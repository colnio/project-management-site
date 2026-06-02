package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Conversation ─────────────────────────────────────────────────────────────

// Conversation represents an LLM chat session.
type Conversation struct {
	ID             uuid.UUID `json:"id"`
	ProjectID      uuid.UUID `json:"project_id"`
	StartedBy      uuid.UUID `json:"started_by"`
	Title          string    `json:"title"`
	Skill          *string   `json:"skill,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	LastAccessedAt time.Time `json:"last_accessed_at"`
}

func createConversation(ctx context.Context, pool *pgxpool.Pool, projectID, userID uuid.UUID, title string, skill *string) (*Conversation, error) {
	var c Conversation
	err := pool.QueryRow(ctx,
		`INSERT INTO ai_conversations (project_id, started_by, title, skill)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, project_id, started_by, title, skill, created_at, last_accessed_at`,
		projectID, userID, title, skill,
	).Scan(&c.ID, &c.ProjectID, &c.StartedBy, &c.Title, &c.Skill, &c.CreatedAt, &c.LastAccessedAt)
	if err != nil {
		return nil, fmt.Errorf("ai: create conversation: %w", err)
	}
	return &c, nil
}

func getConversation(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (*Conversation, error) {
	var c Conversation
	err := pool.QueryRow(ctx,
		`SELECT id, project_id, started_by, title, skill, created_at, last_accessed_at FROM ai_conversations WHERE id=$1`,
		id,
	).Scan(&c.ID, &c.ProjectID, &c.StartedBy, &c.Title, &c.Skill, &c.CreatedAt, &c.LastAccessedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ai: get conversation: %w", err)
	}
	return &c, nil
}

func listConversations(ctx context.Context, pool *pgxpool.Pool, projectID uuid.UUID) ([]*Conversation, error) {
	rows, err := pool.Query(ctx,
		`SELECT id, project_id, started_by, title, skill, created_at, last_accessed_at
		 FROM ai_conversations WHERE project_id=$1 ORDER BY created_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("ai: list conversations: %w", err)
	}
	defer rows.Close()
	var out []*Conversation
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.StartedBy, &c.Title, &c.Skill, &c.CreatedAt, &c.LastAccessedAt); err != nil {
			return nil, err
		}
		out = append(out, &c)
	}
	return out, rows.Err()
}

// touchConversation bumps last_accessed_at to now() for the given conversation,
// resetting its idle-expiration window. Called whenever a chat is opened or
// messaged into.
func touchConversation(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) error {
	_, err := pool.Exec(ctx,
		`UPDATE ai_conversations SET last_accessed_at = now() WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("ai: touch conversation: %w", err)
	}
	return nil
}

// deleteIdleConversations hard-deletes conversations whose last_accessed_at is
// older than the given duration. ai_messages and ai_tool_calls rows cascade.
// Returns the number of conversations deleted.
func deleteIdleConversations(ctx context.Context, pool *pgxpool.Pool, idleFor time.Duration) (int64, error) {
	tag, err := pool.Exec(ctx,
		`DELETE FROM ai_conversations
		 WHERE last_accessed_at < now() - make_interval(secs => $1)`,
		idleFor.Seconds(),
	)
	if err != nil {
		return 0, fmt.Errorf("ai: delete idle conversations: %w", err)
	}
	return tag.RowsAffected(), nil
}

// ─── Messages ─────────────────────────────────────────────────────────────────

// Message is a persisted chat message.
type Message struct {
	ID             uuid.UUID  `json:"id"`
	ConversationID uuid.UUID  `json:"conversation_id"`
	Seq            int        `json:"seq"`
	Role           string     `json:"role"`
	Content        string     `json:"content"`
	ToolCalls      []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID     string     `json:"tool_call_id,omitempty"`
	Name           string     `json:"name,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

func appendMessage(ctx context.Context, pool *pgxpool.Pool, convID uuid.UUID, seq int, msg ChatMessage) (*Message, error) {
	var toolCallsJSON []byte
	if len(msg.ToolCalls) > 0 {
		var err error
		toolCallsJSON, err = json.Marshal(msg.ToolCalls)
		if err != nil {
			return nil, fmt.Errorf("ai: marshal tool calls: %w", err)
		}
	}

	var m Message
	var rawTC []byte
	err := pool.QueryRow(ctx,
		`INSERT INTO ai_messages (conversation_id, seq, role, content, tool_calls, tool_call_id, name)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, conversation_id, seq, role, content, tool_calls, tool_call_id, name, created_at`,
		convID, seq, msg.Role, msg.Content, toolCallsJSON, msg.ToolCallID, msg.Name,
	).Scan(&m.ID, &m.ConversationID, &m.Seq, &m.Role, &m.Content, &rawTC, &m.ToolCallID, &m.Name, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("ai: append message: %w", err)
	}
	if len(rawTC) > 0 {
		_ = json.Unmarshal(rawTC, &m.ToolCalls)
	}
	return &m, nil
}

func listMessages(ctx context.Context, pool *pgxpool.Pool, convID uuid.UUID) ([]*Message, error) {
	rows, err := pool.Query(ctx,
		`SELECT id, conversation_id, seq, role, content, tool_calls, tool_call_id, name, created_at
		 FROM ai_messages WHERE conversation_id=$1 ORDER BY seq`,
		convID,
	)
	if err != nil {
		return nil, fmt.Errorf("ai: list messages: %w", err)
	}
	defer rows.Close()
	var out []*Message
	for rows.Next() {
		var m Message
		var rawTC []byte
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Seq, &m.Role, &m.Content, &rawTC, &m.ToolCallID, &m.Name, &m.CreatedAt); err != nil {
			return nil, err
		}
		if len(rawTC) > 0 {
			_ = json.Unmarshal(rawTC, &m.ToolCalls)
		}
		out = append(out, &m)
	}
	return out, rows.Err()
}

func nextSeq(ctx context.Context, pool *pgxpool.Pool, convID uuid.UUID) (int, error) {
	var max *int
	err := pool.QueryRow(ctx,
		`SELECT MAX(seq) FROM ai_messages WHERE conversation_id=$1`, convID,
	).Scan(&max)
	if err != nil {
		return 0, err
	}
	if max == nil {
		return 0, nil
	}
	return *max + 1, nil
}

// ─── Tool calls ───────────────────────────────────────────────────────────────

// ToolCallRecord is a persisted LLM tool call record.
type ToolCallRecord struct {
	ID             uuid.UUID  `json:"id"`
	ConversationID *uuid.UUID `json:"conversation_id,omitempty"`
	RunID          *uuid.UUID `json:"run_id,omitempty"`
	Tool           string     `json:"tool"`
	InputJSON      any        `json:"input_json,omitempty"`
	OutputJSON     any        `json:"output_json,omitempty"`
	Status         string     `json:"status"`
	ExecutedBy     *uuid.UUID `json:"executed_by,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// recordToolCall persists an LLM tool-call attempt. callID is the OpenAI
// tool_call id carried on the assistant message; it links this record back to
// the message tool_call so the conversation API can enrich it with status (and
// this record's UUID) for the Approve/Reject controls. Pass "" when no message
// tool_call id applies (e.g. workflow steps).
func recordToolCall(ctx context.Context, pool *pgxpool.Pool, convID *uuid.UUID, tool string, inputJSON json.RawMessage, status, callID string) (*ToolCallRecord, error) {
	var id uuid.UUID
	var createdAt time.Time
	var callIDArg *string
	if callID != "" {
		callIDArg = &callID
	}
	err := pool.QueryRow(ctx,
		`INSERT INTO ai_tool_calls (conversation_id, tool, input_json, status, call_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at`,
		convID, tool, []byte(inputJSON), status, callIDArg,
	).Scan(&id, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("ai: record tool call: %w", err)
	}
	return &ToolCallRecord{
		ID:             id,
		ConversationID: convID,
		Tool:           tool,
		Status:         status,
		CreatedAt:      createdAt,
	}, nil
}

// toolCallStatus is the per-call_id enrichment used to surface a message
// tool_call's approval status and its record UUID.
type toolCallStatus struct {
	RecordID uuid.UUID
	Status   string
}

// loadToolCallStatusByCallID returns, for a conversation, a map from the OpenAI
// tool_call id to its persisted record (UUID + status). Only rows that carry a
// call_id participate, so older rows are simply skipped.
func loadToolCallStatusByCallID(ctx context.Context, pool *pgxpool.Pool, convID uuid.UUID) (map[string]toolCallStatus, error) {
	rows, err := pool.Query(ctx,
		`SELECT id, call_id, status FROM ai_tool_calls
		 WHERE conversation_id=$1 AND call_id IS NOT NULL`,
		convID,
	)
	if err != nil {
		return nil, fmt.Errorf("ai: load tool call status: %w", err)
	}
	defer rows.Close()
	out := map[string]toolCallStatus{}
	for rows.Next() {
		var id uuid.UUID
		var callID, status string
		if err := rows.Scan(&id, &callID, &status); err != nil {
			return nil, err
		}
		out[callID] = toolCallStatus{RecordID: id, Status: status}
	}
	return out, rows.Err()
}

func updateToolCallOutput(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, outputJSON json.RawMessage, status string, executedBy *uuid.UUID) error {
	_, err := pool.Exec(ctx,
		`UPDATE ai_tool_calls SET output_json=$2, status=$3, executed_by=$4 WHERE id=$1`,
		id, []byte(outputJSON), status, executedBy,
	)
	return err
}

func getToolCall(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (*ToolCallRecord, error) {
	var tc ToolCallRecord
	var convID *uuid.UUID
	var rawIn, rawOut []byte
	err := pool.QueryRow(ctx,
		`SELECT id, conversation_id, tool, input_json, output_json, status, executed_by, created_at
		 FROM ai_tool_calls WHERE id=$1`, id,
	).Scan(&tc.ID, &convID, &tc.Tool, &rawIn, &rawOut, &tc.Status, &tc.ExecutedBy, &tc.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ai: get tool call: %w", err)
	}
	tc.ConversationID = convID
	// Preserve the stored JSON verbatim so callers (e.g. ApproveToolCall) can
	// re-dispatch the tool with its original arguments. Without this the scanned
	// bytes are dropped and InputJSON marshals to "null", losing all arguments.
	if len(rawIn) > 0 {
		tc.InputJSON = json.RawMessage(rawIn)
	}
	if len(rawOut) > 0 {
		tc.OutputJSON = json.RawMessage(rawOut)
	}
	return &tc, nil
}

// ─── Usage records ────────────────────────────────────────────────────────────

const (
	defaultPricePer1k    = 0.0  // $ per 1k tokens (configurable; 0.0 default for dev)
	defaultMonthlyCapUSD = 50.0 // generous cap per workspace per month
	spendWarnThreshold   = 0.80 // warn at 80% of cap
)

func recordUsage(ctx context.Context, pool *pgxpool.Pool, workspaceID, projectID, userID uuid.UUID, feature, model string, usage Usage) error {
	total := usage.PromptTokens + usage.CompletionTokens
	cost := float64(total) / 1000.0 * defaultPricePer1k
	_, err := pool.Exec(ctx,
		`INSERT INTO ai_usage_records (workspace_id, project_id, user_id, feature, model, prompt_tokens, completion_tokens, usd_cost)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		workspaceID, projectID, userID, feature, model,
		usage.PromptTokens, usage.CompletionTokens, cost,
	)
	return err
}

// SpendCheckResult is the result of a spend cap check.
type SpendCheckResult struct {
	Allowed  bool
	SoftWarn bool    // true when >= 80% of cap
	Spent    float64 // current month total
}

func checkSpendCap(ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID) (SpendCheckResult, error) {
	var spent float64
	err := pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(usd_cost),0) FROM ai_usage_records
		 WHERE workspace_id=$1
		   AND date_trunc('month', created_at) = date_trunc('month', now())`,
		workspaceID,
	).Scan(&spent)
	if err != nil {
		return SpendCheckResult{Allowed: true}, fmt.Errorf("ai: check spend cap: %w", err)
	}
	if spent >= defaultMonthlyCapUSD {
		return SpendCheckResult{Allowed: false, Spent: spent}, nil
	}
	warn := spent >= defaultMonthlyCapUSD*spendWarnThreshold
	return SpendCheckResult{Allowed: true, SoftWarn: warn, Spent: spent}, nil
}

// UsageSummary holds the current usage statistics for a workspace.
type UsageSummary struct {
	SpentToday float64 `json:"spent_today"`
	SpentMonth float64 `json:"spent_month"`
	MonthlyCap float64 `json:"monthly_cap"`
	Pct        float64 `json:"pct"`
	Model      string  `json:"model"`
}

func getUsageSummary(ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID) (*UsageSummary, error) {
	var spentToday, spentMonth float64
	err := pool.QueryRow(ctx,
		`SELECT
		   COALESCE(SUM(usd_cost) FILTER (WHERE created_at::date = now()::date), 0),
		   COALESCE(SUM(usd_cost) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', now())), 0)
		 FROM ai_usage_records
		 WHERE workspace_id=$1`,
		workspaceID,
	).Scan(&spentToday, &spentMonth)
	if err != nil {
		return nil, fmt.Errorf("ai: get usage summary: %w", err)
	}

	// Fetch the most recent model used for this workspace.
	var model string
	_ = pool.QueryRow(ctx,
		`SELECT model FROM ai_usage_records WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1`,
		workspaceID,
	).Scan(&model)

	pct := 0.0
	if defaultMonthlyCapUSD > 0 {
		pct = spentMonth / defaultMonthlyCapUSD
	}

	return &UsageSummary{
		SpentToday: spentToday,
		SpentMonth: spentMonth,
		MonthlyCap: defaultMonthlyCapUSD,
		Pct:        pct,
		Model:      model,
	}, nil
}
