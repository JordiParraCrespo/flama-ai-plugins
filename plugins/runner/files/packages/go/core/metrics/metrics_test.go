package metrics

import (
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func render(t *testing.T, r *Registry) string {
	t.Helper()
	var b strings.Builder
	if err := r.WriteText(&b); err != nil {
		t.Fatal(err)
	}
	return b.String()
}

func TestWriteTextFormat(t *testing.T) {
	var r Registry
	r.GaugeFunc("b_depth", "Queued items.", func() float64 { return 3 })
	r.Register("a_total", "Finished, by status.", Counter, func() []Sample {
		return []Sample{
			{Labels: []Label{{Name: "status", Value: "ok"}}, Value: 2},
			{Labels: []Label{{Name: "status", Value: `say "hi"\` + "\n"}}, Value: 1},
		}
	})
	got := render(t, &r)
	want := `# HELP a_total Finished, by status.
# TYPE a_total counter
a_total{status="ok"} 2
a_total{status="say \"hi\"\\\n"} 1
# HELP b_depth Queued items.
# TYPE b_depth gauge
b_depth 3
`
	if got != want {
		t.Fatalf("got\n%s\nwant\n%s", got, want)
	}
}

func TestSpecialValuesAndBadLabels(t *testing.T) {
	var r Registry
	r.Register("v", "line one\nline two", Gauge, func() []Sample {
		return []Sample{
			{Value: math.NaN()},
			{Value: math.Inf(1)},
			{Labels: []Label{{Name: "0bad", Value: "x"}, {Name: "ok", Value: "y"}}, Value: math.Inf(-1)},
			{Labels: []Label{{Name: "bad-name", Value: "x"}}, Value: 0.5},
		}
	})
	got := render(t, &r)
	for _, want := range []string{
		"# HELP v line one\\nline two\n",
		"v NaN\n", "v +Inf\n", `v{ok="y"} -Inf` + "\n", "v 0.5\n",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in\n%s", want, got)
		}
	}
}

func TestRegisterRejectsTyposAtBoot(t *testing.T) {
	for name, fn := range map[string]func(r *Registry){
		"malformed": func(r *Registry) { r.GaugeFunc("runner-depth", "", func() float64 { return 0 }) },
		"duplicate": func(r *Registry) {
			r.GaugeFunc("x", "", func() float64 { return 0 })
			r.GaugeFunc("x", "", func() float64 { return 0 })
		},
		"kind": func(r *Registry) { r.Register("x", "", Kind("histogram"), nil) },
	} {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("expected a panic")
				}
			}()
			fn(&Registry{})
		})
	}
}

func TestHandlerServesRuntimeMetrics(t *testing.T) {
	var r Registry
	RegisterRuntime(&r)
	rec := httptest.NewRecorder()
	r.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if rec.Code != 200 || rec.Header().Get("Content-Type") != ContentType {
		t.Fatalf("%d %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	body := rec.Body.String()
	for _, want := range []string{"# TYPE go_goroutines gauge\ngo_goroutines ", "go_memstats_heap_alloc_bytes ", "go_gc_cycles_total ", `go_info{version="go`, "process_start_time_seconds "} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q in\n%s", want, body)
		}
	}
	if strings.Contains(body, "NaN") {
		t.Fatalf("a runtime metric name is wrong for this Go version:\n%s", body)
	}
}
