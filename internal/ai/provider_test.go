package ai

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadProvider_FileAbsent(t *testing.T) {
	t.Setenv("AICONF_PATH", "/tmp/nonexistent-aiconf-XXXX.json")
	p, err := LoadProvider()
	if err != nil {
		t.Fatalf("expected nil error when file absent, got: %v", err)
	}
	if p != nil {
		t.Fatalf("expected nil provider when file absent, got: %+v", p)
	}
}

func TestLoadProvider_Unparseable(t *testing.T) {
	f, err := os.CreateTemp("", "aiconf-*.json")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	_, _ = f.WriteString("not-json{{{")
	_ = f.Close()

	t.Setenv("AICONF_PATH", f.Name())
	p, loadErr := LoadProvider()
	if loadErr != nil {
		t.Fatalf("expected nil error for unparseable file, got: %v", loadErr)
	}
	if p != nil {
		t.Fatal("expected nil provider for unparseable file")
	}
}

func TestLoadProvider_GlowByte(t *testing.T) {
	conf := map[string]any{
		"active": "glowbyte",
		"glowbyte": map[string]any{
			"model":    "gpt-4.1-mini",
			"token":    "sk-test",
			"api_base": "https://example.com/v1",
		},
	}
	data, _ := json.Marshal(conf)
	dir := t.TempDir()
	path := filepath.Join(dir, "aiconf.json")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AICONF_PATH", path)

	p, err := LoadProvider()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
	if p.Model != "gpt-4.1-mini" {
		t.Errorf("model = %q, want gpt-4.1-mini", p.Model)
	}
	if p.APIBase != "https://example.com/v1" {
		t.Errorf("api_base = %q", p.APIBase)
	}
	// Token must be set but we don't log it in test output.
	if p.Token == "" {
		t.Error("expected non-empty token")
	}
}

func TestLoadProvider_OpenRouter(t *testing.T) {
	conf := map[string]any{
		"active": "openrouter",
		"openrouter": map[string]any{
			"model":    "meta-llama/llama-3",
			"token":    "sk-or-test",
			"api_base": "https://openrouter.ai/api/v1",
		},
	}
	data, _ := json.Marshal(conf)
	dir := t.TempDir()
	path := filepath.Join(dir, "aiconf.json")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AICONF_PATH", path)

	p, err := LoadProvider()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p == nil || p.Model != "meta-llama/llama-3" {
		t.Fatalf("unexpected provider: %+v", p)
	}
}

func TestLoadProvider_Ollama(t *testing.T) {
	conf := map[string]any{
		"active": "ollama",
		"ollama": map[string]any{
			"model":    "qwen2.5:14b-instruct",
			"token":    "ollama",
			"api_base": "http://localhost:11434/v1",
		},
	}
	data, _ := json.Marshal(conf)
	dir := t.TempDir()
	path := filepath.Join(dir, "aiconf.json")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AICONF_PATH", path)

	p, err := LoadProvider()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p == nil {
		t.Fatal("expected non-nil provider")
	}
	if p.Model != "qwen2.5:14b-instruct" {
		t.Errorf("model = %q, want qwen2.5:14b-instruct", p.Model)
	}
	if p.APIBase != "http://localhost:11434/v1" {
		t.Errorf("api_base = %q", p.APIBase)
	}
	if p.Token != "ollama" {
		t.Error("expected token ollama")
	}
}
