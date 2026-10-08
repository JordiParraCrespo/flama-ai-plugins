package httpx

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"
)

// ServerOptions are the knobs config exposes for the listener.
type ServerOptions struct {
	Addr string
	// Listener, when set, is served instead of listening on Addr: tests pass
	// a 127.0.0.1:0 listener to learn the port, and socket activation hands
	// one over. Serve closes it.
	Listener        net.Listener
	ShutdownTimeout time.Duration
	// ReadHeaderTimeout bounds slowloris-style header dribbling. Body and
	// write timeouts are deliberately not set globally: long-lived WebSocket
	// connections and streaming responses would trip them.
	ReadHeaderTimeout time.Duration
	IdleTimeout       time.Duration
}

// Serve runs the handler until ctx is cancelled, then shuts down within one
// ShutdownTimeout budget:
//
//  1. The listener closes and in-flight requests drain. Their contexts are
//     not derived from ctx — a request does not see the signal that started
//     the shutdown, so it finishes instead of failing half-way. Hijacked
//     connections (WebSockets) are not part of the drain and keep streaming.
//  2. The onShutdown hooks run with what is left of the budget: close
//     long-lived connections (a hub's 1001 Going Away), wait for workers,
//     then release what requests were using (pools). They run after the
//     drain so nothing a request still holds is closed under it.
//  3. If the drain overran the budget, the remaining requests' contexts are
//     cancelled and their connections closed before the hooks run.
func Serve(ctx context.Context, logger *slog.Logger, opts ServerOptions, h http.Handler, onShutdown ...func(context.Context)) error {
	// Requests get their own root: the values of ctx without its
	// cancellation, cancelled only when the drain gives up on them.
	base, cancelBase := context.WithCancel(context.WithoutCancel(ctx))
	defer cancelBase()

	srv := &http.Server{
		Addr:              opts.Addr,
		Handler:           h,
		ReadHeaderTimeout: opts.ReadHeaderTimeout,
		IdleTimeout:       opts.IdleTimeout,
		BaseContext:       func(net.Listener) context.Context { return base },
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}

	ln := opts.Listener
	if ln == nil {
		var err error
		if ln, err = (&net.ListenConfig{}).Listen(ctx, "tcp", opts.Addr); err != nil {
			return err
		}
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("http server listening", slog.String("addr", ln.Addr().String()))
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down", slog.Duration("timeout", opts.ShutdownTimeout))
	shutdownCtx, cancel := context.WithTimeout(context.Background(), opts.ShutdownTimeout)
	defer cancel()

	var closeErr error
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Warn("forced close after drain timeout", slog.Any("error", err))
		cancelBase()
		closeErr = srv.Close()
	}
	for _, hook := range onShutdown {
		hook(shutdownCtx)
	}
	return closeErr
}
