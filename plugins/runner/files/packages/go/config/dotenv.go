// Package config is the environment-loading toolkit every Go service
// shares: the root .env loader that mirrors @flama/env, and typed accessors
// that collect every parse error so a misconfigured process reports all of
// them at once.
package config

import (
	"bufio"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// workspaceMarker identifies the monorepo root: the file that declares the
// pnpm workspace is exactly what `@flama/env` looks for.
const workspaceMarker = "pnpm-workspace.yaml"

// FindWorkspaceRoot walks up from dir until it finds the marker.
func FindWorkspaceRoot(dir string) (string, bool) {
	for {
		if _, err := os.Stat(filepath.Join(dir, workspaceMarker)); err == nil {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

// LoadDotenv applies the root `.env` then `.env.local` (local wins between
// the files) without overwriting anything already in the environment — real
// variables always win, which is what makes the same binary correct in CI
// and in a container. A missing file is not an error.
func LoadDotenv(root string) error {
	for _, name := range []string{".env.local", ".env"} {
		if err := applyFile(filepath.Join(root, name)); err != nil {
			return err
		}
	}
	return nil
}

func applyFile(path string) error {
	f, err := os.Open(path) //nolint:gosec // path is <workspace root>/.env, derived from a marker file, not from input
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		key, value, ok := parseLine(sc.Text())
		if !ok {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			return err
		}
	}
	return sc.Err()
}

// parseLine splits one line into a variable, or reports that the line
// holds none: blank, a comment, no `=`, or a key or value the process could
// not set. A line `dotenv` would ignore is ignored here too, rather than
// turned into an os.Setenv error that fails boot.
func parseLine(raw string) (key, value string, ok bool) {
	// A byte-order mark is whitespace to dotenv's parser, not part of the
	// first key.
	line := strings.TrimSpace(strings.TrimPrefix(raw, "\ufeff"))
	if line == "" || strings.HasPrefix(line, "#") {
		return "", "", false
	}
	if rest, found := strings.CutPrefix(line, "export"); found && rest != "" && (rest[0] == ' ' || rest[0] == '\t') {
		line = strings.TrimLeft(rest, " \t")
	}
	key, value, ok = strings.Cut(line, "=")
	if !ok {
		return "", "", false
	}
	key = strings.TrimSpace(key)
	value = parseValue(value)
	if !validKey(key) || strings.ContainsRune(value, 0) {
		return "", "", false
	}
	return key, value, true
}

// parseValue handles the dotenv quoting rules `@flama/env` accepts: bare
// values lose trailing comments and whitespace, quoted values keep
// everything inside the quotes and may be followed by a comment.
func parseValue(raw string) string {
	v := strings.TrimSpace(raw)
	if inner, ok := quoted(v); ok {
		return inner
	}
	if len(v) >= 2 {
		switch {
		case v[0] == '"' && v[len(v)-1] == '"':
			return strings.ReplaceAll(v[1:len(v)-1], `\n`, "\n")
		case v[0] == '\'' && v[len(v)-1] == '\'':
			return v[1 : len(v)-1]
		}
	}
	if i := strings.Index(v, " #"); i >= 0 {
		v = strings.TrimSpace(v[:i])
	}
	return v
}

// quoted reads a value that opens with a quote and closes at the first
// matching (for double quotes, unescaped) quote, followed by nothing or a
// comment — `KEY="value" # note` is "value", as dotenv reads it.
func quoted(v string) (string, bool) {
	if len(v) < 2 || (v[0] != '"' && v[0] != '\'') {
		return "", false
	}
	q := v[0]
	for i := 1; i < len(v); i++ {
		if q == '"' && v[i] == '\\' {
			i++ // \" does not close
			continue
		}
		if v[i] != q {
			continue
		}
		rest := strings.TrimSpace(v[i+1:])
		if rest != "" && rest[0] != '#' {
			return "", false
		}
		inner := v[1:i]
		if q == '"' {
			inner = strings.ReplaceAll(inner, `\n`, "\n")
		}
		return inner, true
	}
	return "", false
}

// validKey is the key grammar `dotenv` (and so `@flama/env`) accepts:
// letters, digits, `_`, `.` and `-`.
func validKey(key string) bool {
	if key == "" {
		return false
	}
	for i := 0; i < len(key); i++ {
		switch c := key[i]; {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '_', c == '.', c == '-':
		default:
			return false
		}
	}
	return true
}
