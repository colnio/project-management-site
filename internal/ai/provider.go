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

	// The file is a flat object: an "active" key naming the provider plus one
	// block per provider (e.g. "ollama", "DeepInfra"). Decoding into a map lets
	// any provider name resolve without a hard-coded list — case-sensitive, so
	// "active" must match a block key exactly.
	var conf map[string]json.RawMessage
	if err := json.Unmarshal(data, &conf); err != nil {
		return nil, nil // unparseable — AI disabled
	}

	var active string
	if err := json.Unmarshal(conf["active"], &active); err != nil || active == "" {
		return nil, fmt.Errorf("ai: missing or invalid %q in aiconf", "active")
	}

	raw := conf[active]
	if len(raw) == 0 {
		return nil, fmt.Errorf("ai: provider %q config missing in aiconf", active)
	}

	var entry providerEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		return nil, fmt.Errorf("ai: parse provider entry: %w", err)
	}
	if entry.APIBase == "" || entry.Model == "" {
		return nil, fmt.Errorf("ai: provider %q missing model or api_base", active)
	}

	return &Provider{
		Model:   entry.Model,
		Token:   entry.Token,
		APIBase: entry.APIBase,
	}, nil
}
