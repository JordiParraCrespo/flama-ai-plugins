package app

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jordiparracrespo/flama-ai/packages/go/auth/scope"

	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/jobs/domain"
	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/scopes"
	"github.com/jordiparracrespo/flama-ai/packages/go/auth"
	"github.com/jordiparracrespo/flama-ai/packages/go/core/problem"
)

// memRepo is a minimal Repository so this package's tests stay free of the
// adapters (the boundary test forbids importing them here).
type memRepo struct {
	mu   sync.Mutex
	jobs map[string]domain.Job
}

func newMemRepo() *memRepo { return &memRepo{jobs: map[string]domain.Job{}} }

func (r *memRepo) Save(_ context.Context, j domain.Job) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.jobs[j.ID] = j
	return nil
}

func (r *memRepo) FindByID(_ context.Context, id string) (domain.Job, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	j, ok := r.jobs[id]
	if !ok {
		return domain.Job{}, ErrNotFound
	}
	return j, nil
}

func (r *memRepo) List(_ context.Context, _ ListFilter) ([]domain.Job, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]domain.Job, 0, len(r.jobs))
	for _, j := range r.jobs {
		out = append(out, j)
	}
	return out, nil
}

func (r *memRepo) Update(_ context.Context, id string, fn func(*domain.Job) error) (domain.Job, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	j, ok := r.jobs[id]
	if !ok {
		return domain.Job{}, ErrNotFound
	}
	if err := fn(&j); err != nil {
		return domain.Job{}, err
	}
	r.jobs[id] = j
	return j, nil
}

func (r *memRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.jobs, id)
	return nil
}

func callerCtx() context.Context {
	return auth.WithPrincipal(context.Background(), &auth.Principal{ID: "t", Scopes: scope.NewSet(scopes.JobsWrite)})
}

func newService(repo Repository, runner Runner, queue int) *Service {
	return New(Options{
		Repository: repo,
		Runners:    map[string]Runner{"r": runner},
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Workers:    1,
		QueueSize:  queue,
	})
}

func TestRejectedSubmitLeavesNothingBehind(t *testing.T) {
	repo := newMemRepo()
	svc := newService(repo, RunnerFunc(func(context.Context, domain.Job) error { return nil }), 1)
	// No Start: the queue holds one id and the second submit must be refused.
	if _, err := svc.Submit(callerCtx(), SubmitInput{Kind: "r"}); err != nil {
		t.Fatal(err)
	}
	_, err := svc.Submit(callerCtx(), SubmitInput{Kind: "r"})
	var pe *problem.Error
	if !errors.As(err, &pe) || pe.Code != domain.ErrQueueFull.Code {
		t.Fatalf("expected queue-full problem, got %v", err)
	}
	jobs, _ := repo.List(context.Background(), ListFilter{})
	if len(jobs) != 1 {
		t.Fatalf("rejected job persisted: %d jobs", len(jobs))
	}
}

// A cancel that lands while the runner is returning must win: the worker's
// completion is applied against the stored state and dropped.
func TestCancelWinsOverLateCompletion(t *testing.T) {
	repo := newMemRepo()
	release := make(chan struct{})
	svc := newService(repo, RunnerFunc(func(ctx context.Context, _ domain.Job) error {
		<-release
		return nil // ignore ctx on purpose: a runner that returns late
	}), 4)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)

	job, err := svc.Submit(callerCtx(), SubmitInput{Kind: "r"})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		j, _ := repo.FindByID(context.Background(), job.ID)
		if j.Status == domain.StatusRunning || time.Now().After(deadline) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if _, err := svc.Cancel(callerCtx(), job.ID); err != nil {
		t.Fatal(err)
	}
	close(release)
	cancel()
	if err := svc.Wait(context.Background()); err != nil {
		t.Fatal(err)
	}

	final, _ := repo.FindByID(context.Background(), job.ID)
	if final.Status != domain.StatusCancelled {
		t.Fatalf("late completion overwrote the cancellation: %s", final.Status)
	}
}

// cancelOnStart cancels a job the moment the worker has marked it running,
// before the worker has registered it as cancellable: the window a Cancel
// can land in and find nothing to interrupt.
type cancelOnStart struct {
	*memRepo
	svc *Service
}

func (r *cancelOnStart) Update(ctx context.Context, id string, fn func(*domain.Job) error) (domain.Job, error) {
	j, err := r.memRepo.Update(ctx, id, fn)
	if err == nil && j.Status == domain.StatusRunning && r.svc != nil {
		svc := r.svc
		r.svc = nil
		if _, cerr := svc.Cancel(callerCtx(), id); cerr != nil {
			return j, cerr
		}
	}
	return j, err
}

func TestCancelBeforeRegistrationNeverRuns(t *testing.T) {
	repo := &cancelOnStart{memRepo: newMemRepo()}
	ran := make(chan struct{}, 1)
	svc := newService(repo, RunnerFunc(func(context.Context, domain.Job) error {
		ran <- struct{}{}
		return nil
	}), 4)
	repo.svc = svc
	ctx, cancel := context.WithCancel(context.Background())
	svc.Start(ctx)

	job, err := svc.Submit(callerCtx(), SubmitInput{Kind: "r"})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		j, _ := repo.FindByID(context.Background(), job.ID)
		if j.Status == domain.StatusCancelled || time.Now().After(deadline) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	// Let the worker finish execute before looking at the runner.
	for svc.Depth() > 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(20 * time.Millisecond)
	cancel()
	if err := svc.Wait(context.Background()); err != nil {
		t.Fatal(err)
	}

	select {
	case <-ran:
		t.Fatal("the runner ran a job that was cancelled before it started")
	default:
	}
	final, _ := repo.FindByID(context.Background(), job.ID)
	if final.Status != domain.StatusCancelled {
		t.Fatalf("expected cancelled, got %s", final.Status)
	}
}

func TestCapacityIsTheNormalizedQueue(t *testing.T) {
	svc := newService(newMemRepo(), RunnerFunc(func(context.Context, domain.Job) error { return nil }), 0)
	if svc.Capacity() != 1 || svc.Depth() >= svc.Capacity() {
		t.Fatalf("an empty queue of size 0 must read as not full: depth %d, capacity %d", svc.Depth(), svc.Capacity())
	}
}

// A restart recovery must run persisted queued jobs and fail interrupted
// running ones, so persistence makes job processing survive a restart, not
// just the rows.
func TestRecoverRequeuesQueuedAndFailsInterrupted(t *testing.T) {
	repo := newMemRepo()
	now := time.Now()

	// A job left queued by the previous run.
	q, _ := domain.New("q1", "r", nil, "k", now)
	if err := repo.Save(context.Background(), q); err != nil {
		t.Fatal(err)
	}
	// A job left running (its worker died with the old process).
	r, _ := domain.New("r1", "r", nil, "k", now)
	_ = r.Start(now)
	if err := repo.Save(context.Background(), r); err != nil {
		t.Fatal(err)
	}

	ran := make(chan struct{}, 1)
	svc := newService(repo, RunnerFunc(func(context.Context, domain.Job) error {
		select {
		case ran <- struct{}{}:
		default:
		}
		return nil
	}), 4)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.Start(ctx)
	if err := svc.Recover(ctx); err != nil {
		t.Fatal(err)
	}

	// The queued job runs.
	select {
	case <-ran:
	case <-time.After(2 * time.Second):
		t.Fatal("recovered queued job never ran")
	}

	deadline := time.Now().Add(2 * time.Second)
	for {
		q1, _ := repo.FindByID(context.Background(), "q1")
		r1, _ := repo.FindByID(context.Background(), "r1")
		if q1.Status == domain.StatusSucceeded && r1.Status == domain.StatusFailed {
			if r1.Error == "" {
				t.Fatal("interrupted job should carry a reason")
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("recovery incomplete: q1=%s r1=%s", q1.Status, r1.Status)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// A runner that ignores cancellation must not hold a shutdown past its
// deadline: Wait gives up, names the job it abandoned, and returns.
func TestWaitRespectsTheDeadline(t *testing.T) {
	repo := newMemRepo()
	started := make(chan struct{})
	release := make(chan struct{})
	defer close(release)
	svc := newService(repo, RunnerFunc(func(context.Context, domain.Job) error {
		close(started)
		<-release // ignores ctx on purpose
		return nil
	}), 4)
	ctx, cancel := context.WithCancel(context.Background())
	svc.Start(ctx)
	job, err := svc.Submit(callerCtx(), SubmitInput{Kind: "r"})
	if err != nil {
		t.Fatal(err)
	}
	<-started
	if svc.Running() != 1 {
		t.Fatalf("running %d", svc.Running())
	}
	cancel()

	waitCtx, waitCancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer waitCancel()
	begin := time.Now()
	err = svc.Wait(waitCtx)
	if took := time.Since(begin); took > time.Second {
		t.Fatalf("Wait blocked %v past its deadline", took)
	}
	if !errors.Is(err, context.DeadlineExceeded) || !strings.Contains(err.Error(), job.ID) {
		t.Fatalf("Wait should report the abandoned job: %v", err)
	}
}

func TestFinishedCountsTerminalTransitions(t *testing.T) {
	repo := newMemRepo()
	fail := errors.New("nope")
	var calls atomic.Int32
	svc := newService(repo, RunnerFunc(func(context.Context, domain.Job) error {
		if calls.Add(1) == 1 {
			return nil
		}
		return fail
	}), 4)
	ctx, cancel := context.WithCancel(context.Background())
	svc.Start(ctx)
	for i := 0; i < 2; i++ {
		if _, err := svc.Submit(callerCtx(), SubmitInput{Kind: "r"}); err != nil {
			t.Fatal(err)
		}
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		f := svc.Finished()
		if f[domain.StatusSucceeded]+f[domain.StatusFailed] == 2 || time.Now().After(deadline) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	cancel()
	if err := svc.Wait(context.Background()); err != nil {
		t.Fatal(err)
	}
	f := svc.Finished()
	if f[domain.StatusSucceeded] != 1 || f[domain.StatusFailed] != 1 || f[domain.StatusCancelled] != 0 {
		t.Fatalf("finished %v", f)
	}
}
