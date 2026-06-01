package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// gatherContext fetches data from the REST API for each requested source.
func (s *Service) gatherContext(ctx context.Context, sources []string, target WorkflowTarget, restCall restCallFn) (string, error) {
	var parts []string
	var lastErr error

	for _, src := range sources {
		switch src {
		case "sample":
			if target.SampleID == nil {
				continue
			}
			data, status, err := restCall("GET", "/v1/samples/"+target.SampleID.String(), nil)
			if err != nil || status >= 300 {
				lastErr = fmt.Errorf("gather sample: status %d: %v", status, err)
				continue
			}
			parts = append(parts, "=== Sample ===\n"+string(data))

		case "sample_lineage":
			if target.SampleID == nil {
				continue
			}
			data, status, err := restCall("GET", "/v1/samples/"+target.SampleID.String()+"/lineage", nil)
			if err != nil || status >= 300 {
				lastErr = fmt.Errorf("gather sample_lineage: status %d: %v", status, err)
				continue
			}
			parts = append(parts, "=== Sample Lineage ===\n"+string(data))

		case "recent_experiments":
			data, status, err := restCall("GET", "/v1/projects/"+target.ProjectID.String()+"/experiments", nil)
			if err != nil || status >= 300 {
				lastErr = fmt.Errorf("gather experiments: status %d: %v", status, err)
				continue
			}
			parts = append(parts, "=== Recent Experiments ===\n"+string(data))

		case "related_artifacts":
			data, status, err := restCall("GET", "/v1/projects/"+target.ProjectID.String()+"/artifacts", nil)
			if err != nil || status >= 300 {
				lastErr = fmt.Errorf("gather artifacts: status %d: %v", status, err)
				continue
			}
			parts = append(parts, "=== Related Artifacts ===\n"+string(data))

		case "recent_iteration_pages":
			// List pages for the project — use a best-effort call.
			data, status, err := restCall("GET", "/v1/projects/"+target.ProjectID.String()+"/pages", nil)
			if err != nil || status >= 300 {
				// Pages endpoint is best-effort; record the soft error and skip.
				lastErr = fmt.Errorf("gather pages: status %d: %v", status, err)
				continue
			}
			parts = append(parts, "=== Recent Pages ===\n"+string(data))
		}
	}

	return strings.Join(parts, "\n\n"), lastErr
}

// webSearchMandate is prepended to workflow AI-step system prompts so the model
// verifies external facts via Brave Search rather than relying on memory. It
// mirrors the chat path's mandate (see sse.go) so both Risk Assessment flows
// behave consistently.
const webSearchMandate = "Before stating any factual, numerical, dated, or external claim, you MUST call the web_search tool to verify it and base your answer on the returned results. " +
	"Do not rely on memory for facts, figures, dates, prices, names, or current events. " +
	"If web_search is unconfigured or returns an error, proceed but explicitly mark the affected claim as unverified. " +
	"web_search returns title/url/description snippets — these are sufficient to cite; one or two well-formed searches per question is enough. "

// workflowToolRounds caps how many web_search rounds a single workflow AI step
// may take before it must answer. Kept small to bound latency and Brave usage,
// since ai_question steps run concurrently.
const workflowToolRounds = 3

// chatWithWebSearch runs a non-streaming chat with only the web_search tool
// enabled, executing each web_search call the model makes and looping until it
// returns a tool-call-free answer (or the round cap is hit, after which one
// final tool-free call forces a text answer). It returns the final assistant
// content and the token usage summed across every round. The caller's req is
// not mutated.
func (s *Service) chatWithWebSearch(ctx context.Context, req ChatRequest) (string, Usage, error) {
	// Work on our own copy of the message slice so the caller can reuse req
	// (e.g. for a stricter-instruction retry).
	req.Messages = append([]ChatMessage(nil), req.Messages...)
	req.Tools = []Tool{webSearchTool().Tool}

	total := Usage{}
	for round := 0; round < workflowToolRounds; round++ {
		resp, err := s.client.Chat(ctx, req)
		if err != nil {
			return "", total, err
		}
		total = addUsage(total, resp.Usage)
		if len(resp.Message.ToolCalls) == 0 {
			return resp.Message.Content, total, nil
		}
		// Record the assistant's tool-call turn, then execute each call. Only
		// web_search is offered; restCall is unused by it, so we pass nil.
		req.Messages = append(req.Messages, resp.Message)
		for _, tc := range resp.Message.ToolCalls {
			result, _, execErr := dispatchTool(ctx, tc.Function.Name, tc.Function.Arguments, "", "", nil)
			if execErr != nil {
				result = fmt.Sprintf(`{"error":%q}`, execErr.Error())
			}
			req.Messages = append(req.Messages, ChatMessage{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			})
		}
	}

	// Round cap hit while the model still wanted to search: force a final answer
	// with no tools available.
	req.Tools = nil
	resp, err := s.client.Chat(ctx, req)
	if err != nil {
		return "", total, err
	}
	total = addUsage(total, resp.Usage)
	return resp.Message.Content, total, nil
}

// runAIQuestion sends the context + prompt to the model and parses the expected JSON.
func (s *Service) runAIQuestion(ctx context.Context, step WorkflowStep, contextBlob string) (map[string]any, Usage, error) {
	systemMsg := "You are a scientific risk assessment assistant. " + webSearchMandate +
		"Answer precisely. If instructed to respond as JSON, output only valid JSON with no prose."
	userMsg := buildQuestionPrompt(step, contextBlob)

	req := ChatRequest{
		Messages: []ChatMessage{
			{Role: "system", Content: systemMsg},
			{Role: "user", Content: userMsg},
		},
		Temperature: 0.1,
		MaxTokens:   1024,
	}

	content, usage, err := s.chatWithWebSearch(ctx, req)
	if err != nil {
		return nil, Usage{}, err
	}

	result, parseErr := parseJSONResult(content, step.Expects)
	if parseErr != nil {
		// Retry once with stricter instruction.
		req.Messages[1].Content = userMsg + "\n\nIMPORTANT: Respond with ONLY a valid JSON object. No explanations, no markdown fences, no extra text."
		content2, usage2, err2 := s.chatWithWebSearch(ctx, req)
		if err2 != nil {
			// Return raw on retry failure.
			return map[string]any{"raw": content}, usage, nil
		}
		result2, parseErr2 := parseJSONResult(content2, step.Expects)
		if parseErr2 != nil {
			return map[string]any{"raw": content2}, addUsage(usage, usage2), nil
		}
		return result2, addUsage(usage, usage2), nil
	}
	return result, usage, nil
}

// runAISynthesis calls the model to produce a markdown summary + validated JSON output.
func (s *Service) runAISynthesis(ctx context.Context, step WorkflowStep, schema map[string]string, stepResults map[string]any, contextBlob string) (string, map[string]any, Usage, error) {
	// Build a summary of step results for the synthesis.
	resultsJSON, _ := json.MarshalIndent(stepResults, "", "  ")

	systemMsg := "You are a scientific risk assessment assistant. Produce a comprehensive synthesis. " +
		"Ground every claim in the provided step results and context; do not invent findings. " +
		webSearchMandate
	userMsg := fmt.Sprintf(`Based on the following assessment step results and project context, produce:

1. A concise markdown summary of the overall assessment (use the actual evidence from the step results).
2. A JSON object (on its own line after the markdown, enclosed in <json>...</json> tags) conforming EXACTLY to this schema — include every field, no extras:
%s

Step Results:
%s

Context Summary:
%s

Respond with the markdown summary first, then a line containing only <json>{...}</json> with all schema fields.`,
		describeSchema(schema),
		string(resultsJSON),
		truncate(contextBlob, synthesisContextChars),
	)

	req := ChatRequest{
		Messages: []ChatMessage{
			{Role: "system", Content: systemMsg},
			{Role: "user", Content: userMsg},
		},
		Temperature: 0.2,
		MaxTokens:   2048,
	}

	content, usage, err := s.chatWithWebSearch(ctx, req)
	if err != nil {
		return "", nil, Usage{}, err
	}

	md, outMap, parseErr := parseSynthesisResponse(content, schema)
	if parseErr != nil {
		// Retry once.
		req.Messages[1].Content = userMsg + "\n\nIMPORTANT: You MUST include the JSON in <json>...</json> tags."
		content2, usage2, err2 := s.chatWithWebSearch(ctx, req)
		if err2 != nil {
			return content, buildFallbackOutput(stepResults), usage, nil
		}
		md2, outMap2, _ := parseSynthesisResponse(content2, schema)
		if outMap2 == nil {
			outMap2 = buildFallbackOutput(stepResults)
		}
		return md2, outMap2, addUsage(usage, usage2), nil
	}

	return md, outMap, usage, nil
}

// createResultPage POSTs a page with the synthesis markdown to the REST API.
func (s *Service) createResultPage(ctx context.Context, wf *Workflow, target WorkflowTarget, md string, restCall restCallFn) (*uuid.UUID, error) {
	// Determine parent type and ID.
	parentType := "project"
	parentID := target.ProjectID.String()
	if target.SampleID != nil {
		parentType = "sample"
		parentID = target.SampleID.String()
	} else if target.ExperimentID != nil {
		parentType = "experiment"
		parentID = target.ExperimentID.String()
	}

	// Build blocks: one paragraph block per non-empty line of markdown.
	blocks := buildMarkdownBlocks(md)
	blocksJSON, err := json.Marshal(blocks)
	if err != nil {
		return nil, fmt.Errorf("ai: marshal page blocks: %w", err)
	}

	body := map[string]any{
		"parent_type": parentType,
		"parent_id":   parentID,
		"blocks":      json.RawMessage(blocksJSON),
	}

	data, status, err := restCall("POST", "/v1/projects/"+target.ProjectID.String()+"/pages", body)
	if err != nil {
		return nil, fmt.Errorf("ai: create result page: %w", err)
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("ai: create result page: status %d: %s", status, string(data))
	}

	var resp struct {
		Page struct {
			ID string `json:"id"`
		} `json:"page"`
		// Also handle flat response.
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("ai: parse page response: %w", err)
	}
	idStr := resp.Page.ID
	if idStr == "" {
		idStr = resp.ID
	}
	if idStr == "" {
		return nil, fmt.Errorf("ai: no page id in response")
	}
	pageID, err := uuid.Parse(idStr)
	if err != nil {
		return nil, fmt.Errorf("ai: parse page id: %w", err)
	}
	return &pageID, nil
}
