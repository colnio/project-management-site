package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// workflowRunTimeout bounds a single synchronous workflow run so a stuck model
// provider returns a clean 504 rather than hanging for minutes.
const workflowRunTimeout = 150 * time.Second

// mapWorkflowError turns a raw workflow execution error into a typed platform
// error so huma emits a meaningful status (502/504) instead of an opaque 500.
// Errors that are already platform errors (e.g. 402 spend cap) pass through.
func mapWorkflowError(err error) error {
	if err == nil {
		return nil
	}
	var pe *platform.ErrorModel
	if errors.As(err, &pe) {
		return err
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return platform.Errorf(504, "ai.upstream_timeout", "AI provider timed out: "+err.Error())
	}
	return platform.Errorf(502, "ai.upstream_error", "AI provider error: "+err.Error())
}

// ─── Workflow runner ──────────────────────────────────────────────────────────

// RunWorkflow executes a workflow synchronously and returns the completed run.
// It authorizes the caller, gathers context via internal-token REST calls,
// runs each AI step, creates a result page, and flags for PI review if needed.
func (s *Service) RunWorkflow(ctx context.Context, p *platform.Principal, key string, target WorkflowTarget) (*WorkflowRun, error) {
	// Load workflow registry.
	workflows, err := LoadWorkflows()
	if err != nil {
		return nil, fmt.Errorf("ai: load workflows: %w", err)
	}
	wf, ok := workflows[key]
	if !ok {
		return nil, platform.NotFound("ai.workflow_not_found", "workflow not found: "+key)
	}

	// Authorize the caller on the project.
	proj, _, err := s.projects.Authorize(ctx, p, target.ProjectID, org.RoleEditor)
	if err != nil {
		return nil, err
	}

	// Check spend cap.
	cap, err := checkSpendCap(ctx, s.pool, proj.WorkspaceID)
	if err != nil {
		s.log.Warn("ai: workflow: spend cap check failed", "err", err)
	} else if !cap.Allowed {
		return nil, platform.Errorf(402, "ai.spend_cap_exceeded", "workspace AI spend cap exceeded")
	}

	// Create a running row.
	run, err := createWorkflowRun(ctx, s.pool, key, target, p.UserID)
	if err != nil {
		return nil, err
	}

	// Mint a run-scoped internal token with the full set of scopes needed by AI tools.
	iaiToken, err := s.authSvc.MintInternalAIToken(ctx, p.UserID, run.ID, []string{
		platform.ScopeReadProjects,
		platform.ScopeReadSamples,
		platform.ScopeReadExperiments,
		platform.ScopeReadPages,
		platform.ScopeReadArtifacts,
		platform.ScopeWritePages,
		platform.ScopeWriteIterations,
		platform.ScopeWriteCalendar,
	}, nil)
	if err != nil {
		_ = s.markRunFailed(ctx, run.ID, "{}", "failed to mint internal token: "+err.Error())
		return nil, fmt.Errorf("ai: workflow: mint token: %w", err)
	}
	defer func() { _ = s.authSvc.RevokeInternalAITokens(ctx, run.ID) }()

	restCall := makeRESTCaller(s.restBase, iaiToken)

	// Execute workflow under a bounded deadline (separate from ctx so the
	// persistence/audit below still runs even if execution times out).
	execCtx, cancel := context.WithTimeout(ctx, workflowRunTimeout)
	defer cancel()
	stepResults, output, resultPageID, runErr := s.executeWorkflow(execCtx, wf, target, proj.WorkspaceID, p, run.ID, restCall)

	stepResultsJSON, _ := json.Marshal(stepResults)
	var outputJSON json.RawMessage
	if output != nil {
		outputJSON, _ = json.Marshal(output)
	} else {
		outputJSON = json.RawMessage("{}")
	}

	status := "completed"
	errMsg := ""
	if runErr != nil {
		status = "failed"
		errMsg = runErr.Error()
		// Still store partial step results.
	}

	// Handle PI flagging (even on error, if we have output).
	if output != nil && status == "completed" {
		s.handlePIFlag(ctx, output, proj.WorkspaceID, target.ProjectID, p, run.ID)

		// Populate the risk register from workflow output.
		if s.risks != nil {
			if upsertErr := s.risks.UpsertFromWorkflow(ctx, target.ProjectID, nil, key, run.ID, output, p.UserID); upsertErr != nil {
				s.log.Warn("ai: workflow: risk upsert failed", "run_id", run.ID, "err", upsertErr)
			}
		}
	}

	// Persist final state.
	if err := updateWorkflowRun(ctx, s.pool, run.ID, status, stepResultsJSON, outputJSON, resultPageID, errMsg); err != nil {
		s.log.Error("ai: workflow: update run failed", "run_id", run.ID, "err", err)
	}

	// Audit.
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "ai.workflow_run",
		ResourceType: "ai_workflow_run",
		ResourceID:   run.ID.String(),
	})

	// Reload final state.
	final, err := GetRun(ctx, s.pool, run.ID)
	if err != nil || final == nil {
		// Fallback to in-memory.
		run.Status = status
		run.StepResults = stepResultsJSON
		run.Output = outputJSON
		run.ResultPageID = resultPageID
		run.Error = errMsg
		return run, mapWorkflowError(runErr)
	}
	return final, mapWorkflowError(runErr)
}

// executeWorkflow runs all steps and returns (stepResults, outputMap, resultPageID, error).
func (s *Service) executeWorkflow(
	ctx context.Context,
	wf *Workflow,
	target WorkflowTarget,
	workspaceID uuid.UUID,
	p *platform.Principal,
	runID uuid.UUID,
	restCall restCallFn,
) (map[string]any, map[string]any, *uuid.UUID, error) {
	stepResults := make(map[string]any)
	var contextBlob string
	var output map[string]any
	var mu sync.Mutex // guards stepResults across the parallel question batch

	// Independent ai_question steps depend only on the gathered context, not on
	// each other, so they run concurrently. They are collected and flushed as a
	// batch just before the synthesis step (or at the end of the workflow).
	var pendingQuestions []WorkflowStep
	flushQuestions := func() error {
		if len(pendingQuestions) == 0 {
			return nil
		}
		if s.client == nil {
			return s.unavailableErr()
		}
		// Single spend-cap check for the whole batch.
		if cap, _ := checkSpendCap(ctx, s.pool, workspaceID); !cap.Allowed {
			return platform.Errorf(402, "ai.spend_cap_exceeded", "workspace AI spend cap exceeded")
		}
		var wg sync.WaitGroup
		for _, step := range pendingQuestions {
			wg.Add(1)
			go func(step WorkflowStep) {
				defer wg.Done()
				result, usage, err := s.runAIQuestion(ctx, step, contextBlob)
				mu.Lock()
				if err != nil {
					s.log.Warn("ai: workflow: ai_question failed", "step", step.ID, "err", err)
					stepResults[step.ID] = map[string]any{"error": err.Error()}
				} else {
					stepResults[step.ID] = result
				}
				mu.Unlock()
				// Meter usage (concurrent inserts are safe).
				_ = recordUsage(ctx, s.pool, workspaceID, target.ProjectID, p.UserID, "workflow", "ai", usage)
			}(step)
		}
		wg.Wait()
		pendingQuestions = nil
		return nil
	}

	for _, step := range wf.Steps {
		switch step.Type {
		case "gather_context":
			blob, err := s.gatherContext(ctx, step.Sources, target, restCall)
			if err != nil {
				s.log.Warn("ai: workflow: gather_context partial failure", "err", err)
				// Continue with whatever we got.
			}
			contextBlob = blob
			stepResults[step.ID] = map[string]any{"context_length": len(blob)}

		case "ai_question":
			pendingQuestions = append(pendingQuestions, step)

		case "ai_synthesis":
			// Run any collected questions concurrently before synthesizing.
			if err := flushQuestions(); err != nil {
				return stepResults, nil, nil, err
			}
			if s.client == nil {
				return stepResults, nil, nil, s.unavailableErr()
			}
			// Check spend cap before model call.
			cap, _ := checkSpendCap(ctx, s.pool, workspaceID)
			if !cap.Allowed {
				return stepResults, nil, nil, platform.Errorf(402, "ai.spend_cap_exceeded", "workspace AI spend cap exceeded")
			}

			md, outMap, usage, err := s.runAISynthesis(ctx, step, wf.OutputSchema, stepResults, contextBlob)
			if err != nil {
				return stepResults, nil, nil, fmt.Errorf("ai: synthesis step: %w", err)
			}
			output = outMap
			stepResults[step.ID] = map[string]any{"markdown": md}
			// Meter usage.
			_ = recordUsage(ctx, s.pool, workspaceID, target.ProjectID, p.UserID, "workflow", "ai", usage)

			// Create result page.
			pageID, pageErr := s.createResultPage(ctx, wf, target, md, restCall)
			if pageErr != nil {
				s.log.Warn("ai: workflow: result page creation failed", "err", pageErr)
			}
			return stepResults, output, pageID, nil
		}
	}
	// Flush any trailing questions for workflows without a synthesis step.
	if err := flushQuestions(); err != nil {
		return stepResults, nil, nil, err
	}
	return stepResults, output, nil, nil
}

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
				// Pages endpoint may not exist yet — skip silently.
				_ = fmt.Errorf("gather pages: status %d: %v", status, err)
				continue
			}
			parts = append(parts, "=== Recent Pages ===\n"+string(data))
		}
	}

	return strings.Join(parts, "\n\n"), lastErr
}

// runAIQuestion sends the context + prompt to the model and parses the expected JSON.
func (s *Service) runAIQuestion(ctx context.Context, step WorkflowStep, contextBlob string) (map[string]any, Usage, error) {
	systemMsg := "You are a scientific risk assessment assistant. Answer precisely. If instructed to respond as JSON, output only valid JSON with no prose."
	userMsg := buildQuestionPrompt(step, contextBlob)

	req := ChatRequest{
		Messages: []ChatMessage{
			{Role: "system", Content: systemMsg},
			{Role: "user", Content: userMsg},
		},
		Temperature: 0.1,
		MaxTokens:   1024,
	}

	resp, err := s.client.Chat(ctx, req)
	if err != nil {
		return nil, Usage{}, err
	}

	result, parseErr := parseJSONResult(resp.Message.Content, step.Expects)
	if parseErr != nil {
		// Retry once with stricter instruction.
		retryMsg := userMsg + "\n\nIMPORTANT: Respond with ONLY a valid JSON object. No explanations, no markdown fences, no extra text."
		req.Messages[1].Content = retryMsg
		resp2, err2 := s.client.Chat(ctx, req)
		if err2 != nil {
			// Return raw on retry failure.
			return map[string]any{"raw": resp.Message.Content}, addUsage(resp.Usage, Usage{}), nil
		}
		result2, parseErr2 := parseJSONResult(resp2.Message.Content, step.Expects)
		if parseErr2 != nil {
			return map[string]any{"raw": resp2.Message.Content}, addUsage(resp.Usage, resp2.Usage), nil
		}
		return result2, addUsage(resp.Usage, resp2.Usage), nil
	}
	return result, resp.Usage, nil
}

// runAISynthesis calls the model to produce a markdown summary + validated JSON output.
func (s *Service) runAISynthesis(ctx context.Context, step WorkflowStep, schema map[string]string, stepResults map[string]any, contextBlob string) (string, map[string]any, Usage, error) {
	// Build a summary of step results for the synthesis.
	resultsJSON, _ := json.MarshalIndent(stepResults, "", "  ")

	systemMsg := "You are a scientific risk assessment assistant. Produce a comprehensive synthesis."
	userMsg := fmt.Sprintf(`Based on the following risk assessment step results and context, produce:

1. A markdown summary of the overall risk assessment.
2. A JSON object (on its own line after the markdown, enclosed in <json>...</json> tags) conforming to this schema:
   - overall_rating: integer 1-5
   - category_ratings: object mapping category name to integer rating
   - mitigations: array of strings (top mitigations across all categories)
   - flagged_for_PI_review: boolean (true if overall_rating >= 4 or any category is >= 4)

Step Results:
%s

Context Summary (first 2000 chars):
%s

Respond with the markdown summary first, then a line containing only <json>{"overall_rating":...}</json>.`,
		string(resultsJSON),
		truncate(contextBlob, 2000),
	)

	req := ChatRequest{
		Messages: []ChatMessage{
			{Role: "system", Content: systemMsg},
			{Role: "user", Content: userMsg},
		},
		Temperature: 0.2,
		MaxTokens:   2048,
	}

	resp, err := s.client.Chat(ctx, req)
	if err != nil {
		return "", nil, Usage{}, err
	}

	md, outMap, parseErr := parseSynthesisResponse(resp.Message.Content, schema)
	if parseErr != nil {
		// Retry once.
		req.Messages[1].Content = userMsg + "\n\nIMPORTANT: You MUST include the JSON in <json>...</json> tags."
		resp2, err2 := s.client.Chat(ctx, req)
		if err2 != nil {
			return resp.Message.Content, buildFallbackOutput(stepResults), addUsage(resp.Usage, Usage{}), nil
		}
		md2, outMap2, _ := parseSynthesisResponse(resp2.Message.Content, schema)
		if outMap2 == nil {
			outMap2 = buildFallbackOutput(stepResults)
		}
		return md2, outMap2, addUsage(resp.Usage, resp2.Usage), nil
	}

	return md, outMap, resp.Usage, nil
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

// handlePIFlag checks if the output warrants PI review and sends notifications.
func (s *Service) handlePIFlag(ctx context.Context, output map[string]any, workspaceID, projectID uuid.UUID, p *platform.Principal, runID uuid.UUID) {
	flagged := false

	if v, ok := output["flagged_for_PI_review"]; ok {
		if b, ok := v.(bool); ok && b {
			flagged = true
		}
	}
	if !flagged {
		if v, ok := output["overall_rating"]; ok {
			rating := toInt(v)
			if rating >= 4 {
				flagged = true
			}
		}
	}

	if !flagged {
		return
	}

	// Audit the flag.
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "ai.workflow_pi_flag",
		ResourceType: "ai_workflow_run",
		ResourceID:   runID.String(),
	})

	if s.piNotify != nil {
		proj, err := s.projects.GetProject(ctx, projectID)
		if err != nil {
			s.log.Warn("ai: workflow: load project for pi flag email", "err", err)
			return
		}
		idem := fmt.Sprintf("pi_flag_workflow:%s", runID)
		actionPath := "/projects/" + projectID.String()
		go func() {
			if err := s.piNotify.EnqueuePIFlagForWorkspaceOwners(
				context.Background(), proj.WorkspaceID, proj.Name, actionPath, "", idem,
			); err != nil {
				s.log.Warn("ai: workflow: enqueue PI flag emails failed", "err", err)
			}
		}()
	}
}

func (s *Service) markRunFailed(ctx context.Context, runID uuid.UUID, stepResults, errMsg string) error {
	return updateWorkflowRun(ctx, s.pool, runID, "failed",
		json.RawMessage(stepResults), json.RawMessage("{}"), nil, errMsg)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func buildQuestionPrompt(step WorkflowStep, contextBlob string) string {
	var sb strings.Builder
	if contextBlob != "" {
		sb.WriteString("Context:\n")
		sb.WriteString(truncate(contextBlob, 3000))
		sb.WriteString("\n\n")
	}
	sb.WriteString(step.Prompt)
	if len(step.Expects) > 0 {
		sb.WriteString("\n\nRespond as a JSON object with these fields:")
		for field, typ := range step.Expects {
			sb.WriteString(fmt.Sprintf("\n- %s (%s)", field, typ))
		}
	}
	return sb.String()
}

// parseJSONResult tries to decode the model's response as JSON and extract expected fields.
func parseJSONResult(content string, expects map[string]string) (map[string]any, error) {
	// Strip markdown fences if present.
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "```") {
		lines := strings.Split(content, "\n")
		if len(lines) > 2 {
			content = strings.Join(lines[1:len(lines)-1], "\n")
		}
	}

	var m map[string]any
	if err := json.Unmarshal([]byte(content), &m); err != nil {
		return nil, fmt.Errorf("ai: parse JSON result: %w", err)
	}

	// Basic type validation.
	for field, typ := range expects {
		v, ok := m[field]
		if !ok {
			return nil, fmt.Errorf("ai: missing expected field %q", field)
		}
		if err := validateFieldType(field, v, typ); err != nil {
			return nil, err
		}
	}
	return m, nil
}

// parseSynthesisResponse extracts markdown and the JSON block from <json>...</json> tags.
func parseSynthesisResponse(content string, schema map[string]string) (string, map[string]any, error) {
	start := strings.Index(content, "<json>")
	end := strings.Index(content, "</json>")
	if start < 0 || end < 0 || end <= start {
		return content, nil, fmt.Errorf("ai: no <json> block in synthesis response")
	}

	md := strings.TrimSpace(content[:start])
	rawJSON := strings.TrimSpace(content[start+6 : end])

	var outMap map[string]any
	if err := json.Unmarshal([]byte(rawJSON), &outMap); err != nil {
		return md, nil, fmt.Errorf("ai: parse synthesis JSON: %w", err)
	}

	// Validate against schema.
	if err := validateOutputSchema(outMap, schema); err != nil {
		return md, nil, err
	}

	return md, outMap, nil
}

// validateOutputSchema performs basic type checking of the output against the schema.
func validateOutputSchema(m map[string]any, schema map[string]string) error {
	for field, typ := range schema {
		v, ok := m[field]
		if !ok {
			// Missing field — insert zero value.
			switch typ {
			case "int":
				m[field] = 0
			case "boolean":
				m[field] = false
			case "object":
				m[field] = map[string]any{}
			case "list[string]":
				m[field] = []any{}
			}
			continue
		}
		if err := validateFieldType(field, v, typ); err != nil {
			// Coerce if possible.
			switch typ {
			case "int":
				m[field] = toInt(v)
			case "boolean":
				m[field] = toBool(v)
			}
		}
	}
	return nil
}

func validateFieldType(field string, v any, typ string) error {
	switch typ {
	case "int":
		switch v.(type) {
		case float64, int, int64, json.Number:
			return nil
		}
		return fmt.Errorf("ai: field %q expected int, got %T", field, v)
	case "boolean":
		if _, ok := v.(bool); ok {
			return nil
		}
		return fmt.Errorf("ai: field %q expected boolean, got %T", field, v)
	case "object":
		if _, ok := v.(map[string]any); ok {
			return nil
		}
		return fmt.Errorf("ai: field %q expected object, got %T", field, v)
	case "list[string]":
		if arr, ok := v.([]any); ok {
			for _, item := range arr {
				if _, ok := item.(string); !ok {
					return fmt.Errorf("ai: field %q list item expected string, got %T", field, item)
				}
			}
			return nil
		}
		return fmt.Errorf("ai: field %q expected list, got %T", field, v)
	}
	return nil
}

func buildFallbackOutput(stepResults map[string]any) map[string]any {
	// Compute a rough average rating from step results.
	totalRating := 0
	count := 0
	for _, v := range stepResults {
		if m, ok := v.(map[string]any); ok {
			if r, ok := m["rating"]; ok {
				totalRating += toInt(r)
				count++
			}
		}
	}
	overall := 1
	if count > 0 {
		overall = totalRating / count
	}
	return map[string]any{
		"overall_rating":       overall,
		"category_ratings":     map[string]any{},
		"mitigations":          []any{},
		"flagged_for_PI_review": overall >= 4,
	}
}

// buildMarkdownBlocks converts markdown text to a simple block array for the page API.
func buildMarkdownBlocks(md string) []map[string]any {
	lines := strings.Split(md, "\n")
	var blocks []map[string]any
	for _, line := range lines {
		line = strings.TrimRight(line, " \t")
		blockType := "paragraph"
		if strings.HasPrefix(line, "# ") {
			blockType = "heading_1"
			line = strings.TrimPrefix(line, "# ")
		} else if strings.HasPrefix(line, "## ") {
			blockType = "heading_2"
			line = strings.TrimPrefix(line, "## ")
		} else if strings.HasPrefix(line, "### ") {
			blockType = "heading_3"
			line = strings.TrimPrefix(line, "### ")
		} else if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") {
			blockType = "bulleted_list_item"
			line = line[2:]
		}
		blocks = append(blocks, map[string]any{
			"type": blockType,
			"text": line,
		})
	}
	if len(blocks) == 0 {
		blocks = []map[string]any{{"type": "paragraph", "text": md}}
	}
	return blocks
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func addUsage(a, b Usage) Usage {
	return Usage{
		PromptTokens:     a.PromptTokens + b.PromptTokens,
		CompletionTokens: a.CompletionTokens + b.CompletionTokens,
		TotalTokens:      a.TotalTokens + b.TotalTokens,
	}
}

func toInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	}
	return 0
}

func toBool(v any) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}
