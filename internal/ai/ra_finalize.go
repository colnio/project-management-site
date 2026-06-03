package ai

// ra_finalize.go — two-model finalization of the interactive Risk Assessment.
//
// The dialogue model (the active provider, e.g. DeepSeek-V4-Pro) is strong at
// the 6-phase interrogation and composes a rich report, but reliably emitting
// the structured save_risk_assessment tool call after a long, research-heavy
// dialogue is brittle: it tends to keep calling web_search and then return the
// report as prose. Rather than fight that, when the researcher triggers the
// report we take the report text the dialogue model produced, save it to a
// server-side tmp folder, and run a focused, low-cost formatter pass (Flash)
// whose ONLY job is to convert that report into the structured arguments. We
// then persist the report page + risk register ourselves via the existing
// save_risk_assessment tool. This makes Phase 6 deterministic regardless of how
// the dialogue model chose to present the report.

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

// raFormatterModel is the focused model used to structure the report. It defaults
// to DeepSeek-V4-Flash and is overridable via RA_FORMATTER_MODEL. Both this and
// the active dialogue model are served by the same provider (same base URL +
// token), so only the per-request model name differs.
func raFormatterModel() string {
	if m := strings.TrimSpace(os.Getenv("RA_FORMATTER_MODEL")); m != "" {
		return m
	}
	return "deepseek-ai/DeepSeek-V4-Flash"
}

// iterationIDRe recovers an iteration UUID from the conversation's seed message
// (e.g. `... for iteration <uuid> ... pass iteration_id="<uuid>" ...`) so the
// finalized risks are scoped to that iteration.
var iterationIDRe = regexp.MustCompile(`(?i)iteration[^0-9a-f]{0,24}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`)

// isRAReportTrigger reports whether the user message is the Phase-6 trigger.
func isRAReportTrigger(userContent string) bool {
	c := strings.ToLower(strings.TrimSpace(userContent))
	return c == "report" || c == "summary"
}

// shouldFinalizeRA reports whether to run the two-model finalize pass for this turn.
// It does NOT require the just-completed turn to contain report text: the dialogue
// model often returns little or nothing at Phase 6 (it spends its rounds on
// research). The formatter pass instead synthesizes from the whole transcript.
func (s *Service) shouldFinalizeRA(conv *Conversation, userContent string) bool {
	if s.client == nil || s.risks == nil {
		return false
	}
	if conv == nil || conv.Skill == nil || *conv.Skill != "risk_assessment_skill" {
		return false
	}
	return isRAReportTrigger(userContent)
}

// raFormatterResult is the structured extraction the formatter model returns.
type raFormatterResult struct {
	ReportMarkdown string `json:"report_markdown"`
	ReportTitle    string `json:"report_title"`
	RiskLevel      string `json:"risk_level"`
	Expertise      string `json:"expertise"`
	FailureModes   []struct {
		Title             string `json:"title"`
		Likelihood        string `json:"likelihood"`
		ImpactHeadline    string `json:"impact_headline"`
		ImpactDescription string `json:"impact_description"`
		Mitigation        string `json:"mitigation"`
		PlanB             string `json:"plan_b"`
		FlagPIReview      bool   `json:"flag_pi_review"`
	} `json:"failure_modes"`
}

const raFormatterSystem = "You compile a completed 6-phase pre-experiment Risk Assessment dialogue into the final report and a structured risk register. " +
	"You are given the full transcript between a lab supervisor (assistant) and a researcher (user). " +
	"Output ONLY a single valid JSON object — no prose outside it, no markdown code fences. Do not call any tools."

func raFormatterPrompt(transcript string) string {
	return "Risk Assessment dialogue transcript:\n\n" + transcript + "\n\n" +
		"Compile this into a JSON object with exactly these fields:\n" +
		`{` + "\n" +
		`  "report_markdown": string — the full Pre-Experimental Risk Assessment Report Summary in markdown (Supervisor Triage Block, Experiment Overview, Failure Mode Resolution Matrix, Required Actions, Key Lesson), synthesized from the transcript,` + "\n" +
		`  "report_title": string (e.g. "Risk Assessment — <Technique> on <Substrate>"),` + "\n" +
		`  "risk_level": "GREEN" | "YELLOW" | "RED" (overall triage: RED if any Active Threat is Critical/High severity; YELLOW if Active Threats are all Medium/Low; GREEN if all Managed/Ignored),` + "\n" +
		`  "expertise": "Novice" | "Intermediate" | "Expert",` + "\n" +
		`  "failure_modes": [ {` + "\n" +
		`     "title": string,` + "\n" +
		`     "likelihood": "high" | "med" | "low" (map severity Critical/High -> high, Medium -> med, Low -> low),` + "\n" +
		`     "impact_headline": string (one line),` + "\n" +
		`     "impact_description": string (physical mechanism + instrument indicator),` + "\n" +
		`     "mitigation": string (the action agreed in Phase 4-5),` + "\n" +
		`     "plan_b": string,` + "\n" +
		`     "flag_pi_review": boolean (true if triage is RED, or this is an Active Threat of Critical/High severity)` + "\n" +
		`  } ]` + "\n" +
		`}` + "\n" +
		"Include one entry per failure mode raised in Phase 3 (the red-teaming). Output JSON only."
}

// buildRATranscript assembles a compact transcript of the dialogue for the
// formatter: the assistant's phase outputs (which hold the failure modes,
// classifications, and recommendations) plus the researcher's replies. Any
// late report text the dialogue model produced is appended too.
func buildRATranscript(history []*Message, finalReport string) string {
	var b strings.Builder
	for _, m := range history {
		c := strings.TrimSpace(m.Content)
		if c == "" || (m.Role != "assistant" && m.Role != "user") {
			continue
		}
		role := "RESEARCHER"
		if m.Role == "assistant" {
			role = "SUPERVISOR"
		}
		b.WriteString(role + ": " + c + "\n\n")
	}
	if fr := strings.TrimSpace(finalReport); fr != "" {
		b.WriteString("SUPERVISOR (report draft): " + fr + "\n")
	}
	return b.String()
}

// extractJSONObject pulls the first balanced JSON object out of a model response,
// tolerating code fences and surrounding prose.
func extractJSONObject(content string) string {
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "```") {
		if i := strings.Index(content, "\n"); i >= 0 {
			content = content[i+1:]
		}
		content = strings.TrimSuffix(strings.TrimSpace(content), "```")
	}
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start < 0 || end <= start {
		return ""
	}
	return content[start : end+1]
}

// finalizeRiskAssessment runs the formatter pass and persists the report page +
// risk register via the save_risk_assessment tool. All failures are logged and
// surfaced as an SSE warning; they never abort the chat stream.
func (s *Service) finalizeRiskAssessment(
	ctx context.Context,
	sendSSE func(eventType, data string),
	convID uuid.UUID,
	projectID, workspaceID string,
	userID uuid.UUID,
	history []*Message,
	finalReport string,
	restCall restCallFn,
	restCallHdrs restCallWithHeadersFn,
) {
	// 1. Build a transcript of the dialogue and persist it to a server-side tmp
	//    folder. The transcript (not just the Phase-6 turn) is the source of
	//    truth, since the dialogue model often returns little at Phase 6.
	transcript := buildRATranscript(history, finalReport)
	if strings.TrimSpace(transcript) == "" {
		s.log.Warn("ai: ra finalize: empty transcript; nothing to finalize")
		return
	}
	dir := filepath.Join(os.TempDir(), "lab-pm-ra")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		s.log.Warn("ai: ra finalize: mkdir tmp", "err", err)
	} else {
		path := filepath.Join(dir, convID.String()+".md")
		if werr := os.WriteFile(path, []byte(transcript), 0o644); werr != nil {
			s.log.Warn("ai: ra finalize: write tmp transcript", "err", werr)
		} else {
			s.log.Info("ai: ra finalize: saved transcript", "path", path, "bytes", len(transcript))
		}
	}

	// 2. Recover iteration scope from the conversation seed, if any.
	iterationID := ""
	for _, m := range history {
		if m.Role == "user" {
			if mm := iterationIDRe.FindStringSubmatch(m.Content); len(mm) == 2 {
				iterationID = mm[1]
				break
			}
		}
	}

	// 3. Focused formatter pass with the dedicated (Flash) model — no tools.
	resp, err := s.client.Chat(ctx, ChatRequest{
		Model: raFormatterModel(),
		Messages: []ChatMessage{
			{Role: "system", Content: raFormatterSystem},
			{Role: "user", Content: raFormatterPrompt(transcript)},
		},
		Temperature: 0.1,
		MaxTokens:   4096,
	})
	if err != nil {
		s.log.Warn("ai: ra finalize: formatter call failed", "err", err)
		warn, _ := json.Marshal(map[string]string{"message": "Could not auto-save the risk assessment (formatter unavailable). Your report text is preserved; you can retry."})
		sendSSE("warn", string(warn))
		return
	}
	if resp.Usage.TotalTokens > 0 {
		if wsID, e1 := uuid.Parse(workspaceID); e1 == nil {
			if pID, e2 := uuid.Parse(projectID); e2 == nil {
				_ = recordUsage(ctx, s.pool, wsID, pID, userID, "ra_finalize", raFormatterModel(), resp.Usage)
			}
		}
	}

	var parsed raFormatterResult
	if raw := extractJSONObject(resp.Message.Content); raw != "" {
		_ = json.Unmarshal([]byte(raw), &parsed)
	}
	if len(parsed.FailureModes) == 0 {
		s.log.Warn("ai: ra finalize: formatter returned no failure modes")
		warn, _ := json.Marshal(map[string]string{"message": "Could not structure the risk assessment for saving. Your report text is preserved; you can retry."})
		sendSSE("warn", string(warn))
		return
	}

	// 4. Assemble save_risk_assessment args. report_markdown is the dialogue
	//    model's report verbatim; the structured fields come from the formatter.
	fms := make([]map[string]any, 0, len(parsed.FailureModes))
	for _, f := range parsed.FailureModes {
		fms = append(fms, map[string]any{
			"title":              f.Title,
			"likelihood":         f.Likelihood,
			"impact_headline":    f.ImpactHeadline,
			"impact_description": f.ImpactDescription,
			"mitigation":         f.Mitigation,
			"plan_b":             f.PlanB,
			"flag_pi_review":     f.FlagPIReview,
		})
	}
	reportMD := strings.TrimSpace(parsed.ReportMarkdown)
	if reportMD == "" {
		reportMD = strings.TrimSpace(finalReport)
	}
	if reportMD == "" {
		reportMD = "# Risk Assessment\n\n(Report compiled from the assessment dialogue.)"
	}
	args := map[string]any{
		"report_markdown": reportMD,
		"report_title":    parsed.ReportTitle,
		"risk_level":      parsed.RiskLevel,
		"expertise":       parsed.Expertise,
		"failure_modes":   fms,
	}
	if iterationID != "" {
		args["iteration_id"] = iterationID
	}
	argsJSON, _ := json.Marshal(args)

	// 5. Persist via the save_risk_assessment tool (report page + register + PI
	//    flags). Dispatched server-side because the researcher explicitly asked
	//    to compile the report; this is not an autonomous model write.
	callID := "ra-finalize-" + uuid.NewString()
	evt, _ := json.Marshal(map[string]any{"tool_call_id": callID, "name": "save_risk_assessment", "arguments": string(argsJSON)})
	sendSSE("tool_call", string(evt))

	result, _, derr := dispatchTool(ctx, "save_risk_assessment", string(argsJSON), projectID, workspaceID, restCall, restCallHdrs)
	status := "executed"
	if derr != nil {
		result = fmt.Sprintf(`{"error":%q}`, derr.Error())
		status = "error"
		s.log.Warn("ai: ra finalize: save_risk_assessment failed", "err", derr)
	} else {
		s.log.Info("ai: ra finalize: saved risk assessment", "failure_modes", len(fms), "iteration_id", iterationID)
	}
	if rec, rErr := recordToolCall(ctx, s.pool, &convID, "save_risk_assessment", json.RawMessage(argsJSON), status, callID); rErr == nil && rec != nil {
		out, _ := json.Marshal(map[string]string{"result": result})
		_ = updateToolCallOutput(ctx, s.pool, rec.ID, out, status, &userID)
	}
	resEvt, _ := json.Marshal(map[string]any{"tool_call_id": callID, "name": "save_risk_assessment", "result": result, "status": status})
	sendSSE("tool_result", string(resEvt))
}
