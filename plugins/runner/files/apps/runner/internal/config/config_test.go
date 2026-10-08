package config

import (
	"strings"
	"testing"

	"github.com/jordiparracrespo/flama-ai/packages/go/config"
)

func lookup(m map[string]string) config.Lookup {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

const key = "0123456789abcdef0123456789abcdef"

func TestParseDefaults(t *testing.T) {
	cfg, err := Parse(lookup(map[string]string{"RUNNER_BOOTSTRAP_API_KEY": key}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != 3006 || cfg.Env != config.Development || cfg.LogFormat != "text" || cfg.JWT != nil {
		t.Fatalf("unexpected defaults %+v", cfg)
	}
}

func TestParseRequiresBootstrapKey(t *testing.T) {
	_, err := Parse(lookup(map[string]string{}))
	if err == nil || !strings.Contains(err.Error(), "RUNNER_BOOTSTRAP_API_KEY") {
		t.Fatalf("expected bootstrap key error, got %v", err)
	}
}

func TestParseCollectsEveryError(t *testing.T) {
	_, err := Parse(lookup(map[string]string{
		"RUNNER_BOOTSTRAP_API_KEY": key,
		"RUNNER_PORT":              "abc",
		"RUNNER_JWT_SECRET":        "short",
		"RUNNER_ENV":               "staging",
	}))
	if err == nil {
		t.Fatal("expected errors")
	}
	for _, want := range []string{"RUNNER_PORT", "RUNNER_JWT_SECRET", "RUNNER_ENV"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("error should mention %s: %v", want, err)
		}
	}
}

func TestProductionDefaultsToJSONLogs(t *testing.T) {
	cfg, err := Parse(lookup(map[string]string{"RUNNER_BOOTSTRAP_API_KEY": key, "RUNNER_ENV": "production", "RUNNER_JWT_SECRET": key}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.LogFormat != "json" || cfg.JWT == nil || cfg.JWT.Issuer != "flama-runner" {
		t.Fatalf("unexpected %+v", cfg)
	}
}

func TestProductionRejectsThePlaceholderBootstrapKey(t *testing.T) {
	placeholder := "change-me-in-production-at-least-32-chars"
	_, err := Parse(lookup(map[string]string{"RUNNER_BOOTSTRAP_API_KEY": placeholder, "RUNNER_ENV": "production"}))
	if err == nil || !strings.Contains(err.Error(), "placeholder") {
		t.Fatalf("expected the placeholder to be refused in production, got %v", err)
	}
	if _, err := Parse(lookup(map[string]string{"RUNNER_BOOTSTRAP_API_KEY": placeholder})); err != nil {
		t.Fatalf("development keeps the placeholder working out of the box: %v", err)
	}
}

func TestAdminAddrIsOptionalAndValidated(t *testing.T) {
	cfg, err := Parse(lookup(map[string]string{"RUNNER_BOOTSTRAP_API_KEY": key}))
	if err != nil || cfg.AdminAddr != "" {
		t.Fatalf("admin listener should default to off: %q %v", cfg.AdminAddr, err)
	}
	cfg, err = Parse(lookup(map[string]string{"RUNNER_BOOTSTRAP_API_KEY": key, "RUNNER_ADMIN_ADDR": "127.0.0.1:9006"}))
	if err != nil || cfg.AdminAddr != "127.0.0.1:9006" {
		t.Fatalf("%q %v", cfg.AdminAddr, err)
	}
	_, err = Parse(lookup(map[string]string{"RUNNER_BOOTSTRAP_API_KEY": key, "RUNNER_ADMIN_ADDR": "9006"}))
	if err == nil || !strings.Contains(err.Error(), "RUNNER_ADMIN_ADDR") {
		t.Fatalf("a bare port should be refused: %v", err)
	}
}

func TestParsePortNeedsNoSecrets(t *testing.T) {
	if port, err := ParsePort(lookup(map[string]string{})); err != nil || port != 3006 {
		t.Fatalf("%d %v", port, err)
	}
	if port, err := ParsePort(lookup(map[string]string{"RUNNER_PORT": "4000"})); err != nil || port != 4000 {
		t.Fatalf("%d %v", port, err)
	}
	if _, err := ParsePort(lookup(map[string]string{"RUNNER_PORT": "x"})); err == nil {
		t.Fatal("a bad port should fail")
	}
}
