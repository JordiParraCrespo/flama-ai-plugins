package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func lookup(m map[string]string) Lookup {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func TestEnvCollectsEveryError(t *testing.T) {
	e := NewEnv(lookup(map[string]string{"PORT": "abc", "TTL": "soon", "FLAG": "maybe", "SECRET": "short"}))
	if e.Int("PORT", 1) != 1 || e.Duration("TTL", time.Second) != time.Second || e.Bool("FLAG", false) || e.Secret("SECRET", 32) != "short" {
		t.Fatal("defaults should be returned on failure")
	}
	err := e.Err()
	for _, want := range []string{"PORT", "TTL", "FLAG", "SECRET"} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("error should mention %s: %v", want, err)
		}
	}
}

func TestEnvBlankIsAbsent(t *testing.T) {
	e := NewEnv(lookup(map[string]string{"A": "  ", "B": "x"}))
	if e.Optional("A") != "" || e.String("A", "d") != "d" || e.Optional("B") != "x" {
		t.Fatal("blank must read as unset")
	}
	if e.Err() != nil {
		t.Fatal(e.Err())
	}
}

func TestParseValue(t *testing.T) {
	cases := map[string]string{
		`plain`:           "plain",
		`plain # comment`: "plain",
		`"quoted # keep"`: "quoted # keep",
		`'single'`:        "single",
		`"line\nbreak"`:   "line\nbreak",
		`  padded  `:      "padded",
	}
	for in, want := range cases {
		if got := parseValue(in); got != want {
			t.Errorf("parseValue(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestParseLine(t *testing.T) {
	type kv struct {
		key, value string
		ok         bool
	}
	cases := map[string]kv{
		"KEY=v":                  {"KEY", "v", true},
		"export KEY=v":           {"KEY", "v", true},
		"export\tKEY=v":          {"KEY", "v", true},
		"export=v":               {"export", "v", true},
		`KEY="quoted" # comment`: {"KEY", "quoted", true},
		`KEY='single' # comment`: {"KEY", "single", true},
		`KEY="say \"hi\"" # c`:   {"KEY", `say \"hi\"`, true},
		`KEY="a""b"`:             {"KEY", `a""b`, true},
		"\ufeffKEY=bom":          {"KEY", "bom", true},
		"=value":                 {"", "", false},
		"export =x":              {"", "", false},
		"K EY=1":                 {"", "", false},
		"KE\x00Y=1":              {"", "", false},
		"KEY=nul\x00byte":        {"", "", false},
		"# KEY=commented":        {"", "", false},
		"NO_EQUALS":              {"", "", false},
		"app.name-v2=dotted":     {"app.name-v2", "dotted", true},
	}
	for in, want := range cases {
		key, value, ok := parseLine(in)
		if (kv{key, value, ok}) != want {
			t.Errorf("parseLine(%q) = %q %q %v, want %+v", in, key, value, ok, want)
		}
	}
}

// One malformed line used to make os.Setenv fail and the service refuse to
// boot; dotenv skips it, and so does this loader.
func TestLoadDotenvSkipsLinesItCannotSet(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("=oops\nFLAMA_DOTENV_TEST=ok\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("FLAMA_DOTENV_TEST", "")
	os.Unsetenv("FLAMA_DOTENV_TEST")
	if err := LoadDotenv(dir); err != nil {
		t.Fatalf("a malformed line failed the load: %v", err)
	}
	if got := os.Getenv("FLAMA_DOTENV_TEST"); got != "ok" {
		t.Fatalf("valid line after the bad one not applied: %q", got)
	}
}
