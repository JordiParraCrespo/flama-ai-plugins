# @flama/go-core

The bottom of the Go toolkit: what every other module and every Go service
need before anything else exists. `problem` produces RFC 7807 documents that
mirror the NestJS API's field for field, so one client parser covers both
stacks; `logging` builds the process-wide `slog` logger; `lifecycle` is the
cleanup stack a composition root opens resources onto; `metrics` renders the
numbers a service already keeps in the Prometheus text format. Nothing here
knows about HTTP routing, credentials or a database; the module imports only
the standard library.

## What it exports

`problem/problem.go`

- `Error` — the one error type use cases return when they know how a failure
  should be reported; `WithDetail`, `WithCause`, `WithInvalidParams` return
  copies, so a catalog value is never mutated.
- `New(code, status, title)` declares a catalog entry; `Status(status)` is a
  bare `about:blank` problem.
- The shared catalog: `ErrValidation`, `ErrUnauthorized`, `ErrForbidden`,
  `ErrNotFound`, `ErrConflict`, `ErrPayloadSize`, `ErrInternal`
  (`RUNNER_001`–`RUNNER_006`, `RUNNER_500`).
- `Writer` renders any error as `application/problem+json` (`Write`), logging
  5xx at error and the rest at debug; `From` picks the problem for an error.
- `WithCorrelationID` / `CorrelationID` carry the request id on a context
  without importing `httpx`; `TypeFor` builds the `type` URI; `Details` and
  `InvalidParam` are the wire shapes; `ContentType`, `DefaultType`,
  `DefaultTypeBaseURL`.

`logging/logging.go`

- `New(w, Options)` — JSON or text handler at the given level, stamped with
  `service` and `version`.

`lifecycle/lifecycle.go` — Caddy's `ctx.OnCancel`, as a value

- `Stack` (zero value ready): `Add(name, func(ctx) error)` registers a
  cleanup as a resource is opened; `Close(ctx)` runs them last-in first-out
  and joins their errors, each prefixed with its name. It is idempotent
  (later calls return the first result) and bounded by `ctx`: a cleanup
  still running at the deadline is abandoned and the rest are skipped and
  reported, never run out of order. A panicking cleanup becomes its error;
  `Add` after `Close` panics. `Len` counts what is registered.

`metrics/metrics.go` — the text exposition format, no client library

- `Registry` (zero value ready): `GaugeFunc` / `CounterFunc(name, help, fn)`
  for a single value, `Register(name, help, kind, collect)` for labelled
  samples. Nothing is stored: every function is read at scrape time.
  Malformed and duplicate names panic at registration.
- `WriteText(w)` renders sorted by name with label and help escaping and
  `NaN`/`±Inf`; `Handler()` serves it with `ContentType`.
- `RegisterRuntime(r)` adds `go_goroutines`, `go_memstats_heap_alloc_bytes`,
  `go_memstats_sys_bytes`, `go_gc_cycles_total`, `go_info` and
  `process_start_time_seconds`, read from `runtime/metrics` without
  stopping the world.

## How to use it

A bounded context declares its errors once and returns them with detail; the
router renders them (from `apps/runner/internal/jobs/domain/errors.go` and
the composition root):

```go
var ErrQueueFull = problem.New("JOB_003", http.StatusTooManyRequests, "Job queue is full")

return ErrQueueFull.WithDetail("%d jobs queued", depth)
```

```go
problems := &problem.Writer{TypeBaseURL: cfg.ErrorTypeBaseURL, Logger: logger}
logger := logging.New(os.Stdout, logging.Options{Level: cfg.LogLevel, Format: cfg.LogFormat, Service: "runner", Version: cfg.Version})
```

The composition root (`apps/runner/internal/server`) registers each cleanup
as it opens the resource, unwinds on a failed boot and closes the stack on
shutdown; it also builds the registry `/metrics` serves:

```go
pool, err := pg.Open(ctx, cfg.DatabaseURL, pg.Options{})
if err != nil {
	return nil, err // a deferred s.closers.Close(ctx) unwinds what came before
}
s.closers.Add("postgres pool", func(context.Context) error { pool.Close(); return nil })

r.GaugeFunc("runner_ws_connections", "Open WebSocket connections.", func() float64 { return float64(hub.Len()) })
```

## How to run it

```bash
go test -count=1 ./...
golangci-lint run ./...
go build ./...
```

## Dependencies

Depends on nothing but the standard library. Imported by every other
`packages/go` module except `config` and `postgres`, and by every layer of
`apps/runner` (`domain` may import `core/problem` and nothing else from the
toolkit).
