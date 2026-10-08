package httpx

import (
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type served struct {
	url  string
	done chan error
}

func serve(t *testing.T, ctx context.Context, timeout time.Duration, h http.Handler, hooks ...func(context.Context)) served {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		done <- Serve(ctx, discardLogger(), ServerOptions{Listener: ln, ShutdownTimeout: timeout, ReadHeaderTimeout: time.Second}, h, hooks...)
	}()
	return served{url: "http://" + ln.Addr().String(), done: done}
}

// The regression this guards: request contexts used to be the signal
// context itself, so SIGTERM cancelled every in-flight request at once and
// the drain only waited for handlers that ignored their context.
func TestInFlightRequestCompletesDuringShutdown(t *testing.T) {
	ctx, signal := context.WithCancel(context.Background())
	entered := make(chan struct{})
	release := make(chan struct{})
	var requestCancelled atomic.Bool
	var drainedBeforeHook atomic.Bool
	var finished atomic.Bool

	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		select {
		case <-release:
		case <-r.Context().Done():
			requestCancelled.Store(true)
			return
		}
		finished.Store(true)
		_, _ = io.WriteString(w, "done")
	})
	hook := func(context.Context) { drainedBeforeHook.Store(finished.Load()) }
	s := serve(t, ctx, 5*time.Second, h, hook)

	type result struct {
		body string
		err  error
	}
	res := make(chan result, 1)
	go func() {
		resp, err := http.Get(s.url) //nolint:noctx // test
		if err != nil {
			res <- result{err: err}
			return
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(resp.Body)
		res <- result{body: string(b), err: err}
	}()

	<-entered
	signal() // SIGTERM arrives while the request is in flight
	time.Sleep(50 * time.Millisecond)
	if requestCancelled.Load() {
		t.Fatal("the shutdown signal cancelled an in-flight request")
	}
	close(release)

	r := <-res
	if r.err != nil || r.body != "done" {
		t.Fatalf("in-flight request did not complete: %q %v", r.body, r.err)
	}
	if err := <-s.done; err != nil {
		t.Fatalf("Serve: %v", err)
	}
	if !drainedBeforeHook.Load() {
		t.Fatal("onShutdown ran before the in-flight request drained")
	}
}

func TestDrainTimeoutCancelsStragglers(t *testing.T) {
	ctx, signal := context.WithCancel(context.Background())
	entered := make(chan struct{})
	cancelled := make(chan struct{})
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(entered)
		<-r.Context().Done() // only the forced close ends this request
		close(cancelled)
	})
	var hookCtxDone atomic.Bool
	s := serve(t, ctx, 100*time.Millisecond, h, func(c context.Context) { hookCtxDone.Store(c.Err() != nil) })

	go func() {
		resp, err := http.Get(s.url) //nolint:noctx // test
		if err == nil {
			resp.Body.Close()
		}
	}()
	<-entered
	signal()

	select {
	case <-cancelled:
	case <-time.After(5 * time.Second):
		t.Fatal("a request past the drain budget was never cancelled")
	}
	select {
	case <-s.done:
	case <-time.After(5 * time.Second):
		t.Fatal("Serve did not return after the drain budget")
	}
	if !hookCtxDone.Load() {
		t.Fatal("hooks should see the spent budget")
	}
}

func TestServeReportsListenErrors(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	err = Serve(context.Background(), discardLogger(), ServerOptions{Addr: ln.Addr().String()}, http.NotFoundHandler())
	if err == nil || !strings.Contains(err.Error(), "address already in use") {
		t.Fatalf("want address in use, got %v", err)
	}
}

func TestAdminHandler(t *testing.T) {
	metrics := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "up 1\n") })
	ctx, cancel := context.WithCancel(context.Background())
	s := serve(t, ctx, time.Second, AdminHandler(metrics))
	defer func() { cancel(); <-s.done }()

	for path, want := range map[string]string{
		"/metrics":                       "up 1",
		"/debug/pprof/":                  "goroutine",
		"/debug/pprof/goroutine?debug=1": "goroutine profile",
		"/debug/pprof/cmdline":           "",
	} {
		resp, err := http.Get(s.url + path) //nolint:noctx // test
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != 200 || !strings.Contains(string(b), want) {
			t.Fatalf("%s: %d %.200s", path, resp.StatusCode, b)
		}
	}
}
