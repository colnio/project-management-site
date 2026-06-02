package ai

import "testing"

// These tests prove the workflow AI steps run a tool-execution loop with the
// web_search tool: when the model emits a web_search call, chatWithWebSearch
// executes it, feeds the result back, and continues until the model returns a
// tool-call-free answer (or the round cap forces one). BRAVE_SEARCH_API_KEY is
// forced empty so web_search takes its graceful "unconfigured" path and the
// test makes no network call — we are asserting the loop, not Brave itself.

func TestChatWithWebSearch_ExecutesToolThenAnswers(t *testing.T) {
	t.Setenv("BRAVE_SEARCH_API_KEY", "")

	stub := NewStubClient([]StubResponse{
		// Round 0: model asks to search the web.
		{Response: &ChatResponse{
			Message: ChatMessage{
				Role: "assistant",
				ToolCalls: []ToolCall{{
					ID:       "call_1",
					Type:     "function",
					Function: FunctionCall{Name: "web_search", Arguments: `{"query":"graphene anode safety"}`},
				}},
			},
			Usage:        Usage{PromptTokens: 10, CompletionTokens: 5, TotalTokens: 15},
			FinishReason: "tool_calls",
		}},
		// Round 1: with the tool result in hand, model answers.
		{Response: &ChatResponse{
			Message:      ChatMessage{Role: "assistant", Content: "final answer"},
			Usage:        Usage{PromptTokens: 20, CompletionTokens: 8, TotalTokens: 28},
			FinishReason: "stop",
		}},
	})

	svc := &Service{client: stub}
	content, usage, err := svc.chatWithWebSearch(t.Context(), ChatRequest{
		Messages: []ChatMessage{
			{Role: "system", Content: "you are a tester"},
			{Role: "user", Content: "assess"},
		},
	})
	if err != nil {
		t.Fatalf("chatWithWebSearch: %v", err)
	}
	if content != "final answer" {
		t.Errorf("content = %q; want the post-tool answer %q (loop did not continue past the tool call)", content, "final answer")
	}
	// Usage must be summed across both model rounds.
	if usage.TotalTokens != 43 {
		t.Errorf("usage.TotalTokens = %d; want 43 (10+5 + 20+8 summed across rounds)", usage.TotalTokens)
	}
}

func TestChatWithWebSearch_RoundCapForcesAnswer(t *testing.T) {
	t.Setenv("BRAVE_SEARCH_API_KEY", "")

	toolResp := StubResponse{Response: &ChatResponse{
		Message: ChatMessage{
			Role: "assistant",
			ToolCalls: []ToolCall{{
				ID:       "c",
				Type:     "function",
				Function: FunctionCall{Name: "web_search", Arguments: `{"query":"loop"}`},
			}},
		},
		Usage:        Usage{TotalTokens: 1},
		FinishReason: "tool_calls",
	}}

	// The model wants to search every round; supply workflowToolRounds tool-call
	// responses, then one final answer for the forced tool-free call.
	responses := make([]StubResponse, 0, workflowToolRounds+1)
	for i := 0; i < workflowToolRounds; i++ {
		responses = append(responses, toolResp)
	}
	responses = append(responses, StubResponse{Response: &ChatResponse{
		Message:      ChatMessage{Role: "assistant", Content: "forced final"},
		Usage:        Usage{TotalTokens: 1},
		FinishReason: "stop",
	}})

	svc := &Service{client: NewStubClient(responses)}
	content, _, err := svc.chatWithWebSearch(t.Context(), ChatRequest{
		Messages: []ChatMessage{{Role: "user", Content: "go"}},
	})
	if err != nil {
		t.Fatalf("chatWithWebSearch: %v", err)
	}
	if content != "forced final" {
		t.Errorf("content = %q; want %q from the forced tool-free call after the round cap", content, "forced final")
	}
}
