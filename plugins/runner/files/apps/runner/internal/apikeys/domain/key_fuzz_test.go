package domain

import (
	"strings"
	"testing"
	"time"

	"github.com/jordiparracrespo/flama-ai/packages/go/auth/scope"
)

// Every bearer value that is not a JWT reaches ParseToken, which picks the
// row to compare against. It must take a token apart exactly, and a token
// this package minted must always parse back to its own key.

func FuzzParseToken(f *testing.F) {
	_, minted, err := Generate("seed", []scope.Scope{"jobs:read"}, "t", nil, time.Now())
	if err != nil {
		f.Fatal(err)
	}
	for _, s := range []string{
		minted, "flr_", "flr__", "flr_id_", "flr__secret", "flr_id_sec_ret", "flr_id_secret",
		"FLR_id_secret", "flr-id-secret", "xflr_id_secret", "", "_", "__", "flr_\x00_\xff",
	} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, token string) {
		id, ok := ParseToken(token)
		if !ok {
			if id != "" {
				t.Fatalf("rejected %q but returned id %q", token, id)
			}
			return
		}
		if !IsToken(token) {
			t.Fatalf("parsed %q, which IsToken does not route here", token)
		}
		if id == "" || strings.Contains(id, "_") {
			t.Fatalf("%q gave id %q", token, id)
		}
		secret := strings.TrimPrefix(token, TokenPrefix+"_"+id+"_")
		if secret == token || secret == "" || TokenPrefix+"_"+id+"_"+secret != token {
			t.Fatalf("%q does not rebuild from id %q", token, id)
		}
	})
}

func FuzzGeneratedTokensParse(f *testing.F) {
	f.Add("key")
	f.Add(" padded name ")
	f.Fuzz(func(t *testing.T, name string) {
		key, token, err := Generate(name, []scope.Scope{"jobs:read"}, "t", nil, time.Now())
		if err != nil {
			if strings.TrimSpace(name) != "" {
				t.Fatalf("named %q: %v", name, err)
			}
			return
		}
		id, ok := ParseToken(token)
		if !ok || id != key.ID || !key.Matches(token) || key.Matches(token+"x") {
			t.Fatalf("minted %q does not parse back to key %q", token, key.ID)
		}
		if !strings.HasPrefix(token, key.Prefix) {
			t.Fatalf("display prefix %q is not a prefix of the token", key.Prefix)
		}
	})
}
