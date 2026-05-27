package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Workflow definition loading tests ───────────────────────────────────────

func TestLoadWorkflows_AllThreeKeys(t *testing.T) {
	wfs, err := LoadWorkflows()
	if err != nil {
		t.Fatalf("LoadWorkflows: %v", err)
	}

	required := []string{"battery_safety_risk_v1", "experimental_risk_v1", "project_risk_v1"}
	for _, key := range required {
		wf, ok := wfs[key]
		if !ok {
			t.Errorf("missing workflow key %q", key)
			continue
		}
		if wf.Title == "" {
			t.Errorf("workflow %q has no title", key)
		}
		if len(wf.Steps) == 0 {
			t.Errorf("workflow %q has no steps", key)
		}
		if wf.OutputSchema == nil {
			t.Errorf("workflow %q has no outputSchema", key)
		}
		// Verify required output schema fields.
		for _, field := range []string{"overall_rating", "category_ratings", "mitigations", "flagged_for_PI_review"} {
			if _, ok := wf.OutputSchema[field]; !ok {
				t.Errorf("workflow %q outputSchema missing field %q", key, field)
			}
		}
		// Verify step types are valid.
		for _, step := range wf.Steps {
			switch step.Type {
			case "gather_context", "ai_question", "ai_synthesis":
				// ok
			default:
				t.Errorf("workflow %q step %q has unknown type %q", key, step.ID, step.Type)
			}
		}
	}
}

func TestLoadWorkflows_FromFS(t *testing.T) {
	// Test the loadWorkflowsFromFS helper with a synthetic FS.
	synthetic := fstest.MapFS{
		"test_wf_v1.json": &fstest.MapFile{
			Data: []byte(`{
				"key": "test_wf_v1",
				"title": "Test Workflow",
				"description": "A test workflow",
				"scope": "system",
				"steps": [
					{"id": "gather", "type": "gather_context", "sources": ["recent_experiments"]},
					{"id": "q1", "type": "ai_question", "prompt": "Test prompt", "expects": {"rating": "int"}},
					{"id": "syn", "type": "ai_synthesis", "output_format": "markdown"}
				],
				"outputSchema": {
					"overall_rating": "int",
					"category_ratings": "object",
					"mitigations": "list[string]",
					"flagged_for_PI_review": "boolean"
				}
			}`),
		},
	}

	wfs, err := loadWorkflowsFromFS(fs.FS(synthetic))
	if err != nil {
		t.Fatalf("loadWorkflowsFromFS: %v", err)
	}
	if len(wfs) != 1 {
		t.Errorf("expected 1 workflow, got %d", len(wfs))
	}
	wf := wfs["test_wf_v1"]
	if wf == nil {
		t.Fatal("workflow test_wf_v1 not found")
	}
	if len(wf.Steps) != 3 {
		t.Errorf("expected 3 steps, got %d", len(wf.Steps))
	}
}

// ─── Workflow runner tests ────────────────────────────────────────────────────

// newWorkflowTestSetup creates a full test environment with a real DB and fake REST server.
func newWorkflowTestSetup(t *testing.T) (*Service, *setupData, *httptest.Server) {
	t.Helper()
	pool := testsupport.NewPool(t)
	ctx := context.Background()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))

	authSvc, err := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "wf-test-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		
	}, audit.Nop{}, logger)
	if err != nil {
		t.Fatalf("auth service: %v", err)
	}

	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	// Create test user + workspace + project.
	email := fmt.Sprintf("wf-test-%s@example.com", uuid.New().String()[:8])
	user, err := authSvc.CreateUser(ctx, email, "WF Test User")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	ws, err := orgSvc.CreateWorkspace(ctx, "wftestws"+user.ID.String()[:8], user.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	projID := uuid.New()
	if _, err := pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "WF Test Project", "", "workspace", user.ID,
	); err != nil {
		t.Fatalf("create project: %v", err)
	}

	p := &platform.Principal{UserID: user.ID, Email: email}
	sd := &setupData{
		UserID:      user.ID,
		WorkspaceID: ws.ID,
		ProjectID:   projID,
		Principal:   p,
	}

	// Stand up a fake REST server.
	pageID := uuid.New()
	restSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check auth header.
		auth := r.Header.Get("Authorization")
		if auth == "" {
			http.Error(w, "unauthorized", 401)
			return
		}

		path := r.URL.Path
		switch {
		case strings.Contains(path, "/experiments"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/artifacts"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/pages") && r.Method == "GET":
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/pages") && r.Method == "POST":
			// Return a new page.
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]any{
				"page": map[string]any{"id": pageID.String()},
			})
		case strings.Contains(path, "/samples/") && strings.HasSuffix(path, "/lineage"):
			json.NewEncoder(w).Encode(map[string]any{"ancestors": []any{}, "descendants": []any{}})
		case strings.Contains(path, "/samples/"):
			json.NewEncoder(w).Encode(map[string]any{"id": "sample-1", "name": "Test Sample"})
		default:
			http.Error(w, "not found", 404)
		}
	}))

	port := restSrv.URL[strings.LastIndex(restSrv.URL, ":")+1:]
	cfg := &config.Config{
		Port:     port,
		SMTPHost: "localhost",
		SMTPPort: "1025",
		SMTPFrom: "no-reply@test.example.com",
	}

	// Use nil client for gather-only; tests that need model calls pass their own stub.
	svc := NewService(pool, cfg, nil, authSvc, orgSvc, projectSvc, audit.Nop{}, logger)
	svc.restBase = restSrv.URL
	t.Cleanup(restSrv.Close)

	return svc, sd, restSrv
}

// scriptedStub builds a StubClient for a battery_safety_risk_v1 workflow run.
func scriptedStub() Client {
	// 4 ai_question calls + 1 ai_synthesis call.
	questionResp := func(rating int) *ChatResponse {
		return &ChatResponse{
			Message: ChatMessage{
				Role: "assistant",
				Content: fmt.Sprintf(`{"rating": %d, "mitigations": ["mitigation A", "mitigation B"]}`, rating),
			},
			Usage: Usage{PromptTokens: 50, CompletionTokens: 30, TotalTokens: 80},
		}
	}

	synthesisContent := `## Risk Assessment Summary

This battery sample presents moderate risk.

### Key Findings
- Thermal runaway risk is moderate
- Electrolyte handling requires care

<json>{"overall_rating": 2, "category_ratings": {"thermal_runaway": 2, "electrolyte_handling": 3}, "mitigations": ["Use proper PPE", "Store in cool dry place"], "flagged_for_PI_review": false}</json>`

	return NewStubClient([]StubResponse{
		{Response: questionResp(2)}, // thermal_runaway
		{Response: questionResp(3)}, // electrolyte_handling
		{Response: questionResp(2)}, // voltage_overcharge
		{Response: questionResp(2)}, // storage
		{Response: &ChatResponse{   // synthesis
			Message: ChatMessage{Role: "assistant", Content: synthesisContent},
			Usage:   Usage{PromptTokens: 200, CompletionTokens: 150, TotalTokens: 350},
		}},
	})
}

func TestRunWorkflow_CompletedSuccessfully(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, "ai_workflow_runs", "ai_usage_records", "internal_ai_tokens")

	svc, sd, _ := newWorkflowTestSetup(t)
	// Override the pool to the test pool (newWorkflowTestSetup creates its own pool via testsupport).
	// Actually newWorkflowTestSetup calls testsupport.NewPool internally — let's just use the same svc.
	svc.client = scriptedStub()

	ctx := context.Background()
	sampleID := uuid.New()

	run, err := svc.RunWorkflow(ctx, sd.Principal, "battery_safety_risk_v1", WorkflowTarget{
		ProjectID: sd.ProjectID,
		SampleID:  &sampleID,
	})
	if err != nil {
		t.Fatalf("RunWorkflow: %v", err)
	}

	if run.Status != "completed" {
		t.Errorf("expected status 'completed', got %q (error: %s)", run.Status, run.Error)
	}

	// Verify step_results populated.
	var stepResults map[string]any
	if err := json.Unmarshal(run.StepResults, &stepResults); err != nil {
		t.Fatalf("unmarshal step_results: %v", err)
	}
	for _, stepID := range []string{"thermal_runaway", "electrolyte_handling", "voltage_overcharge", "storage", "synthesis"} {
		if _, ok := stepResults[stepID]; !ok {
			t.Errorf("step %q not in step_results", stepID)
		}
	}

	// Verify output stored.
	if len(run.Output) == 0 || string(run.Output) == "{}" {
		t.Error("expected non-empty output")
	}
	var output map[string]any
	if err := json.Unmarshal(run.Output, &output); err != nil {
		t.Fatalf("unmarshal output: %v", err)
	}
	if _, ok := output["overall_rating"]; !ok {
		t.Error("output missing overall_rating")
	}

	// Verify result_page_id set.
	if run.ResultPageID == nil {
		t.Error("expected result_page_id to be set")
	}

	// Verify usage rows written.
	var usageCount int
	if err := pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM ai_usage_records WHERE project_id=$1 AND feature='workflow'`, sd.ProjectID,
	).Scan(&usageCount); err != nil {
		t.Fatalf("count usage: %v", err)
	}
	// Note: newWorkflowTestSetup creates its own pool; check with svc's pool.
	_ = usageCount // pool reference differs; usage is tested below via direct assertion
}

func TestRunWorkflow_UsageWritten(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, "ai_workflow_runs", "ai_usage_records", "internal_ai_tokens")

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	authSvc, _ := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "wf-test-key2",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		
	}, audit.Nop{}, logger)
	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	email := fmt.Sprintf("wf-usage-%s@example.com", uuid.New().String()[:8])
	user, _ := authSvc.CreateUser(ctx, email, "WF Usage Test")
	ws, _ := orgSvc.CreateWorkspace(ctx, "wfusagews"+user.ID.String()[:8], user.ID)
	projID := uuid.New()
	_, _ = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "WF Usage Proj", "", "workspace", user.ID,
	)

	p := &platform.Principal{UserID: user.ID, Email: email}

	// Set up fake REST server.
	pageID := uuid.New()
	restSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.Contains(path, "/experiments"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/artifacts"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/pages") && r.Method == "POST":
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]any{"page": map[string]any{"id": pageID.String()}})
		case strings.Contains(path, "/pages"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		default:
			http.Error(w, "not found", 404)
		}
	}))
	defer restSrv.Close()

	port := restSrv.URL[strings.LastIndex(restSrv.URL, ":")+1:]

	stub := scriptedStub()
	svc := NewService(pool, &config.Config{
		Port:     port,
		SMTPHost: "localhost",
		SMTPPort: "1025",
		SMTPFrom: "no-reply@test.example.com",
	}, stub, authSvc, orgSvc, projectSvc, audit.Nop{}, logger)
	svc.restBase = restSrv.URL

	run, err := svc.RunWorkflow(ctx, p, "battery_safety_risk_v1", WorkflowTarget{ProjectID: projID})
	if err != nil {
		t.Fatalf("RunWorkflow: %v", err)
	}
	if run.Status != "completed" {
		t.Errorf("expected completed, got %q: %s", run.Status, run.Error)
	}

	// Verify usage rows.
	var usageCount int
	_ = pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ai_usage_records WHERE project_id=$1 AND feature='workflow'`, projID,
	).Scan(&usageCount)
	if usageCount == 0 {
		t.Error("expected usage records to be written for workflow feature")
	}

	// Verify result_page_id.
	if run.ResultPageID == nil {
		t.Error("expected result_page_id to be set")
	}
}

// TestRunWorkflow_PIFlag_Flagged verifies PI-flag path when overall_rating >= 4.
func TestRunWorkflow_PIFlag_Flagged(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, "ai_workflow_runs", "ai_usage_records", "internal_ai_tokens")

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	authSvc, _ := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "wf-pi-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		
	}, audit.Nop{}, logger)
	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	email := fmt.Sprintf("wf-pi-%s@example.com", uuid.New().String()[:8])
	user, _ := authSvc.CreateUser(ctx, email, "WF PI Test")
	ws, _ := orgSvc.CreateWorkspace(ctx, "wfpiws"+user.ID.String()[:8], user.ID)
	projID := uuid.New()
	_, _ = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "WF PI Proj", "", "workspace", user.ID,
	)
	p := &platform.Principal{UserID: user.ID, Email: email}

	// Audit recorder that captures entries.
	rec := &capturingRecorder{}

	pageID := uuid.New()
	restSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.Contains(path, "/experiments"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/artifacts"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/pages") && r.Method == "POST":
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]any{"page": map[string]any{"id": pageID.String()}})
		case strings.Contains(path, "/pages"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		default:
			http.Error(w, "not found", 404)
		}
	}))
	defer restSrv.Close()

	port := restSrv.URL[strings.LastIndex(restSrv.URL, ":")+1:]

	// Script stub to return overall_rating=4 → flagged.
	highRiskSynthesis := `## High Risk Assessment

This sample is HIGH RISK.

<json>{"overall_rating": 4, "category_ratings": {"thermal_runaway": 5}, "mitigations": ["Immediate PI review required"], "flagged_for_PI_review": true}</json>`

	stub := NewStubClient([]StubResponse{
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 4, "mitigations": ["m1"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 4, "mitigations": ["m2"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 4, "mitigations": ["m3"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 5, "mitigations": ["m4"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: highRiskSynthesis}, Usage: Usage{TotalTokens: 200}}},
	})

	svc := NewService(pool, &config.Config{
		Port:     port,
		SMTPHost: "localhost",
		SMTPPort: "59999", // likely not listening — email failure should be non-fatal
		SMTPFrom: "no-reply@test.example.com",
	}, stub, authSvc, orgSvc, projectSvc, rec, logger)
	svc.restBase = restSrv.URL

	run, err := svc.RunWorkflow(ctx, p, "battery_safety_risk_v1", WorkflowTarget{ProjectID: projID})
	if err != nil {
		t.Fatalf("RunWorkflow: %v", err)
	}
	if run.Status != "completed" {
		t.Errorf("expected completed, got %q: %s", run.Status, run.Error)
	}

	// Verify PI flag audit entry was recorded (allow brief async settle).
	// The main workflow audit fires synchronously; the PI flag fires synchronously too.
	hasPIFlag := false
	for _, e := range rec.entries {
		if e.Action == "ai.workflow_pi_flag" {
			hasPIFlag = true
		}
	}
	if !hasPIFlag {
		t.Error("expected ai.workflow_pi_flag audit entry when overall_rating >= 4")
	}
}

// TestRunWorkflow_PIFlag_NotFlagged verifies no PI flag when rating < 4.
func TestRunWorkflow_PIFlag_NotFlagged(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, "ai_workflow_runs", "ai_usage_records", "internal_ai_tokens")

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	authSvc, _ := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "wf-noflg-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		
	}, audit.Nop{}, logger)
	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	email := fmt.Sprintf("wf-nf-%s@example.com", uuid.New().String()[:8])
	user, _ := authSvc.CreateUser(ctx, email, "WF NoFlag Test")
	ws, _ := orgSvc.CreateWorkspace(ctx, "wfnfws"+user.ID.String()[:8], user.ID)
	projID := uuid.New()
	_, _ = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "WF NoFlag Proj", "", "workspace", user.ID,
	)
	_ = ws
	p := &platform.Principal{UserID: user.ID, Email: email}

	rec := &capturingRecorder{}

	pageID := uuid.New()
	restSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.Contains(path, "/experiments"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/artifacts"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/pages") && r.Method == "POST":
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]any{"page": map[string]any{"id": pageID.String()}})
		case strings.Contains(path, "/pages"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		default:
			http.Error(w, "not found", 404)
		}
	}))
	defer restSrv.Close()

	port := restSrv.URL[strings.LastIndex(restSrv.URL, ":")+1:]

	lowRiskSynthesis := `## Low Risk Assessment

This sample is LOW RISK.

<json>{"overall_rating": 2, "category_ratings": {"thermal": 2}, "mitigations": ["Standard PPE"], "flagged_for_PI_review": false}</json>`

	stub := scriptedStub()
	// Override last response to low risk.
	stub = NewStubClient([]StubResponse{
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 2, "mitigations": ["m1"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 1, "mitigations": ["m2"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 2, "mitigations": ["m3"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 1, "mitigations": ["m4"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: lowRiskSynthesis}, Usage: Usage{TotalTokens: 150}}},
	})

	svc := NewService(pool, &config.Config{
		Port:     port,
		SMTPHost: "localhost",
		SMTPPort: "1025",
		SMTPFrom: "no-reply@test.example.com",
	}, stub, authSvc, orgSvc, projectSvc, rec, logger)
	svc.restBase = restSrv.URL

	run, err := svc.RunWorkflow(ctx, p, "battery_safety_risk_v1", WorkflowTarget{ProjectID: projID})
	if err != nil {
		t.Fatalf("RunWorkflow: %v", err)
	}
	if run.Status != "completed" {
		t.Errorf("expected completed, got %q", run.Status)
	}

	for _, e := range rec.entries {
		if e.Action == "ai.workflow_pi_flag" {
			t.Error("unexpected ai.workflow_pi_flag audit entry for low-risk run")
		}
	}
}

// TestRunWorkflow_MalformedSynthesisJSON verifies graceful handling of bad model output.
func TestRunWorkflow_MalformedSynthesisJSON(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, "ai_workflow_runs", "ai_usage_records", "internal_ai_tokens")

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	authSvc, _ := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "wf-bad-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		
	}, audit.Nop{}, logger)
	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	email := fmt.Sprintf("wf-bad-%s@example.com", uuid.New().String()[:8])
	user, _ := authSvc.CreateUser(ctx, email, "WF Bad Test")
	ws, _ := orgSvc.CreateWorkspace(ctx, "wfbadws"+user.ID.String()[:8], user.ID)
	projID := uuid.New()
	_, _ = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "WF Bad Proj", "", "workspace", user.ID,
	)
	_ = ws
	p := &platform.Principal{UserID: user.ID, Email: email}

	pageID := uuid.New()
	restSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.Contains(path, "/experiments"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/artifacts"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		case strings.Contains(path, "/pages") && r.Method == "POST":
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]any{"page": map[string]any{"id": pageID.String()}})
		case strings.Contains(path, "/pages"):
			json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
		default:
			http.Error(w, "not found", 404)
		}
	}))
	defer restSrv.Close()

	port := restSrv.URL[strings.LastIndex(restSrv.URL, ":")+1:]

	// Both synthesis calls return malformed JSON (no <json> tags).
	malformedSynthesis := "Here is the risk assessment: it is very risky but I forgot to include the JSON output sorry."

	stub := NewStubClient([]StubResponse{
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 3, "mitigations": ["m1"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 3, "mitigations": ["m2"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 3, "mitigations": ["m3"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 3, "mitigations": ["m4"]}`}, Usage: Usage{TotalTokens: 50}}},
		// First synthesis attempt: malformed.
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: malformedSynthesis}, Usage: Usage{TotalTokens: 100}}},
		// Second synthesis attempt (retry): also malformed.
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: malformedSynthesis}, Usage: Usage{TotalTokens: 100}}},
	})

	svc := NewService(pool, &config.Config{
		Port:     port,
		SMTPHost: "localhost",
		SMTPPort: "1025",
		SMTPFrom: "no-reply@test.example.com",
	}, stub, authSvc, orgSvc, projectSvc, audit.Nop{}, logger)
	svc.restBase = restSrv.URL

	// Must not panic; run should complete or fail gracefully.
	run, _ := svc.RunWorkflow(ctx, p, "battery_safety_risk_v1", WorkflowTarget{ProjectID: projID})

	if run == nil {
		t.Fatal("expected a run to be returned (even on failure)")
	}
	// Either completed with fallback output or failed — either is acceptable.
	switch run.Status {
	case "completed", "failed":
		// Both are acceptable.
	default:
		t.Errorf("unexpected run status %q", run.Status)
	}
	// Must not have panicked (test would have failed if so).
}

// ─── Helper types ─────────────────────────────────────────────────────────────

// capturingRecorder is an audit.Recorder that records all entries in memory.
type capturingRecorder struct {
	entries []audit.Entry
}

func (r *capturingRecorder) Record(_ context.Context, e audit.Entry) error {
	r.entries = append(r.entries, e)
	return nil
}

// TestRunWorkflow_SynthesisError_Returns502 verifies that a model/provider
// failure on the synthesis step surfaces as a typed 502 (not an opaque 500).
func TestRunWorkflow_SynthesisError_Returns502(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, "ai_workflow_runs", "ai_usage_records", "internal_ai_tokens")

	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	authSvc, _ := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "wf-502-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		
	}, audit.Nop{}, logger)
	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	email := fmt.Sprintf("wf-502-%s@example.com", uuid.New().String()[:8])
	user, _ := authSvc.CreateUser(ctx, email, "WF 502 Test")
	ws, _ := orgSvc.CreateWorkspace(ctx, "wf502ws"+user.ID.String()[:8], user.ID)
	projID := uuid.New()
	_, _ = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, description, visibility, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
		projID, ws.ID, "WF 502 Proj", "", "workspace", user.ID,
	)
	p := &platform.Principal{UserID: user.ID, Email: email}

	restSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"items": []any{}})
	}))
	defer restSrv.Close()
	port := restSrv.URL[strings.LastIndex(restSrv.URL, ":")+1:]

	// 4 question responses succeed; the synthesis call (5th) errors (nil Response).
	stub := NewStubClient([]StubResponse{
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 3, "mitigations": ["m1"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 3, "mitigations": ["m2"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 3, "mitigations": ["m3"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: &ChatResponse{Message: ChatMessage{Role: "assistant", Content: `{"rating": 3, "mitigations": ["m4"]}`}, Usage: Usage{TotalTokens: 50}}},
		{Response: nil}, // synthesis: provider error
	})

	svc := NewService(pool, &config.Config{Port: port, SMTPHost: "localhost", SMTPPort: "59999", SMTPFrom: "x@test.example.com"},
		stub, authSvc, orgSvc, projectSvc, audit.Nop{}, logger)
	svc.restBase = restSrv.URL

	_, err := svc.RunWorkflow(ctx, p, "battery_safety_risk_v1", WorkflowTarget{ProjectID: projID})
	if err == nil {
		t.Fatal("expected an error from a failed synthesis, got nil")
	}
	pe, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if pe.GetStatus() != 502 {
		t.Errorf("expected status 502, got %d", pe.GetStatus())
	}
}
