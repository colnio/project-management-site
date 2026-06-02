package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ─── httpClient tests ─────────────────────────────────────────────────────────

func TestHTTPClient_Chat_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		auth := r.Header.Get("Authorization")
		if auth != "Bearer test-token" {
			t.Errorf("expected Bearer test-token, got %q", auth)
		}
		body, _ := io.ReadAll(r.Body)
		var req ChatRequest
		if err := json.Unmarshal(body, &req); err != nil {
			t.Errorf("unmarshal request: %v", err)
		}
		if len(req.Messages) == 0 {
			t.Error("expected at least one message")
		}

		resp := openAIResponse{
			Choices: []struct {
				Message      ChatMessage  `json:"message"`
				Delta        *ChatMessage `json:"delta,omitempty"`
				FinishReason string       `json:"finish_reason"`
			}{
				{
					Message:      ChatMessage{Role: "assistant", Content: "Hello!"},
					FinishReason: "stop",
				},
			},
			Usage: Usage{PromptTokens: 10, CompletionTokens: 5, TotalTokens: 15},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewHTTPClient(&Provider{
		Model:   "test-model",
		Token:   "test-token",
		APIBase: srv.URL,
	})

	resp, err := client.Chat(context.Background(), ChatRequest{
		Messages: []ChatMessage{{Role: "user", Content: "hi"}},
	})
	if err != nil {
		t.Fatalf("Chat error: %v", err)
	}
	if resp.Message.Content != "Hello!" {
		t.Errorf("content = %q, want Hello!", resp.Message.Content)
	}
	if resp.Usage.TotalTokens != 15 {
		t.Errorf("total_tokens = %d, want 15", resp.Usage.TotalTokens)
	}
}

func TestHTTPClient_Chat_ToolCalls(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := openAIResponse{
			Choices: []struct {
				Message      ChatMessage  `json:"message"`
				Delta        *ChatMessage `json:"delta,omitempty"`
				FinishReason string       `json:"finish_reason"`
			}{
				{
					Message: ChatMessage{
						Role: "assistant",
						ToolCalls: []ToolCall{
							{
								ID:   "call_123",
								Type: "function",
								Function: FunctionCall{
									Name:      "read_sample",
									Arguments: `{"sample_id":"abc"}`,
								},
							},
						},
					},
					FinishReason: "tool_calls",
				},
			},
			Usage: Usage{PromptTokens: 20, CompletionTokens: 10},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	client := NewHTTPClient(&Provider{Model: "m", Token: "t", APIBase: srv.URL})
	resp, err := client.Chat(context.Background(), ChatRequest{
		Messages: []ChatMessage{{Role: "user", Content: "read sample abc"}},
	})
	if err != nil {
		t.Fatalf("Chat error: %v", err)
	}
	if len(resp.Message.ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(resp.Message.ToolCalls))
	}
	if resp.Message.ToolCalls[0].Function.Name != "read_sample" {
		t.Errorf("tool name = %q", resp.Message.ToolCalls[0].Function.Name)
	}
}

func TestHTTPClient_Chat_ProviderError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"overloaded"}`, http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	client := NewHTTPClient(&Provider{Model: "m", Token: "t", APIBase: srv.URL})
	_, err := client.Chat(context.Background(), ChatRequest{
		Messages: []ChatMessage{{Role: "user", Content: "hi"}},
	})
	if err == nil {
		t.Fatal("expected error from 503 response")
	}
	if !strings.Contains(err.Error(), "503") {
		t.Errorf("error should mention 503: %v", err)
	}
}

func TestHTTPClient_ChatStream_Basic(t *testing.T) {
	events := []string{
		`data: {"choices":[{"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}`,
		`data: [DONE]`,
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		for _, e := range events {
			_, _ = fmt.Fprintln(w, e)
			_, _ = fmt.Fprintln(w)
		}
	}))
	defer srv.Close()

	client := NewHTTPClient(&Provider{Model: "m", Token: "t", APIBase: srv.URL})
	ch, err := client.ChatStream(context.Background(), ChatRequest{
		Messages: []ChatMessage{{Role: "user", Content: "hi"}},
	})
	if err != nil {
		t.Fatalf("ChatStream error: %v", err)
	}

	var content strings.Builder
	var gotUsage *Usage
	for chunk := range ch {
		if chunk.Err != nil {
			t.Fatalf("stream chunk error: %v", chunk.Err)
		}
		content.WriteString(chunk.ContentDelta)
		if chunk.Usage != nil {
			gotUsage = chunk.Usage
		}
	}

	if content.String() != "Hello world" {
		t.Errorf("content = %q, want 'Hello world'", content.String())
	}
	if gotUsage == nil {
		t.Error("expected usage in stream")
	} else if gotUsage.TotalTokens != 7 {
		t.Errorf("total_tokens = %d, want 7", gotUsage.TotalTokens)
	}
}

// TestHTTPClient_ChatStream_ParallelToolCalls guards the streamed tool-call
// accumulator. Providers like DeepInfra emit several tool calls in one turn,
// streaming each fragment in its own delta keyed by an `index`. Accumulating by
// slice position instead of that index concatenated the names into one bogus
// tool (e.g. "list_sampleslist_experiments…"). Each call must stay separate.
func TestHTTPClient_ChatStream_ParallelToolCalls(t *testing.T) {
	events := []string{
		// Three parallel calls announced (one per delta, distinct index).
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"list_samples","arguments":""}}]},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_b","type":"function","function":{"name":"list_experiments","arguments":""}}]},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":2,"id":"call_c","type":"function","function":{"name":"list_artifacts","arguments":""}}]},"finish_reason":null}]}`,
		// Argument fragments arrive out of order, split across deltas.
		`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\"limit\":"}}]},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"5}"}}]},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":2,"function":{"arguments":"{}"}}]},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}`,
		`data: [DONE]`,
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		for _, e := range events {
			_, _ = fmt.Fprintln(w, e)
			_, _ = fmt.Fprintln(w)
		}
	}))
	defer srv.Close()

	client := NewHTTPClient(&Provider{Model: "m", Token: "t", APIBase: srv.URL})
	ch, err := client.ChatStream(context.Background(), ChatRequest{
		Messages: []ChatMessage{{Role: "user", Content: "list everything"}},
	})
	if err != nil {
		t.Fatalf("ChatStream error: %v", err)
	}

	var got []ToolCall
	for chunk := range ch {
		if chunk.Err != nil {
			t.Fatalf("stream chunk error: %v", chunk.Err)
		}
		got = append(got, chunk.ToolCalls...)
	}

	if len(got) != 3 {
		t.Fatalf("expected 3 separate tool calls, got %d: %+v", len(got), got)
	}
	want := []ToolCall{
		{ID: "call_a", Type: "function", Function: FunctionCall{Name: "list_samples", Arguments: "{}"}},
		{ID: "call_b", Type: "function", Function: FunctionCall{Name: "list_experiments", Arguments: `{"limit":5}`}},
		{ID: "call_c", Type: "function", Function: FunctionCall{Name: "list_artifacts", Arguments: "{}"}},
	}
	for i, w := range want {
		if got[i] != w {
			t.Errorf("tool call %d = %+v, want %+v", i, got[i], w)
		}
	}
}

// ─── Stub client tests ────────────────────────────────────────────────────────

func TestStubClient_Chat(t *testing.T) {
	expected := &ChatResponse{
		Message:      ChatMessage{Role: "assistant", Content: "stub response"},
		Usage:        Usage{PromptTokens: 1, CompletionTokens: 1, TotalTokens: 2},
		FinishReason: "stop",
	}
	client := NewStubClient([]StubResponse{{Response: expected}})
	resp, err := client.Chat(context.Background(), ChatRequest{})
	if err != nil {
		t.Fatalf("stub Chat error: %v", err)
	}
	if resp.Message.Content != "stub response" {
		t.Errorf("content = %q", resp.Message.Content)
	}
}

func TestStubClient_ChatStream(t *testing.T) {
	expected := &ChatResponse{
		Message: ChatMessage{Role: "assistant", Content: "hello from stub"},
		Usage:   Usage{TotalTokens: 3},
	}
	client := NewStubClient([]StubResponse{{Response: expected}})
	ch, err := client.ChatStream(context.Background(), ChatRequest{})
	if err != nil {
		t.Fatalf("stub ChatStream error: %v", err)
	}
	var content strings.Builder
	for chunk := range ch {
		content.WriteString(chunk.ContentDelta)
	}
	if content.String() != "hello from stub" {
		t.Errorf("content = %q", content.String())
	}
}

func TestStubClient_ExhaustedResponses(t *testing.T) {
	client := NewStubClient([]StubResponse{})
	_, err := client.Chat(context.Background(), ChatRequest{})
	if err == nil {
		t.Fatal("expected error when no responses left")
	}
}
