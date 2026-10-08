package auth

import (
	"context"
	"crypto/subtle"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/jordiparracrespo/flama-ai/packages/go/auth/scope"
	"github.com/jordiparracrespo/flama-ai/packages/go/core/problem"
)

// The Authorization header is the first thing an attacker controls. These
// targets drive it through the bearer parser, the middleware and the JWT
// verifier, and check what may come out the other side.

const fuzzKey = "flr_fuzzkey_secretsecretsecretsecretsecret"

// keyVerifier stands in for the api-keys context: one known key.
type keyVerifier struct{}

func (keyVerifier) Accepts(token string) bool { return strings.HasPrefix(token, "flr_") }
func (keyVerifier) Verify(_ context.Context, token string) (*Principal, error) {
	if subtle.ConstantTimeCompare([]byte(token), []byte(fuzzKey)) != 1 {
		return nil, ErrInvalidCredential
	}
	return &Principal{ID: "key", Kind: KindAPIKey, Scopes: scope.NewSet("jobs:read")}, nil
}

func fuzzJWT(f *testing.F) *JWT {
	j, err := NewJWT(JWTOptions{Secret: secret, Issuer: "runner", Audience: "runner"})
	if err != nil {
		f.Fatal(err)
	}
	return j
}

func bearerSeeds(f *testing.F, j *JWT) []string {
	valid, err := j.Issue("agent-1", "agent", scope.NewSet("jobs:write"), time.Hour, time.Now())
	if err != nil {
		f.Fatal(err)
	}
	expired, _ := j.Issue("agent-1", "", scope.NewSet(), time.Minute, time.Now().Add(-time.Hour))
	other, _ := NewJWT(JWTOptions{Secret: []byte("ffffffffffffffffffffffffffffffff")})
	foreign, _ := other.Issue("agent-1", "", scope.NewSet(), time.Hour, time.Now())
	parts := strings.Split(valid, ".")
	return []string{
		valid, expired, foreign,
		parts[0] + "." + parts[1] + ".",                         // stripped signature
		"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." + parts[1] + ".", // alg none
		"eyJhbGciOiJIUzUxMiJ9." + parts[1] + "." + parts[2],     // alg swap
		"a.b.c", "..", ".", "", fuzzKey, fuzzKey + "x", "flr_", "flr__", "bootstrap",
	}
}

func FuzzBearer(f *testing.F) {
	for _, tok := range bearerSeeds(f, fuzzJWT(f)) {
		f.Add("Bearer " + tok)
	}
	for _, h := range []string{"", "Bearer", "Bearer ", "bearer x", "BEARER x", "Basic dXNlcjpwYXNz", "Bearer  x ", "Bearer\tx", "Token x", " Bearer x", "Bearer x y"} {
		f.Add(h)
	}
	f.Fuzz(func(t *testing.T, header string) {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("Authorization", header)
		token, ok := bearer(r)
		if !ok {
			if token != "" {
				t.Fatalf("rejected %q but returned %q", header, token)
			}
			return
		}
		if token == "" || token != strings.TrimSpace(token) {
			t.Fatalf("%q gave token %q", header, token)
		}
		got := r.Header.Get("Authorization")
		if len(got) < 7 || !strings.EqualFold(got[:7], "Bearer ") || !strings.Contains(got, token) {
			t.Fatalf("accepted %q as a bearer credential %q", got, token)
		}
	})
}

// FuzzAuthenticate checks the middleware as a whole: the next handler runs
// only for a credential some verifier vouched for, with that verifier's
// principal; everything else is a 401 problem.
func FuzzAuthenticate(f *testing.F) {
	j := fuzzJWT(f)
	for _, tok := range bearerSeeds(f, j) {
		f.Add("Bearer " + tok)
	}
	f.Add("")
	f.Add("Basic Zm9vOmJhcg==")
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	f.Fuzz(func(t *testing.T, header string) {
		var reached *Principal
		h := Authenticate(&problem.Writer{}, logger, j, keyVerifier{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reached = FromContext(r.Context())
			if reached == nil {
				t.Fatal("next handler ran without a principal")
			}
			w.WriteHeader(http.StatusNoContent)
		}))
		r := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
		r.Header.Set("Authorization", header)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)

		if reached == nil {
			if rec.Code != http.StatusUnauthorized || rec.Header().Get("Content-Type") != problem.ContentType {
				t.Fatalf("%q: rejected with %d %q", header, rec.Code, rec.Header().Get("Content-Type"))
			}
			return
		}
		token, _ := bearer(r)
		switch reached.Kind {
		case KindAPIKey:
			if token != fuzzKey {
				t.Fatalf("%q authenticated as the key", header)
			}
		case KindService:
			if p, err := j.Verify(context.Background(), token); err != nil || p.ID != reached.ID {
				t.Fatalf("%q authenticated as a service token the verifier rejects: %v", header, err)
			}
		default:
			t.Fatalf("%q produced principal kind %q", header, reached.Kind)
		}
	})
}

// FuzzJWTVerify feeds arbitrary strings to the verifier: malformed
// segments, other algorithms, `none`, stripped or foreign signatures. A
// fuzzer cannot forge HS256, so the only tokens that may pass are mutations
// of the valid seed that still decode to its signed bytes, and those must
// come out as the service principal it names.
func FuzzJWTVerify(f *testing.F) {
	j := fuzzJWT(f)
	for _, tok := range bearerSeeds(f, j) {
		f.Add(tok)
	}
	f.Fuzz(func(t *testing.T, token string) {
		p, err := j.Verify(context.Background(), token)
		if err != nil {
			if p != nil {
				t.Fatal("principal returned with an error")
			}
			return
		}
		if p.ID != "agent-1" || p.Kind != KindService {
			t.Fatalf("accepted %q as %+v", token, p)
		}
		if !j.Accepts(token) {
			t.Fatalf("verified a token Accepts would not route here: %q", token)
		}
	})
}

// FuzzJWTRoundTrip issues tokens from arbitrary subjects, names and scope
// claims and checks that verification returns exactly what was issued.
func FuzzJWTRoundTrip(f *testing.F) {
	j := fuzzJWT(f)
	f.Add("agent-1", "agent one", "jobs:write events:read")
	f.Add("", "", "")
	f.Add("a", "ünïcode ✓", "jobs:read jobs:read  keys:write")
	f.Add(`"quoted"`, "line\nbreak", "\t")
	now := time.Now()
	f.Fuzz(func(t *testing.T, subject, name, claim string) {
		granted := scope.ParseSet(claim)
		tok, err := j.Issue(subject, name, granted, time.Hour, now)
		if err != nil {
			t.Fatalf("issue: %v", err)
		}
		p, err := j.Verify(context.Background(), tok)
		if subject == "" {
			if err == nil {
				t.Fatal("a token without sub verified")
			}
			return
		}
		if !utf8.ValidString(subject) || !utf8.ValidString(name) || !utf8.ValidString(claim) {
			// JSON cannot carry invalid UTF-8; encoding/json replaces it
			// with U+FFFD, so the token would name a different subject or
			// scope than the one asked for (testdata/fuzz holds the case).
			// Unreachable in the service: subjects come from decoded JSON
			// and scopes from the catalog, both valid UTF-8.
			return
		}
		if err != nil {
			t.Fatalf("issued token rejected: %v", err)
		}
		if p.ID != subject || p.Name != name {
			t.Fatalf("issued sub=%q name=%q, verified sub=%q name=%q", subject, name, p.ID, p.Name)
		}
		if strings.Join(p.Scopes.Strings(), " ") != strings.Join(granted.Strings(), " ") {
			t.Fatalf("issued %v, verified %v", granted.Strings(), p.Scopes.Strings())
		}
	})
}
