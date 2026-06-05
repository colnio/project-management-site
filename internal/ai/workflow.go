package ai

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

func buildQuestionPrompt(step WorkflowStep, contextBlob string) string {
	var sb strings.Builder
	if contextBlob != "" {
		sb.WriteString("Context:\n")
		sb.WriteString(truncate(contextBlob, questionContextChars))
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

// describeSchema renders a workflow's declared output schema as a bullet list
// for the synthesis prompt, attaching calibrated guidance to well-known fields
// so a small local model fills them consistently. Unknown fields fall back to
// their declared type. Fields are emitted in a stable order (known fields first)
// so the prompt is deterministic across runs.
func describeSchema(schema map[string]string) string {
	hints := map[string]string{
		"overall_rating":        "integer 1-5 — the single overall rating (1 negligible, 2 low, 3 moderate, 4 high, 5 critical/blocking)",
		"category_ratings":      "object mapping each assessed category name to its integer rating 1-5",
		"mitigations":           "array of strings — the top concrete, actionable mitigations across all categories",
		"flagged_for_PI_review": "boolean — true if overall_rating >= 4 or any category rating >= 4",
		"summary":               "string — a 2-3 sentence executive summary of the assessment, citing the most important evidence",
		"completeness_score":    "integer 0-100 — overall completeness/coverage percentage",
		"go_no_go":              "boolean — true only if it is safe/ready to proceed",
		"proposed_goals":        "array of strings — concrete proposed goals for the next iteration",
		"open_questions":        "array of strings — unresolved questions that need a human decision",
	}
	order := []string{
		"overall_rating", "category_ratings", "mitigations", "flagged_for_PI_review",
		"summary", "completeness_score", "go_no_go", "proposed_goals", "open_questions",
	}
	var sb strings.Builder
	seen := make(map[string]bool)
	emit := func(field string) {
		typ := schema[field]
		desc, ok := hints[field]
		if !ok {
			desc = fmt.Sprintf("%s value", typ)
		}
		sb.WriteString(fmt.Sprintf("   - %s: %s\n", field, desc))
	}
	for _, field := range order {
		if _, ok := schema[field]; ok {
			emit(field)
			seen[field] = true
		}
	}
	for field := range schema {
		if !seen[field] {
			emit(field)
		}
	}
	return strings.TrimRight(sb.String(), "\n")
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
		"overall_rating":        overall,
		"category_ratings":      map[string]any{},
		"mitigations":           []any{},
		"flagged_for_PI_review": overall >= 4,
	}
}

// buildMarkdownBlocks converts markdown text to a BlockNote-native block array
// for the page API. It delegates to markdownToBlockNoteBlocks which uses goldmark
// (with GFM table support) to produce correct camelCase block types with inline
// content arrays.
func buildMarkdownBlocks(md string) []map[string]any {
	return markdownToBlockNoteBlocks(md)
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
