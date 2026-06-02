package mcp_test

// tools_new_test.go — tests for the new MCP tools added in the recent commits.
// Pattern mirrors the existing TestToolListSamples / TestToolReadSample in mcp_test.go.
// All tests use an httptest fake REST backend and invoke handlers via srv.DoCallTool.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	mcplib "github.com/mark3labs/mcp-go/mcp"

	labmcp "github.com/colnio/project-management-site/internal/mcp"
)

// fakeNewToolsBackend creates an httptest.Server with canned responses for the
// new endpoints exercised by the tests below. It extends the setup from
// fakeRESTBackend in mcp_test.go but lives here to keep the test data local.
func fakeNewToolsBackend(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	// ── iterations ────────────────────────────────────────────────────────
	mux.HandleFunc("/v1/projects/proj-1/iterations", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			// create_iteration
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":    "iter-new",
				"title": body["title"],
			})
			return
		}
		// list_iterations GET
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]string{
				{"id": "iter-1", "title": "Sprint One"},
			},
		})
	})

	mux.HandleFunc("/v1/iterations/iter-1", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "iter-1", "title": "Sprint One"})
	})

	// ── pages (update_page ETag round-trip) ───────────────────────────────
	const pageETag = `"rev-001"`
	mux.HandleFunc("/v1/pages/pg-2", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			// GET: return ETag header
			w.Header().Set("ETag", pageETag)
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "pg-2", "title": "Doc"})
			return
		}
		if r.Method == http.MethodPut {
			// PUT: echo back the If-Match header so the test can inspect it
			w.Header().Set("X-Received-If-Match", r.Header.Get("If-Match"))
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "pg-2", "status": "updated"})
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	// ── risks ─────────────────────────────────────────────────────────────
	mux.HandleFunc("/v1/projects/proj-1/risks", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]string{
				{"id": "risk-1", "title": "Budget overrun"},
			},
		})
	})

	// ── approval-requests ─────────────────────────────────────────────────
	mux.HandleFunc("/v1/projects/proj-1/approval-requests", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"items": []string{}})
	})

	// ── also serve endpoints reused from fakeRESTBackend ──────────────────
	// (project, samples, experiments — needed if any tool internally fetches them)
	mux.HandleFunc("/v1/projects/proj-1/samples", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"items": []string{}})
	})
	mux.HandleFunc("/v1/projects/proj-1/experiments", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"items": []string{}})
	})
	mux.HandleFunc("/v1/projects/proj-1/artifacts", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"items": []string{}})
	})

	return httptest.NewServer(mux)
}

// ─── Read tool: list_iterations ────────────────────────────────────────────

// TestMCPToolListIterations asserts that the list_iterations tool issues GET
// /v1/projects/{id}/iterations and that the bearer token is forwarded.
func TestMCPToolListIterations(t *testing.T) {
	fake := fakeNewToolsBackend(t)
	defer fake.Close()

	// Wrap with a bearer-recording proxy to verify forwarding.
	var capturedBearer string
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedBearer = r.Header.Get("Authorization")
		// Forward to the real fake backend.
		resp, err := http.DefaultClient.Do(func() *http.Request {
			req, _ := http.NewRequest(r.Method, fake.URL+r.URL.RequestURI(), r.Body)
			for k, v := range r.Header {
				req.Header[k] = v
			}
			return req
		}())
		if err != nil {
			http.Error(w, err.Error(), 502)
			return
		}
		defer resp.Body.Close()
		for k, v := range resp.Header {
			w.Header()[k] = v
		}
		w.WriteHeader(resp.StatusCode)
		buf := make([]byte, 4096)
		for {
			n, err2 := resp.Body.Read(buf)
			if n > 0 {
				_, _ = w.Write(buf[:n])
			}
			if err2 != nil {
				break
			}
		}
	}))
	defer proxy.Close()

	srv := labmcp.NewServer(proxy.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"list_iterations",
		map[string]any{"project_id": "proj-1"},
		"pat_bearer_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}

	text := result.Content[0].(mcplib.TextContent).Text
	if !strings.Contains(text, "Sprint One") {
		t.Errorf("expected iteration title in result, got: %s", text)
	}

	if !strings.Contains(capturedBearer, "pat_bearer_test") {
		t.Errorf("bearer not forwarded: Authorization=%q", capturedBearer)
	}
}

// ─── Write tool: create_iteration ─────────────────────────────────────────

// TestMCPToolCreateIteration asserts that the create_iteration tool issues POST
// /v1/projects/{id}/iterations and that the JSON body carries the title.
func TestMCPToolCreateIteration(t *testing.T) {
	// Use a backend that captures the decoded request body.
	var receivedBody map[string]any
	var receivedMethod string
	var receivedPath string

	captureSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		receivedPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&receivedBody)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "iter-new", "title": receivedBody["title"]})
	}))
	defer captureSrv.Close()

	srv := labmcp.NewServer(captureSrv.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"create_iteration",
		map[string]any{
			"project_id": "proj-1",
			"title":      "Sprint Two",
		},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}

	// Verify method and path.
	if receivedMethod != http.MethodPost {
		t.Errorf("method: want POST, got %s", receivedMethod)
	}
	if receivedPath != "/v1/projects/proj-1/iterations" {
		t.Errorf("path: want /v1/projects/proj-1/iterations, got %s", receivedPath)
	}

	// Verify title is in the body.
	if title, ok := receivedBody["title"]; !ok || title != "Sprint Two" {
		t.Errorf("body[title]: want Sprint Two, got %v (body=%v)", title, receivedBody)
	}
}

// ─── ETag round-trip: update_page ────────────────────────────────────────

// TestMCPToolUpdatePageETag asserts that update_page:
//  1. Issues a GET to /v1/pages/{id} to read the ETag.
//  2. Issues a PUT to /v1/pages/{id} with the captured ETag as If-Match.
func TestMCPToolUpdatePageETag(t *testing.T) {
	const pageID = "pg-2"
	const wantETag = `"rev-001"`

	var calls []struct {
		method  string
		path    string
		ifMatch string
	}

	captureSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls = append(calls, struct {
			method  string
			path    string
			ifMatch string
		}{r.Method, r.URL.Path, r.Header.Get("If-Match")})

		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			w.Header().Set("ETag", wantETag)
			_ = json.NewEncoder(w).Encode(map[string]string{"id": pageID})
			return
		}
		if r.Method == http.MethodPut {
			_ = json.NewEncoder(w).Encode(map[string]string{"id": pageID, "status": "updated"})
			return
		}
		http.Error(w, "unexpected method", http.StatusMethodNotAllowed)
	}))
	defer captureSrv.Close()

	srv := labmcp.NewServer(captureSrv.URL, newTestLogger())

	result, err := srv.DoCallTool(
		context.Background(),
		"update_page",
		map[string]any{
			"page_id": pageID,
			"blocks":  `[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]`,
		},
		"pat_test",
	)
	if err != nil {
		t.Fatalf("DoCallTool error: %v", err)
	}
	if result.IsError {
		t.Fatalf("tool returned error: %+v", result)
	}

	// Must have exactly 2 calls.
	if len(calls) != 2 {
		t.Fatalf("expected 2 calls (GET + PUT), got %d: %+v", len(calls), calls)
	}

	if calls[0].method != http.MethodGet {
		t.Errorf("call 0: want GET, got %s", calls[0].method)
	}
	if calls[0].path != "/v1/pages/"+pageID {
		t.Errorf("call 0 path: want /v1/pages/%s, got %s", pageID, calls[0].path)
	}

	if calls[1].method != http.MethodPut {
		t.Errorf("call 1: want PUT, got %s", calls[1].method)
	}
	if calls[1].path != "/v1/pages/"+pageID {
		t.Errorf("call 1 path: want /v1/pages/%s, got %s", pageID, calls[1].path)
	}
	if calls[1].ifMatch != wantETag {
		t.Errorf("PUT If-Match: want %q, got %q", wantETag, calls[1].ifMatch)
	}
}

// ─── Registration guard ───────────────────────────────────────────────────

// TestMCPNewToolsRegistered asserts that the new tools introduced in the
// recent commits are actually registered in the MCP server. It uses
// DoCallTool with a deliberately missing required argument so we can
// distinguish "tool not registered" (returns an error) from "tool found but
// validation failed" (returns IsError=true with a message).
func TestMCPNewToolsRegistered(t *testing.T) {
	fake := fakeNewToolsBackend(t)
	defer fake.Close()

	srv := labmcp.NewServer(fake.URL, newTestLogger())

	// Tools that must be registered. We call them with a missing required arg
	// so the handler returns an IsError result (tool found, validation inside
	// handler). If the tool is not registered at all, DoCallTool returns a Go
	// error, which is a test failure.
	newTools := []struct {
		name string
		args map[string]any
	}{
		{"list_iterations", map[string]any{}},          // missing project_id → IsError
		{"read_iteration", map[string]any{}},           // missing iteration_id → IsError
		{"list_iteration_samples", map[string]any{}},   // missing iteration_id → IsError
		{"list_risks", map[string]any{}},               // missing project_id → IsError
		{"list_iteration_risks", map[string]any{}},     // missing iteration_id → IsError
		{"list_pages", map[string]any{}},               // missing project_id → IsError
		{"list_events", map[string]any{}},              // missing project_id → IsError
		{"list_approvals", map[string]any{}},           // missing project_id → IsError
		{"list_experiment_tags", map[string]any{}},     // missing project_id → IsError
		{"list_sample_tags", map[string]any{}},         // missing project_id → IsError
		{"create_iteration", map[string]any{}},         // missing project_id → IsError
		{"update_iteration", map[string]any{}},         // missing iteration_id → IsError
		{"link_iteration_sample", map[string]any{}},    // missing both → IsError
		{"unlink_iteration_sample", map[string]any{}},  // missing both → IsError
		{"create_experiment", map[string]any{}},        // missing project_id → IsError
		{"update_experiment", map[string]any{}},        // missing experiment_id → IsError
		{"link_experiment_sample", map[string]any{}},   // missing both → IsError
		{"unlink_experiment_sample", map[string]any{}}, // missing both → IsError
		{"create_sample", map[string]any{}},            // missing both → IsError
		{"update_sample", map[string]any{}},            // missing sample_id → IsError
		{"add_sample_relation", map[string]any{}},      // missing both → IsError
		{"create_risk", map[string]any{}},              // missing both → IsError
		{"update_risk", map[string]any{}},              // missing risk_id → IsError
		{"create_approval_request", map[string]any{}},  // missing both → IsError
		{"update_page", map[string]any{}},              // missing page_id → IsError
	}

	for _, tc := range newTools {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			// A Go-level error means the tool is NOT registered.
			_, err := srv.DoCallTool(context.Background(), tc.name, tc.args, "pat_test")
			if err != nil {
				t.Errorf("tool %q not registered (DoCallTool returned Go error: %v)", tc.name, err)
			}
			// IsError=true is acceptable — it means the handler ran but rejected
			// the (intentionally incomplete) args.
		})
	}
}
