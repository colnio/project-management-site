package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"log/slog"
	"os"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/iteration"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/risk"
	"github.com/colnio/project-management-site/internal/testsupport"
	"github.com/colnio/project-management-site/skills"
)

// ─── Test helpers ─────────────────────────────────────────────────────────────

func newTestService(t *testing.T, pool *pgxpool.Pool, client Client) (*Service, *setupData) {
	t.Helper()
	ctx := context.Background()

	cfg := &config.Config{Port: "19099"} // fake port

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))

	authSvc, err := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "test-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		OIDCIssuer:      "http://localhost:9999/nonexistent",
	}, audit.Nop{}, logger)
	if err != nil {
		t.Fatalf("auth service: %v", err)
	}

	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	svc := NewService(pool, cfg, client, authSvc, orgSvc, projectSvc, audit.Nop{}, logger)

	sd := createTestSetup(t, ctx, pool, authSvc, orgSvc)
	return svc, sd
}

type setupData struct {
	UserID      uuid.UUID
	WorkspaceID uuid.UUID
	ProjectID   uuid.UUID
	Principal   *platform.Principal
}

func createTestSetup(t *testing.T, ctx context.Context, pool *pgxpool.Pool, authSvc *auth.Service, orgSvc *org.Service) *setupData {
	t.Helper()

	// Create user.
	email := fmt.Sprintf("ai-test-%s@example.com", uuid.New().String()[:8])
	user, err := authSvc.CreateUser(ctx, email, "AI Test User")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	// Create workspace.
	ws, err := orgSvc.CreateWorkspace(ctx, "aitestws"+user.ID.String()[:8], user.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	// Create project via direct DB insert (faster for tests).
	projID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "AI Test Project", "", "workspace", user.ID,
	)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	p := &platform.Principal{
		UserID: user.ID,
		Email:  email,
	}
	return &setupData{
		UserID:      user.ID,
		WorkspaceID: ws.ID,
		ProjectID:   projID,
		Principal:   p,
	}
}

// ─── Service tests ────────────────────────────────────────────────────────────

func TestService_Unavailable(t *testing.T) {
	pool := testsupport.NewPool(t)
	svc, sd := newTestService(t, pool, nil) // nil client = disabled

	_, err := svc.CreateConversation(context.Background(), sd.Principal, sd.ProjectID, "test", nil)
	if err == nil {
		t.Fatal("expected error when AI unavailable")
	}
	if !strings.Contains(err.Error(), "not configured") && !strings.Contains(err.Error(), "unavailable") {
		t.Errorf("expected unavailable error, got: %v", err)
	}
}

func TestService_CreateAndListConversations(t *testing.T) {
	pool := testsupport.NewPool(t)
	stub := NewStubClient(nil)
	svc, sd := newTestService(t, pool, stub)

	ctx := context.Background()
	conv, err := svc.CreateConversation(ctx, sd.Principal, sd.ProjectID, "My Test Chat", nil)
	if err != nil {
		t.Fatalf("CreateConversation: %v", err)
	}
	if conv.ID == uuid.Nil {
		t.Error("expected non-nil conversation ID")
	}
	if conv.Title != "My Test Chat" {
		t.Errorf("title = %q", conv.Title)
	}

	convs, err := svc.ListConversations(ctx, sd.Principal, sd.ProjectID)
	if err != nil {
		t.Fatalf("ListConversations: %v", err)
	}
	found := false
	for _, c := range convs {
		if c.ID == conv.ID {
			found = true
		}
	}
	if !found {
		t.Error("created conversation not in list")
	}
}

// TestChatLoop_ReadToolThenText tests the full tool-use loop with stub:
// model first calls read_sample, gets result, then returns final text.
func TestChatLoop_ReadToolThenText(t *testing.T) {
	pool := testsupport.NewPool(t)

	// Stand up a fake REST backend for the tool to hit.
	sampleID := uuid.New().String()
	restSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/samples/"+sampleID) {
			json.NewEncoder(w).Encode(map[string]any{"id": sampleID, "name": "Test Sample"})
			return
		}
		http.Error(w, "not found", 404)
	}))
	defer restSrv.Close()

	// Script stub: first call returns tool_call, second returns final text.
	stub := NewStubClient([]StubResponse{
		{
			Response: &ChatResponse{
				Message: ChatMessage{
					Role: "assistant",
					ToolCalls: []ToolCall{
						{
							ID:   "call_001",
							Type: "function",
							Function: FunctionCall{
								Name:      "read_sample",
								Arguments: fmt.Sprintf(`{"sample_id":%q}`, sampleID),
							},
						},
					},
				},
				Usage: Usage{PromptTokens: 20, CompletionTokens: 15, TotalTokens: 35},
			},
		},
		{
			Response: &ChatResponse{
				Message:      ChatMessage{Role: "assistant", Content: "The sample is Test Sample."},
				Usage:        Usage{PromptTokens: 30, CompletionTokens: 10, TotalTokens: 40},
				FinishReason: "stop",
			},
		},
	})

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	authSvc, _ := auth.NewService(context.Background(), pool, &config.Config{
		JWTSigningKey:   "test-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		OIDCIssuer:      "http://localhost:9999/nonexistent",
	}, audit.Nop{}, logger)

	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	// Extract port from restSrv URL.
	restURL := restSrv.URL
	port := restURL[strings.LastIndex(restURL, ":")+1:]
	cfg := &config.Config{Port: port}

	svc := NewService(pool, cfg, stub, authSvc, orgSvc, projectSvc, audit.Nop{}, logger)
	// Override restBase to point to test server.
	svc.restBase = restSrv.URL

	ctx := context.Background()

	// Setup user and project.
	email := fmt.Sprintf("loop-test-%s@example.com", uuid.New().String()[:8])
	user, _ := authSvc.CreateUser(ctx, email, "Loop Test")
	ws, _ := orgSvc.CreateWorkspace(ctx, "loopws"+user.ID.String()[:8], user.ID)
	projID := uuid.New()
	_, _ = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "LoopProj", "", "workspace", user.ID,
	)

	p := &platform.Principal{UserID: user.ID, Email: email}
	conv, err := svc.CreateConversation(ctx, p, projID, "loop test", nil)
	if err != nil {
		t.Fatalf("create conv: %v", err)
	}

	// Call HandleMessageStream via an httptest.ResponseRecorder.
	reqBody, _ := json.Marshal(map[string]string{"content": "what is sample " + sampleID})
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/ai/conversations/"+conv.ID.String()+"/messages", bytes.NewReader(reqBody))
	req = req.WithContext(platform.WithPrincipal(req.Context(), p))
	// Chi router not set up — inject URL param via chi context manually.
	// For the test, we use the strings fallback in HandleMessageStream.
	req.URL.Path = "/v1/ai/conversations/" + conv.ID.String() + "/messages"

	svc.HandleMessageStream(w, req)

	body, _ := io.ReadAll(w.Body)
	result := string(body)

	if !strings.Contains(result, "done") {
		t.Errorf("expected 'done' SSE event, got:\n%s", result)
	}

	// Verify messages were persisted.
	msgs, err := svc.GetConversationMessages(ctx, p, conv.ID)
	if err != nil {
		t.Fatalf("get messages: %v", err)
	}
	if len(msgs) == 0 {
		t.Error("expected messages to be persisted")
	}

	// Verify usage was recorded.
	var usageCount int
	_ = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ai_usage_records WHERE workspace_id=$1`, ws.ID,
	).Scan(&usageCount)
	if usageCount == 0 {
		t.Error("expected usage records to be written")
	}

	// Verify tool_call was recorded.
	var tcCount int
	_ = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ai_tool_calls WHERE conversation_id=$1`, conv.ID,
	).Scan(&tcCount)
	if tcCount == 0 {
		t.Error("expected tool call records to be written")
	}
}

func TestChatLoop_SpendCapRefusal(t *testing.T) {
	pool := testsupport.NewPool(t)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	authSvc, _ := auth.NewService(context.Background(), pool, &config.Config{
		JWTSigningKey:   "test-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		OIDCIssuer:      "http://localhost:9999/nonexistent",
	}, audit.Nop{}, logger)
	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	ctx := context.Background()
	email := fmt.Sprintf("cap-test-%s@example.com", uuid.New().String()[:8])
	user, _ := authSvc.CreateUser(ctx, email, "Cap Test")
	ws, _ := orgSvc.CreateWorkspace(ctx, "capws"+user.ID.String()[:8], user.ID)
	projID := uuid.New()
	_, _ = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "CapProj", "", "workspace", user.ID,
	)

	// Insert a huge usage record exceeding the cap.
	_, err := pool.Exec(ctx,
		`INSERT INTO ai_usage_records (workspace_id, project_id, user_id, feature, model, prompt_tokens, completion_tokens, usd_cost)
		 VALUES ($1,$2,$3,'chat','test',0,0,$4)`,
		ws.ID, projID, user.ID, defaultMonthlyCapUSD+1.0,
	)
	if err != nil {
		t.Fatalf("insert usage: %v", err)
	}

	stub := NewStubClient([]StubResponse{})
	svc := NewService(pool, &config.Config{Port: "19099"}, stub, authSvc, orgSvc, projectSvc, audit.Nop{}, logger)
	svc.restBase = "http://127.0.0.1:19099"

	p := &platform.Principal{UserID: user.ID, Email: email}
	conv, _ := svc.CreateConversation(ctx, p, projID, "cap test", nil)

	reqBody, _ := json.Marshal(map[string]string{"content": "hello"})
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/ai/conversations/"+conv.ID.String()+"/messages", bytes.NewReader(reqBody))
	req = req.WithContext(platform.WithPrincipal(req.Context(), p))
	req.URL.Path = "/v1/ai/conversations/" + conv.ID.String() + "/messages"

	svc.HandleMessageStream(w, req)

	body, _ := io.ReadAll(w.Body)
	if !strings.Contains(string(body), "spend_cap_exceeded") {
		t.Errorf("expected spend_cap_exceeded error, got:\n%s", string(body))
	}
}

func TestRecordUsage_WrittenAfterModelCall(t *testing.T) {
	pool := testsupport.NewPool(t)

	ctx := context.Background()
	wsID := uuid.New()
	projID := uuid.New()
	userID := uuid.New()

	err := recordUsage(ctx, pool, wsID, projID, userID, "chat", "gpt-4.1-mini", Usage{
		PromptTokens:     100,
		CompletionTokens: 50,
		TotalTokens:      150,
	})
	if err != nil {
		t.Fatalf("recordUsage: %v", err)
	}

	var count int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM ai_usage_records WHERE workspace_id=$1`, wsID).Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 usage record, got %d", count)
	}
}

func TestInternalTokenMintedAndRevoked(t *testing.T) {
	pool := testsupport.NewPool(t)
	ctx := context.Background()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	authSvc, _ := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "test-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		OIDCIssuer:      "http://localhost:9999/nonexistent",
	}, audit.Nop{}, logger)

	userID := uuid.New()
	// Create user via DB.
	_, _ = pool.Exec(ctx,
		`INSERT INTO users (id, email, display_name) VALUES ($1,$2,$3)`,
		userID, fmt.Sprintf("token-test-%s@example.com", userID.String()[:8]), "Token Test",
	)

	convID := uuid.New()

	token, err := authSvc.MintInternalAIToken(ctx, userID, convID, []string{"tools:read"}, nil)
	if err != nil {
		t.Fatalf("mint token: %v", err)
	}
	if !strings.HasPrefix(token, "iai_") {
		t.Errorf("expected iai_ prefix, got %q", token[:8])
	}

	// Verify the token.
	p, err := authSvc.VerifyInternalAIToken(ctx, token)
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if p.UserID != userID {
		t.Errorf("user mismatch: %v vs %v", p.UserID, userID)
	}

	// Revoke.
	if err := authSvc.RevokeInternalAITokens(ctx, convID); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	// Verify now fails.
	_, err = authSvc.VerifyInternalAIToken(ctx, token)
	if err == nil {
		t.Error("expected error after revoke")
	}
}

// ─── Skills package tests ─────────────────────────────────────────────────────

func TestSkillsLoadSkill_RiskAssessment(t *testing.T) {
	body, err := skills.LoadSkill("risk_assesment_skill")
	if err != nil {
		t.Fatalf("LoadSkill: %v", err)
	}
	if len(body) == 0 {
		t.Error("expected non-empty skill body")
	}
	if !strings.Contains(body, "Risk Assessment") {
		t.Errorf("expected skill body to contain 'Risk Assessment', got %d chars", len(body))
	}
}

func TestSkillsLoadSkill_NotFound(t *testing.T) {
	_, err := skills.LoadSkill("nonexistent_skill")
	if err == nil {
		t.Fatal("expected error for nonexistent skill")
	}
	if !strings.Contains(err.Error(), "skills: load") {
		t.Errorf("expected wrapped error with 'skills: load', got: %v", err)
	}
}

// ─── Conversation skill round-trip test ──────────────────────────────────────

func TestCreateConversation_SkillRoundTrip(t *testing.T) {
	pool := testsupport.NewPool(t)
	stub := NewStubClient(nil)
	svc, sd := newTestService(t, pool, stub)

	ctx := context.Background()
	skill := "risk_assesment_skill"
	conv, err := svc.CreateConversation(ctx, sd.Principal, sd.ProjectID, "Skill Chat", &skill)
	if err != nil {
		t.Fatalf("CreateConversation: %v", err)
	}
	if conv.Skill == nil {
		t.Fatal("expected Skill to be set on created conversation")
	}
	if *conv.Skill != skill {
		t.Errorf("skill = %q, want %q", *conv.Skill, skill)
	}

	// Round-trip through getConversation (store-level).
	loaded, err := getConversation(ctx, pool, conv.ID)
	if err != nil {
		t.Fatalf("getConversation: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected conversation to be found")
	}
	if loaded.Skill == nil {
		t.Fatal("expected Skill to be present after reload")
	}
	if *loaded.Skill != skill {
		t.Errorf("reloaded skill = %q, want %q", *loaded.Skill, skill)
	}

	// Round-trip through listConversations.
	convs, err := svc.ListConversations(ctx, sd.Principal, sd.ProjectID)
	if err != nil {
		t.Fatalf("ListConversations: %v", err)
	}
	var found *Conversation
	for _, c := range convs {
		if c.ID == conv.ID {
			found = c
			break
		}
	}
	if found == nil {
		t.Fatal("conversation not found in list")
	}
	if found.Skill == nil || *found.Skill != skill {
		t.Errorf("listed conversation skill = %v, want %q", found.Skill, skill)
	}
}

// ─── ReviewRisks tests ────────────────────────────────────────────────────────

func TestReviewRisks_ReturnsContent(t *testing.T) {
	pool := testsupport.NewPool(t)
	ctx := context.Background()

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	authSvc, _ := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "review-test-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		OIDCIssuer:      "http://localhost:9999/nonexistent",
	}, audit.Nop{}, logger)
	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	email := fmt.Sprintf("review-test-%s@example.com", uuid.New().String()[:8])
	user, _ := authSvc.CreateUser(ctx, email, "Review Test")
	ws, _ := orgSvc.CreateWorkspace(ctx, "reviewws"+user.ID.String()[:8], user.ID)
	projID := uuid.New()
	_, _ = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "Review Proj", "", "workspace", user.ID,
	)

	// Seed a couple of risks.
	_, _ = pool.Exec(ctx,
		`INSERT INTO risks (project_id, seq, title, likelihood, impact_headline, impact_description, mitigation, created_by)
		 VALUES ($1, 1, 'Thermal runaway', 'high', 'Fire', '', '', $2),
		        ($1, 2, 'Short circuit',  'med',  'Data loss', '', '', $2)`,
		projID, user.ID,
	)

	rec := &capturingRecorder{}
	stub := NewStubClient([]StubResponse{
		{Response: &ChatResponse{
			Message: ChatMessage{Role: "assistant", Content: "Risk review: two risks found. Recommendation: proceed with caution."},
			Usage:   Usage{PromptTokens: 50, CompletionTokens: 30, TotalTokens: 80},
		}},
	})

	// Build AI service wired with a real risk service.
	riskSvc := newTestRiskService(pool, projectSvc, logger)
	svc := NewService(pool, &config.Config{Port: "19099"}, stub, authSvc, orgSvc, projectSvc, rec, logger)
	svc.SetRiskService(riskSvc)

	p := &platform.Principal{UserID: user.ID, Email: email}

	review, err := svc.ReviewRisks(ctx, p, projID, nil)
	if err != nil {
		t.Fatalf("ReviewRisks: %v", err)
	}
	if !strings.Contains(review, "two risks") {
		t.Errorf("expected review content, got: %q", review)
	}

	// Verify ai.risk_review audit entry was recorded.
	auditFound := false
	for _, e := range rec.entries {
		if e.Action == "ai.risk_review" && e.ResourceID == projID.String() {
			auditFound = true
		}
	}
	if !auditFound {
		t.Error("expected ai.risk_review audit entry")
	}
}

func TestReviewRisks_NilRisks(t *testing.T) {
	pool := testsupport.NewPool(t)
	stub := NewStubClient(nil)
	svc, sd := newTestService(t, pool, stub)
	// risks is nil by default in newTestService.

	_, err := svc.ReviewRisks(context.Background(), sd.Principal, sd.ProjectID, nil)
	if err == nil {
		t.Fatal("expected error when risk service not wired")
	}
	if !strings.Contains(err.Error(), "unavailable") && !strings.Contains(err.Error(), "not wired") {
		t.Errorf("expected unavailable error, got: %v", err)
	}
}

// newTestRiskService creates a risk.Service for use in AI tests.
func newTestRiskService(pool *pgxpool.Pool, projectSvc *project.Service, log *slog.Logger) *risk.Service {
	iterSvc := iteration.NewService(pool, projectSvc, audit.Nop{}, log)
	return risk.NewService(pool, projectSvc, iterSvc, audit.Nop{}, log)
}

// ensure skills import is used via LoadSkill (already called in tests above)
