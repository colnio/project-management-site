package ai

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/ai/skills"
	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

const maxToolRounds = 5

// HandleMessageStream is mounted as a chi POST route (not huma) to support SSE.
// Path: /v1/ai/conversations/{id}/messages
func (s *Service) HandleMessageStream(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if !s.available() {
		writeSSEError(w, "ai.unavailable", "LLM provider is not configured")
		return
	}

	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		http.Error(w, `{"code":"unauthorized","message":"authentication required"}`, http.StatusUnauthorized)
		return
	}
	if err := platform.RequireScope(p, platform.ScopeWriteAI); err != nil {
		writeSSEError(w, "ai.forbidden", "missing write:ai scope")
		return
	}

	// Extract conversation ID from path.
	convIDStr := chi.URLParam(r, "id")
	if convIDStr == "" {
		// Fallback: parse from URL path.
		parts := strings.Split(strings.TrimSuffix(r.URL.Path, "/"), "/")
		for i, seg := range parts {
			if seg == "conversations" && i+1 < len(parts) {
				convIDStr = parts[i+1]
				break
			}
		}
	}
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		writeSSEError(w, "ai.invalid_conversation_id", "invalid conversation id")
		return
	}

	// Parse request body.
	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeSSEError(w, "ai.bad_request", "invalid request body")
		return
	}
	if strings.TrimSpace(body.Content) == "" {
		writeSSEError(w, "ai.bad_request", "content is required")
		return
	}

	// Load conversation.
	conv, err := getConversation(ctx, s.pool, convID)
	if err != nil || conv == nil {
		writeSSEError(w, "ai.conversation_not_found", "conversation not found")
		return
	}

	// Authorize on the project.
	proj, _, err := s.projects.Authorize(ctx, p, conv.ProjectID, org.RoleViewer)
	if err != nil {
		writeSSEError(w, "ai.forbidden", "access denied")
		return
	}

	// Spend cap check.
	capCheck, err := checkSpendCap(ctx, s.pool, proj.WorkspaceID)
	if err != nil {
		s.log.Warn("ai: spend cap check error", "err", err)
	}
	if !capCheck.Allowed {
		writeSSEError(w, "ai.spend_cap_exceeded", "monthly LLM spend cap exceeded")
		return
	}

	// Resolve autonomy.
	mode, allowedTools := ResolveAutonomy(ctx, s.pool, proj.WorkspaceID, proj.ID)

	// Mint internal LLM token with the full set of scopes needed by LLM tools.
	// This set must cover every endpoint the LLM tools call via the REST API.
	iaiToken, err := s.authSvc.MintInternalAIToken(ctx, p.UserID, convID, []string{
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
		writeSSEError(w, "ai.internal_error", "failed to create internal token")
		return
	}
	defer func() {
		if rErr := s.authSvc.RevokeInternalAITokens(ctx, convID); rErr != nil {
			s.log.Warn("ai: revoke internal token", "err", rErr)
		}
	}()

	// Load existing messages as history.
	existingMsgs, err := listMessages(ctx, s.pool, convID)
	if err != nil {
		writeSSEError(w, "ai.internal_error", "failed to load messages")
		return
	}

	// Persist the user message.
	userSeq, err := nextSeq(ctx, s.pool, convID)
	if err != nil {
		writeSSEError(w, "ai.internal_error", "failed to determine sequence")
		return
	}
	userMsg := ChatMessage{Role: "user", Content: body.Content}
	if _, err := appendMessage(ctx, s.pool, convID, userSeq, userMsg); err != nil {
		writeSSEError(w, "ai.internal_error", "failed to persist user message")
		return
	}

	// Build the full message history for the model.
	// Compose a system message with project context (not persisted to DB).

	// contextPreamble is always included as the foundation of the system prompt.
	contextPreamble := untrustedDataNotice +
		xmlData("project_id", proj.ID.String()) + "\n" +
		xmlData("project_name", proj.Name) + "\n" +
		xmlData("workspace_id", proj.WorkspaceID.String()) + "\n" +
		xmlData("today", time.Now().Format("2006-01-02")) + "\n\n" +
		"You are running inside a web application; there is no local filesystem. " +
		"Use the available tools to read project data and produce the final report as a chat message and/or via the draft_page tool.\n" +
		// The project_id above is wrapped in XML data tags for safety; a smaller
		// model may otherwise copy the literal "<project_id>" tag as an argument.
		// Restate it as a plain value and pin the response language so the model
		// stays in English through multi-round tool use.
		"When a tool needs project_id, pass exactly this value: " + proj.ID.String() + " — never pass a placeholder like \"<project_id>\" or the tag name itself.\n" +
		"Always respond in English.\n" +
		"Before stating any factual, numerical, dated, or external claim, you MUST call the web_search tool to verify it and base your answer on the returned results. " +
		"Do not rely on memory for facts, figures, dates, prices, names, or current events. " +
		"If web_search is unconfigured or returns an error, say so explicitly and clearly mark the affected claim as unverified. " +
		"web_search returns title/url/description snippets — these are sufficient to cite; you cannot open pages, so do not keep searching for \"the full page\". " +
		"One well-formed search is usually enough; after at most two searches, give your final answer and cite the source URLs."

	var systemContent string
	if conv.Skill != nil && *conv.Skill != "" {
		skillBody, skillErr := skills.LoadSkill(*conv.Skill)
		if skillErr == nil {
			systemContent = contextPreamble + "\n\n" + skillBody
		} else {
			s.log.Warn("ai: sse: load skill failed; falling back to generic prompt", "skill", *conv.Skill, "err", skillErr)
			systemContent = "You are an LLM assistant embedded in a research project management tool.\n" +
				contextPreamble + "\n\n" +
				"Instructions:\n" +
				"- When a tool requires a project_id and the user has not specified one, default to the current project_id above.\n" +
				"- Use the list_projects tool when the user asks about multiple projects or projects outside the current one.\n" +
				"- Be concise and factual in your responses."
		}
	} else {
		systemContent = "You are an LLM assistant embedded in a research project management tool.\n" +
			contextPreamble + "\n\n" +
			"Instructions:\n" +
			"- When a tool requires a project_id and the user has not specified one, default to the current project_id above.\n" +
			"- Use the list_projects tool when the user asks about multiple projects or projects outside the current one.\n" +
			"- Be concise and factual in your responses."
	}

	systemMsg := ChatMessage{
		Role:    "system",
		Content: systemContent,
	}
	history := make([]ChatMessage, 0, len(existingMsgs)+2)
	history = append(history, systemMsg)
	for _, m := range existingMsgs {
		history = append(history, ChatMessage{
			Role:       m.Role,
			Content:    m.Content,
			ToolCalls:  m.ToolCalls,
			ToolCallID: m.ToolCallID,
			Name:       m.Name,
		})
	}
	history = append(history, userMsg)

	// Set up SSE response.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher, canFlush := w.(http.Flusher)

	sendSSE := func(eventType, data string) {
		_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, data)
		if canFlush {
			flusher.Flush()
		}
	}

	if capCheck.SoftWarn {
		d, _ := json.Marshal(map[string]any{"message": "approaching monthly spend cap"})
		sendSSE("warn", string(d))
	}

	// Tool-use loop.
	restCall := makeRESTCaller(s.restBase, iaiToken)
	tools := gatedTools(proj.ID.String(), proj.WorkspaceID.String(), mode, allowedTools)

	var finalAssistantContent string
	seq := userSeq + 1

	// pendingToolCalls stays true if the loop exits via the round cap while the
	// model still wants to call tools (vs. a clean break when it has answered).
	pendingToolCalls := false

	for round := 0; round < maxToolRounds; round++ {
		chatReq := ChatRequest{
			Messages:  history,
			Tools:     tools,
			MaxTokens: 4096,
		}

		// Check spend cap before each round.
		capCheck, _ = checkSpendCap(ctx, s.pool, proj.WorkspaceID)
		if !capCheck.Allowed {
			sendSSE("error", `{"code":"ai.spend_cap_exceeded","message":"monthly LLM spend cap exceeded"}`)
			return
		}

		stream, err := s.client.ChatStream(ctx, chatReq)
		if err != nil {
			sendSSE("error", jsonErrorStr("ai.provider_error", err.Error()))
			return
		}

		var assistantContent strings.Builder
		var toolCalls []ToolCall
		var usage *Usage

		for chunk := range stream {
			if chunk.Err != nil {
				sendSSE("error", jsonErrorStr("ai.stream_error", chunk.Err.Error()))
				return
			}
			if chunk.Done {
				break
			}
			if chunk.ContentDelta != "" {
				assistantContent.WriteString(chunk.ContentDelta)
				d, _ := json.Marshal(map[string]string{"delta": chunk.ContentDelta})
				sendSSE("token", string(d))
			}
			if len(chunk.ToolCalls) > 0 {
				toolCalls = chunk.ToolCalls
			}
			if chunk.Usage != nil {
				usage = chunk.Usage
			}
		}

		// Meter usage.
		if usage != nil {
			model := ""
			if p2, err2 := LoadProvider(); p2 != nil && err2 == nil {
				model = p2.Model
			}
			_ = recordUsage(ctx, s.pool, proj.WorkspaceID, proj.ID, p.UserID, "chat", model, *usage)
		}

		content := assistantContent.String()
		finalAssistantContent = content

		// Persist assistant message.
		assistantMsg := ChatMessage{
			Role:      "assistant",
			Content:   content,
			ToolCalls: toolCalls,
		}
		if _, err := appendMessage(ctx, s.pool, convID, seq, assistantMsg); err != nil {
			s.log.Warn("ai: persist assistant message", "err", err)
		}
		seq++
		history = append(history, assistantMsg)

		// If no tool calls, we're done.
		if len(toolCalls) == 0 {
			pendingToolCalls = false
			break
		}
		pendingToolCalls = true

		// Execute tool calls.
		for _, tc := range toolCalls {
			isWrite := false
			for _, td := range allTools(proj.ID.String(), proj.WorkspaceID.String()) {
				if td.Tool.Function.Name == tc.Function.Name {
					isWrite = td.IsWrite
					break
				}
			}

			inputJSON := json.RawMessage(tc.Function.Arguments)

			toolCallEvt, _ := json.Marshal(map[string]any{
				"tool_call_id": tc.ID,
				"name":         tc.Function.Name,
				"arguments":    tc.Function.Arguments,
			})
			sendSSE("tool_call", string(toolCallEvt))

			var status string
			var resultJSON string
			var toolErr error

			if isWrite {
				execute, propose := IsWriteAllowed(mode, allowedTools, tc.Function.Name)
				if !execute && !propose {
					// read_only: refuse
					resultJSON = `{"error":"write tool refused in read_only mode"}`
					status = "rejected"
				} else if propose && !execute {
					// suggest_writes or auto_routine for draft_page: record as proposed
					rec, rErr := recordToolCall(ctx, s.pool, &convID, tc.Function.Name, inputJSON, "proposed")
					if rErr != nil {
						s.log.Warn("ai: record proposed tool call", "err", rErr)
					}
					_ = rec
					resultJSON = `{"status":"proposed","message":"write tool call is pending approval"}`
					status = "proposed"
					_ = s.rec.Record(ctx, audit.Entry{
						Actor:               p.UserID,
						ViaAIConversationID: &convID,
						Action:              "ai.tool_call_proposed",
						ResourceType:        "ai_tool_call",
						ResourceID:          tc.Function.Name,
					})
				} else {
					// auto-execute
					rec, rErr := recordToolCall(ctx, s.pool, &convID, tc.Function.Name, inputJSON, "executed")
					if rErr != nil {
						s.log.Warn("ai: record executed tool call", "err", rErr)
					}
					resultJSON, _, toolErr = dispatchTool(ctx, tc.Function.Name, tc.Function.Arguments, proj.ID.String(), proj.WorkspaceID.String(), restCall)
					if toolErr != nil {
						resultJSON = fmt.Sprintf(`{"error":%q}`, toolErr.Error())
					}
					if rec != nil {
						outJSON, _ := json.Marshal(map[string]string{"result": resultJSON})
						_ = updateToolCallOutput(ctx, s.pool, rec.ID, outJSON, "executed", &p.UserID)
					}
					status = "executed"
				}
			} else {
				// Read tool — always execute.
				rec, rErr := recordToolCall(ctx, s.pool, &convID, tc.Function.Name, inputJSON, "executed")
				if rErr != nil {
					s.log.Warn("ai: record read tool call", "err", rErr)
				}
				resultJSON, _, toolErr = dispatchTool(ctx, tc.Function.Name, tc.Function.Arguments, proj.ID.String(), proj.WorkspaceID.String(), restCall)
				if toolErr != nil {
					resultJSON = fmt.Sprintf(`{"error":%q}`, toolErr.Error())
				}
				if rec != nil {
					outJSON, _ := json.Marshal(map[string]string{"result": resultJSON})
					_ = updateToolCallOutput(ctx, s.pool, rec.ID, outJSON, "executed", nil)
				}
				status = "executed"
			}

			toolResultEvt, _ := json.Marshal(map[string]any{
				"tool_call_id": tc.ID,
				"name":         tc.Function.Name,
				"result":       resultJSON,
				"status":       status,
			})
			sendSSE("tool_result", string(toolResultEvt))

			// Append tool result to history.
			toolResultMsg := ChatMessage{
				Role:       "tool",
				Content:    resultJSON,
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
			}
			if _, err := appendMessage(ctx, s.pool, convID, seq, toolResultMsg); err != nil {
				s.log.Warn("ai: persist tool result message", "err", err)
			}
			seq++
			history = append(history, toolResultMsg)
		}
	}

	// If the round cap was hit while the model still wanted to call tools, make
	// one final call WITHOUT tools so the user gets a synthesized answer from
	// the data already gathered instead of a dangling tool call.
	if pendingToolCalls {
		if capCheck, _ = checkSpendCap(ctx, s.pool, proj.WorkspaceID); capCheck.Allowed {
			history = append(history, ChatMessage{
				Role:    "user",
				Content: "You have reached the tool-call limit. Give your best final answer now using the information already gathered, and clearly mark any claim you could not fully verify.",
			})
			if stream, err := s.client.ChatStream(ctx, ChatRequest{Messages: history, MaxTokens: 1024}); err == nil {
				var finalContent strings.Builder
				var usage *Usage
				for chunk := range stream {
					if chunk.Err != nil || chunk.Done {
						break
					}
					if chunk.ContentDelta != "" {
						finalContent.WriteString(chunk.ContentDelta)
						d, _ := json.Marshal(map[string]string{"delta": chunk.ContentDelta})
						sendSSE("token", string(d))
					}
					if chunk.Usage != nil {
						usage = chunk.Usage
					}
				}
				if usage != nil {
					model := ""
					if p2, err2 := LoadProvider(); p2 != nil && err2 == nil {
						model = p2.Model
					}
					_ = recordUsage(ctx, s.pool, proj.WorkspaceID, proj.ID, p.UserID, "chat", model, *usage)
				}
				if fc := finalContent.String(); fc != "" {
					finalAssistantContent = fc
					if _, err := appendMessage(ctx, s.pool, convID, seq, ChatMessage{Role: "assistant", Content: fc}); err != nil {
						s.log.Warn("ai: persist final assistant message", "err", err)
					}
					seq++
				}
			}
		}
	}

	_ = finalAssistantContent

	doneData, _ := json.Marshal(map[string]string{"conversation_id": convID.String()})
	sendSSE("done", string(doneData))

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:               p.UserID,
		ViaAIConversationID: &convID,
		Action:              "ai.message_stream",
		ResourceType:        "ai_conversation",
		ResourceID:          convID.String(),
	})

	_ = slog.Default()
}

func writeSSEError(w http.ResponseWriter, code, message string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	d, _ := json.Marshal(map[string]string{"code": code, "message": message})
	_, _ = fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(d))
}

func jsonErrorStr(code, message string) string {
	d, _ := json.Marshal(map[string]string{"code": code, "message": message})
	return string(d)
}
