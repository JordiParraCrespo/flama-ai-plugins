package scope

import (
	"strings"
	"testing"
	"unicode"
)

// Scopes arrive from outside on every mint (`POST /v1/api-keys`, service
// tokens) and inside every JWT `scope` claim. These targets hold the grammar
// to properties, not just to not panicking.

func FuzzScopeGrammar(f *testing.F) {
	for _, s := range []string{
		"jobs:read", "jobs:write", "keys:write", "events:read",
		"", ":", ":read", "jobs:", "jobs", "jobs:admin", "jobs:read:write",
		"a:b:read", " jobs:read", "jobs:read ", "JOBS:READ", "jobs:Read",
		"jobs\x00:read", "jöbs:write", "jobs:write\n",
	} {
		f.Add(s)
	}
	catalog := NewCatalog("jobs:read", "jobs:write", "keys:read", "keys:write", "events:read")

	f.Fuzz(func(t *testing.T, raw string) {
		s := Scope(raw)

		// Valid is exactly the `resource:read|write` shape.
		if s.Valid() {
			if s.Resource() == "" || strings.Contains(s.Resource(), ":") {
				t.Fatalf("%q valid with resource %q", raw, s.Resource())
			}
			if s.Level() != Read && s.Level() != Write {
				t.Fatalf("%q valid with level %q", raw, s.Level())
			}
			if string(s) != s.Resource()+":"+string(s.Level()) {
				t.Fatalf("%q does not rebuild from its parts", raw)
			}
		}

		// A catalog never hands back a scope that is not well formed and
		// known, whatever it is given.
		if parsed, err := catalog.Parse(raw); err == nil {
			if !parsed.Valid() {
				t.Fatalf("catalog accepted malformed %q as %q", raw, parsed)
			}
			found := false
			for _, known := range catalog.All() {
				found = found || known == parsed
			}
			if !found {
				t.Fatalf("catalog accepted unknown %q", parsed)
			}
		}

		// A grant satisfies itself, and only itself or — for write — the
		// read on the same resource. Nothing else, valid or not.
		granted := NewSet(s)
		if !granted.Has(s) {
			t.Fatalf("%q does not satisfy itself", raw)
		}
		for _, req := range []Scope{"jobs:read", "jobs:write", "keys:read", Scope(s.Resource() + ":read"), Scope(s.Resource() + ":write"), ":read"} {
			if !granted.Has(req) {
				continue
			}
			implied := req.Level() == Read && s == Scope(req.Resource()+":"+string(Write))
			if req != s && !implied {
				t.Fatalf("grant %q satisfied %q", raw, req)
			}
		}
	})
}

func FuzzParseSetRoundTrip(f *testing.F) {
	for _, s := range []string{
		"", "jobs:read", "jobs:read jobs:write", "  jobs:read\tkeys:write\n",
		"jobs:read jobs:read", "jobs:read keys:read", " ", "a b  c",
	} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, claim string) {
		set := ParseSet(claim)
		for _, s := range set.Strings() {
			if s == "" || strings.IndexFunc(s, unicode.IsSpace) >= 0 {
				t.Fatalf("claim %q produced scope %q", claim, s)
			}
		}
		// What Issue writes into a token (Strings joined by spaces) parses
		// back to the same set, so a token never gains or loses a scope.
		again := ParseSet(strings.Join(set.Strings(), " "))
		if strings.Join(again.Strings(), " ") != strings.Join(set.Strings(), " ") {
			t.Fatalf("claim %q: %v became %v", claim, set.Strings(), again.Strings())
		}
	})
}
