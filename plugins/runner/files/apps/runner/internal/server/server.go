// Package server is the composition root: it turns a Config into a running
// HTTP handler by building every adapter, wiring every module and mounting
// the routes. It is the only package that sees concrete adapters, which is
// what keeps the contexts swappable.
package server

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/apikeys"
	keyspg "github.com/jordiparracrespo/flama-ai/apps/runner/internal/apikeys/adapters/postgres"
	keysapp "github.com/jordiparracrespo/flama-ai/apps/runner/internal/apikeys/app"
	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/config"
	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/jobs"
	jobspg "github.com/jordiparracrespo/flama-ai/apps/runner/internal/jobs/adapters/postgres"
	jobsapp "github.com/jordiparracrespo/flama-ai/apps/runner/internal/jobs/app"
	"github.com/jordiparracrespo/flama-ai/apps/runner/internal/jobs/domain"
	"github.com/jordiparracrespo/flama-ai/packages/go/auth"
	"github.com/jordiparracrespo/flama-ai/packages/go/core/lifecycle"
	"github.com/jordiparracrespo/flama-ai/packages/go/core/metrics"
	"github.com/jordiparracrespo/flama-ai/packages/go/core/problem"
	"github.com/jordiparracrespo/flama-ai/packages/go/health"
	"github.com/jordiparracrespo/flama-ai/packages/go/httpx"
	pg "github.com/jordiparracrespo/flama-ai/packages/go/postgres"
	"github.com/jordiparracrespo/flama-ai/packages/go/ws"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Capability names reported by /health/capabilities.
const (
	CapabilityServiceTokens = "service_tokens"
	CapabilityWebSocket     = "websocket"
	CapabilityPostgres      = "postgres"
)

// Server is the assembled application.
type Server struct {
	Handler http.Handler
	Hub     *ws.Hub
	Jobs    *jobs.Module
	APIKeys *apikeys.Module
	Health  *health.Module
	Metrics *metrics.Registry

	// closers holds everything New opened, in the order it was opened;
	// Shutdown (or a failing New) closes it in reverse.
	closers lifecycle.Stack
	// admin is the internal listener, nil when RUNNER_ADMIN_ADDR is empty.
	admin  *adminServer
	logger *slog.Logger
}

// New builds the application. Nothing starts running until Start, but
// resources are acquired here — the database pool, the admin port — so a
// misconfiguration fails boot. Every one is registered on the server's
// cleanup stack as it is acquired, and any error unwinds what came before.
func New(ctx context.Context, cfg *config.Config, logger *slog.Logger) (_ *Server, err error) {
	s := &Server{logger: logger, Metrics: &metrics.Registry{}}
	defer func() {
		if err != nil {
			if cerr := s.closers.Close(ctx); cerr != nil {
				err = errors.Join(err, cerr)
			}
		}
	}()

	problems := &problem.Writer{TypeBaseURL: cfg.ErrorTypeBaseURL, Logger: logger}

	// Optional capability: service tokens.
	var issuer *auth.JWT
	if cfg.JWT != nil {
		j, err := auth.NewJWT(auth.JWTOptions{Secret: cfg.JWT.Secret, Issuer: cfg.JWT.Issuer, Audience: cfg.JWT.Audience})
		if err != nil {
			return nil, err
		}
		issuer = j
	}
	capabilities := map[string]bool{
		CapabilityServiceTokens: issuer != nil,
		CapabilityWebSocket:     true,
	}
	logger.Info("capabilities resolved", slog.Any("capabilities", capabilities))

	hub := ws.NewHub(logger.With(slog.String("module", "ws")), ws.DefaultOptions())

	// The internal listener binds now, so a taken port fails boot, and
	// serves from Start. Anything that fails after this unwinds it.
	if cfg.AdminAddr != "" {
		admin, err := listenAdmin(ctx, cfg.AdminAddr, s.Metrics, logger)
		if err != nil {
			return nil, err
		}
		s.admin = admin
		s.closers.Add("admin listener", admin.close)
	}

	// Optional capability: Postgres persistence. Empty URL keeps the
	// in-memory stores (Repository nil in the module options).
	var (
		pool     *pgxpool.Pool
		keysRepo keysapp.Repository
		jobsRepo jobsapp.Repository
	)
	if cfg.DatabaseURL != "" {
		p, err := pg.Open(ctx, cfg.DatabaseURL, pg.Options{})
		if err != nil {
			return nil, err
		}
		pool = p
		// Registered before the workers and the hub, so it closes after
		// them; Serve calls Shutdown only once requests have drained.
		s.closers.Add("postgres pool", func(context.Context) error { pool.Close(); return nil })
		if keysRepo, err = keyspg.New(ctx, pool); err != nil {
			return nil, err
		}
		if jobsRepo, err = jobspg.New(ctx, pool); err != nil {
			return nil, err
		}
	}
	capabilities[CapabilityPostgres] = pool != nil

	// A nil *auth.JWT must become a nil interface, not an interface holding
	// a nil pointer, or the service would think tokens are enabled.
	var issuerPort keysapp.TokenIssuer
	var tokenTTL time.Duration
	if issuer != nil {
		issuerPort = issuer
		tokenTTL = cfg.JWT.TTL
	}
	keys := apikeys.New(apikeys.Options{
		BootstrapKey: cfg.BootstrapAPIKey,
		Issuer:       issuerPort,
		TokenTTL:     tokenTTL,
		Problems:     problems,
		Logger:       logger,
		Repository:   keysRepo,
	})
	jobsModule := jobs.New(jobs.Options{
		Hub:        hub,
		Problems:   problems,
		Logger:     logger,
		Workers:    cfg.Jobs.Workers,
		QueueSize:  cfg.Jobs.QueueSize,
		Repository: jobsRepo,
	})
	healthModule := health.New(cfg.Version, capabilities)
	healthModule.Register(health.CheckerFunc{CheckName: "jobs_queue", Fn: func(context.Context) error {
		if jobsModule.Service.Depth() >= jobsModule.Service.Capacity() {
			return errQueueSaturated
		}
		return nil
	}})
	if pool != nil {
		healthModule.Register(pg.Checker{Pool: pool})
	}

	// Verifiers: JWTs are recognised by shape, everything else is a key.
	verifiers := []auth.Verifier{}
	if issuer != nil {
		verifiers = append(verifiers, issuer)
	}
	verifiers = append(verifiers, keys.Service)

	root := httpx.NewRouter(problems)
	root.Use(
		httpx.RealIP(cfg.TrustProxy),
		httpx.RequestID(),
		httpx.Recover(problems, logger),
		httpx.Logger(logger),
		httpx.SecurityHeaders(),
		httpx.MaxBytes(cfg.MaxBodyBytes),
	)
	healthModule.Mount(root)

	root.Group(func(api *httpx.Router) {
		api.Use(auth.Authenticate(problems, logger, verifiers...))
		keys.Mount(api)
		jobsModule.Mount(api)
		api.Handle("GET /v1/ws", ws.Handler(hub, problems, logger, jobsModule.Authorize()))
	})

	s.Handler, s.Hub, s.Jobs, s.APIKeys, s.Health = root, hub, jobsModule, keys, healthModule
	registerMetrics(s.Metrics, cfg.Version, hub, jobsModule)

	// Shutdown order, last registered first: say goodbye on every socket,
	// then wait for the workers (bounded — a runner ignoring cancellation
	// is abandoned at the deadline, not waited on forever).
	s.closers.Add("job workers", s.Jobs.Service.Wait)
	s.closers.Add("websocket hub", func(ctx context.Context) error { hub.Close(ctx); return nil })

	return s, nil
}

// Start launches background work (the job workers, the admin listener). It
// returns at once.
func (s *Server) Start(ctx context.Context) {
	s.Jobs.Start(ctx)
	// Reconcile jobs a previous run left behind (persistent store only).
	if err := s.Jobs.Recover(ctx); err != nil {
		s.logger.Error("job recovery failed", slog.Any("error", err))
	}
	if s.admin != nil {
		s.admin.serve()
	}
}

// AdminAddr is the address the internal listener is bound to, or "" when it
// is off. Tests bind 127.0.0.1:0 and read the port back from here.
func (s *Server) AdminAddr() string {
	if s.admin == nil {
		return ""
	}
	return s.admin.ln.Addr().String()
}

// Shutdown closes what New opened, in reverse: the WebSocket hub, the job
// workers, the database pool, the admin listener (last, so /metrics and
// pprof can watch a slow shutdown). httpx.Serve calls it once the HTTP
// drain is over, with what is left of the shutdown budget; nothing here
// outlives that deadline.
func (s *Server) Shutdown(ctx context.Context) {
	if err := s.closers.Close(ctx); err != nil {
		s.logger.Warn("shutdown incomplete", slog.Any("error", err))
	}
}

// registerMetrics is what /metrics reports: the Go runtime, and the
// numbers the hub and the job queue already keep.
func registerMetrics(r *metrics.Registry, version string, hub *ws.Hub, jobsModule *jobs.Module) {
	metrics.RegisterRuntime(r)
	svc := jobsModule.Service
	r.Register("runner_build_info", "The running version.", metrics.Gauge, func() []metrics.Sample {
		return []metrics.Sample{{Labels: []metrics.Label{{Name: "version", Value: version}}, Value: 1}}
	})
	r.GaugeFunc("runner_ws_connections", "Open WebSocket connections.", func() float64 { return float64(hub.Len()) })
	r.GaugeFunc("runner_jobs_queue_depth", "Jobs queued and not yet picked up by a worker.", func() float64 { return float64(svc.Depth()) })
	r.GaugeFunc("runner_jobs_queue_capacity", "Queued jobs beyond which POST /v1/jobs answers 429.", func() float64 { return float64(svc.Capacity()) })
	r.GaugeFunc("runner_jobs_running", "Jobs a worker is executing.", func() float64 { return float64(svc.Running()) })
	r.Register("runner_jobs_finished_total", "Jobs this process took to a terminal status, by status.", metrics.Counter, func() []metrics.Sample {
		finished := svc.Finished()
		out := make([]metrics.Sample, 0, len(finished))
		for _, status := range []domain.Status{domain.StatusSucceeded, domain.StatusFailed, domain.StatusCancelled} {
			out = append(out, metrics.Sample{Labels: []metrics.Label{{Name: "status", Value: string(status)}}, Value: float64(finished[status])})
		}
		return out
	})
}

// adminServer is the internal listener: bound in New, served from Start,
// closed by the cleanup stack.
type adminServer struct {
	ln     net.Listener
	srv    *http.Server
	logger *slog.Logger
}

func listenAdmin(ctx context.Context, addr string, reg *metrics.Registry, logger *slog.Logger) (*adminServer, error) {
	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	logger = logger.With(slog.String("module", "admin"))
	return &adminServer{
		ln: ln,
		srv: &http.Server{
			Handler:           httpx.AdminHandler(reg.Handler()),
			ReadHeaderTimeout: 10 * time.Second,
			ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
		},
		logger: logger,
	}, nil
}

func (a *adminServer) serve() {
	a.logger.Info("admin listener serving /metrics and /debug/pprof", slog.String("addr", a.ln.Addr().String()))
	go func() {
		if err := a.srv.Serve(a.ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			a.logger.Error("admin listener stopped", slog.Any("error", err))
		}
	}()
}

// close stops the listener whether or not serve ever ran (Shutdown only
// closes listeners Serve was handed).
func (a *adminServer) close(ctx context.Context) error {
	err := a.srv.Shutdown(ctx)
	if err != nil {
		err = errors.Join(err, a.srv.Close())
	}
	if cerr := a.ln.Close(); cerr != nil && !errors.Is(cerr, net.ErrClosed) {
		err = errors.Join(err, cerr)
	}
	return err
}

type saturated struct{}

func (saturated) Error() string { return "job queue saturated" }

var errQueueSaturated error = saturated{}
