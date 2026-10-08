package lifecycle

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCloseRunsLIFOAndJoinsErrors(t *testing.T) {
	var s Stack
	var order []string
	boom := errors.New("boom")
	s.Add("pool", func(context.Context) error { order = append(order, "pool"); return nil })
	s.Add("workers", func(context.Context) error { order = append(order, "workers"); return boom })
	s.Add("hub", func(context.Context) error { order = append(order, "hub"); return nil })
	if s.Len() != 3 {
		t.Fatalf("len %d", s.Len())
	}

	err := s.Close(context.Background())
	if got := strings.Join(order, ","); got != "hub,workers,pool" {
		t.Fatalf("order %s", got)
	}
	if !errors.Is(err, boom) || !strings.Contains(err.Error(), "workers: boom") {
		t.Fatalf("err %v", err)
	}
	if s.Len() != 0 {
		t.Fatalf("len after close %d", s.Len())
	}
}

func TestCloseIsIdempotent(t *testing.T) {
	var s Stack
	calls := 0
	boom := errors.New("boom")
	s.Add("once", func(context.Context) error { calls++; return boom })
	first := s.Close(context.Background())
	second := s.Close(context.Background())
	if calls != 1 {
		t.Fatalf("cleanup ran %d times", calls)
	}
	if !errors.Is(first, boom) || !errors.Is(second, boom) {
		t.Fatalf("first %v second %v", first, second)
	}
}

func TestConcurrentCloseWaitsForTheFirst(t *testing.T) {
	var s Stack
	release := make(chan struct{})
	s.Add("slow", func(context.Context) error { <-release; return nil })

	var wg sync.WaitGroup
	errs := make([]error, 4)
	for i := range errs {
		wg.Add(1)
		go func(i int) { defer wg.Done(); errs[i] = s.Close(context.Background()) }(i)
	}
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("close %d: %v", i, err)
		}
	}
}

func TestCloseRespectsTheDeadline(t *testing.T) {
	var s Stack
	ranFirst := false
	s.Add("first", func(context.Context) error { ranFirst = true; return nil })
	// Ignores ctx entirely, as a misbehaving cleanup would.
	s.Add("stuck", func(context.Context) error { select {} })

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	err := s.Close(ctx)
	if took := time.Since(start); took > time.Second {
		t.Fatalf("Close blocked %v past its deadline", took)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err %v", err)
	}
	if !strings.Contains(err.Error(), "stuck: abandoned") || !strings.Contains(err.Error(), "first: skipped") {
		t.Fatalf("err should name what was abandoned and skipped: %v", err)
	}
	if ranFirst {
		t.Fatal("a cleanup after an abandoned one must not run out of order")
	}
}

func TestPanicBecomesAnError(t *testing.T) {
	var s Stack
	s.Add("pool", func(context.Context) error { return nil })
	s.Add("bad", func(context.Context) error { panic("nope") })
	err := s.Close(context.Background())
	if err == nil || !strings.Contains(err.Error(), "bad: panic: nope") {
		t.Fatalf("err %v", err)
	}
}

func TestAddAfterClosePanics(t *testing.T) {
	var s Stack
	_ = s.Close(context.Background())
	defer func() {
		if recover() == nil {
			t.Fatal("Add after Close should panic")
		}
	}()
	s.Add("late", func(context.Context) error { return nil })
}
