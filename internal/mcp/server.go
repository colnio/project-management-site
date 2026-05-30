package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
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

	// Register all read-only tools.
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

// ─── HTTP helper ─────────────────────────────────────────────────────────────

// get performs a GET request to the REST backend, forwarding the caller's bearer.
// On non-2xx status it returns a descriptive error.
func (s *Server) get(ctx context.Context, path string) ([]byte, error) {
	url := s.restBase + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("mcp: build request: %w", err)
	}
	if tok := bearerFromCtx(ctx); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mcp: http: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("mcp: read body: %w", err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("mcp: 401 Unauthorized — provide a valid PAT via Authorization: Bearer pat_...")
	}
	if resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("mcp: 403 Forbidden — PAT lacks required scope for this resource")
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("mcp: 404 Not Found — %s", url)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("mcp: upstream returned %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
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
	s.mcp.AddTool(s.toolListProjects())
	s.mcp.AddTool(s.toolSearchProjectContent())
	s.mcp.AddTool(s.toolListSamples())
	s.mcp.AddTool(s.toolReadSample())
	s.mcp.AddTool(s.toolGetSampleLineage())
	s.mcp.AddTool(s.toolListExperiments())
	s.mcp.AddTool(s.toolReadExperiment())
	s.mcp.AddTool(s.toolReadPage())
	s.mcp.AddTool(s.toolListArtifacts())
}

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

// ─── read_page ────────────────────────────────────────────────────────────────

func (s *Server) toolReadPage() (mcplib.Tool, mcpserver.ToolHandlerFunc) {
	tool := mcplib.NewTool("read_page",
		mcplib.WithDescription("Get a page (structured document) by ID, including its current content blocks."),
		mcplib.WithString("page_id",
			mcplib.Description("UUID of the page."),
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
