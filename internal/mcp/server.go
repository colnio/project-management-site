package mcp

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// bearerKey is the context key used to propagate the caller's PAT through to
// tool handlers. The SSEContextFunc extracts the bearer from the HTTP request
// headers and stores it here; each tool handler reads it to forward to the
// REST backend.
type bearerKey struct{}

// bearerFromCtx returns the PAT bearer token stored in ctx, or "".
func bearerFromCtx(ctx context.Context) string {
	if v, ok := ctx.Value(bearerKey{}).(string); ok {
		return v
	}
	return ""
}

// Server is the MCP server that wraps the platform REST API.
type Server struct {
	restBase   string // e.g. "http://127.0.0.1:8080"
	log        *slog.Logger
	mcp        *mcpserver.MCPServer
	sse        *mcpserver.SSEServer
	httpClient *http.Client
}

// NewServer constructs the MCP server. restBaseURL must be the full base URL
// of the local REST API (e.g. "http://127.0.0.1:8080"). The SSE context
// function extracts the Authorization header from each incoming HTTP request
// and stores the bearer token in the context so tool handlers can forward it.
func NewServer(restBaseURL string, log *slog.Logger) *Server {
	s := &Server{
		restBase:   strings.TrimSuffix(restBaseURL, "/"),
		log:        log,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}

	s.mcp = mcpserver.NewMCPServer(
		"lab-platform-mcp",
		"1.0.0",
	)

	// Register all tools (read + write).
	s.registerTools()

	// Build the SSE server. The context function runs on each new HTTP request
	// to the /mcp endpoint and injects the caller's bearer into the context.
	s.sse = mcpserver.NewSSEServer(
		s.mcp,
		mcpserver.WithBaseURL(restBaseURL),
		mcpserver.WithStaticBasePath("/mcp"),
		mcpserver.WithSSEContextFunc(func(ctx context.Context, r *http.Request) context.Context {
			auth := r.Header.Get("Authorization")
			token := ""
			const pfx = "Bearer "
			if len(auth) > len(pfx) && strings.EqualFold(auth[:len(pfx)], pfx) {
				token = strings.TrimSpace(auth[len(pfx):])
			}
			return context.WithValue(ctx, bearerKey{}, token)
		}),
	)

	return s
}

// Handler returns an http.Handler that implements the MCP-over-SSE transport.
// Mount it at "/mcp" in the chi router:
//
//	srv.Router.Mount("/mcp", mcpServer.Handler())
func (s *Server) Handler() http.Handler {
	return s.sse
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

// do performs an HTTP request to the REST backend, forwarding the caller's
// bearer. If body is non-nil it is marshalled to JSON and sent with
// Content-Type: application/json. On non-2xx status it returns a descriptive
// error.
func (s *Server) do(ctx context.Context, method, path string, body any) ([]byte, error) {
	_, b, err := s.doWithHeaders(ctx, method, path, body, nil)
	return b, err
}

// doWithHeaders is the low-level transport. extraHeaders are added to the
// outbound request (e.g. "If-Match"). It returns the response headers and body
// so callers that need response headers (like update_page needing the ETag) can
// inspect them.
func (s *Server) doWithHeaders(ctx context.Context, method, path string, body any, extraHeaders map[string]string) (http.Header, []byte, error) {
	url := s.restBase + path

	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, nil, fmt.Errorf("mcp: marshal body: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, nil, fmt.Errorf("mcp: build request: %w", err)
	}
	if tok := bearerFromCtx(ctx); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("mcp: http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("mcp: read body: %w", err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, nil, fmt.Errorf("mcp: 401 Unauthorized — provide a valid PAT via Authorization: Bearer pat_...")
	}
	if resp.StatusCode == http.StatusForbidden {
		return nil, nil, fmt.Errorf("mcp: 403 Forbidden — PAT lacks required scope for this resource")
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil, fmt.Errorf("mcp: 404 Not Found — %s", url)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("mcp: upstream returned %d: %s", resp.StatusCode, string(respBody))
	}

	return resp.Header, respBody, nil
}

// get is a convenience wrapper for GET requests.
func (s *Server) get(ctx context.Context, path string) ([]byte, error) {
	return s.do(ctx, http.MethodGet, path, nil)
}

// toolText is a convenience for returning a successful text result.
func toolText(b []byte) *mcplib.CallToolResult {
	return mcplib.NewToolResultText(string(b))
}

// toolErr maps an error from the REST layer to a CallToolResult with IsError set.
func toolErr(err error) *mcplib.CallToolResult {
	return mcplib.NewToolResultError(err.Error())
}

// stringArg extracts a string argument from a tool request, returning "" if absent.
func stringArg(req mcplib.CallToolRequest, key string) string {
	if v, ok := req.GetArguments()[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// boolArg extracts a boolean argument from a tool request, returning false if absent.
func boolArg(req mcplib.CallToolRequest, key string) bool {
	if v, ok := req.GetArguments()[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

// ─── Test helper ─────────────────────────────────────────────────────────────

// DoCallTool is a test helper that invokes a named tool handler directly,
// bypassing the SSE transport. The bearer token is injected into the context
// so that the handler's outgoing HTTP call to the REST backend carries it.
// This function is exported for use from _test packages in this package.
func (s *Server) DoCallTool(ctx context.Context, toolName string, args map[string]any, bearer string) (*mcplib.CallToolResult, error) {
	// Inject bearer into context the same way the SSEContextFunc would.
	if bearer != "" {
		ctx = context.WithValue(ctx, bearerKey{}, bearer)
	}

	// Build a CallToolRequest with the args.
	rawArgs, err := json.Marshal(args)
	if err != nil {
		return nil, fmt.Errorf("mcp: marshal args: %w", err)
	}
	var req mcplib.CallToolRequest
	req.Params.Name = toolName
	if err := json.Unmarshal(rawArgs, &req.Params.Arguments); err != nil {
		return nil, fmt.Errorf("mcp: unmarshal args into request: %w", err)
	}

	// Look up the registered tool handler.
	tools := s.mcp.ListTools()
	if st, ok := tools[toolName]; ok {
		return st.Handler(ctx, req)
	}
	return nil, fmt.Errorf("mcp: tool %q not registered", toolName)
}

// ─── Tool registration ────────────────────────────────────────────────────────

func (s *Server) registerTools() {
	// ── Read tools ──────────────────────────────────────────────────────────
	s.mcp.AddTool(s.toolListProjects())
	s.mcp.AddTool(s.toolSearchProjectContent())
	s.mcp.AddTool(s.toolReadProject())
	s.mcp.AddTool(s.toolListSamples())
	s.mcp.AddTool(s.toolReadSample())
	s.mcp.AddTool(s.toolGetSampleLineage())
	s.mcp.AddTool(s.toolListExperiments())
	s.mcp.AddTool(s.toolReadExperiment())
	s.mcp.AddTool(s.toolListIterations())
	s.mcp.AddTool(s.toolReadIteration())
	s.mcp.AddTool(s.toolListIterationSamples())
	s.mcp.AddTool(s.toolListRisks())
	s.mcp.AddTool(s.toolListIterationRisks())
	s.mcp.AddTool(s.toolListPages())
	s.mcp.AddTool(s.toolReadPage())
	s.mcp.AddTool(s.toolListEvents())
	s.mcp.AddTool(s.toolListApprovals())
	s.mcp.AddTool(s.toolListExperimentTags())
	s.mcp.AddTool(s.toolListSampleTags())
	s.mcp.AddTool(s.toolListArtifacts())
	s.mcp.AddTool(s.toolListTasks())
	s.mcp.AddTool(s.toolReadTask())
	s.mcp.AddTool(s.toolListWikiPages())

	// ── Write tools ──────────────────────────────────────────────────────────
	s.mcp.AddTool(s.toolCreateIteration())
	s.mcp.AddTool(s.toolUpdateIteration())
	s.mcp.AddTool(s.toolDeleteIteration())
	s.mcp.AddTool(s.toolLinkIterationSample())
	s.mcp.AddTool(s.toolUnlinkIterationSample())
	s.mcp.AddTool(s.toolCreateExperiment())
	s.mcp.AddTool(s.toolUpdateExperiment())
	s.mcp.AddTool(s.toolLinkExperimentSample())
	s.mcp.AddTool(s.toolUnlinkExperimentSample())
	s.mcp.AddTool(s.toolCreateSample())
	s.mcp.AddTool(s.toolUpdateSample())
	s.mcp.AddTool(s.toolAddSampleRelation())
	s.mcp.AddTool(s.toolCreateRisk())
	s.mcp.AddTool(s.toolUpdateRisk())
	s.mcp.AddTool(s.toolCreateApprovalRequest())
	s.mcp.AddTool(s.toolCreatePage())
	s.mcp.AddTool(s.toolUpdatePage())
	s.mcp.AddTool(s.toolUploadArtifact())
	s.mcp.AddTool(s.toolCreateTask())
	s.mcp.AddTool(s.toolTakeTask())
	s.mcp.AddTool(s.toolMarkTaskDone())
	s.mcp.AddTool(s.toolCancelTask())
	s.mcp.AddTool(s.toolAddTaskReference())
	s.mcp.AddTool(s.toolCreateWikiPage())
}

// ═══════════════════════════════════════════════════════════════════════════
// READ TOOLS
// ═══════════════════════════════════════════════════════════════════════════

// ─── list_projects ────────────────────────────────────────────────────────────

func (s *Server) toolListProjects() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_projects",
		mcplib.WithDescription("List projects visible to the authenticated user. "+
			"Returns all projects the caller's PAT can access across all workspaces."),
		mcplib.WithString("workspace_id",
			mcplib.Description("Optional workspace UUID to filter results.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		wsID := stringArg(req, "workspace_id")
		var path string
		if wsID != "" {
			path = "/v1/workspaces/" + wsID + "/projects"
		} else {
			// Fetch workspace list first to enumerate projects across all workspaces.
			// We use the /v1/workspaces endpoint that lists workspaces for the user.
			wsBody, err := s.get(ctx, "/v1/workspaces")
			if err != nil {
				return toolErr(err), nil
			}
			// Return the workspace list with a note — this is the best we can do
			// without a cross-workspace project list endpoint.
			var result map[string]json.RawMessage
			if err := json.Unmarshal(wsBody, &result); err == nil {
				if items, ok := result["items"]; ok {
					return mcplib.NewToolResultText(
						"Workspaces (use workspace_id to list projects in a specific one):\n" +
							string(items),
					), nil
				}
			}
			return toolText(wsBody), nil
		}
		body, err := s.get(ctx, path)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── search_project_content ───────────────────────────────────────────────────

func (s *Server) toolSearchProjectContent() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("search_project_content",
		mcplib.WithDescription("Search for samples, experiments, pages, and artifacts within a project "+
			"by keyword. Returns matching items from each resource type."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project to search in."),
			mcplib.Required()),
		mcplib.WithString("query",
			mcplib.Description("Keyword to filter results by (case-insensitive substring match on names and identifiers).")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		query := stringArg(req, "query")

		type result struct {
			Samples     json.RawMessage `json:"samples,omitempty"`
			Experiments json.RawMessage `json:"experiments,omitempty"`
			Artifacts   json.RawMessage `json:"artifacts,omitempty"`
		}

		var res result
		var errs []string

		samplesPath := "/v1/projects/" + projectID + "/samples"
		if query != "" {
			samplesPath += "?q=" + query
		}
		if b, err := s.get(ctx, samplesPath); err == nil {
			res.Samples = b
		} else {
			errs = append(errs, "samples: "+err.Error())
		}

		experimentsPath := "/v1/projects/" + projectID + "/experiments"
		if query != "" {
			experimentsPath += "?q=" + query
		}
		if b, err := s.get(ctx, experimentsPath); err == nil {
			res.Experiments = b
		} else {
			errs = append(errs, "experiments: "+err.Error())
		}

		artifactsPath := "/v1/projects/" + projectID + "/artifacts"
		if query != "" {
			artifactsPath += "?q=" + query
		}
		if b, err := s.get(ctx, artifactsPath); err == nil {
			res.Artifacts = b
		} else {
			errs = append(errs, "artifacts: "+err.Error())
		}

		if len(errs) > 0 && res.Samples == nil && res.Experiments == nil && res.Artifacts == nil {
			return toolErr(fmt.Errorf("all sub-requests failed: %s", strings.Join(errs, "; "))), nil
		}

		out, _ := json.MarshalIndent(res, "", "  ")
		return toolText(out), nil
	}
	return tool, handler
}

// ─── read_project ─────────────────────────────────────────────────────────────

func (s *Server) toolReadProject() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("read_project",
		mcplib.WithDescription("Get a single project by ID. Requires viewer role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "project_id")
		if id == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+id)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_samples ─────────────────────────────────────────────────────────────

func (s *Server) toolListSamples() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_samples",
		mcplib.WithDescription("List samples in a project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/samples")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── read_sample ──────────────────────────────────────────────────────────────

func (s *Server) toolReadSample() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("read_sample",
		mcplib.WithDescription("Get a single sample by ID, including all properties and status."),
		mcplib.WithString("sample_id",
			mcplib.Description("UUID of the sample."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "sample_id")
		if id == "" {
			return toolErr(fmt.Errorf("sample_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/samples/"+id)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── get_sample_lineage ───────────────────────────────────────────────────────

func (s *Server) toolGetSampleLineage() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("get_sample_lineage",
		mcplib.WithDescription("Get the lineage graph for a sample — ancestor/descendant relations."),
		mcplib.WithString("sample_id",
			mcplib.Description("UUID of the sample."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "sample_id")
		if id == "" {
			return toolErr(fmt.Errorf("sample_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/samples/"+id+"/lineage")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_experiments ─────────────────────────────────────────────────────────

func (s *Server) toolListExperiments() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_experiments",
		mcplib.WithDescription("List experiments in a project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/experiments")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── read_experiment ──────────────────────────────────────────────────────────

func (s *Server) toolReadExperiment() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("read_experiment",
		mcplib.WithDescription("Get a single experiment by ID, including linked samples."),
		mcplib.WithString("experiment_id",
			mcplib.Description("UUID of the experiment."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "experiment_id")
		if id == "" {
			return toolErr(fmt.Errorf("experiment_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/experiments/"+id)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_iterations ─────────────────────────────────────────────────────────

func (s *Server) toolListIterations() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_iterations",
		mcplib.WithDescription("List iterations in a project ordered by position. Requires viewer role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/iterations")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── read_iteration ───────────────────────────────────────────────────────────

func (s *Server) toolReadIteration() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("read_iteration",
		mcplib.WithDescription("Get a single iteration by ID. Requires viewer role on the iteration's project."),
		mcplib.WithString("iteration_id",
			mcplib.Description("UUID of the iteration."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "iteration_id")
		if id == "" {
			return toolErr(fmt.Errorf("iteration_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/iterations/"+id)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_iteration_samples ───────────────────────────────────────────────────

func (s *Server) toolListIterationSamples() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_iteration_samples",
		mcplib.WithDescription("List samples linked to an iteration, including their roles and notes. Requires viewer role on the iteration's project."),
		mcplib.WithString("iteration_id",
			mcplib.Description("UUID of the iteration."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "iteration_id")
		if id == "" {
			return toolErr(fmt.Errorf("iteration_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/iterations/"+id+"/samples")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_risks ───────────────────────────────────────────────────────────────

func (s *Server) toolListRisks() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_risks",
		mcplib.WithDescription("List risks in a project ordered by seq. Requires viewer role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/risks")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_iteration_risks ────────────────────────────────────────────────────

func (s *Server) toolListIterationRisks() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_iteration_risks",
		mcplib.WithDescription("List risks scoped to an iteration. Requires viewer role on the iteration's project."),
		mcplib.WithString("iteration_id",
			mcplib.Description("UUID of the iteration."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "iteration_id")
		if id == "" {
			return toolErr(fmt.Errorf("iteration_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/iterations/"+id+"/risks")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_pages ───────────────────────────────────────────────────────────────

func (s *Server) toolListPages() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_pages",
		mcplib.WithDescription("List page summaries for a project, ordered by updated_at descending. Requires viewer role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("parent_type",
			mcplib.Description("Optional filter by parent entity type: project, iteration, sample, or experiment.")),
		mcplib.WithString("parent_id",
			mcplib.Description("Optional filter by parent entity UUID (use together with parent_type).")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		path := "/v1/projects/" + projectID + "/pages"
		params := []string{}
		if pt := stringArg(req, "parent_type"); pt != "" {
			params = append(params, "parent_type="+pt)
		}
		if pi := stringArg(req, "parent_id"); pi != "" {
			params = append(params, "parent_id="+pi)
		}
		if len(params) > 0 {
			path += "?" + strings.Join(params, "&")
		}
		body, err := s.get(ctx, path)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── read_page ────────────────────────────────────────────────────────────────

func (s *Server) toolReadPage() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("read_page",
		mcplib.WithDescription("Get a page (structured document) by ID, including its current content blocks. Also accepts wiki page IDs returned by list_wiki_pages."),
		mcplib.WithString("page_id",
			mcplib.Description("UUID of the page (project page or wiki page)."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "page_id")
		if id == "" {
			return toolErr(fmt.Errorf("page_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/pages/"+id)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_events ──────────────────────────────────────────────────────────────

func (s *Server) toolListEvents() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_events",
		mcplib.WithDescription("List calendar events in a project. Requires viewer role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/events")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_approvals ───────────────────────────────────────────────────────────

func (s *Server) toolListApprovals() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_approvals",
		mcplib.WithDescription("List approval requests for a project, ordered newest-first. Requires viewer role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/approval-requests")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_experiment_tags ─────────────────────────────────────────────────────

func (s *Server) toolListExperimentTags() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_experiment_tags",
		mcplib.WithDescription("List project-defined experiment tag labels. Requires viewer role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/experiment-tags")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_sample_tags ────────────────────────────────────────────────────────

func (s *Server) toolListSampleTags() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_sample_tags",
		mcplib.WithDescription("List project-defined sample tag labels. Requires viewer role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/sample-tags")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── list_artifacts ───────────────────────────────────────────────────────────

func (s *Server) toolListArtifacts() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_artifacts",
		mcplib.WithDescription("List artifacts (uploaded files) in a project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/artifacts")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── upload_artifact ──────────────────────────────────────────────────────────

// toolUploadArtifact uploads a file's bytes server-side and returns the created
// artifact (including its id). Combined with create_page/update_page, this lets
// an agent embed images into pages: upload the image here, then add a block
// {"type":"imageEmbed","props":{"artifactId":"<id>"}} to a page. The image
// renders once the background worker has produced thumbnails.
func (s *Server) toolUploadArtifact() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("upload_artifact",
		mcplib.WithDescription("Upload a file (image, PDF, data file) into a project and return the created artifact, including its id. Provide either file_path (a path readable by the server) or data_base64. To embed an uploaded image into a page, add a block {\"type\":\"imageEmbed\",\"props\":{\"artifactId\":\"<artifact id>\"}} via create_page or update_page (use \"pdfEmbed\" for PDFs). The image renders after background processing. Requires editor role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("file_path",
			mcplib.Description("Absolute path to a local file readable by the server. Provide this OR data_base64.")),
		mcplib.WithString("data_base64",
			mcplib.Description("Standard base64-encoded file bytes. Provide this OR file_path.")),
		mcplib.WithString("filename",
			mcplib.Description("Filename to store. Defaults to the base name of file_path when omitted; required when using data_base64.")),
		mcplib.WithString("content_type",
			mcplib.Description("MIME type (e.g. image/png, application/pdf). Inferred from the filename extension when omitted.")),
		mcplib.WithString("type",
			mcplib.Description("Optional artifact category: image, pdf, ipynb, or other. Inferred when omitted.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}

		filePath := stringArg(req, "file_path")
		dataB64 := stringArg(req, "data_base64")
		if filePath == "" && dataB64 == "" {
			return toolErr(fmt.Errorf("provide either file_path or data_base64")), nil
		}

		filename := stringArg(req, "filename")
		if filePath != "" {
			raw, err := os.ReadFile(filePath)
			if err != nil {
				return toolErr(fmt.Errorf("read file_path: %w", err)), nil
			}
			dataB64 = base64.StdEncoding.EncodeToString(raw)
			if filename == "" {
				filename = filepath.Base(filePath)
			}
		}
		if filename == "" {
			return toolErr(fmt.Errorf("filename is required when using data_base64")), nil
		}

		contentType := stringArg(req, "content_type")
		if contentType == "" {
			contentType = mime.TypeByExtension(filepath.Ext(filename))
		}
		if contentType == "" {
			return toolErr(fmt.Errorf("content_type could not be inferred from filename; provide content_type explicitly")), nil
		}

		payload := map[string]any{
			"filename":     filename,
			"content_type": contentType,
			"data_base64":  dataB64,
		}
		if v := stringArg(req, "type"); v != "" {
			payload["type"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/projects/"+projectID+"/artifacts/upload", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — ITERATIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─── create_iteration ────────────────────────────────────────────────────────

func (s *Server) toolCreateIteration() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("create_iteration",
		mcplib.WithDescription("Create a new iteration (sprint / experimental batch) within a project. Requires editor role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("title",
			mcplib.Description("Title of the iteration (required, non-empty)."),
			mcplib.Required()),
		mcplib.WithString("description",
			mcplib.Description("Optional description.")),
		mcplib.WithString("status",
			mcplib.Description("Optional status: planned, active, done, or blocked.")),
		mcplib.WithString("start_at",
			mcplib.Description("Optional start date/time in RFC 3339 format.")),
		mcplib.WithString("end_at",
			mcplib.Description("Optional end date/time in RFC 3339 format.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		title := stringArg(req, "title")
		if title == "" {
			return toolErr(fmt.Errorf("title is required")), nil
		}

		payload := map[string]any{
			"title": title,
		}
		if v := stringArg(req, "description"); v != "" {
			payload["description"] = v
		}
		if v := stringArg(req, "status"); v != "" {
			payload["status"] = v
		}
		if v := stringArg(req, "start_at"); v != "" {
			payload["start_at"] = v
		}
		if v := stringArg(req, "end_at"); v != "" {
			payload["end_at"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/projects/"+projectID+"/iterations", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── update_iteration ────────────────────────────────────────────────────────

func (s *Server) toolUpdateIteration() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("update_iteration",
		mcplib.WithDescription("Partially update an iteration (title, description, status, dates, position). Requires editor role on the iteration's project."),
		mcplib.WithString("iteration_id",
			mcplib.Description("UUID of the iteration."),
			mcplib.Required()),
		mcplib.WithString("title",
			mcplib.Description("New title.")),
		mcplib.WithString("description",
			mcplib.Description("New description.")),
		mcplib.WithString("status",
			mcplib.Description("New status: planned, active, done, or blocked.")),
		mcplib.WithString("start_at",
			mcplib.Description("New start date/time in RFC 3339 format.")),
		mcplib.WithString("end_at",
			mcplib.Description("New end date/time in RFC 3339 format.")),
		mcplib.WithString("position",
			mcplib.Description("New integer position (as a string, e.g. \"2\").")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "iteration_id")
		if id == "" {
			return toolErr(fmt.Errorf("iteration_id is required")), nil
		}

		payload := map[string]any{}
		if v := stringArg(req, "title"); v != "" {
			payload["title"] = v
		}
		if v := stringArg(req, "description"); v != "" {
			payload["description"] = v
		}
		if v := stringArg(req, "status"); v != "" {
			payload["status"] = v
		}
		if v := stringArg(req, "start_at"); v != "" {
			payload["start_at"] = v
		}
		if v := stringArg(req, "end_at"); v != "" {
			payload["end_at"] = v
		}
		if v := stringArg(req, "position"); v != "" {
			var pos int
			if _, err := fmt.Sscanf(v, "%d", &pos); err == nil {
				payload["position"] = pos
			}
		}

		body, err := s.do(ctx, http.MethodPatch, "/v1/iterations/"+id, payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── delete_iteration ────────────────────────────────────────────────────────

func (s *Server) toolDeleteIteration() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("delete_iteration",
		mcplib.WithDescription("Permanently delete an iteration and its sample associations. Requires editor role on the iteration's project."),
		mcplib.WithString("iteration_id",
			mcplib.Description("UUID of the iteration to delete."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "iteration_id")
		if id == "" {
			return toolErr(fmt.Errorf("iteration_id is required")), nil
		}
		body, err := s.do(ctx, http.MethodDelete, "/v1/iterations/"+id, nil)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── link_iteration_sample ───────────────────────────────────────────────────

func (s *Server) toolLinkIterationSample() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("link_iteration_sample",
		mcplib.WithDescription("Associate an existing sample with an iteration in a given role (input, output, passthrough). Requires editor role on the iteration's project."),
		mcplib.WithString("iteration_id",
			mcplib.Description("UUID of the iteration."),
			mcplib.Required()),
		mcplib.WithString("sample_id",
			mcplib.Description("UUID of the sample to link."),
			mcplib.Required()),
		mcplib.WithString("role",
			mcplib.Description("Optional role: input, output, or passthrough.")),
		mcplib.WithString("note",
			mcplib.Description("Optional free-text note about this association.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		iterID := stringArg(req, "iteration_id")
		if iterID == "" {
			return toolErr(fmt.Errorf("iteration_id is required")), nil
		}
		sampleID := stringArg(req, "sample_id")
		if sampleID == "" {
			return toolErr(fmt.Errorf("sample_id is required")), nil
		}

		payload := map[string]any{
			"sample_id": sampleID,
		}
		if v := stringArg(req, "role"); v != "" {
			payload["role"] = v
		}
		if v := stringArg(req, "note"); v != "" {
			payload["note"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/iterations/"+iterID+"/samples", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── unlink_iteration_sample ─────────────────────────────────────────────────

func (s *Server) toolUnlinkIterationSample() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("unlink_iteration_sample",
		mcplib.WithDescription("Remove the association between a sample and an iteration. Requires editor role on the iteration's project."),
		mcplib.WithString("iteration_id",
			mcplib.Description("UUID of the iteration."),
			mcplib.Required()),
		mcplib.WithString("sample_id",
			mcplib.Description("UUID of the sample to unlink."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		iterID := stringArg(req, "iteration_id")
		if iterID == "" {
			return toolErr(fmt.Errorf("iteration_id is required")), nil
		}
		sampleID := stringArg(req, "sample_id")
		if sampleID == "" {
			return toolErr(fmt.Errorf("sample_id is required")), nil
		}
		body, err := s.do(ctx, http.MethodDelete, "/v1/iterations/"+iterID+"/samples/"+sampleID, nil)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — EXPERIMENTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── create_experiment ───────────────────────────────────────────────────────

func (s *Server) toolCreateExperiment() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("create_experiment",
		mcplib.WithDescription("Create a new experiment run within a project. Requires editor role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("method",
			mcplib.Description("Optional primary method label (e.g. \"EIS\"), max 64 chars.")),
		mcplib.WithString("status",
			mcplib.Description("Optional status: planned, in_progress, completed, or failed.")),
		mcplib.WithString("result_summary",
			mcplib.Description("Optional free-text result summary.")),
		mcplib.WithString("iteration_id",
			mcplib.Description("Optional UUID of an iteration to associate this experiment with.")),
		mcplib.WithString("performed_at",
			mcplib.Description("Optional date/time the experiment was performed (RFC 3339).")),
		mcplib.WithString("parameters",
			mcplib.Description("Optional experiment parameters as a JSON object string.")),
		mcplib.WithString("tags",
			mcplib.Description("Optional comma-separated list of tag labels to apply.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}

		payload := map[string]any{}
		if v := stringArg(req, "method"); v != "" {
			payload["method"] = v
		}
		if v := stringArg(req, "status"); v != "" {
			payload["status"] = v
		}
		if v := stringArg(req, "result_summary"); v != "" {
			payload["result_summary"] = v
		}
		if v := stringArg(req, "iteration_id"); v != "" {
			payload["iteration_id"] = v
		}
		if v := stringArg(req, "performed_at"); v != "" {
			payload["performed_at"] = v
		}
		if v := stringArg(req, "parameters"); v != "" {
			var raw json.RawMessage
			if err := json.Unmarshal([]byte(v), &raw); err != nil {
				return toolErr(fmt.Errorf("parameters must be a valid JSON object: %w", err)), nil
			}
			payload["parameters"] = raw
		}
		if v := stringArg(req, "tags"); v != "" {
			parts := strings.Split(v, ",")
			trimmed := make([]string, 0, len(parts))
			for _, p := range parts {
				if t := strings.TrimSpace(p); t != "" {
					trimmed = append(trimmed, t)
				}
			}
			payload["tags"] = trimmed
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/projects/"+projectID+"/experiments", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── update_experiment ───────────────────────────────────────────────────────

func (s *Server) toolUpdateExperiment() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("update_experiment",
		mcplib.WithDescription("Partially update an experiment (method, parameters, result_summary, status, tags, etc.). Requires editor role on the experiment's project."),
		mcplib.WithString("experiment_id",
			mcplib.Description("UUID of the experiment."),
			mcplib.Required()),
		mcplib.WithString("method",
			mcplib.Description("New method label.")),
		mcplib.WithString("status",
			mcplib.Description("New status: planned, in_progress, completed, or failed.")),
		mcplib.WithString("result_summary",
			mcplib.Description("New result summary.")),
		mcplib.WithString("iteration_id",
			mcplib.Description("UUID of an iteration to associate (or re-associate) with.")),
		mcplib.WithString("performed_at",
			mcplib.Description("Date/time the experiment was performed (RFC 3339).")),
		mcplib.WithString("parameters",
			mcplib.Description("Experiment parameters as a JSON object string.")),
		mcplib.WithString("tags",
			mcplib.Description("Comma-separated tag labels. When provided, replaces all existing tags.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "experiment_id")
		if id == "" {
			return toolErr(fmt.Errorf("experiment_id is required")), nil
		}

		payload := map[string]any{}
		if v := stringArg(req, "method"); v != "" {
			payload["method"] = v
		}
		if v := stringArg(req, "status"); v != "" {
			payload["status"] = v
		}
		if v := stringArg(req, "result_summary"); v != "" {
			payload["result_summary"] = v
		}
		if v := stringArg(req, "iteration_id"); v != "" {
			payload["iteration_id"] = v
		}
		if v := stringArg(req, "performed_at"); v != "" {
			payload["performed_at"] = v
		}
		if v := stringArg(req, "parameters"); v != "" {
			var raw json.RawMessage
			if err := json.Unmarshal([]byte(v), &raw); err != nil {
				return toolErr(fmt.Errorf("parameters must be a valid JSON object: %w", err)), nil
			}
			payload["parameters"] = raw
		}
		if v := stringArg(req, "tags"); v != "" {
			parts := strings.Split(v, ",")
			trimmed := make([]string, 0, len(parts))
			for _, p := range parts {
				if t := strings.TrimSpace(p); t != "" {
					trimmed = append(trimmed, t)
				}
			}
			payload["tags"] = trimmed
		}

		body, err := s.do(ctx, http.MethodPatch, "/v1/experiments/"+id, payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── link_experiment_sample ──────────────────────────────────────────────────

func (s *Server) toolLinkExperimentSample() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("link_experiment_sample",
		mcplib.WithDescription("Associate an existing sample with an experiment in a given role (subject, reference, control, byproduct). Requires editor role on the experiment's project."),
		mcplib.WithString("experiment_id",
			mcplib.Description("UUID of the experiment."),
			mcplib.Required()),
		mcplib.WithString("sample_id",
			mcplib.Description("UUID of the sample to link."),
			mcplib.Required()),
		mcplib.WithString("role",
			mcplib.Description("Optional role: subject, reference, control, or byproduct.")),
		mcplib.WithString("note",
			mcplib.Description("Optional free-text note about this association.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		expID := stringArg(req, "experiment_id")
		if expID == "" {
			return toolErr(fmt.Errorf("experiment_id is required")), nil
		}
		sampleID := stringArg(req, "sample_id")
		if sampleID == "" {
			return toolErr(fmt.Errorf("sample_id is required")), nil
		}

		payload := map[string]any{
			"sample_id": sampleID,
		}
		if v := stringArg(req, "role"); v != "" {
			payload["role"] = v
		}
		if v := stringArg(req, "note"); v != "" {
			payload["note"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/experiments/"+expID+"/samples", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── unlink_experiment_sample ────────────────────────────────────────────────

func (s *Server) toolUnlinkExperimentSample() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("unlink_experiment_sample",
		mcplib.WithDescription("Remove the association between a sample and an experiment. Requires editor role on the experiment's project."),
		mcplib.WithString("experiment_id",
			mcplib.Description("UUID of the experiment."),
			mcplib.Required()),
		mcplib.WithString("sample_id",
			mcplib.Description("UUID of the sample to unlink."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		expID := stringArg(req, "experiment_id")
		if expID == "" {
			return toolErr(fmt.Errorf("experiment_id is required")), nil
		}
		sampleID := stringArg(req, "sample_id")
		if sampleID == "" {
			return toolErr(fmt.Errorf("sample_id is required")), nil
		}
		body, err := s.do(ctx, http.MethodDelete, "/v1/experiments/"+expID+"/samples/"+sampleID, nil)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — SAMPLES
// ═══════════════════════════════════════════════════════════════════════════

// ─── create_sample ───────────────────────────────────────────────────────────

func (s *Server) toolCreateSample() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("create_sample",
		mcplib.WithDescription("Create a new physical or virtual sample within a project. Requires editor role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("identifier",
			mcplib.Description("Unique sample identifier within the project (e.g. \"EL-2024-042\")."),
			mcplib.Required()),
		mcplib.WithString("name",
			mcplib.Description("Optional human-readable name.")),
		mcplib.WithString("description",
			mcplib.Description("Optional description.")),
		mcplib.WithString("kind",
			mcplib.Description("Optional kind: precursor, electrode, cell, module, derivative, or other.")),
		mcplib.WithString("status",
			mcplib.Description("Optional status: active, consumed, archived, or failed.")),
		mcplib.WithString("properties",
			mcplib.Description("Optional domain-specific metadata as a JSON object string.")),
		mcplib.WithString("tags",
			mcplib.Description("Optional comma-separated list of tag labels to apply.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		identifier := stringArg(req, "identifier")
		if identifier == "" {
			return toolErr(fmt.Errorf("identifier is required")), nil
		}

		payload := map[string]any{
			"identifier": identifier,
		}
		if v := stringArg(req, "name"); v != "" {
			payload["name"] = v
		}
		if v := stringArg(req, "description"); v != "" {
			payload["description"] = v
		}
		if v := stringArg(req, "kind"); v != "" {
			payload["kind"] = v
		}
		if v := stringArg(req, "status"); v != "" {
			payload["status"] = v
		}
		if v := stringArg(req, "properties"); v != "" {
			var raw json.RawMessage
			if err := json.Unmarshal([]byte(v), &raw); err != nil {
				return toolErr(fmt.Errorf("properties must be a valid JSON object: %w", err)), nil
			}
			payload["properties"] = raw
		}
		if v := stringArg(req, "tags"); v != "" {
			parts := strings.Split(v, ",")
			trimmed := make([]string, 0, len(parts))
			for _, p := range parts {
				if t := strings.TrimSpace(p); t != "" {
					trimmed = append(trimmed, t)
				}
			}
			payload["tags"] = trimmed
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/projects/"+projectID+"/samples", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── update_sample ───────────────────────────────────────────────────────────

func (s *Server) toolUpdateSample() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("update_sample",
		mcplib.WithDescription("Partially update a sample's fields (name, status, properties, etc.). Requires editor role on the sample's project."),
		mcplib.WithString("sample_id",
			mcplib.Description("UUID of the sample."),
			mcplib.Required()),
		mcplib.WithString("name",
			mcplib.Description("New name.")),
		mcplib.WithString("description",
			mcplib.Description("New description.")),
		mcplib.WithString("identifier",
			mcplib.Description("New identifier.")),
		mcplib.WithString("kind",
			mcplib.Description("New kind: precursor, electrode, cell, module, derivative, or other.")),
		mcplib.WithString("status",
			mcplib.Description("New status: active, consumed, archived, or failed.")),
		mcplib.WithString("properties",
			mcplib.Description("New domain-specific metadata as a JSON object string.")),
		mcplib.WithString("tags",
			mcplib.Description("Comma-separated tag labels. When provided, replaces all existing tags.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "sample_id")
		if id == "" {
			return toolErr(fmt.Errorf("sample_id is required")), nil
		}

		payload := map[string]any{}
		if v := stringArg(req, "name"); v != "" {
			payload["name"] = v
		}
		if v := stringArg(req, "description"); v != "" {
			payload["description"] = v
		}
		if v := stringArg(req, "identifier"); v != "" {
			payload["identifier"] = v
		}
		if v := stringArg(req, "kind"); v != "" {
			payload["kind"] = v
		}
		if v := stringArg(req, "status"); v != "" {
			payload["status"] = v
		}
		if v := stringArg(req, "properties"); v != "" {
			var raw json.RawMessage
			if err := json.Unmarshal([]byte(v), &raw); err != nil {
				return toolErr(fmt.Errorf("properties must be a valid JSON object: %w", err)), nil
			}
			payload["properties"] = raw
		}
		if v := stringArg(req, "tags"); v != "" {
			parts := strings.Split(v, ",")
			trimmed := make([]string, 0, len(parts))
			for _, p := range parts {
				if t := strings.TrimSpace(p); t != "" {
					trimmed = append(trimmed, t)
				}
			}
			payload["tags"] = trimmed
		}

		body, err := s.do(ctx, http.MethodPatch, "/v1/samples/"+id, payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── add_sample_relation ─────────────────────────────────────────────────────

func (s *Server) toolAddSampleRelation() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("add_sample_relation",
		mcplib.WithDescription("Record a directed lineage relationship between two samples (e.g. derived_from, split_from). Requires editor role on both samples' projects."),
		mcplib.WithString("sample_id",
			mcplib.Description("UUID of the parent sample (the one that the relation originates from)."),
			mcplib.Required()),
		mcplib.WithString("child_sample_id",
			mcplib.Description("UUID of the child sample."),
			mcplib.Required()),
		mcplib.WithString("relation_type",
			mcplib.Description("Relation type: derived_from, split_from, assembled_into, tested_as, or duplicate_of."),
			mcplib.Required()),
		mcplib.WithString("notes",
			mcplib.Description("Optional notes about this relation.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "sample_id")
		if id == "" {
			return toolErr(fmt.Errorf("sample_id is required")), nil
		}
		childID := stringArg(req, "child_sample_id")
		if childID == "" {
			return toolErr(fmt.Errorf("child_sample_id is required")), nil
		}
		relType := stringArg(req, "relation_type")
		if relType == "" {
			return toolErr(fmt.Errorf("relation_type is required")), nil
		}

		payload := map[string]any{
			"child_sample_id": childID,
			"relation_type":   relType,
		}
		if v := stringArg(req, "notes"); v != "" {
			payload["notes"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/samples/"+id+"/relations", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — RISKS
// ═══════════════════════════════════════════════════════════════════════════

// ─── create_risk ─────────────────────────────────────────────────────────────

func (s *Server) toolCreateRisk() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("create_risk",
		mcplib.WithDescription("Create a new risk entry within a project. Requires editor role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("title",
			mcplib.Description("Risk title (required, non-empty)."),
			mcplib.Required()),
		mcplib.WithString("likelihood",
			mcplib.Description("Likelihood rating: high, med, or low (defaults to low).")),
		mcplib.WithString("impact_headline",
			mcplib.Description("Optional short impact headline.")),
		mcplib.WithString("impact_description",
			mcplib.Description("Optional detailed impact description.")),
		mcplib.WithString("mitigation",
			mcplib.Description("Optional mitigation plan.")),
		mcplib.WithString("plan_b",
			mcplib.Description("Optional contingency plan.")),
		mcplib.WithString("iteration_id",
			mcplib.Description("Optional UUID of an iteration to scope this risk to.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		title := stringArg(req, "title")
		if title == "" {
			return toolErr(fmt.Errorf("title is required")), nil
		}

		payload := map[string]any{
			"title": title,
		}
		if v := stringArg(req, "likelihood"); v != "" {
			payload["likelihood"] = v
		}
		if v := stringArg(req, "impact_headline"); v != "" {
			payload["impact_headline"] = v
		}
		if v := stringArg(req, "impact_description"); v != "" {
			payload["impact_description"] = v
		}
		if v := stringArg(req, "mitigation"); v != "" {
			payload["mitigation"] = v
		}
		if v := stringArg(req, "plan_b"); v != "" {
			payload["plan_b"] = v
		}
		if v := stringArg(req, "iteration_id"); v != "" {
			payload["iteration_id"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/projects/"+projectID+"/risks", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── update_risk ─────────────────────────────────────────────────────────────

func (s *Server) toolUpdateRisk() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("update_risk",
		mcplib.WithDescription("Partially update a risk (title, likelihood, impact, mitigation, status, PI review flag). Requires editor role on the risk's project."),
		mcplib.WithString("risk_id",
			mcplib.Description("UUID of the risk."),
			mcplib.Required()),
		mcplib.WithString("title",
			mcplib.Description("New title.")),
		mcplib.WithString("likelihood",
			mcplib.Description("New likelihood: high, med, or low.")),
		mcplib.WithString("impact_headline",
			mcplib.Description("New impact headline.")),
		mcplib.WithString("impact_description",
			mcplib.Description("New impact description.")),
		mcplib.WithString("mitigation",
			mcplib.Description("New mitigation plan.")),
		mcplib.WithString("plan_b",
			mcplib.Description("New contingency plan.")),
		mcplib.WithString("status",
			mcplib.Description("New status.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "risk_id")
		if id == "" {
			return toolErr(fmt.Errorf("risk_id is required")), nil
		}

		payload := map[string]any{}
		if v := stringArg(req, "title"); v != "" {
			payload["title"] = v
		}
		if v := stringArg(req, "likelihood"); v != "" {
			payload["likelihood"] = v
		}
		if v := stringArg(req, "impact_headline"); v != "" {
			payload["impact_headline"] = v
		}
		if v := stringArg(req, "impact_description"); v != "" {
			payload["impact_description"] = v
		}
		if v := stringArg(req, "mitigation"); v != "" {
			payload["mitigation"] = v
		}
		if v := stringArg(req, "plan_b"); v != "" {
			payload["plan_b"] = v
		}
		if v := stringArg(req, "status"); v != "" {
			payload["status"] = v
		}

		body, err := s.do(ctx, http.MethodPatch, "/v1/risks/"+id, payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — APPROVALS
// ═══════════════════════════════════════════════════════════════════════════

// ─── create_approval_request ──────────────────────────────────────────────────

func (s *Server) toolCreateApprovalRequest() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("create_approval_request",
		mcplib.WithDescription("Create a new approval request for a project. Requires editor role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("description",
			mcplib.Description("Description of what is being approved (required, non-empty)."),
			mcplib.Required()),
		mcplib.WithString("iteration_id",
			mcplib.Description("Optional UUID of an iteration this approval is associated with.")),
		mcplib.WithString("ai_review",
			mcplib.Description("Optional AI-generated review text to include.")),
		mcplib.WithString("recipient_user_ids",
			mcplib.Description("Optional comma-separated list of user UUIDs who should review this request.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		description := stringArg(req, "description")
		if description == "" {
			return toolErr(fmt.Errorf("description is required")), nil
		}

		payload := map[string]any{
			"description": description,
		}
		if v := stringArg(req, "iteration_id"); v != "" {
			payload["iteration_id"] = v
		}
		if v := stringArg(req, "ai_review"); v != "" {
			payload["ai_review"] = v
		}
		if v := stringArg(req, "recipient_user_ids"); v != "" {
			parts := strings.Split(v, ",")
			trimmed := make([]string, 0, len(parts))
			for _, p := range parts {
				if t := strings.TrimSpace(p); t != "" {
					trimmed = append(trimmed, t)
				}
			}
			payload["recipient_user_ids"] = trimmed
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/projects/"+projectID+"/approval-requests", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — PAGES
// ═══════════════════════════════════════════════════════════════════════════

// ─── create_page ─────────────────────────────────────────────────────────────

func (s *Server) toolCreatePage() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("create_page",
		mcplib.WithDescription("Create a new content-addressable page attached to a parent entity (project, iteration, sample, or experiment). Requires editor role on the project."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("parent_type",
			mcplib.Description("Parent entity type: project, iteration, sample, or experiment."),
			mcplib.Required()),
		mcplib.WithString("parent_id",
			mcplib.Description("UUID of the parent entity."),
			mcplib.Required()),
		mcplib.WithString("blocks",
			mcplib.Description("Initial page content as a JSON array of block objects."),
			mcplib.Required()),
		mcplib.WithString("slot",
			mcplib.Description("Optional slot name for distinguishing multiple pages on the same parent.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		parentType := stringArg(req, "parent_type")
		if parentType == "" {
			return toolErr(fmt.Errorf("parent_type is required")), nil
		}
		parentID := stringArg(req, "parent_id")
		if parentID == "" {
			return toolErr(fmt.Errorf("parent_id is required")), nil
		}
		blocksStr := stringArg(req, "blocks")
		if blocksStr == "" {
			return toolErr(fmt.Errorf("blocks is required")), nil
		}
		var blocks json.RawMessage
		if err := json.Unmarshal([]byte(blocksStr), &blocks); err != nil {
			return toolErr(fmt.Errorf("blocks must be a valid JSON array: %w", err)), nil
		}

		payload := map[string]any{
			"parent_type": parentType,
			"parent_id":   parentID,
			"blocks":      blocks,
		}
		if v := stringArg(req, "slot"); v != "" {
			payload["slot"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/projects/"+projectID+"/pages", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── update_page ─────────────────────────────────────────────────────────────

// update_page uses PUT /v1/pages/{id} which requires an If-Match header
// containing the current revision's ETag. The ETag is sent by the REST API
// as a response header on GET /v1/pages/{id} and is formatted as a quoted
// revision UUID (e.g. `"abc123..."`).
//
// Strategy: the handler first GETs the page to capture the ETag from the
// response header, then issues the PUT with If-Match set to that value.
// This is a read-modify-write pattern that works correctly for the common
// case. Callers that need explicit optimistic-concurrency control should
// call read_page first, note the current_revision_id, format it as
// `"<revision_id>"`, and pass it as if_match to override the auto-fetch.
func (s *Server) toolUpdatePage() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("update_page",
		mcplib.WithDescription("Write a new revision for a page. The handler auto-fetches the current ETag via GET before issuing the PUT with If-Match. Pass if_match explicitly (as a quoted revision UUID, e.g. `\"abc...\"`) to override the auto-fetch and use strict optimistic concurrency. Requires editor role on the project. Also accepts wiki page IDs returned by list_wiki_pages — the server authorizes wiki pages for any authenticated user."),
		mcplib.WithString("page_id",
			mcplib.Description("UUID of the page to update."),
			mcplib.Required()),
		mcplib.WithString("blocks",
			mcplib.Description("New page content as a JSON array of block objects."),
			mcplib.Required()),
		mcplib.WithString("source",
			mcplib.Description("Optional write source: human (default) or auto_save.")),
		mcplib.WithString("if_match",
			mcplib.Description("Optional explicit If-Match ETag value (e.g. `\"<revision_uuid>\"`). When omitted the handler fetches the current ETag automatically.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "page_id")
		if id == "" {
			return toolErr(fmt.Errorf("page_id is required")), nil
		}
		blocksStr := stringArg(req, "blocks")
		if blocksStr == "" {
			return toolErr(fmt.Errorf("blocks is required")), nil
		}
		var blocks json.RawMessage
		if err := json.Unmarshal([]byte(blocksStr), &blocks); err != nil {
			return toolErr(fmt.Errorf("blocks must be a valid JSON array: %w", err)), nil
		}

		// Resolve the If-Match value. If the caller provided one explicitly,
		// use it. Otherwise GET the page and read the ETag from the response header.
		ifMatch := stringArg(req, "if_match")
		if ifMatch == "" {
			// Auto-fetch the current ETag so the caller doesn't have to.
			headers, _, err := s.doWithHeaders(ctx, http.MethodGet, "/v1/pages/"+id, nil, nil)
			if err != nil {
				return toolErr(fmt.Errorf("update_page: failed to read current ETag: %w", err)), nil
			}
			ifMatch = headers.Get("ETag")
			if ifMatch == "" {
				return toolErr(fmt.Errorf("update_page: page has no current ETag (no revision yet?); create content first")), nil
			}
		}

		payload := map[string]any{
			"blocks": blocks,
		}
		if v := stringArg(req, "source"); v != "" {
			payload["source"] = v
		}

		extraHeaders := map[string]string{
			"If-Match": ifMatch,
		}
		_, respBody, err := s.doWithHeaders(ctx, http.MethodPut, "/v1/pages/"+id, payload, extraHeaders)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(respBody), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// READ TOOLS — TASKS
// ═══════════════════════════════════════════════════════════════════════════

// ─── list_tasks ──────────────────────────────────────────────────────────────

func (s *Server) toolListTasks() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_tasks",
		mcplib.WithDescription("List tasks in a project. Returns tasks with status, planned executor (assignee), actual executor, planned dates (planned_start_at, estimated_finish_at), actual dates (actual_start_at, actual_end_at), and associated iteration."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/projects/"+projectID+"/tasks")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── read_task ───────────────────────────────────────────────────────────────

func (s *Server) toolReadTask() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("read_task",
		mcplib.WithDescription("Get a single task by ID, including status, assignees, dates, references, and associated iteration."),
		mcplib.WithString("task_id",
			mcplib.Description("UUID of the task."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "task_id")
		if id == "" {
			return toolErr(fmt.Errorf("task_id is required")), nil
		}
		body, err := s.get(ctx, "/v1/tasks/"+id)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — TASKS
// ═══════════════════════════════════════════════════════════════════════════

// ─── create_task ─────────────────────────────────────────────────────────────

func (s *Server) toolCreateTask() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("create_task",
		mcplib.WithDescription("Create a new task within a project. Requires editor role on the project. "+
			"Actual executor, actual start, and actual end are inferred by the server on take/done — do not pass them here."),
		mcplib.WithString("project_id",
			mcplib.Description("UUID of the project."),
			mcplib.Required()),
		mcplib.WithString("title",
			mcplib.Description("Title of the task (required, non-empty)."),
			mcplib.Required()),
		mcplib.WithString("description",
			mcplib.Description("Optional free-text description.")),
		mcplib.WithString("iteration_id",
			mcplib.Description("Optional UUID of an iteration to associate this task with.")),
		mcplib.WithString("assignee_user_id",
			mcplib.Description("Optional UUID of the planned executor (assigned user).")),
		mcplib.WithString("planned_start_at",
			mcplib.Description("Optional planned start date/time in RFC 3339 format.")),
		mcplib.WithString("estimated_finish_at",
			mcplib.Description("Optional planned end date/time in RFC 3339 format.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		projectID := stringArg(req, "project_id")
		if projectID == "" {
			return toolErr(fmt.Errorf("project_id is required")), nil
		}
		title := stringArg(req, "title")
		if title == "" {
			return toolErr(fmt.Errorf("title is required")), nil
		}

		payload := map[string]any{
			"title": title,
		}
		if v := stringArg(req, "description"); v != "" {
			payload["description"] = v
		}
		if v := stringArg(req, "iteration_id"); v != "" {
			payload["iteration_id"] = v
		}
		if v := stringArg(req, "assignee_user_id"); v != "" {
			payload["assignee_user_id"] = v
		}
		if v := stringArg(req, "planned_start_at"); v != "" {
			payload["planned_start_at"] = v
		}
		if v := stringArg(req, "estimated_finish_at"); v != "" {
			payload["estimated_finish_at"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/projects/"+projectID+"/tasks", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── take_task ───────────────────────────────────────────────────────────────

func (s *Server) toolTakeTask() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("take_task",
		mcplib.WithDescription("Take a task — records the actual start timestamp and sets the actual executor to the calling user. "+
			"Transitions the task status to in_progress."),
		mcplib.WithString("task_id",
			mcplib.Description("UUID of the task to take."),
			mcplib.Required()),
		mcplib.WithString("estimated_finish_at",
			mcplib.Description("Revised estimated finish date/time in RFC 3339 format."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "task_id")
		if id == "" {
			return toolErr(fmt.Errorf("task_id is required")), nil
		}
		estimatedFinish := stringArg(req, "estimated_finish_at")
		if estimatedFinish == "" {
			return toolErr(fmt.Errorf("estimated_finish_at is required")), nil
		}

		payload := map[string]any{
			"estimated_finish_at": estimatedFinish,
		}
		body, err := s.do(ctx, http.MethodPost, "/v1/tasks/"+id+"/take", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── mark_task_done ───────────────────────────────────────────────────────────

func (s *Server) toolMarkTaskDone() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("mark_task_done",
		mcplib.WithDescription("Mark a task as done. Requires at least one reference of type sample, experiment, or page to be attached first — use add_task_reference before calling this. "+
			"Records the actual end timestamp. Cancelled tasks cannot be marked done."),
		mcplib.WithString("task_id",
			mcplib.Description("UUID of the task to mark as done."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "task_id")
		if id == "" {
			return toolErr(fmt.Errorf("task_id is required")), nil
		}
		body, err := s.do(ctx, http.MethodPost, "/v1/tasks/"+id+"/done", nil)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── cancel_task ─────────────────────────────────────────────────────────────

func (s *Server) toolCancelTask() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("cancel_task",
		mcplib.WithDescription("Cancel a task with a reason. Cancelled tasks have no actual end timestamp recorded."),
		mcplib.WithString("task_id",
			mcplib.Description("UUID of the task to cancel."),
			mcplib.Required()),
		mcplib.WithString("reason",
			mcplib.Description("Reason for cancellation (required, non-empty)."),
			mcplib.Required()),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "task_id")
		if id == "" {
			return toolErr(fmt.Errorf("task_id is required")), nil
		}
		reason := stringArg(req, "reason")
		if reason == "" {
			return toolErr(fmt.Errorf("reason is required")), nil
		}

		payload := map[string]any{
			"reason": reason,
		}
		body, err := s.do(ctx, http.MethodPost, "/v1/tasks/"+id+"/cancel", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── add_task_reference ───────────────────────────────────────────────────────

func (s *Server) toolAddTaskReference() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("add_task_reference",
		mcplib.WithDescription("Attach a reference to a task. At least one reference of type sample, experiment, or page is required before a task can be marked done."),
		mcplib.WithString("task_id",
			mcplib.Description("UUID of the task."),
			mcplib.Required()),
		mcplib.WithString("ref_type",
			mcplib.Description("Type of the referenced entity: sample, experiment, page, user, or project."),
			mcplib.Required()),
		mcplib.WithString("ref_id",
			mcplib.Description("UUID of the referenced entity."),
			mcplib.Required()),
		mcplib.WithString("label",
			mcplib.Description("Optional human-readable label for the reference.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		id := stringArg(req, "task_id")
		if id == "" {
			return toolErr(fmt.Errorf("task_id is required")), nil
		}
		refType := stringArg(req, "ref_type")
		if refType == "" {
			return toolErr(fmt.Errorf("ref_type is required")), nil
		}
		refID := stringArg(req, "ref_id")
		if refID == "" {
			return toolErr(fmt.Errorf("ref_id is required")), nil
		}

		payload := map[string]any{
			"ref_type": refType,
			"ref_id":   refID,
		}
		if v := stringArg(req, "label"); v != "" {
			payload["label"] = v
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/tasks/"+id+"/references", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ═══════════════════════════════════════════════════════════════════════════
// WIKI TOOLS
// ═══════════════════════════════════════════════════════════════════════════

// ─── list_wiki_pages ─────────────────────────────────────────────────────────

func (s *Server) toolListWikiPages() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("list_wiki_pages",
		mcplib.WithDescription("List site-global wiki pages (project_id is null, parent_type is 'wiki'). "+
			"Any authenticated user can read wiki pages. Use read_page or update_page with the returned page IDs to read or edit individual wiki pages."),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		body, err := s.get(ctx, "/v1/wiki/pages")
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}

// ─── create_wiki_page ────────────────────────────────────────────────────────

func (s *Server) toolCreateWikiPage() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("create_wiki_page",
		mcplib.WithDescription("Create a new site-global wiki page. Content is converted to BlockNote blocks: "+
			"a heading block for the title followed by a paragraph block per line of content. "+
			"Any authenticated user can create wiki pages."),
		mcplib.WithString("title",
			mcplib.Description("Title of the wiki page (required, non-empty)."),
			mcplib.Required()),
		mcplib.WithString("content",
			mcplib.Description("Optional plain-text content. Each line becomes a separate paragraph block.")),
	)
	handler := func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		title := stringArg(req, "title")
		if title == "" {
			return toolErr(fmt.Errorf("title is required")), nil
		}

		// Build BlockNote blocks: heading for the title, then a paragraph per line.
		type blockContent struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		type block struct {
			Type    string         `json:"type"`
			Props   map[string]any `json:"props,omitempty"`
			Content []blockContent `json:"content"`
		}

		blocks := []block{
			{
				Type:    "heading",
				Props:   map[string]any{"level": 1},
				Content: []blockContent{{Type: "text", Text: title}},
			},
		}

		if content := stringArg(req, "content"); content != "" {
			for _, line := range strings.Split(content, "\n") {
				blocks = append(blocks, block{
					Type:    "paragraph",
					Content: []blockContent{{Type: "text", Text: line}},
				})
			}
		}

		payload := map[string]any{
			"title":  title,
			"blocks": blocks,
		}

		body, err := s.do(ctx, http.MethodPost, "/v1/wiki/pages", payload)
		if err != nil {
			return toolErr(err), nil
		}
		return toolText(body), nil
	}
	return tool, handler
}
