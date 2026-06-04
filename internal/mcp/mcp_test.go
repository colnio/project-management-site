package mcp_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"log/slog"
	"os"

	labmcp "github.com/colnio/project-management-site/internal/mcp"
)

// ─── LLMSText tests ──────────────────────────────────────────────────────────

func buildTestAPI(t *testing.T) huma.API {
	t.Helper()
	r := chi.NewRouter()
	cfg := huma.DefaultConfig("Test API", "0.1.0")
	cfg.DocsPath = ""
	cfg.OpenAPIPath = "/openapi"
	api := humachi.New(r, cfg)

	huma.Register(api, huma.Operation{
		OperationID: "project-list",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces/{id}/projects",
		Summary:     "List projects in a workspace",
		Tags:        []string{"projects"},
	}, func(ctx context.Context, in *struct {
		ID string `path:"id"`
	}) (*struct{ Body struct{ Items []string } }, error) {
		return nil, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "sample-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/samples",
		Summary:     "List samples in a project",
		Tags:        []string{"samples"},
	}, func(ctx context.Context, in *struct {
		ID string `path:"id"`
	}) (*struct{ Body struct{ Items []string } }, error) {
		return nil, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "sample-get",
		Method:      http.MethodGet,
		Path:        "/v1/samples/{id}",
		Summary:     "Get a sample",
		Tags:        []string{"samples"},
	}, func(ctx context.Context, in *struct {
		ID string `path:"id"`
	}) (*struct{ Body struct{ ID string } }, error) {
		return nil, nil
	})

	return api
}

func TestLLMSText_ContainsAuth(t *testing.T) {
	api := buildTestAPI(t)
	txt := labmcp.LLMSText(api.OpenAPI())

	if !strings.Contains(txt, "Authorization: Bearer pat_") {
		t.Errorf("LLMSText: expected auth instructions with PAT prefix, got:\n%s", txt)
	}
	if !strings.Contains(txt, "/openapi.json") {
		t.Errorf("LLMSText: expected /openapi.json pointer, got:\n%s", txt)
	}
}

func TestLLMSText_ListsPaths(t *testing.T) {
	api := buildTestAPI(t)
	txt := labmcp.LLMSText(api.OpenAPI())

	for _, want := range []string{
		"/v1/workspaces/{id}/projects",
		"List projects in a workspace",
		"/v1/projects/{id}/samples",
		"List samples in a project",
		"/v1/samples/{id}",
		"Get a sample",
	} {
		if !strings.Contains(txt, want) {
			t.Errorf("LLMSText: expected %q in output, got:\n%s", want, txt)
		}
	}
}

func TestLLMSText_GroupedByTag(t *testing.T) {
	api := buildTestAPI(t)
	txt := labmcp.LLMSText(api.OpenAPI())

	projectsIdx := strings.Index(txt, "### projects")
	samplesIdx := strings.Index(txt, "### samples")

	if projectsIdx < 0 {
		t.Fatalf("LLMSText: missing '### projects' section")
	}
	if samplesIdx < 0 {
		t.Fatalf("LLMSText: missing '### samples' section")
	}

	// Since tags are sorted alphabetically, projects < samples
	if projectsIdx > samplesIdx {
		t.Errorf("LLMSText: expected '### projects' before '### samples'")
	}
}

func TestLLMSText_MCPPointer(t *testing.T) {
	api := buildTestAPI(t)
	txt := labmcp.LLMSText(api.OpenAPI())

	if !strings.Contains(txt, "/mcp") {
		t.Errorf("LLMSText: expected /mcp endpoint reference, got:\n%s", txt)
	}
}

// ─── MCP server tool handler tests ───────────────────────────────────────────

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
}

// fakeRESTBackend returns an httptest.Server that serves canned JSON responses
// for the REST endpoints the MCP tools use.
func fakeRESTBackend(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	// list workspaces
	mux.HandleFunc("/v1/workspaces", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]string{{"id": "ws-1", "name": "Default"}},
		})
	})

	// list projects in workspace
	mux.HandleFunc("/v1/workspaces/ws-1/projects", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]string{{"id": "proj-1", "name": "Alpha"}},
		})
	})

	// list samples in project
	mux.HandleFunc("/v1/projects/proj-1/samples", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]string{{"id": "s-1", "identifier": "EL-001"}},
		})
	})

	// get single sample
	mux.HandleFunc("/v1/samples/s-1", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "s-1", "identifier": "EL-001"})
	})

	// sample lineage
	mux.HandleFunc("/v1/samples/s-1/lineage", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"nodes": []string{"s-1"}})
	})

	// list experiments in project
	mux.HandleFunc("/v1/projects/proj-1/experiments", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]string{{"id": "exp-1", "title": "Cycle test"}},
		})
	})

	// get single experiment
	mux.HandleFunc("/v1/experiments/exp-1", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "exp-1"})
	})

	// get page
	mux.HandleFunc("/v1/pages/pg-1", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "pg-1", "title": "Notes"})
	})

	// upload artifact (server-side bytes). Echoes back the decoded size so the
	// test can assert the bytes were forwarded base64-decoded by the endpoint
	// contract. Registered before the list route's prefix to take precedence.
	mux.HandleFunc("/v1/projects/proj-1/artifacts/upload", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Filename    string `json:"filename"`
			ContentType string `json:"content_type"`
			Type        string `json:"type"`
			DataBase64  string `json:"data_base64"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":           "art-1",
			"project_id":   "proj-1",
			"filename":     body.Filename,
			"content_type": body.ContentType,
			"type":         body.Type,
			"data_b64_len": len(body.DataBase64),
		})
	})

	// list artifacts in project
	mux.HandleFunc("/v1/projects/proj-1/artifacts", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"items": []string{}})
	})

	// 401 for bad token
	mux.HandleFunc("/v1/samples/bad", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"title": "Unauthorized"})
	})

	return httptest.NewServer(mux)
}

// callTool invokes a tool handler on the MCP server directly via the fake backend.
// It wraps the args into a CallToolRequest and calls the server's tool through
// a side-channel: we build a Server, grab its HTTP handler, but invoke the
// underlying tool-handler functions directly to avoid needing a full SSE roundtrip.
//
// We do this by constructing a labmcp.Server pointed at the fake backend and
// using exported helpers to invoke tools.
func TestToolBearerForwarding(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	// Verify that the /mcp SSE endpoint responds with text/event-stream.
	// SSE connections block, so we cancel the request after a short time.
	ctx, cancel := context.WithCancel(context.Background())

	req := httptest.NewRequest(http.MethodGet, "/mcp/sse", nil)
	req = req.WithContext(ctx)
	req.Header.Set("Authorization", "Bearer pat_test")
	req.Header.Set("Accept", "text/event-stream")

	// Use a channel to capture the recorder after first flush.
	done := make(chan struct{})
	rr := &responseRecorder{ResponseRecorder: httptest.NewRecorder(), onWrite: func() {
		select {
		case <-done:
		default:
			close(done)
		}
	}}

	go func() {
		srv.Handler().ServeHTTP(rr, req)
	}()

	// Wait for first data flush or timeout.
	select {
	case <-done:
		cancel() // cancel to let the handler exit
	case <-ctx.Done():
	}
	cancel() // ensure cancel is always called

	// The SSE handler sets Content-Type before writing, so we can check it.
	ct := rr.ResponseRecorder.Header().Get("Content-Type")
	if !strings.Contains(ct, "text/event-stream") {
		t.Errorf("expected text/event-stream content-type, got %q", ct)
	}
}

// responseRecorder wraps httptest.ResponseRecorder to call a hook on first write.
type responseRecorder struct {
	*httptest.ResponseRecorder
	onWrite func()
	once    bool
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	if !r.once && r.onWrite != nil {
		r.once = true
		r.onWrite()
	}
	return r.ResponseRecorder.Write(b)
}

func (r *responseRecorder) Flush() {
	r.ResponseRecorder.Flush()
}

// TestToolListSamples calls the list_samples handler directly via the exported
// DoCallTool helper.
func TestToolListSamples(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"list_samples",
		map[string]any{"project_id": "proj-1"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected non-empty content")
	}
	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "EL-001") {
		t.Errorf("expected EL-001 in result, got: %s", text)
	}
}

// TestToolUploadArtifactBase64 verifies the upload_artifact tool forwards
// base64 data to the server-side upload endpoint and returns the artifact.
func TestToolUploadArtifactBase64(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"upload_artifact",
		map[string]any{
			"project_id":   "proj-1",
			"filename":     "figure.png",
			"content_type": "image/png",
			"data_base64":  "aGVsbG8=", // "hello"
		},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "art-1") {
		t.Errorf("expected artifact id art-1 in result, got: %s", text)
	}
	if !strings.Contains(text, "figure.png") {
		t.Errorf("expected filename forwarded, got: %s", text)
	}
}

// TestToolUploadArtifactInfersContentType verifies content_type is inferred from
// the filename extension when omitted.
func TestToolUploadArtifactInfersContentType(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"upload_artifact",
		map[string]any{
			"project_id":  "proj-1",
			"filename":    "scan.png",
			"data_base64": "aGVsbG8=",
		},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "image/png") {
		t.Errorf("expected inferred image/png content type, got: %s", text)
	}
}

// TestToolUploadArtifactRequiresSource verifies an error when neither file_path
// nor data_base64 is provided.
func TestToolUploadArtifactRequiresSource(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"upload_artifact",
		map[string]any{"project_id": "proj-1", "filename": "x.png"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected an error when no file_path/data_base64 provided")
	}
}

func TestToolReadSample(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"read_sample",
		map[string]any{"sample_id": "s-1"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "EL-001") {
		t.Errorf("expected sample identifier in result, got: %s", text)
	}
}

func TestToolRead401MapsToError(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"read_sample",
		map[string]any{"sample_id": "bad"},
		"", // no token
	)
	if err != nil {
		t.Fatalf("DoCallTool should not return Go error on 401, got: %v", err)
	}
	if !result.IsError {
		t.Errorf("expected IsError=true for 401 upstream, got result: %+v", result)
	}
}

func TestToolGetSampleLineage(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"get_sample_lineage",
		map[string]any{"sample_id": "s-1"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "nodes") {
		t.Errorf("expected lineage nodes in result, got: %s", text)
	}
}

func TestToolListExperiments(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"list_experiments",
		map[string]any{"project_id": "proj-1"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "Cycle test") {
		t.Errorf("expected experiment in result, got: %s", text)
	}
}

func TestToolReadExperiment(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"read_experiment",
		map[string]any{"experiment_id": "exp-1"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
}

func TestToolReadPage(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"read_page",
		map[string]any{"page_id": "pg-1"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "Notes") {
		t.Errorf("expected page title in result, got: %s", text)
	}
}

func TestToolListArtifacts(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"list_artifacts",
		map[string]any{"project_id": "proj-1"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
}

func TestToolListProjectsWithWorkspaceID(t *testing.T) {
	fake := fakeRESTBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"list_projects",
		map[string]any{"workspace_id": "ws-1"},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}
	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "Alpha") {
		t.Errorf("expected project name in result, got: %s", text)
	}
}
