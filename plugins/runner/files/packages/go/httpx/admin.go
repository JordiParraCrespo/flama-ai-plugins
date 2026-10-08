package httpx

import (
	"net/http"
	"net/http/pprof" //nolint:gosec // G108: its init registers on http.DefaultServeMux, which nothing serves; the handlers are mounted below on the admin mux only
)

// AdminHandler is the routes of an internal listener, kept apart from the
// public router the way Caddy keeps its admin endpoint apart from the sites
// it serves: `GET /metrics` (whatever handler the service passes, normally a
// metrics.Registry) and the runtime profiler under `/debug/pprof/`.
//
// None of it is authenticated — a heap profile or a goroutine dump is for
// whoever can reach the port — so it must be bound to loopback or a private
// interface and never published or routed by an ingress. It has no write
// timeout either: `/debug/pprof/profile` streams for as long as it is asked.
func AdminHandler(metrics http.Handler) http.Handler {
	mux := http.NewServeMux()
	if metrics != nil {
		mux.Handle("GET /metrics", metrics)
	}
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	return mux
}
