package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// braveTestServer spins up an httptest.Server that serves a canned Brave-shaped
// JSON response with n results, then overrides braveSearchBaseURL for the
// duration of the test.  Call t.Cleanup is registered automatically.
func braveTestServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(handler)
	orig := braveSearchBaseURL
	braveSearchBaseURL = srv.URL
	t.Cleanup(func() {
		braveSearchBaseURL = orig
		srv.Close()
	})
	return srv
}

// makeBraveBody returns a JSON body shaped like a Brave Web Search response
// with count results.
func makeBraveBody(count int) []byte {
	type result struct {
		Title       string `json:"title"`
		URL         string `json:"url"`
		Description string `json:"description"`
	}
	type web struct {
		Results []result `json:"results"`
	}
	type body struct {
		Web web `json:"web"`
	}
	var results []result
	for i := 0; i < count; i++ {
		results = append(results, result{
			Title:       "Title",
			URL:         "https://example.com",
			Description: "A description.",
		})
	}
	b, _ := json.Marshal(body{Web: web{Results: results}})
	return b
}

func TestWebSearch_Success(t *testing.T) {
	var capturedToken, capturedAccept, capturedQ, capturedCount string

	braveTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		capturedToken = r.Header.Get("X-Subscription-Token")
		capturedAccept = r.Header.Get("Accept")
		capturedQ = r.URL.Query().Get("q")
		capturedCount = r.URL.Query().Get("count")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(makeBraveBody(6))
	})

	t.Setenv("BRAVE_SEARCH_API_KEY", "test-key")

	result, err := webSearchTool().Handler(
		context.Background(),
		json.RawMessage(`{"query":"graphene synthesis"}`),
		nil,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify headers sent to Brave.
	if capturedToken != "test-key" {
		t.Errorf("X-Subscription-Token = %q, want test-key", capturedToken)
	}
	if capturedAccept != "application/json" {
		t.Errorf("Accept = %q, want application/json", capturedAccept)
	}
	if capturedQ != "graphene synthesis" {
		t.Errorf("q param = %q, want 'graphene synthesis'", capturedQ)
	}
	if capturedCount != "5" {
		t.Errorf("count param = %q, want 5", capturedCount)
	}

	// Result must be a JSON array of exactly 5 items (server returned 6).
	var items []struct {
		Title       string `json:"title"`
		URL         string `json:"url"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal([]byte(result), &items); err != nil {
		t.Fatalf("result is not valid JSON array: %v\nraw: %s", err, result)
	}
	if len(items) != 5 {
		t.Errorf("expected 5 results, got %d", len(items))
	}
	for i, item := range items {
		if strings.TrimSpace(item.Title) == "" {
			t.Errorf("item %d: empty title", i)
		}
		if strings.TrimSpace(item.URL) == "" {
			t.Errorf("item %d: empty url", i)
		}
		if strings.TrimSpace(item.Description) == "" {
			t.Errorf("item %d: empty description", i)
		}
	}
}

func TestWebSearch_CountClamp(t *testing.T) {
	var capturedCount string

	braveTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		capturedCount = r.URL.Query().Get("count")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(makeBraveBody(5))
	})

	t.Setenv("BRAVE_SEARCH_API_KEY", "test-key")

	result, err := webSearchTool().Handler(
		context.Background(),
		json.RawMessage(`{"query":"something","count":50}`),
		nil,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedCount != "5" {
		t.Errorf("count param sent to Brave = %q, want 5 (clamped)", capturedCount)
	}
	var items []any
	if err := json.Unmarshal([]byte(result), &items); err != nil {
		t.Fatalf("result not valid JSON: %v", err)
	}
	if len(items) > 5 {
		t.Errorf("expected ≤5 results, got %d", len(items))
	}
}

func TestWebSearch_DefaultCount(t *testing.T) {
	var capturedCount string

	braveTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		capturedCount = r.URL.Query().Get("count")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(makeBraveBody(5))
	})

	t.Setenv("BRAVE_SEARCH_API_KEY", "test-key")

	_, err := webSearchTool().Handler(
		context.Background(),
		json.RawMessage(`{"query":"default count test"}`),
		nil,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedCount != "5" {
		t.Errorf("count param = %q, want 5 (default)", capturedCount)
	}
}

func TestWebSearch_MissingKey(t *testing.T) {
	// No server needed — should short-circuit before making any HTTP call.
	t.Setenv("BRAVE_SEARCH_API_KEY", "")

	result, err := webSearchTool().Handler(
		context.Background(),
		json.RawMessage(`{"query":"test"}`),
		nil,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "not configured") {
		t.Errorf("expected 'not configured' in result, got: %s", result)
	}
}

func TestWebSearch_RateLimited(t *testing.T) {
	braveTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"message":"rate limited"}`))
	})

	t.Setenv("BRAVE_SEARCH_API_KEY", "test-key")

	result, err := webSearchTool().Handler(
		context.Background(),
		json.RawMessage(`{"query":"rate limit test"}`),
		nil,
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "rate-limited") {
		t.Errorf("expected 'rate-limited' in result, got: %s", result)
	}
}

func TestWebSearch_ServerError(t *testing.T) {
	braveTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"message":"internal error"}`))
	})

	t.Setenv("BRAVE_SEARCH_API_KEY", "test-key")

	_, err := webSearchTool().Handler(
		context.Background(),
		json.RawMessage(`{"query":"server error test"}`),
		nil,
	)
	if err == nil {
		t.Fatal("expected an error for 500 response")
	}
	if !strings.Contains(err.Error(), "brave status 500") {
		t.Errorf("expected 'brave status 500' in error, got: %v", err)
	}
}

func TestWebSearch_EmptyQuery(t *testing.T) {
	// A server override is harmless, but no HTTP call should be made.
	braveTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("no HTTP call expected for empty query")
	})

	t.Setenv("BRAVE_SEARCH_API_KEY", "test-key")

	_, err := webSearchTool().Handler(
		context.Background(),
		json.RawMessage(`{"query":"  "}`),
		nil,
	)
	if err == nil {
		t.Fatal("expected an error for empty query")
	}
	if !strings.Contains(err.Error(), "query required") {
		t.Errorf("expected 'query required' in error, got: %v", err)
	}
}
