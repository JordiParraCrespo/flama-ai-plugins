package config

import (
	"strings"
	"testing"
)

// The root .env is edited by hand, copied between machines and pasted
// into; parseLine is the only thing between it and the process
// environment.

func dotenvSeeds(f *testing.F) {
	for _, s := range []string{
		"RUNNER_PORT=3006", "export RUNNER_ENV=development", "# comment", "", "   ",
		"KEY=plain # comment", "KEY=a#b", `KEY="quoted # keep"`, `KEY="quoted" # comment`,
		`KEY='single' # comment`, `KEY="line\nbreak"`, "KEY='", `KEY="`, "KEY=", "KEY= padded ",
		"=value", " = ", "NO_EQUALS", "KEY==x", "export =x", "export KEY", "K EY=1",
		"KEY=nul\x00byte", "KE\x00Y=1", "KEY=\"a\"\"b\"", "\ufeffKEY=bom",
	} {
		f.Add(s)
	}
}

// FuzzParseLine: whatever a line holds, what comes out is something the
// process can set. os.Setenv refuses an empty key, a key with `=` and any
// NUL, and the loader would turn that refusal into a failed boot.
func FuzzParseLine(f *testing.F) {
	dotenvSeeds(f)
	f.Fuzz(func(t *testing.T, line string) {
		key, value, ok := parseLine(line)
		if !ok {
			return
		}
		if !validKey(key) {
			t.Fatalf("%q yielded key %q", line, key)
		}
		if strings.ContainsRune(value, 0) {
			t.Fatalf("%q yielded a value with NUL", line)
		}
		if key != strings.TrimSpace(key) {
			t.Fatalf("%q yielded unpadded key %q", line, key)
		}
	})
}

// FuzzQuotedValueRoundTrip writes a value the way someone would in .env —
// quoted, optionally followed by a comment — and expects it back exactly.
// Single quotes are literal, so any value without a quote or a line break
// survives them.
func FuzzQuotedValueRoundTrip(f *testing.F) {
	f.Add("value", "", false)
	f.Add("with # hash", "trailing note", true)
	f.Add("  spaced  ", "", true)
	f.Add("", "empty", true)
	f.Add(`back\slash "dq"`, "x", false)
	f.Fuzz(func(t *testing.T, value, comment string, export bool) {
		if strings.ContainsAny(value, "'\r\n\x00") || strings.ContainsAny(comment, "\r\n\x00") {
			return
		}
		line := "KEY='" + value + "'"
		if comment != "" {
			line += " # " + comment
		}
		if export {
			line = "export " + line
		}
		key, got, ok := parseLine(line)
		if !ok || key != "KEY" || got != value {
			t.Fatalf("%q: got key %q value %q ok %v, want %q", line, key, got, ok, value)
		}
	})
}
