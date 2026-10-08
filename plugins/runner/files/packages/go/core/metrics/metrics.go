// Package metrics exposes values in the Prometheus text exposition format
// (version 0.0.4) without the Prometheus client library.
//
// A service already holds the numbers worth scraping — a hub knows its
// connections, a queue its depth — so nothing here stores samples. A
// Registry is a list of named functions read at scrape time: gauges for
// values that go up and down, counters for totals that only grow. That is
// all a service of this size needs, and it keeps `packages/go` on the
// standard library. Reach for prometheus/client_golang when you need
// histograms or exemplars, not before.
package metrics

import (
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"runtime"
	rtmetrics "runtime/metrics"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ContentType is what /metrics answers with.
const ContentType = "text/plain; version=0.0.4; charset=utf-8"

// Kind is the metric TYPE.
type Kind string

const (
	Gauge   Kind = "gauge"
	Counter Kind = "counter"
)

// Label is one name="value" pair on a sample.
type Label struct {
	Name, Value string
}

// Sample is one line of a metric: its labels and value.
type Sample struct {
	Labels []Label
	Value  float64
}

// Collect returns a metric's samples at scrape time. It must be cheap and
// safe to call concurrently.
type Collect func() []Sample

type metric struct {
	name, help string
	kind       Kind
	collect    Collect
}

// Registry is the set of metrics a /metrics handler renders. The zero value
// is ready to use; it is safe for concurrent use.
type Registry struct {
	mu      sync.RWMutex
	metrics map[string]metric
}

var (
	nameRE  = regexp.MustCompile(`^[a-zA-Z_:][a-zA-Z0-9_:]*$`)
	labelRE = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)
)

// Register adds a metric. A malformed or duplicate name panics: metrics are
// registered at boot from constants, so a typo should fail there.
func (r *Registry) Register(name, help string, kind Kind, collect Collect) {
	if !nameRE.MatchString(name) {
		panic(fmt.Sprintf("metrics: malformed name %q", name))
	}
	if kind != Gauge && kind != Counter {
		panic(fmt.Sprintf("metrics: unknown kind %q for %s", kind, name))
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.metrics == nil {
		r.metrics = map[string]metric{}
	}
	if _, dup := r.metrics[name]; dup {
		panic(fmt.Sprintf("metrics: %s registered twice", name))
	}
	r.metrics[name] = metric{name: name, help: help, kind: kind, collect: collect}
}

// GaugeFunc registers an unlabelled gauge read from fn.
func (r *Registry) GaugeFunc(name, help string, fn func() float64) {
	r.Register(name, help, Gauge, func() []Sample { return []Sample{{Value: fn()}} })
}

// CounterFunc registers an unlabelled counter read from fn.
func (r *Registry) CounterFunc(name, help string, fn func() float64) {
	r.Register(name, help, Counter, func() []Sample { return []Sample{{Value: fn()}} })
}

// WriteText renders every metric, sorted by name, in the text format.
func (r *Registry) WriteText(w io.Writer) error {
	r.mu.RLock()
	ms := make([]metric, 0, len(r.metrics))
	for _, m := range r.metrics {
		ms = append(ms, m)
	}
	r.mu.RUnlock()
	sort.Slice(ms, func(i, j int) bool { return ms[i].name < ms[j].name })

	var b strings.Builder
	for _, m := range ms {
		if m.help != "" {
			b.WriteString("# HELP " + m.name + " " + escapeHelp(m.help) + "\n")
		}
		b.WriteString("# TYPE " + m.name + " " + string(m.kind) + "\n")
		for _, s := range m.collect() {
			b.WriteString(m.name)
			writeLabels(&b, s.Labels)
			b.WriteString(" " + formatValue(s.Value) + "\n")
		}
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// Handler serves the registry. Mount it on an internal listener only.
func (r *Registry) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", ContentType)
		w.Header().Set("Cache-Control", "no-store")
		_ = r.WriteText(w)
	})
}

func writeLabels(b *strings.Builder, labels []Label) {
	written := 0
	for _, l := range labels {
		if !labelRE.MatchString(l.Name) {
			// A collector bug, not input: keep the exposition parseable.
			continue
		}
		if written == 0 {
			b.WriteByte('{')
		} else {
			b.WriteByte(',')
		}
		b.WriteString(l.Name + `="` + escapeLabel(l.Value) + `"`)
		written++
	}
	if written > 0 {
		b.WriteByte('}')
	}
}

var (
	helpEscaper  = strings.NewReplacer(`\`, `\\`, "\n", `\n`)
	labelEscaper = strings.NewReplacer(`\`, `\\`, "\n", `\n`, `"`, `\"`)
)

func escapeHelp(s string) string  { return helpEscaper.Replace(s) }
func escapeLabel(s string) string { return labelEscaper.Replace(s) }

func formatValue(v float64) string {
	switch {
	case math.IsNaN(v):
		return "NaN"
	case math.IsInf(v, 1):
		return "+Inf"
	case math.IsInf(v, -1):
		return "-Inf"
	}
	return strconv.FormatFloat(v, 'g', -1, 64)
}

// RegisterRuntime adds the Go runtime basics under the names the Prometheus
// client uses, so existing dashboards find them: goroutines, heap and total
// memory, GC cycles, the Go version and the process start time.
func RegisterRuntime(r *Registry) {
	start := float64(time.Now().Unix())
	r.GaugeFunc("go_goroutines", "Number of goroutines that currently exist.", func() float64 {
		return float64(runtime.NumGoroutine())
	})
	r.GaugeFunc("go_memstats_heap_alloc_bytes", "Bytes of allocated heap objects.", func() float64 {
		return readRuntime("/memory/classes/heap/objects:bytes")
	})
	r.GaugeFunc("go_memstats_sys_bytes", "Bytes of memory obtained from the OS.", func() float64 {
		return readRuntime("/memory/classes/total:bytes")
	})
	r.CounterFunc("go_gc_cycles_total", "Completed GC cycles.", func() float64 {
		return readRuntime("/gc/cycles/total:gc-cycles")
	})
	r.Register("go_info", "Information about the Go environment.", Gauge, func() []Sample {
		return []Sample{{Labels: []Label{{Name: "version", Value: runtime.Version()}}, Value: 1}}
	})
	r.GaugeFunc("process_start_time_seconds", "Start time of the process since unix epoch in seconds.", func() float64 {
		return start
	})
}

// readRuntime reads one runtime/metrics value without stopping the world,
// which runtime.ReadMemStats would.
func readRuntime(name string) float64 {
	s := []rtmetrics.Sample{{Name: name}}
	rtmetrics.Read(s)
	switch s[0].Value.Kind() {
	case rtmetrics.KindUint64:
		return float64(s[0].Value.Uint64())
	case rtmetrics.KindFloat64:
		return s[0].Value.Float64()
	default:
		return math.NaN()
	}
}
