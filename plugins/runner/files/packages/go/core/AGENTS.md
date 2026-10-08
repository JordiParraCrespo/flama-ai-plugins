# @flama/go-core — Agent Instructions

> Read the root [`CLAUDE.md`](../../../CLAUDE.md) first, then
> [`packages/go/README.md`](../README.md) for how the Go modules fit
> together and [`apps/runner/ARCHITECTURE.md`](../../../apps/runner/ARCHITECTURE.md)
> for the hexagon they serve.

## Where things go

- A new problem is a catalog entry via `problem.New(code, status, title)` in the service that owns it; the shared codes here are the ones every service reports.
- Log fields go through the `slog` logger `logging.New` builds; no other logger.
- Something a constructor opens is closed through a `lifecycle.Stack`, not
  by hand in each error branch; a metric is a function on a
  `metrics.Registry` over a value the service already keeps.
- This module stays on the standard library. A metric type the text format
  cannot express without storing samples (histograms) is the point to adopt
  `prometheus/client_golang`, not to grow `metrics`.
- Anything a second service would copy belongs here; anything one service
  owns stays in that service under `internal/`.

## Before pushing

```bash
golangci-lint run ./...   # this module
go test -count=1 ./...    # this module
make -C .. test           # every module in go.work, the runner's boundary test included
```

## Patterns agents get wrong

- Importing another module's internals instead of its exported type. The
  modules depend on each other only through what they export: `core` under
  everything, `auth` on `core` and `httpx`, `ws` on `auth`.
- Hand-writing a JSON error body. Every failure is an RFC 7807 problem
  document from `core/problem`, rendered by the `httpx` router.
- Reaching for a framework. Standard `net/http`, `slog`, interfaces as
  ports and constructor injection are the whole toolkit.

See [`.agents/rules/go.md`](../../../.agents/rules/go.md).
