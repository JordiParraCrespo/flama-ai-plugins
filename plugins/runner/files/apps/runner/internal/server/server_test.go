package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/config"
	"github.com/jordiparracrespo/flama-ai/packages/go/core/problem"
	"github.com/jordiparracrespo/flama-ai/packages/go/ws"
)

const bootstrap = "test-bootstrap-key-0123456789abcdef0123456789"

func newTestServer(t *testing.T, extra map[string]string) *httptest.Server {
	t.Helper()
	ts, _ := newTestApp(t, extra)
	return ts
}

func newTestApp(t *testing.T, extra map[string]string) (*httptest.Server, *Server) {
	t.Helper()
	env := map[string]string{"RUNNER_BOOTSTRAP_API_KEY": bootstrap, "RUNNER_ENV": "test", "RUNNER_JOB_WORKERS": "2"}
	for k, v := range extra {
		env[k] = v
	}
	cfg, err := config.Parse(func(k string) (string, bool) { v, ok := env[k]; return v, ok })
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv, err := New(context.Background(), cfg, logger)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	srv.Start(ctx)
	ts := httptest.NewServer(srv.Handler)
	t.Cleanup(func() {
		ts.Close()
		cancel()
		srv.Shutdown(context.Background())
	})
	return ts, srv
}

func call(t *testing.T, ts *httptest.Server, method, path, token string, body any) (*http.Response, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req, _ := http.NewRequest(method, ts.URL+path, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := ts.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	return res, data
}

func TestHealthIsPublic(t *testing.T) {
	ts := newTestServer(t, nil)
	res, body := call(t, ts, http.MethodGet, "/readyz", "", nil)
	if res.StatusCode != 200 || !strings.Contains(string(body), `"jobs_queue":"up"`) {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
	res, body = call(t, ts, http.MethodGet, "/health/capabilities", "", nil)
	if res.StatusCode != 200 || strings.Contains(string(body), "service_tokens") {
		t.Fatalf("tokens should be off without a secret: %d %s", res.StatusCode, body)
	}
}

func TestAuthAndProblems(t *testing.T) {
	ts := newTestServer(t, nil)
	res, body := call(t, ts, http.MethodGet, "/v1/me", "", nil)
	if res.StatusCode != 401 || res.Header.Get("Content-Type") != problem.ContentType {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
	var doc problem.Details
	_ = json.Unmarshal(body, &doc)
	if doc.Code != "RUNNER_002" || doc.CorrelationID == "" || !strings.HasSuffix(doc.Type, "#runner_002") {
		t.Fatalf("%+v", doc)
	}
	res, _ = call(t, ts, http.MethodGet, "/v1/me", "wrong", nil)
	if res.StatusCode != 401 {
		t.Fatalf("wrong key accepted: %d", res.StatusCode)
	}
	res, body = call(t, ts, http.MethodGet, "/v1/me", bootstrap, nil)
	if res.StatusCode != 200 || !strings.Contains(string(body), `"id":"bootstrap"`) {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
}

func TestKeyLifecycleAndScopes(t *testing.T) {
	ts := newTestServer(t, nil)

	// Bootstrap mints a read-only key.
	res, body := call(t, ts, http.MethodPost, "/v1/api-keys", bootstrap, map[string]any{"name": "reader", "scopes": []string{"jobs:read"}})
	if res.StatusCode != 201 {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
	var created struct {
		ID, Token, Prefix string
	}
	_ = json.Unmarshal(body, &created)
	if !strings.HasPrefix(created.Token, "flr_") || !strings.HasPrefix(created.Token, created.Prefix) {
		t.Fatalf("token %q prefix %q", created.Token, created.Prefix)
	}

	// The reader can read jobs but neither write them nor mint keys.
	if res, _ = call(t, ts, http.MethodGet, "/v1/jobs", created.Token, nil); res.StatusCode != 200 {
		t.Fatalf("read: %d", res.StatusCode)
	}
	if res, _ = call(t, ts, http.MethodPost, "/v1/jobs", created.Token, map[string]any{"kind": "sleep"}); res.StatusCode != 403 {
		t.Fatalf("write should be forbidden: %d", res.StatusCode)
	}
	if res, _ = call(t, ts, http.MethodPost, "/v1/api-keys", created.Token, map[string]any{"name": "x", "scopes": []string{"jobs:read"}}); res.StatusCode != 403 {
		t.Fatalf("minting should be forbidden: %d", res.StatusCode)
	}

	// A key-writer cannot escalate beyond its own scopes.
	_, body = call(t, ts, http.MethodPost, "/v1/api-keys", bootstrap, map[string]any{"name": "minter", "scopes": []string{"keys:write"}})
	var minter struct{ Token string }
	_ = json.Unmarshal(body, &minter)
	res, body = call(t, ts, http.MethodPost, "/v1/api-keys", minter.Token, map[string]any{"name": "esc", "scopes": []string{"jobs:write"}})
	if res.StatusCode != 403 || !strings.Contains(string(body), "APIKEY_003") {
		t.Fatalf("escalation: %d %s", res.StatusCode, body)
	}

	// Revocation is immediate and idempotency is reported as a conflict.
	if res, _ = call(t, ts, http.MethodDelete, "/v1/api-keys/"+created.ID, bootstrap, nil); res.StatusCode != 204 {
		t.Fatalf("revoke: %d", res.StatusCode)
	}
	if res, _ = call(t, ts, http.MethodGet, "/v1/jobs", created.Token, nil); res.StatusCode != 401 {
		t.Fatalf("revoked key still works: %d", res.StatusCode)
	}
	if res, _ = call(t, ts, http.MethodDelete, "/v1/api-keys/"+created.ID, bootstrap, nil); res.StatusCode != 409 {
		t.Fatalf("double revoke: %d", res.StatusCode)
	}
	if res, _ = call(t, ts, http.MethodGet, "/v1/api-keys/nope", bootstrap, nil); res.StatusCode != 404 {
		t.Fatalf("missing key: %d", res.StatusCode)
	}
}

func TestServiceTokens(t *testing.T) {
	ts := newTestServer(t, map[string]string{"RUNNER_JWT_SECRET": "0123456789abcdef0123456789abcdef", "RUNNER_JWT_TTL": "5m"})
	_, body := call(t, ts, http.MethodGet, "/health/capabilities", "", nil)
	if !strings.Contains(string(body), "service_tokens") {
		t.Fatalf("capability missing: %s", body)
	}
	res, body := call(t, ts, http.MethodPost, "/v1/service-tokens", bootstrap, map[string]any{"subject": "agent-7", "scopes": []string{"jobs:write", "events:read"}})
	if res.StatusCode != 201 {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
	var tok struct{ Token string }
	_ = json.Unmarshal(body, &tok)
	res, body = call(t, ts, http.MethodGet, "/v1/me", tok.Token, nil)
	if res.StatusCode != 200 || !strings.Contains(string(body), `"kind":"service"`) {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
	if res, _ = call(t, ts, http.MethodGet, "/v1/api-keys", tok.Token, nil); res.StatusCode != 403 {
		t.Fatalf("service token over-scoped: %d", res.StatusCode)
	}
}

func TestServiceTokensDisabledIs501(t *testing.T) {
	ts := newTestServer(t, nil)
	res, body := call(t, ts, http.MethodPost, "/v1/service-tokens", bootstrap, map[string]any{"subject": "a", "scopes": []string{"jobs:read"}})
	if res.StatusCode != 501 || !strings.Contains(string(body), "APIKEY_004") {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
}

func TestJobsOverRestAndWebSocket(t *testing.T) {
	ts := newTestServer(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Subscribe before submitting so no event is missed.
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/v1/ws", &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": {"Bearer " + bootstrap}},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	var env ws.Envelope
	_ = wsjson.Read(ctx, c, &env) // hello
	_ = wsjson.Write(ctx, c, ws.Envelope{Type: ws.TypeSubscribe, ID: "s", Topics: []string{"jobs"}})
	_ = wsjson.Read(ctx, c, &env)
	if env.Type != ws.TypeSubscribed {
		t.Fatalf("subscribe: %+v", env)
	}

	res, body := call(t, ts, http.MethodPost, "/v1/jobs", bootstrap, map[string]any{"kind": "sleep", "payload": map[string]int{"durationMs": 50}})
	if res.StatusCode != 202 || res.Header.Get("Location") == "" {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
	var job struct{ ID, Status string }
	_ = json.Unmarshal(body, &job)

	seen := map[string]bool{}
	for len(seen) < 3 {
		if err := wsjson.Read(ctx, c, &env); err != nil {
			t.Fatalf("events so far %v: %v", seen, err)
		}
		if env.Type == ws.TypeEvent && env.Topic == "jobs" {
			seen[env.Event] = true
		}
	}
	if !seen["job.queued"] || !seen["job.started"] || !seen["job.finished"] {
		t.Fatalf("events %v", seen)
	}

	res, body = call(t, ts, http.MethodGet, "/v1/jobs/"+job.ID, bootstrap, nil)
	if res.StatusCode != 200 || !strings.Contains(string(body), `"status":"succeeded"`) {
		t.Fatalf("%d %s", res.StatusCode, body)
	}

	// Unknown kind and cancel-after-finish are catalog problems.
	res, body = call(t, ts, http.MethodPost, "/v1/jobs", bootstrap, map[string]any{"kind": "warp"})
	if res.StatusCode != 400 || !strings.Contains(string(body), "JOB_004") {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
	res, body = call(t, ts, http.MethodPost, "/v1/jobs/"+job.ID+"/cancel", bootstrap, nil)
	if res.StatusCode != 409 || !strings.Contains(string(body), "JOB_002") {
		t.Fatalf("%d %s", res.StatusCode, body)
	}

	// Cancelling a running job stops it.
	_, body = call(t, ts, http.MethodPost, "/v1/jobs", bootstrap, map[string]any{"kind": "sleep", "payload": map[string]int{"durationMs": 60000}})
	_ = json.Unmarshal(body, &job)
	deadline := time.Now().Add(3 * time.Second)
	for {
		_, body = call(t, ts, http.MethodGet, "/v1/jobs/"+job.ID, bootstrap, nil)
		if strings.Contains(string(body), `"status":"running"`) || time.Now().After(deadline) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	res, body = call(t, ts, http.MethodPost, "/v1/jobs/"+job.ID+"/cancel", bootstrap, nil)
	if res.StatusCode != 200 || !strings.Contains(string(body), `"status":"cancelled"`) {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
	res, body = call(t, ts, http.MethodGet, "/v1/jobs?status=cancelled", bootstrap, nil)
	if res.StatusCode != 200 || !strings.Contains(string(body), job.ID) {
		t.Fatalf("%d %s", res.StatusCode, body)
	}
}

func TestWebSocketNeedsEventsScope(t *testing.T) {
	ts := newTestServer(t, nil)
	_, body := call(t, ts, http.MethodPost, "/v1/api-keys", bootstrap, map[string]any{"name": "r", "scopes": []string{"jobs:read"}})
	var key struct{ Token string }
	_ = json.Unmarshal(body, &key)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/v1/ws", &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": {"Bearer " + key.Token}},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	var env ws.Envelope
	_ = wsjson.Read(ctx, c, &env)
	_ = wsjson.Write(ctx, c, ws.Envelope{Type: ws.TypeSubscribe, ID: "s", Topics: []string{"jobs"}})
	_ = wsjson.Read(ctx, c, &env)
	if env.Type != ws.TypeError || env.Error.Code != "RUNNER_003" {
		t.Fatalf("%+v", env)
	}
}

func get(t *testing.T, url string) (int, string) {
	t.Helper()
	res, err := http.Get(url) //nolint:noctx // test
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(body)
}

func TestAdminListenerServesMetricsAndPprof(t *testing.T) {
	ts, srv := newTestApp(t, map[string]string{"RUNNER_ADMIN_ADDR": "127.0.0.1:0"})
	admin := "http://" + srv.AdminAddr()

	call(t, ts, http.MethodPost, "/v1/jobs", bootstrap, map[string]any{"kind": "sleep", "payload": map[string]int{"durationMs": 1}})
	deadline := time.Now().Add(3 * time.Second)
	var body string
	for {
		_, body = get(t, admin+"/metrics")
		if strings.Contains(body, `runner_jobs_finished_total{status="succeeded"} 1`) || time.Now().After(deadline) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	for _, want := range []string{
		"# TYPE runner_ws_connections gauge\nrunner_ws_connections 0\n",
		"runner_jobs_queue_capacity 1024\n",
		"runner_jobs_queue_depth ",
		"runner_jobs_running ",
		`runner_jobs_finished_total{status="succeeded"} 1`,
		`runner_jobs_finished_total{status="cancelled"} 0`,
		`runner_build_info{version="dev"} 1`,
		"go_goroutines ",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("metrics missing %q:\n%s", want, body)
		}
	}
	if code, body := get(t, admin+"/debug/pprof/"); code != 200 || !strings.Contains(body, "goroutine") {
		t.Fatalf("pprof: %d %.200s", code, body)
	}

	// None of it leaks onto the public router.
	for _, path := range []string{"/metrics", "/debug/pprof/"} {
		if res, _ := call(t, ts, http.MethodGet, path, "", nil); res.StatusCode != 404 {
			t.Fatalf("%s is public: %d", path, res.StatusCode)
		}
	}
}

func TestAdminListenerIsOffByDefault(t *testing.T) {
	_, srv := newTestApp(t, nil)
	if srv.AdminAddr() != "" {
		t.Fatalf("admin listener on without RUNNER_ADMIN_ADDR: %s", srv.AdminAddr())
	}
}

// A New that fails half-way must close what it had already opened: here the
// admin port is bound, then the database is unreachable.
func TestNewUnwindsOnError(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	env := map[string]string{
		"RUNNER_BOOTSTRAP_API_KEY": bootstrap,
		"RUNNER_ENV":               "test",
		"RUNNER_ADMIN_ADDR":        addr,
		"RUNNER_DATABASE_URL":      "postgres://u:p@127.0.0.1:1/db?sslmode=disable&connect_timeout=1",
	}
	cfg, err := config.Parse(func(k string) (string, bool) { v, ok := env[k]; return v, ok })
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	if _, err := New(context.Background(), cfg, logger); err == nil {
		t.Fatal("New should fail without a database")
	}
	again, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatalf("the admin port was not released by the unwind: %v", err)
	}
	_ = again.Close()
}

// Shutdown is the cleanup stack: sockets get their 1001 first, it is safe to
// call twice, and the admin listener is gone afterwards.
func TestShutdownClosesTheStack(t *testing.T) {
	env := map[string]string{"RUNNER_BOOTSTRAP_API_KEY": bootstrap, "RUNNER_ENV": "test", "RUNNER_ADMIN_ADDR": "127.0.0.1:0"}
	cfg, err := config.Parse(func(k string) (string, bool) { v, ok := env[k]; return v, ok })
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv, err := New(context.Background(), cfg, logger)
	if err != nil {
		t.Fatal(err)
	}
	runCtx, stop := context.WithCancel(context.Background())
	srv.Start(runCtx)
	ts := httptest.NewServer(srv.Handler)
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/v1/ws", &websocket.DialOptions{
		HTTPHeader: http.Header{"Authorization": {"Bearer " + bootstrap}},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	var env2 ws.Envelope
	_ = wsjson.Read(ctx, c, &env2) // hello
	closed := make(chan error, 1)
	go func() { closed <- wsjson.Read(ctx, c, &env2) }()

	admin := srv.AdminAddr()
	stop()
	srv.Shutdown(ctx)
	srv.Shutdown(ctx)

	if err := <-closed; websocket.CloseStatus(err) != websocket.StatusGoingAway {
		t.Fatalf("socket should close with 1001, got %v", err)
	}
	if conn, err := net.Dial("tcp", admin); err == nil {
		_ = conn.Close()
		t.Fatal("admin listener still accepting after Shutdown")
	}
}
