// Command server runs the Flama runner service.
//
//	runner              serve (the default, and what the image runs)
//	runner version      print the version and exit
//	runner healthcheck  GET /healthz on the local port; exit 0 when live
//
// The subcommands exist for the distroless image, which has no shell, curl
// or wget: a compose healthcheck runs the binary itself.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strconv"
	"syscall"
	"time"

	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/config"
	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/server"
	"github.com/jordiparracrespo/flama-ai/packages/go/core/logging"
	"github.com/jordiparracrespo/flama-ai/packages/go/httpx"
)

// version is stamped by the build (-ldflags "-X main.version=…").
var version = "dev"

// healthcheckTimeout bounds the probe; compose's own timeout is longer.
const healthcheckTimeout = 3 * time.Second

func main() {
	os.Exit(dispatch(os.Args[1:], os.Stdout, os.Stderr))
}

// dispatch runs a subcommand and returns the process exit code.
func dispatch(args []string, stdout, stderr io.Writer) int {
	cmd := ""
	if len(args) > 0 {
		cmd = args[0]
	}
	var err error
	switch cmd {
	case "":
		err = serve()
	case "version":
		_, err = fmt.Fprintln(stdout, resolveVersion(version, debug.ReadBuildInfo))
	case "healthcheck":
		err = healthcheck()
	case "help", "-h", "--help":
		usage(stdout)
		return 0
	default:
		_, _ = fmt.Fprintf(stderr, "unknown command %q\n", cmd)
		usage(stderr)
		return 2
	}
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "fatal:", err)
		return 1
	}
	return 0
}

func usage(w io.Writer) {
	_, _ = fmt.Fprint(w, `usage: runner [command]

  (none)       serve
  version      print the version
  healthcheck  exit 0 when GET /healthz on the local port answers 200
`)
}

// resolveVersion prefers the ldflags stamp; a plain `go build` falls back to
// the VCS revision the toolchain records, so a binary is never anonymous.
func resolveVersion(stamped string, buildInfo func() (*debug.BuildInfo, bool)) string {
	if stamped != "" && stamped != "dev" {
		return stamped
	}
	info, ok := buildInfo()
	if !ok {
		return "dev"
	}
	var revision string
	var modified bool
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			revision = s.Value
		case "vcs.modified":
			modified = s.Value == "true"
		}
	}
	if revision == "" {
		return "dev"
	}
	if len(revision) > 12 {
		revision = revision[:12]
	}
	if modified {
		revision += "-dirty"
	}
	return revision
}

func healthcheck() error {
	port, err := config.LoadPort()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), healthcheckTimeout)
	defer cancel()
	return probe(ctx, "http://127.0.0.1:"+strconv.Itoa(port)+"/healthz")
}

// probe is the liveness check: 200 or an error.
func probe(ctx context.Context, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<10))
	if res.StatusCode != http.StatusOK {
		return errors.New("healthz answered " + res.Status)
	}
	return nil
}

func serve() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	if cfg.Version == "dev" {
		cfg.Version = resolveVersion(version, debug.ReadBuildInfo)
	}
	logger := logging.New(os.Stdout, logging.Options{
		Level: cfg.LogLevel, Format: cfg.LogFormat, Service: "runner", Version: cfg.Version,
	})
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	srv, err := server.New(ctx, cfg, logger)
	if err != nil {
		return err
	}
	srv.Start(ctx)

	logger.Info("starting", slog.String("env", string(cfg.Env)), slog.Int("port", cfg.Port))
	return httpx.Serve(ctx, logger, httpx.ServerOptions{
		Addr:              cfg.Addr(),
		ShutdownTimeout:   cfg.ShutdownTimeout,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}, srv.Handler, srv.Shutdown)
}
