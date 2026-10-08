package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"runtime/debug"
	"strings"
	"testing"
	"time"
)

func TestResolveVersion(t *testing.T) {
	info := func(settings ...debug.BuildSetting) func() (*debug.BuildInfo, bool) {
		return func() (*debug.BuildInfo, bool) { return &debug.BuildInfo{Settings: settings}, true }
	}
	none := func() (*debug.BuildInfo, bool) { return nil, false }
	rev := debug.BuildSetting{Key: "vcs.revision", Value: "0123456789abcdef0123"}
	cases := []struct {
		name, stamped, want string
		build               func() (*debug.BuildInfo, bool)
	}{
		{"ldflags win", "v1.2.3", "v1.2.3", info(rev)},
		{"vcs revision", "dev", "0123456789ab", info(rev)},
		{"dirty tree", "dev", "0123456789ab-dirty", info(rev, debug.BuildSetting{Key: "vcs.modified", Value: "true"})},
		{"no vcs", "dev", "dev", info()},
		{"no build info", "", "dev", none},
	}
	for _, c := range cases {
		if got := resolveVersion(c.stamped, c.build); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}

func TestVersionAndUnknownCommands(t *testing.T) {
	var out, errOut bytes.Buffer
	if code := dispatch([]string{"version"}, &out, &errOut); code != 0 || strings.TrimSpace(out.String()) == "" {
		t.Fatalf("version: %d %q %q", code, out.String(), errOut.String())
	}
	out.Reset()
	if code := dispatch([]string{"serve-forever"}, &out, &errOut); code != 2 || !strings.Contains(errOut.String(), "usage") {
		t.Fatalf("unknown command: %d %q", code, errOut.String())
	}
}

func TestProbe(t *testing.T) {
	status := http.StatusOK
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(status)
	}))
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := probe(ctx, ts.URL+"/healthz"); err != nil {
		t.Fatalf("healthy: %v", err)
	}
	status = http.StatusServiceUnavailable
	if err := probe(ctx, ts.URL+"/healthz"); err == nil || !strings.Contains(err.Error(), "503") {
		t.Fatalf("unhealthy should fail: %v", err)
	}
	ts.Close()
	if err := probe(ctx, ts.URL+"/healthz"); err == nil {
		t.Fatal("nothing listening should fail")
	}
}

func TestHealthcheckCommand(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	defer ts.Close()
	port := ts.URL[strings.LastIndex(ts.URL, ":")+1:]
	// Production skips the .env walk, so only these variables count.
	t.Setenv("RUNNER_ENV", "production")
	t.Setenv("RUNNER_PORT", port)

	var out, errOut bytes.Buffer
	if code := dispatch([]string{"healthcheck"}, &out, &errOut); code != 0 {
		t.Fatalf("healthcheck against a live server: %d %s", code, errOut.String())
	}
	ts.Close()
	if code := dispatch([]string{"healthcheck"}, &out, &errOut); code != 1 {
		t.Fatalf("healthcheck against nothing: %d", code)
	}
}
