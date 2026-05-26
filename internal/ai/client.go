package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ─── OpenAI-compatible types ─────────────────────────────────────────────────

// ChatMessage represents a single message in a chat conversation.
type ChatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

// Tool is an OpenAI-format tool definition.
type Tool struct {
	Type     string      `json:"type"`
	Function FunctionDef `json:"function"`
}

// FunctionDef describes a callable function.
type FunctionDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

// ToolCall is a tool invocation emitted by the model.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall is the name+arguments pair inside a ToolCall.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Usage is token usage from the model response.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ChatRequest is an OpenAI-compatible chat completions request.
type ChatRequest struct {
	Model       string      `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Tools       []Tool      `json:"tools,omitempty"`
	ToolChoice  any         `json:"tool_choice,omitempty"`
	Temperature float64     `json:"temperature,omitempty"`
	MaxTokens   int         `json:"max_tokens,omitempty"`
}

// ChatResponse is the resolved result of a non-streaming call.
type ChatResponse struct {
	Message      ChatMessage `json:"message"`
	Usage        Usage       `json:"usage"`
	FinishReason string      `json:"finish_reason"`
}

// StreamChunk is one event from a streaming chat call.
type StreamChunk struct {
	ContentDelta string
	ToolCalls    []ToolCall
	Done         bool
	Usage        *Usage
	Err          error
}

// Client is the provider boundary. Swap the implementation in client.go only.
type Client interface {
	Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error)
	ChatStream(ctx context.Context, req ChatRequest) (<-chan StreamChunk, error)
}

// ─── HTTP client implementation ──────────────────────────────────────────────

type httpClient struct {
	model   string
	token   string
	apiBase string
	http    *http.Client
}

// NewHTTPClient constructs the real HTTP-backed Client from a Provider.
func NewHTTPClient(p *Provider) Client {
	return &httpClient{
		model:   p.Model,
		token:   p.Token,
		apiBase: strings.TrimSuffix(p.APIBase, "/"),
		http:    &http.Client{Timeout: 120 * time.Second},
	}
}

// chatRequestBody is the full wire shape (adds stream flag).
type chatRequestBody struct {
	ChatRequest
	Stream bool `json:"stream"`
}

type openAIResponse struct {
	Choices []struct {
		Message      ChatMessage `json:"message"`
		Delta        *ChatMessage `json:"delta,omitempty"`
		FinishReason string      `json:"finish_reason"`
	} `json:"choices"`
	Usage Usage `json:"usage"`
}

func (c *httpClient) post(ctx context.Context, body any) (*http.Response, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("ai: marshal request: %w", err)
	}
	url := c.apiBase + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, fmt.Errorf("ai: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	return c.http.Do(req)
}

func (c *httpClient) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	if req.Model == "" {
		req.Model = c.model
	}
	body := chatRequestBody{ChatRequest: req, Stream: false}
	resp, err := c.post(ctx, body)
	if err != nil {
		return nil, fmt.Errorf("ai: http: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ai: read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ai: provider returned %d: %s", resp.StatusCode, string(raw))
	}

	var oai openAIResponse
	if err := json.Unmarshal(raw, &oai); err != nil {
		return nil, fmt.Errorf("ai: parse response: %w", err)
	}
	if len(oai.Choices) == 0 {
		return nil, fmt.Errorf("ai: no choices in response")
	}
	ch := oai.Choices[0]
	return &ChatResponse{
		Message:      ch.Message,
		Usage:        oai.Usage,
		FinishReason: ch.FinishReason,
	}, nil
}

// streamRequestBody adds stream:true and stream_options.
type streamRequestBody struct {
	ChatRequest
	Stream        bool           `json:"stream"`
	StreamOptions map[string]any `json:"stream_options,omitempty"`
}

func (c *httpClient) ChatStream(ctx context.Context, req ChatRequest) (<-chan StreamChunk, error) {
	if req.Model == "" {
		req.Model = c.model
	}
	body := streamRequestBody{
		ChatRequest:   req,
		Stream:        true,
		StreamOptions: map[string]any{"include_usage": true},
	}
	b, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("ai: marshal stream request: %w", err)
	}
	url := c.apiBase + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, fmt.Errorf("ai: build stream request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.token)
	httpReq.Header.Set("Accept", "text/event-stream")

	// Use a client without timeout for streaming (ctx handles cancellation).
	streamHTTP := &http.Client{}
	resp, err := streamHTTP.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ai: stream http: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("ai: provider stream returned %d: %s", resp.StatusCode, string(body))
	}

	ch := make(chan StreamChunk, 32)
	go func() {
		defer close(ch)
		defer resp.Body.Close()

		// Accumulate streamed tool_calls by index.
		toolCallAccum := map[int]*ToolCall{}

		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				// Flush accumulated tool calls.
				if len(toolCallAccum) > 0 {
					var tcs []ToolCall
					for i := 0; i < len(toolCallAccum); i++ {
						if tc, ok := toolCallAccum[i]; ok {
							tcs = append(tcs, *tc)
						}
					}
					ch <- StreamChunk{ToolCalls: tcs}
				}
				ch <- StreamChunk{Done: true}
				return
			}

			var evt struct {
				Choices []struct {
					Delta        ChatMessage `json:"delta"`
					FinishReason *string     `json:"finish_reason"`
				} `json:"choices"`
				Usage *Usage `json:"usage"`
			}
			if err := json.Unmarshal([]byte(data), &evt); err != nil {
				ch <- StreamChunk{Err: fmt.Errorf("ai: parse stream event: %w", err)}
				return
			}

			if evt.Usage != nil {
				ch <- StreamChunk{Usage: evt.Usage}
			}

			if len(evt.Choices) == 0 {
				continue
			}
			delta := evt.Choices[0].Delta

			if delta.Content != "" {
				ch <- StreamChunk{ContentDelta: delta.Content}
			}

			// Accumulate tool call deltas.
			for i, tc := range delta.ToolCalls {
				if existing, ok := toolCallAccum[i]; ok {
					existing.Function.Arguments += tc.Function.Arguments
					if tc.Function.Name != "" {
						existing.Function.Name += tc.Function.Name
					}
				} else {
					copy := tc
					toolCallAccum[i] = &copy
				}
			}
		}
		if err := scanner.Err(); err != nil {
			ch <- StreamChunk{Err: fmt.Errorf("ai: stream scan: %w", err)}
		}
	}()

	return ch, nil
}

// ─── Stub client for tests ───────────────────────────────────────────────────

// StubResponse is one scripted response for the stubClient.
type StubResponse struct {
	Response *ChatResponse
	// Chunks, if set, are emitted on ChatStream instead of synthesizing from Response.
	Chunks []StreamChunk
}

type stubClient struct {
	responses []StubResponse
	idx       int
}

// NewStubClient returns a Client whose calls are answered from the scripted
// list in order. Panics if called more times than responses are provided.
func NewStubClient(responses []StubResponse) Client {
	return &stubClient{responses: responses}
}

func (s *stubClient) Chat(_ context.Context, _ ChatRequest) (*ChatResponse, error) {
	if s.idx >= len(s.responses) {
		return nil, fmt.Errorf("stub: no more scripted responses (call %d)", s.idx)
	}
	r := s.responses[s.idx]
	s.idx++
	if r.Response == nil {
		return nil, fmt.Errorf("stub: scripted nil response at index %d", s.idx-1)
	}
	return r.Response, nil
}

func (s *stubClient) ChatStream(_ context.Context, _ ChatRequest) (<-chan StreamChunk, error) {
	if s.idx >= len(s.responses) {
		return nil, fmt.Errorf("stub: no more scripted responses (call %d)", s.idx)
	}
	r := s.responses[s.idx]
	s.idx++

	ch := make(chan StreamChunk, 32)
	go func() {
		defer close(ch)
		if r.Chunks != nil {
			for _, chunk := range r.Chunks {
				ch <- chunk
			}
			return
		}
		// Synthesize from Response.
		if r.Response == nil {
			ch <- StreamChunk{Err: fmt.Errorf("stub: scripted nil response")}
			return
		}
		if r.Response.Message.Content != "" {
			ch <- StreamChunk{ContentDelta: r.Response.Message.Content}
		}
		if len(r.Response.Message.ToolCalls) > 0 {
			ch <- StreamChunk{ToolCalls: r.Response.Message.ToolCalls}
		}
		u := r.Response.Usage
		ch <- StreamChunk{Usage: &u}
		ch <- StreamChunk{Done: true}
	}()
	return ch, nil
}
