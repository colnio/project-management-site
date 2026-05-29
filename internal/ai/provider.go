// Package ai implements the AI agentic-chat backend (Track G1+G2+G5).
// The model client is contained in client.go (one provider-swap file).
// Tools call the public REST API with short-lived internal tokens (iai_).
package ai

import (
	"encoding/json"
	"fmt"
	"os"
)

// Provider holds the resolved config for the active AI provider.
// The token is never logged.
type Provider struct {
	Model   string
	Token   string
	APIBase string
}

// aiConfFile is the on-disk shape of aiconf.local.json.
type aiConfFile struct {
	Active     string          `json:"active"`
	OpenRouter json.RawMessage `json:"openrouter"`
	GlowByte   json.RawMessage `json:"glowbyte"`
	Ollama     json.RawMessage `json:"ollama"`
}

type providerEntry struct {
	Model   string `json:"model"`
	Token   string `json:"token"`
	APIBase string `json:"api_base"`
}

// LoadProvider reads aiconf.local.json (path from env AICONF_PATH, default
// ./aiconf.local.json) and returns the active provider config.
// If the file is absent or unparseable, it returns (nil, nil) — the caller
// treats nil as "AI disabled" and serves 503 ai.unavailable.
// The token is never logged.
func LoadProvider() (*Provider, error) {
	path := os.Getenv("AICONF_PATH")
	if path == "" {
		path = "./aiconf.local.json"
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // AI disabled — file absent
		}
		return nil, nil // unparseable or unreadable — AI disabled
	}

	var conf aiConfFile
	if err := json.Unmarshal(data, &conf); err != nil {
		return nil, nil // unparseable — AI disabled
	}

	var raw json.RawMessage
	switch conf.Active {
	case "openrouter":
		raw = conf.OpenRouter
	case "glowbyte":
		raw = conf.GlowByte
	case "ollama":
		raw = conf.Ollama
	default:
		return nil, fmt.Errorf("ai: unknown provider %q in aiconf", conf.Active)
	}

	if len(raw) == 0 {
		return nil, fmt.Errorf("ai: provider %q config missing in aiconf", conf.Active)
	}

	var entry providerEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		return nil, fmt.Errorf("ai: parse provider entry: %w", err)
	}
	if entry.APIBase == "" || entry.Model == "" {
		return nil, fmt.Errorf("ai: provider %q missing model or api_base", conf.Active)
	}

	return &Provider{
		Model:   entry.Model,
		Token:   entry.Token,
		APIBase: entry.APIBase,
	}, nil
}
