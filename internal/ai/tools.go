package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// braveSearchBaseURL is the Brave Web Search API endpoint. It is a package var
// (not a const) so tests can point it at an httptest server.
var braveSearchBaseURL = "https://api.search.brave.com/res/v1/web/search"

// restCallFn is the signature for calling the REST API.
type restCallFn func(method, path string, body any) ([]byte, int, error)

// restCallWithHeadersFn is like restCallFn but also accepts extra outbound
// request headers and returns the response headers. It is used only by the
// update_page tool, which must read the ETag from a GET and replay it as
// If-Match on a subsequent PUT. All other tools continue to use restCallFn.
type restCallWithHeadersFn func(method, path string, body any, extraHeaders map[string]string) ([]byte, int, http.Header, error)

// toolHandler is a Go function that implements a tool.
type toolHandler func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error)

// toolDef is a full tool definition with schema + handler.
type toolDef struct {
	Tool    Tool
	Handler toolHandler
	IsWrite bool // true for write tools, false for read tools
}

// makeRESTCaller returns a restCallFn that calls the REST API with an iai_ token.
func makeRESTCaller(baseURL, iaiToken string) restCallFn {
	client := &http.Client{Timeout: 30 * time.Second}
	return func(method, path string, body any) ([]byte, int, error) {
		var reqBody io.Reader
		if body != nil {
			b, err := json.Marshal(body)
			if err != nil {
				return nil, 0, fmt.Errorf("ai: marshal body: %w", err)
			}
			reqBody = bytes.NewReader(b)
		}
		url := strings.TrimSuffix(baseURL, "/") + path
		req, err := http.NewRequest(method, url, reqBody)
		if err != nil {
			return nil, 0, fmt.Errorf("ai: build request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+iaiToken)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return nil, 0, fmt.Errorf("ai: rest call: %w", err)
		}
		defer resp.Body.Close()
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, resp.StatusCode, fmt.Errorf("ai: read rest body: %w", err)
		}
		return data, resp.StatusCode, nil
	}
}

// makeRESTCallerWithHeaders returns a restCallWithHeadersFn that calls the REST
// API with an iai_ token, accepts extra outbound request headers, and returns
// the response headers. Used only by update_page for the ETag round-trip.
func makeRESTCallerWithHeaders(baseURL, iaiToken string) restCallWithHeadersFn {
	client := &http.Client{Timeout: 30 * time.Second}
	return func(method, path string, body any, extraHeaders map[string]string) ([]byte, int, http.Header, error) {
		var reqBody io.Reader
		if body != nil {
			b, err := json.Marshal(body)
			if err != nil {
				return nil, 0, nil, fmt.Errorf("ai: marshal body: %w", err)
			}
			reqBody = bytes.NewReader(b)
		}
		url := strings.TrimSuffix(baseURL, "/") + path
		req, err := http.NewRequest(method, url, reqBody)
		if err != nil {
			return nil, 0, nil, fmt.Errorf("ai: build request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+iaiToken)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		for k, v := range extraHeaders {
			req.Header.Set(k, v)
		}

		resp, err := client.Do(req)
		if err != nil {
			return nil, 0, nil, fmt.Errorf("ai: rest call: %w", err)
		}
		defer resp.Body.Close()
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, resp.StatusCode, resp.Header, fmt.Errorf("ai: read rest body: %w", err)
		}
		return data, resp.StatusCode, resp.Header, nil
	}
}

// allTools returns the full list of tool definitions (read + write).
// The projectID and workspaceID are injected so tools know their scope.
// restHdrs is the header-capable REST caller used only by update_page; it may
// be nil when the list is built purely for schema enumeration (gatedTools).
func allTools(projectID, workspaceID string, restHdrs ...restCallWithHeadersFn) []toolDef {
	var rhFn restCallWithHeadersFn
	if len(restHdrs) > 0 {
		rhFn = restHdrs[0]
	}
	return []toolDef{
		listProjectsTool(workspaceID),
		readSampleTool(),
		getSampleLineageTool(),
		listSamplesTool(),
		readExperimentTool(),
		listExperimentsTool(),
		readPageTool(),
		listArtifactsTool(),
		searchProjectContentTool(projectID),
		webSearchTool(),
		// ─── new read tools ───────────────────────────────────────────────────
		readProjectTool(projectID),
		listIterationsTool(projectID),
		readIterationTool(),
		listIterationSamplesTool(),
		listRisksTool(projectID),
		listIterationRisksTool(),
		listPagesTool(projectID),
		listEventsTool(projectID),
		listApprovalsTool(projectID),
		listExperimentTagsTool(projectID),
		listSampleTagsTool(projectID),
		// ─── write tools ─────────────────────────────────────────────────────
		draftPageTool(projectID),
		updateIterationStatusTool(),
		createReminderTool(projectID),
		createIterationTool(projectID),
		updateIterationTool(),
		linkIterationSampleTool(),
		unlinkIterationSampleTool(),
		createExperimentTool(projectID),
		updateExperimentTool(),
		linkExperimentSampleTool(),
		unlinkExperimentSampleTool(),
		createSampleTool(projectID),
		updateSampleTool(),
		addSampleRelationTool(),
		createRiskTool(projectID),
		updateRiskTool(),
		saveRiskAssessmentTool(projectID),
		createApprovalRequestTool(projectID),
		updatePageTool(rhFn),
	}
}

// gatedTools returns the subset of tools the autonomy config allows,
// filtered to schemas only (for passing to the model).
func gatedTools(projectID, workspaceID string, mode string, allowedTools []string) []Tool {
	var out []Tool
	for _, td := range allTools(projectID, workspaceID) {
		if !td.IsWrite {
			out = append(out, td.Tool)
			continue
		}
		// Write tools only included if mode isn't read_only.
		if mode == ModeReadOnly {
			continue
		}
		out = append(out, td.Tool)
	}
	return out
}

// dispatchTool finds the tool handler by name and calls it.
// Returns (result, isWrite, error).
// restHdrs is the header-capable REST caller forwarded to update_page; pass nil
// when the caller does not need to support that tool (e.g. read-only workflows).
func dispatchTool(ctx context.Context, name string, argsJSON string, projectID, workspaceID string, rest restCallFn, restHdrs ...restCallWithHeadersFn) (string, bool, error) {
	for _, td := range allTools(projectID, workspaceID, restHdrs...) {
		if td.Tool.Function.Name == name {
			result, err := td.Handler(ctx, json.RawMessage(argsJSON), rest)
			return result, td.IsWrite, err
		}
	}
	return "", false, fmt.Errorf("ai: unknown tool %q", name)
}

// ─── Read tools ──────────────────────────────────────────────────────────────

func listProjectsTool(workspaceID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_projects",
				Description: "List all projects in the workspace. Use this when the user asks about multiple projects or projects other than the current one.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/workspaces/"+workspaceID+"/projects", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_projects: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func readSampleTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "read_sample",
				Description: "Get a single sample by ID, including all properties and status.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"sample_id":{"type":"string","description":"UUID of the sample"}},"required":["sample_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				SampleID string `json:"sample_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("read_sample: parse args: %w", err)
			}
			if p.SampleID == "" {
				return "", fmt.Errorf("read_sample: sample_id required")
			}
			data, status, err := rest("GET", "/v1/samples/"+p.SampleID, nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("read_sample: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func getSampleLineageTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "get_sample_lineage",
				Description: "Get the lineage graph for a sample — ancestor/descendant relations.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"sample_id":{"type":"string","description":"UUID of the sample"}},"required":["sample_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				SampleID string `json:"sample_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}
			if p.SampleID == "" {
				return "", fmt.Errorf("get_sample_lineage: sample_id required")
			}
			data, status, err := rest("GET", "/v1/samples/"+p.SampleID+"/lineage", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("get_sample_lineage: status %d", status)
			}
			return string(data), nil
		},
	}
}

func listSamplesTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_samples",
				Description: "List samples in a project.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"project_id":{"type":"string","description":"UUID of the project"}},"required":["project_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ProjectID string `json:"project_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}
			if p.ProjectID == "" {
				return "", fmt.Errorf("list_samples: project_id required")
			}
			data, status, err := rest("GET", "/v1/projects/"+p.ProjectID+"/samples", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_samples: status %d", status)
			}
			return string(data), nil
		},
	}
}

func readExperimentTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "read_experiment",
				Description: "Get a single experiment by ID, including linked samples.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"experiment_id":{"type":"string","description":"UUID of the experiment"}},"required":["experiment_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ExperimentID string `json:"experiment_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}
			if p.ExperimentID == "" {
				return "", fmt.Errorf("read_experiment: experiment_id required")
			}
			data, status, err := rest("GET", "/v1/experiments/"+p.ExperimentID, nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("read_experiment: status %d", status)
			}
			return string(data), nil
		},
	}
}

func listExperimentsTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_experiments",
				Description: "List experiments in a project.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"project_id":{"type":"string","description":"UUID of the project"}},"required":["project_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ProjectID string `json:"project_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}
			if p.ProjectID == "" {
				return "", fmt.Errorf("list_experiments: project_id required")
			}
			data, status, err := rest("GET", "/v1/projects/"+p.ProjectID+"/experiments", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_experiments: status %d", status)
			}
			return string(data), nil
		},
	}
}

func readPageTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "read_page",
				Description: "Get a page (structured document) by ID, including its current content blocks.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"page_id":{"type":"string","description":"UUID of the page"}},"required":["page_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				PageID string `json:"page_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}
			if p.PageID == "" {
				return "", fmt.Errorf("read_page: page_id required")
			}
			data, status, err := rest("GET", "/v1/pages/"+p.PageID, nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("read_page: status %d", status)
			}
			return string(data), nil
		},
	}
}

func listArtifactsTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_artifacts",
				Description: "List artifacts (uploaded files) in a project.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"project_id":{"type":"string","description":"UUID of the project"}},"required":["project_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ProjectID string `json:"project_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}
			if p.ProjectID == "" {
				return "", fmt.Errorf("list_artifacts: project_id required")
			}
			data, status, err := rest("GET", "/v1/projects/"+p.ProjectID+"/artifacts", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_artifacts: status %d", status)
			}
			return string(data), nil
		},
	}
}

func searchProjectContentTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "search_project_content",
				Description: "Search samples, experiments, and artifacts within the project by keyword.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"query":{"type":"string","description":"Keyword to search (case-insensitive substring)"}},"required":["query"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				Query string `json:"query"`
			}
			_ = json.Unmarshal(args, &p)

			pid := injectProjectID
			type match struct {
				Type    string `json:"type"`
				ID      string `json:"id"`
				Title   string `json:"title"`
				Snippet string `json:"snippet"`
			}
			var matches []match

			// Fetch samples.
			if data, status, err := rest("GET", "/v1/projects/"+pid+"/samples", nil); err == nil && status < 300 {
				var resp struct {
					Items []struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"items"`
				}
				if json.Unmarshal(data, &resp) == nil {
					for _, s := range resp.Items {
						if p.Query == "" || containsCI(s.Name, p.Query) {
							matches = append(matches, match{Type: "sample", ID: s.ID, Title: s.Name})
						}
					}
				}
			}

			// Fetch experiments.
			if data, status, err := rest("GET", "/v1/projects/"+pid+"/experiments", nil); err == nil && status < 300 {
				var resp struct {
					Items []struct {
						ID    string `json:"id"`
						Title string `json:"title"`
					} `json:"items"`
				}
				if json.Unmarshal(data, &resp) == nil {
					for _, e := range resp.Items {
						if p.Query == "" || containsCI(e.Title, p.Query) {
							matches = append(matches, match{Type: "experiment", ID: e.ID, Title: e.Title})
						}
					}
				}
			}

			// Fetch artifacts.
			if data, status, err := rest("GET", "/v1/projects/"+pid+"/artifacts", nil); err == nil && status < 300 {
				var resp struct {
					Items []struct {
						ID       string `json:"id"`
						Filename string `json:"filename"`
					} `json:"items"`
				}
				if json.Unmarshal(data, &resp) == nil {
					for _, a := range resp.Items {
						if p.Query == "" || containsCI(a.Filename, p.Query) {
							matches = append(matches, match{Type: "artifact", ID: a.ID, Title: a.Filename})
						}
					}
				}
			}

			out, _ := json.Marshal(matches)
			return string(out), nil
		},
	}
}

// webSearchTool queries the Brave Web Search API so the model can verify
// factual and numerical claims against live web results. Read-only; it does
// not use the REST callback. The API key comes from BRAVE_SEARCH_API_KEY.
func webSearchTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "web_search",
				Description: "Search the public web via Brave Search. Use this to verify any factual, numerical, dated, or external claim before stating it. Returns a JSON array of results, each with title, url, and description.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"query":{"type":"string","description":"The search query"},"count":{"type":"integer","description":"Number of results to return (default 5, max 5)"}},"required":["query"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, _ restCallFn) (string, error) {
			var p struct {
				Query string `json:"query"`
				Count int    `json:"count"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("web_search: parse args: %w", err)
			}
			if strings.TrimSpace(p.Query) == "" {
				return "", fmt.Errorf("web_search: query required")
			}
			key := os.Getenv("BRAVE_SEARCH_API_KEY")
			if key == "" {
				return `{"error":"web search is not configured (BRAVE_SEARCH_API_KEY unset)"}`, nil
			}
			count := p.Count
			if count <= 0 {
				count = 5
			}
			if count > 5 {
				count = 5 // cap low to stay within the free tier
			}

			q := url.Values{}
			q.Set("q", p.Query)
			q.Set("count", fmt.Sprintf("%d", count))
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, braveSearchBaseURL+"?"+q.Encode(), nil)
			if err != nil {
				return "", fmt.Errorf("web_search: build request: %w", err)
			}
			req.Header.Set("X-Subscription-Token", key)
			req.Header.Set("Accept", "application/json")

			client := &http.Client{Timeout: 30 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				return "", fmt.Errorf("web_search: request: %w", err)
			}
			defer resp.Body.Close()
			data, err := io.ReadAll(resp.Body)
			if err != nil {
				return "", fmt.Errorf("web_search: read body: %w", err)
			}
			if resp.StatusCode == http.StatusTooManyRequests {
				return `{"error":"web search rate-limited (429); try again shortly"}`, nil
			}
			if resp.StatusCode < 200 || resp.StatusCode >= 300 {
				return "", fmt.Errorf("web_search: brave status %d: %s", resp.StatusCode, string(data))
			}

			var br struct {
				Web struct {
					Results []struct {
						Title       string `json:"title"`
						URL         string `json:"url"`
						Description string `json:"description"`
					} `json:"results"`
				} `json:"web"`
			}
			if err := json.Unmarshal(data, &br); err != nil {
				return "", fmt.Errorf("web_search: parse brave json: %w", err)
			}

			type result struct {
				Title       string `json:"title"`
				URL         string `json:"url"`
				Description string `json:"description"`
			}
			out := make([]result, 0, len(br.Web.Results))
			for i, res := range br.Web.Results {
				if i >= count {
					break
				}
				out = append(out, result{Title: res.Title, URL: res.URL, Description: res.Description})
			}
			b, err := json.Marshal(out)
			if err != nil {
				return "", fmt.Errorf("web_search: marshal results: %w", err)
			}
			return string(b), nil
		},
	}
}

func containsCI(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
}

// ─── Write tools ─────────────────────────────────────────────────────────────

func draftPageTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "draft_page",
				Description: "Create a new draft page in the project.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"title":{"type":"string"},"content":{"type":"string"}},"required":["title"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				Title   string `json:"title"`
				Content string `json:"content"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}

			// Build BlockNote blocks: heading first, then one paragraph per line.
			type textContent struct {
				Type   string   `json:"type"`
				Text   string   `json:"text"`
				Styles struct{} `json:"styles"`
			}
			type headingProps struct {
				Level int `json:"level"`
			}
			type headingBlock struct {
				Type    string        `json:"type"`
				Props   headingProps  `json:"props"`
				Content []textContent `json:"content"`
			}
			type paragraphBlock struct {
				Type    string        `json:"type"`
				Content []textContent `json:"content"`
			}

			blocks := make([]any, 0)
			// Heading block for the title.
			blocks = append(blocks, headingBlock{
				Type:  "heading",
				Props: headingProps{Level: 1},
				Content: []textContent{
					{Type: "text", Text: p.Title},
				},
			})
			// One paragraph block per non-empty line of content.
			for _, line := range strings.Split(p.Content, "\n") {
				blocks = append(blocks, paragraphBlock{
					Type: "paragraph",
					Content: []textContent{
						{Type: "text", Text: line},
					},
				})
			}

			blocksJSON, err := json.Marshal(blocks)
			if err != nil {
				return "", fmt.Errorf("draft_page: marshal blocks: %w", err)
			}

			bodyMap := map[string]any{
				"parent_type": "project",
				"parent_id":   injectProjectID,
				"blocks":      json.RawMessage(blocksJSON),
			}
			data, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/pages", bodyMap)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("draft_page: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func updateIterationStatusTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "update_iteration_status",
				Description: "Update the status of an iteration.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"iteration_id":{"type":"string"},"status":{"type":"string"}},"required":["iteration_id","status"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				IterationID string `json:"iteration_id"`
				Status      string `json:"status"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}
			body := map[string]any{"status": p.Status}
			data, status, err := rest("PATCH", "/v1/iterations/"+p.IterationID, body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("update_iteration_status: status %d", status)
			}
			return string(data), nil
		},
	}
}

func createReminderTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "create_reminder",
				Description: "Create a reminder event in the project calendar.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"title":{"type":"string"},"start_at":{"type":"string","description":"RFC3339 datetime"}},"required":["title","start_at"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				Title   string `json:"title"`
				StartAt string `json:"start_at"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", err
			}
			body := map[string]any{
				"kind":     "reminder",
				"title":    p.Title,
				"start_at": p.StartAt,
			}
			data, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/events", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("create_reminder: status %d", status)
			}
			return string(data), nil
		},
	}
}

// ─── Additional read tools ────────────────────────────────────────────────────

func readProjectTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "read_project",
				Description: "Get full details of the current project including name, description, workspace, and status.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/projects/"+injectProjectID, nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("read_project: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listIterationsTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_iterations",
				Description: "List all iterations (time-boxed phases / sprints) in the current project, ordered by position.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/projects/"+injectProjectID+"/iterations", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_iterations: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func readIterationTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "read_iteration",
				Description: "Get a single iteration by ID, including its title, status, and date range.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"iteration_id":{"type":"string","description":"UUID of the iteration"}},"required":["iteration_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				IterationID string `json:"iteration_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("read_iteration: parse args: %w", err)
			}
			if p.IterationID == "" {
				return "", fmt.Errorf("read_iteration: iteration_id required")
			}
			data, status, err := rest("GET", "/v1/iterations/"+p.IterationID, nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("read_iteration: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listIterationSamplesTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_iteration_samples",
				Description: "List all samples linked to a specific iteration, including their roles and notes.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"iteration_id":{"type":"string","description":"UUID of the iteration"}},"required":["iteration_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				IterationID string `json:"iteration_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("list_iteration_samples: parse args: %w", err)
			}
			if p.IterationID == "" {
				return "", fmt.Errorf("list_iteration_samples: iteration_id required")
			}
			data, status, err := rest("GET", "/v1/iterations/"+p.IterationID+"/samples", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_iteration_samples: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listRisksTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_risks",
				Description: "List all risks registered in the current project, ordered by seq.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/projects/"+injectProjectID+"/risks", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_risks: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listIterationRisksTool() toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_iteration_risks",
				Description: "List risks scoped to a specific iteration.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"iteration_id":{"type":"string","description":"UUID of the iteration"}},"required":["iteration_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				IterationID string `json:"iteration_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("list_iteration_risks: parse args: %w", err)
			}
			if p.IterationID == "" {
				return "", fmt.Errorf("list_iteration_risks: iteration_id required")
			}
			data, status, err := rest("GET", "/v1/iterations/"+p.IterationID+"/risks", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_iteration_risks: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listPagesTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_pages",
				Description: "List all pages (structured documents) in the current project, ordered by most recently updated.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/projects/"+injectProjectID+"/pages", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_pages: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listEventsTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_events",
				Description: "List calendar events (reminders, milestones, etc.) in the current project.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/projects/"+injectProjectID+"/events", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_events: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listApprovalsTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_approvals",
				Description: "List approval requests in the current project, ordered newest first.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/projects/"+injectProjectID+"/approval-requests", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_approvals: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listExperimentTagsTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_experiment_tags",
				Description: "List all experiment tags defined in the current project. These are the valid tag labels for experiments.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/projects/"+injectProjectID+"/experiment-tags", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_experiment_tags: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func listSampleTagsTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: false,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "list_sample_tags",
				Description: "List all sample tags defined in the current project. These are the valid tag labels for samples.",
				Parameters:  json.RawMessage(`{"type":"object","properties":{}}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			data, status, err := rest("GET", "/v1/projects/"+injectProjectID+"/sample-tags", nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("list_sample_tags: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

// ─── Additional write tools ───────────────────────────────────────────────────

func createIterationTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "create_iteration",
				Description: "Create a new iteration (sprint / experimental batch) in the current project.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "title":{"type":"string","description":"Iteration title (required)"},
  "description":{"type":"string","description":"Optional description"},
  "status":{"type":"string","enum":["planned","active","done","blocked"],"description":"Initial status (default: planned)"},
  "start_at":{"type":"string","description":"RFC3339 start date-time (optional)"},
  "end_at":{"type":"string","description":"RFC3339 end date-time (optional)"}
},
"required":["title"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				Title       string `json:"title"`
				Description string `json:"description"`
				Status      string `json:"status"`
				StartAt     string `json:"start_at"`
				EndAt       string `json:"end_at"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("create_iteration: parse args: %w", err)
			}
			if p.Title == "" {
				return "", fmt.Errorf("create_iteration: title required")
			}
			body := map[string]any{"title": p.Title}
			if p.Description != "" {
				body["description"] = p.Description
			}
			if p.Status != "" {
				body["status"] = p.Status
			}
			if p.StartAt != "" {
				body["start_at"] = p.StartAt
			}
			if p.EndAt != "" {
				body["end_at"] = p.EndAt
			}
			data, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/iterations", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("create_iteration: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func updateIterationTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "update_iteration",
				Description: "Apply a partial update to an iteration (title, description, status, start/end dates, position). All fields are optional.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "iteration_id":{"type":"string","description":"UUID of the iteration to update"},
  "title":{"type":"string","description":"New title"},
  "description":{"type":"string","description":"New description"},
  "status":{"type":"string","enum":["planned","active","done","blocked"]},
  "start_at":{"type":"string","description":"RFC3339 start date-time"},
  "end_at":{"type":"string","description":"RFC3339 end date-time"},
  "position":{"type":"integer","description":"Display order position"}
},
"required":["iteration_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				IterationID string  `json:"iteration_id"`
				Title       *string `json:"title"`
				Description *string `json:"description"`
				Status      *string `json:"status"`
				StartAt     *string `json:"start_at"`
				EndAt       *string `json:"end_at"`
				Position    *int    `json:"position"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("update_iteration: parse args: %w", err)
			}
			if p.IterationID == "" {
				return "", fmt.Errorf("update_iteration: iteration_id required")
			}
			body := map[string]any{}
			if p.Title != nil {
				body["title"] = *p.Title
			}
			if p.Description != nil {
				body["description"] = *p.Description
			}
			if p.Status != nil {
				body["status"] = *p.Status
			}
			if p.StartAt != nil {
				body["start_at"] = *p.StartAt
			}
			if p.EndAt != nil {
				body["end_at"] = *p.EndAt
			}
			if p.Position != nil {
				body["position"] = *p.Position
			}
			data, status, err := rest("PATCH", "/v1/iterations/"+p.IterationID, body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("update_iteration: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func linkIterationSampleTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "link_iteration_sample",
				Description: "Associate an existing sample with an iteration in a given role (input, output, passthrough).",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "iteration_id":{"type":"string","description":"UUID of the iteration"},
  "sample_id":{"type":"string","description":"UUID of the sample to link"},
  "role":{"type":"string","enum":["input","output","passthrough"],"description":"Role of the sample in this iteration"},
  "note":{"type":"string","description":"Optional note about this link"}
},
"required":["iteration_id","sample_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				IterationID string  `json:"iteration_id"`
				SampleID    string  `json:"sample_id"`
				Role        *string `json:"role"`
				Note        string  `json:"note"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("link_iteration_sample: parse args: %w", err)
			}
			if p.IterationID == "" {
				return "", fmt.Errorf("link_iteration_sample: iteration_id required")
			}
			if p.SampleID == "" {
				return "", fmt.Errorf("link_iteration_sample: sample_id required")
			}
			body := map[string]any{"sample_id": p.SampleID}
			if p.Role != nil {
				body["role"] = *p.Role
			}
			if p.Note != "" {
				body["note"] = p.Note
			}
			data, status, err := rest("POST", "/v1/iterations/"+p.IterationID+"/samples", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("link_iteration_sample: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func unlinkIterationSampleTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "unlink_iteration_sample",
				Description: "Remove the association between a sample and an iteration.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "iteration_id":{"type":"string","description":"UUID of the iteration"},
  "sample_id":{"type":"string","description":"UUID of the sample to unlink"}
},
"required":["iteration_id","sample_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				IterationID string `json:"iteration_id"`
				SampleID    string `json:"sample_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("unlink_iteration_sample: parse args: %w", err)
			}
			if p.IterationID == "" {
				return "", fmt.Errorf("unlink_iteration_sample: iteration_id required")
			}
			if p.SampleID == "" {
				return "", fmt.Errorf("unlink_iteration_sample: sample_id required")
			}
			data, status, err := rest("DELETE", "/v1/iterations/"+p.IterationID+"/samples/"+p.SampleID, nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("unlink_iteration_sample: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func createExperimentTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "create_experiment",
				Description: "Create a new experiment in the current project. All fields except the basic identification are optional.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "method":{"type":"string","description":"Primary experimental method (e.g. EIS, XRD)"},
  "tags":{"type":"array","items":{"type":"string"},"description":"Tag labels to assign (must match project experiment tags)"},
  "result_summary":{"type":"string","description":"Brief summary of the result"},
  "iteration_id":{"type":"string","description":"UUID of the iteration to associate with"},
  "status":{"type":"string","enum":["planned","in_progress","completed","failed"]},
  "performed_at":{"type":"string","description":"RFC3339 datetime when the experiment was performed"}
},
"required":[]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				Method        string   `json:"method"`
				Tags          []string `json:"tags"`
				ResultSummary string   `json:"result_summary"`
				IterationID   string   `json:"iteration_id"`
				Status        string   `json:"status"`
				PerformedAt   string   `json:"performed_at"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("create_experiment: parse args: %w", err)
			}
			body := map[string]any{}
			if p.Method != "" {
				body["method"] = p.Method
			}
			if len(p.Tags) > 0 {
				body["tags"] = p.Tags
			}
			if p.ResultSummary != "" {
				body["result_summary"] = p.ResultSummary
			}
			if p.IterationID != "" {
				body["iteration_id"] = p.IterationID
			}
			if p.Status != "" {
				body["status"] = p.Status
			}
			if p.PerformedAt != "" {
				body["performed_at"] = p.PerformedAt
			}
			data, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/experiments", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("create_experiment: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func updateExperimentTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "update_experiment",
				Description: "Apply a partial update to an experiment. Provide only the fields to change.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "experiment_id":{"type":"string","description":"UUID of the experiment to update"},
  "method":{"type":"string","description":"Primary experimental method"},
  "tags":{"type":"array","items":{"type":"string"},"description":"Replaces all tags when provided (send full selection)"},
  "result_summary":{"type":"string","description":"Brief result summary"},
  "iteration_id":{"type":"string","description":"UUID of the iteration to associate with"},
  "status":{"type":"string","enum":["planned","in_progress","completed","failed"]},
  "performed_at":{"type":"string","description":"RFC3339 datetime"}
},
"required":["experiment_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ExperimentID  string   `json:"experiment_id"`
				Method        string   `json:"method"`
				Tags          []string `json:"tags"`
				ResultSummary *string  `json:"result_summary"`
				IterationID   string   `json:"iteration_id"`
				Status        string   `json:"status"`
				PerformedAt   string   `json:"performed_at"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("update_experiment: parse args: %w", err)
			}
			if p.ExperimentID == "" {
				return "", fmt.Errorf("update_experiment: experiment_id required")
			}
			body := map[string]any{}
			if p.Method != "" {
				body["method"] = p.Method
			}
			if p.Tags != nil {
				body["tags"] = p.Tags
			}
			if p.ResultSummary != nil {
				body["result_summary"] = *p.ResultSummary
			}
			if p.IterationID != "" {
				body["iteration_id"] = p.IterationID
			}
			if p.Status != "" {
				body["status"] = p.Status
			}
			if p.PerformedAt != "" {
				body["performed_at"] = p.PerformedAt
			}
			data, status, err := rest("PATCH", "/v1/experiments/"+p.ExperimentID, body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("update_experiment: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func linkExperimentSampleTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "link_experiment_sample",
				Description: "Associate an existing sample with an experiment in a given role (subject, reference, control, byproduct).",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "experiment_id":{"type":"string","description":"UUID of the experiment"},
  "sample_id":{"type":"string","description":"UUID of the sample to link"},
  "role":{"type":"string","enum":["subject","reference","control","byproduct"],"description":"Role of the sample in this experiment"},
  "note":{"type":"string","description":"Optional note about this link"}
},
"required":["experiment_id","sample_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ExperimentID string  `json:"experiment_id"`
				SampleID     string  `json:"sample_id"`
				Role         *string `json:"role"`
				Note         string  `json:"note"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("link_experiment_sample: parse args: %w", err)
			}
			if p.ExperimentID == "" {
				return "", fmt.Errorf("link_experiment_sample: experiment_id required")
			}
			if p.SampleID == "" {
				return "", fmt.Errorf("link_experiment_sample: sample_id required")
			}
			body := map[string]any{"sample_id": p.SampleID}
			if p.Role != nil {
				body["role"] = *p.Role
			}
			if p.Note != "" {
				body["note"] = p.Note
			}
			data, status, err := rest("POST", "/v1/experiments/"+p.ExperimentID+"/samples", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("link_experiment_sample: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func unlinkExperimentSampleTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "unlink_experiment_sample",
				Description: "Remove the association between a sample and an experiment.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "experiment_id":{"type":"string","description":"UUID of the experiment"},
  "sample_id":{"type":"string","description":"UUID of the sample to unlink"}
},
"required":["experiment_id","sample_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ExperimentID string `json:"experiment_id"`
				SampleID     string `json:"sample_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("unlink_experiment_sample: parse args: %w", err)
			}
			if p.ExperimentID == "" {
				return "", fmt.Errorf("unlink_experiment_sample: experiment_id required")
			}
			if p.SampleID == "" {
				return "", fmt.Errorf("unlink_experiment_sample: sample_id required")
			}
			data, status, err := rest("DELETE", "/v1/experiments/"+p.ExperimentID+"/samples/"+p.SampleID, nil)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("unlink_experiment_sample: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func createSampleTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "create_sample",
				Description: "Create a new physical or virtual sample in the current project.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "identifier":{"type":"string","description":"Unique identifier for the sample (e.g. EL-2024-042). Required."},
  "name":{"type":"string","description":"Human-readable name (e.g. LLZO Pellet A)"},
  "description":{"type":"string","description":"Optional description"},
  "kind":{"type":"string","enum":["precursor","electrode","cell","module","derivative","other"]},
  "status":{"type":"string","enum":["active","consumed","archived","failed"]},
  "tags":{"type":"array","items":{"type":"string"},"description":"Tag labels to assign"}
},
"required":["identifier"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				Identifier  string   `json:"identifier"`
				Name        string   `json:"name"`
				Description string   `json:"description"`
				Kind        string   `json:"kind"`
				Status      string   `json:"status"`
				Tags        []string `json:"tags"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("create_sample: parse args: %w", err)
			}
			if p.Identifier == "" {
				return "", fmt.Errorf("create_sample: identifier required")
			}
			body := map[string]any{"identifier": p.Identifier}
			if p.Name != "" {
				body["name"] = p.Name
			}
			if p.Description != "" {
				body["description"] = p.Description
			}
			if p.Kind != "" {
				body["kind"] = p.Kind
			}
			if p.Status != "" {
				body["status"] = p.Status
			}
			if len(p.Tags) > 0 {
				body["tags"] = p.Tags
			}
			data, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/samples", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("create_sample: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func updateSampleTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "update_sample",
				Description: "Apply a partial update to a sample. Provide only the fields to change.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "sample_id":{"type":"string","description":"UUID of the sample to update"},
  "name":{"type":"string","description":"New name"},
  "description":{"type":"string","description":"New description"},
  "kind":{"type":"string","enum":["precursor","electrode","cell","module","derivative","other"]},
  "status":{"type":"string","enum":["active","consumed","archived","failed"]},
  "identifier":{"type":"string","description":"New identifier"},
  "tags":{"type":"array","items":{"type":"string"},"description":"Replaces all tags when provided (send full selection)"}
},
"required":["sample_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				SampleID    string   `json:"sample_id"`
				Name        *string  `json:"name"`
				Description *string  `json:"description"`
				Kind        *string  `json:"kind"`
				Status      *string  `json:"status"`
				Identifier  *string  `json:"identifier"`
				Tags        []string `json:"tags"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("update_sample: parse args: %w", err)
			}
			if p.SampleID == "" {
				return "", fmt.Errorf("update_sample: sample_id required")
			}
			body := map[string]any{}
			if p.Name != nil {
				body["name"] = *p.Name
			}
			if p.Description != nil {
				body["description"] = *p.Description
			}
			if p.Kind != nil {
				body["kind"] = *p.Kind
			}
			if p.Status != nil {
				body["status"] = *p.Status
			}
			if p.Identifier != nil {
				body["identifier"] = *p.Identifier
			}
			if p.Tags != nil {
				body["tags"] = p.Tags
			}
			data, status, err := rest("PATCH", "/v1/samples/"+p.SampleID, body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("update_sample: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func addSampleRelationTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "add_sample_relation",
				Description: "Record a directed lineage relationship between two samples (e.g. derived_from, split_from).",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "parent_sample_id":{"type":"string","description":"UUID of the parent (source) sample"},
  "child_sample_id":{"type":"string","description":"UUID of the child (derived) sample"},
  "relation_type":{"type":"string","enum":["derived_from","split_from","assembled_into","tested_as","duplicate_of"],"description":"Type of relationship"},
  "notes":{"type":"string","description":"Optional notes"}
},
"required":["parent_sample_id","child_sample_id","relation_type"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ParentSampleID string `json:"parent_sample_id"`
				ChildSampleID  string `json:"child_sample_id"`
				RelationType   string `json:"relation_type"`
				Notes          string `json:"notes"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("add_sample_relation: parse args: %w", err)
			}
			if p.ParentSampleID == "" {
				return "", fmt.Errorf("add_sample_relation: parent_sample_id required")
			}
			if p.ChildSampleID == "" {
				return "", fmt.Errorf("add_sample_relation: child_sample_id required")
			}
			if p.RelationType == "" {
				return "", fmt.Errorf("add_sample_relation: relation_type required")
			}
			body := map[string]any{
				"child_sample_id": p.ChildSampleID,
				"relation_type":   p.RelationType,
			}
			if p.Notes != "" {
				body["notes"] = p.Notes
			}
			data, status, err := rest("POST", "/v1/samples/"+p.ParentSampleID+"/relations", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("add_sample_relation: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func createRiskTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "create_risk",
				Description: "Create a new risk entry in the current project's risk register.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "title":{"type":"string","description":"Short risk title (required)"},
  "likelihood":{"type":"string","enum":["high","med","low"],"description":"Likelihood rating"},
  "impact_headline":{"type":"string","description":"One-line impact description"},
  "impact_description":{"type":"string","description":"Detailed impact description"},
  "mitigation":{"type":"string","description":"Planned mitigation approach"},
  "plan_b":{"type":"string","description":"Contingency plan if mitigation fails"},
  "iteration_id":{"type":"string","description":"UUID of an iteration to scope this risk to (optional)"}
},
"required":["title"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				Title             string `json:"title"`
				Likelihood        string `json:"likelihood"`
				ImpactHeadline    string `json:"impact_headline"`
				ImpactDescription string `json:"impact_description"`
				Mitigation        string `json:"mitigation"`
				PlanB             string `json:"plan_b"`
				IterationID       string `json:"iteration_id"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("create_risk: parse args: %w", err)
			}
			if p.Title == "" {
				return "", fmt.Errorf("create_risk: title required")
			}
			body := map[string]any{"title": p.Title}
			if p.Likelihood != "" {
				body["likelihood"] = p.Likelihood
			}
			if p.ImpactHeadline != "" {
				body["impact_headline"] = p.ImpactHeadline
			}
			if p.ImpactDescription != "" {
				body["impact_description"] = p.ImpactDescription
			}
			if p.Mitigation != "" {
				body["mitigation"] = p.Mitigation
			}
			if p.PlanB != "" {
				body["plan_b"] = p.PlanB
			}
			if p.IterationID != "" {
				body["iteration_id"] = p.IterationID
			}
			data, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/risks", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("create_risk: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

func updateRiskTool() toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "update_risk",
				Description: "Apply a partial update to a risk entry. Provide only the fields to change.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "risk_id":{"type":"string","description":"UUID of the risk to update"},
  "title":{"type":"string","description":"New title"},
  "likelihood":{"type":"string","enum":["high","med","low"]},
  "impact_headline":{"type":"string"},
  "impact_description":{"type":"string"},
  "mitigation":{"type":"string"},
  "plan_b":{"type":"string"},
  "status":{"type":"string","description":"Risk status"}
},
"required":["risk_id"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				RiskID            string  `json:"risk_id"`
				Title             *string `json:"title"`
				Likelihood        *string `json:"likelihood"`
				ImpactHeadline    *string `json:"impact_headline"`
				ImpactDescription *string `json:"impact_description"`
				Mitigation        *string `json:"mitigation"`
				PlanB             *string `json:"plan_b"`
				Status            *string `json:"status"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("update_risk: parse args: %w", err)
			}
			if p.RiskID == "" {
				return "", fmt.Errorf("update_risk: risk_id required")
			}
			body := map[string]any{}
			if p.Title != nil {
				body["title"] = *p.Title
			}
			if p.Likelihood != nil {
				body["likelihood"] = *p.Likelihood
			}
			if p.ImpactHeadline != nil {
				body["impact_headline"] = *p.ImpactHeadline
			}
			if p.ImpactDescription != nil {
				body["impact_description"] = *p.ImpactDescription
			}
			if p.Mitigation != nil {
				body["mitigation"] = *p.Mitigation
			}
			if p.PlanB != nil {
				body["plan_b"] = *p.PlanB
			}
			if p.Status != nil {
				body["status"] = *p.Status
			}
			data, status, err := rest("PATCH", "/v1/risks/"+p.RiskID, body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("update_risk: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

// saveRiskAssessmentTool persists a completed interactive Risk Assessment
// (Phase 6 of the risk_assessment skill). In one tool call it (1) creates the RA
// report page from the supplied markdown and (2) replaces the project's (or
// iteration's) interactive AI risk rows with the failure-mode matrix, setting
// PI-review flags. A single tool call means a single approval under
// suggest_writes — far better UX than N separate create_risk calls, and the
// register population is idempotent on rerun.
func saveRiskAssessmentTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name: "save_risk_assessment",
				Description: "Finalize the Risk Assessment (Phase 6 only). Creates the RA report page AND writes every failure mode into the risk register in one call. Call this exactly once, at Phase 6, after the researcher types 'report'. Do not call create_risk/draft_page separately.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "report_markdown":{"type":"string","description":"The full RA report markdown per the skill's Output Template"},
  "report_title":{"type":"string","description":"Title for the report page, e.g. 'Risk Assessment — <Technique>'"},
  "risk_level":{"type":"string","enum":["GREEN","YELLOW","RED"],"description":"Overall triage risk level from the report"},
  "expertise":{"type":"string","enum":["Novice","Intermediate","Expert"],"description":"Assessed researcher expertise"},
  "iteration_id":{"type":"string","description":"UUID of the iteration to scope risks to (omit for project-level)"},
  "failure_modes":{"type":"array","description":"One entry per row of the Failure Mode Resolution Matrix","items":{
    "type":"object",
    "properties":{
      "title":{"type":"string","description":"Failure mode title (required)"},
      "likelihood":{"type":"string","enum":["high","med","low"],"description":"Map severity C/H->high, M->med, L->low"},
      "impact_headline":{"type":"string","description":"One-line impact"},
      "impact_description":{"type":"string","description":"Physical mechanism + instrument indicator"},
      "mitigation":{"type":"string","description":"Mitigation agreed in Phase 4-5"},
      "plan_b":{"type":"string","description":"Contingency if mitigation fails"},
      "flag_pi_review":{"type":"boolean","description":"true when triage is RED or this is an Active Threat of Critical/High severity"}
    },
    "required":["title"]
  }}
},
"required":["report_markdown","failure_modes"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				ReportMarkdown string `json:"report_markdown"`
				ReportTitle    string `json:"report_title"`
				RiskLevel      string `json:"risk_level"`
				Expertise      string `json:"expertise"`
				IterationID    string `json:"iteration_id"`
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
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("save_risk_assessment: parse args: %w", err)
			}
			if strings.TrimSpace(p.ReportMarkdown) == "" {
				return "", fmt.Errorf("save_risk_assessment: report_markdown required")
			}
			if len(p.FailureModes) == 0 {
				return "", fmt.Errorf("save_risk_assessment: at least one failure_mode required")
			}

			// 1. Create the report page. Prepend the title as a level-1 heading
			// when the markdown doesn't already open with one.
			md := p.ReportMarkdown
			if title := strings.TrimSpace(p.ReportTitle); title != "" && !strings.HasPrefix(strings.TrimSpace(md), "#") {
				md = "# " + title + "\n\n" + md
			}
			blocks := buildMarkdownBlocks(md)
			blocksJSON, err := json.Marshal(blocks)
			if err != nil {
				return "", fmt.Errorf("save_risk_assessment: marshal blocks: %w", err)
			}
			pageBody := map[string]any{
				"parent_type": "project",
				"parent_id":   injectProjectID,
				"blocks":      json.RawMessage(blocksJSON),
			}
			pageData, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/pages", pageBody)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("save_risk_assessment: create page: status %d: %s", status, string(pageData))
			}

			// 2. Populate the risk register (replaces prior interactive AI rows).
			modes := make([]map[string]any, 0, len(p.FailureModes))
			for _, fm := range p.FailureModes {
				modes = append(modes, map[string]any{
					"title":              fm.Title,
					"likelihood":         fm.Likelihood,
					"impact_headline":    fm.ImpactHeadline,
					"impact_description": fm.ImpactDescription,
					"mitigation":         fm.Mitigation,
					"plan_b":             fm.PlanB,
					"flag_pi_review":     fm.FlagPIReview,
				})
			}
			raBody := map[string]any{"failure_modes": modes}
			if p.IterationID != "" {
				raBody["iteration_id"] = p.IterationID
			}
			raData, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/risk-assessment", raBody)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("save_risk_assessment: save risks: status %d: %s", status, string(raData))
			}

			return fmt.Sprintf(`{"page":%s,"risks":%s}`, string(pageData), string(raData)), nil
		},
	}
}

func createApprovalRequestTool(injectProjectID string) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "create_approval_request",
				Description: "Create a new approval request in the current project.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "description":{"type":"string","description":"Description of what is being approved (required)"},
  "iteration_id":{"type":"string","description":"UUID of the iteration this approval is for (optional)"},
  "ai_review":{"type":"string","description":"AI-generated review summary (optional)"},
  "recipient_user_ids":{"type":"array","items":{"type":"string"},"description":"UUIDs of users who should review this request"}
},
"required":["description"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, rest restCallFn) (string, error) {
			var p struct {
				Description      string   `json:"description"`
				IterationID      string   `json:"iteration_id"`
				AIReview         string   `json:"ai_review"`
				RecipientUserIDs []string `json:"recipient_user_ids"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("create_approval_request: parse args: %w", err)
			}
			if p.Description == "" {
				return "", fmt.Errorf("create_approval_request: description required")
			}
			body := map[string]any{"description": p.Description}
			if p.IterationID != "" {
				body["iteration_id"] = p.IterationID
			}
			if p.AIReview != "" {
				body["ai_review"] = p.AIReview
			}
			if len(p.RecipientUserIDs) > 0 {
				body["recipient_user_ids"] = p.RecipientUserIDs
			}
			data, status, err := rest("POST", "/v1/projects/"+injectProjectID+"/approval-requests", body)
			if err != nil {
				return "", err
			}
			if status < 200 || status >= 300 {
				return "", fmt.Errorf("create_approval_request: status %d: %s", status, string(data))
			}
			return string(data), nil
		},
	}
}

// updatePageTool writes a new revision for a page.
//
// The page endpoint (PUT /v1/pages/{id}) uses optimistic concurrency via
// If-Match (ETag = current revision UUID). Since restCallFn discards response
// headers, we accept a restCallWithHeadersFn so the tool can do a GET first to
// capture the ETag and then PUT with If-Match. If restHdrs is nil (e.g. during
// schema-only enumeration), the tool is still registered but will return an
// error at execution time.
func updatePageTool(restHdrs restCallWithHeadersFn) toolDef {
	return toolDef{
		IsWrite: true,
		Tool: Tool{
			Type: "function",
			Function: FunctionDef{
				Name:        "update_page",
				Description: "Write a new revision to an existing page. Automatically fetches the current ETag and sends it as If-Match. Provide blocks as a JSON array in BlockNote format.",
				Parameters: json.RawMessage(`{
"type":"object",
"properties":{
  "page_id":{"type":"string","description":"UUID of the page to update"},
  "blocks":{"type":"array","description":"New BlockNote content blocks (JSON array)"},
  "candidate":{"type":"boolean","description":"If true, save as a candidate draft for approval rather than advancing the current revision"}
},
"required":["page_id","blocks"]}`),
			},
		},
		Handler: func(ctx context.Context, args json.RawMessage, _ restCallFn) (string, error) {
			if restHdrs == nil {
				return "", fmt.Errorf("update_page: header-capable REST caller not available")
			}
			var p struct {
				PageID    string          `json:"page_id"`
				Blocks    json.RawMessage `json:"blocks"`
				Candidate bool            `json:"candidate"`
			}
			if err := json.Unmarshal(args, &p); err != nil {
				return "", fmt.Errorf("update_page: parse args: %w", err)
			}
			if p.PageID == "" {
				return "", fmt.Errorf("update_page: page_id required")
			}
			if len(p.Blocks) == 0 {
				return "", fmt.Errorf("update_page: blocks required")
			}

			// Step 1: GET the page to capture the ETag.
			getData, getStatus, getHdrs, err := restHdrs("GET", "/v1/pages/"+p.PageID, nil, nil)
			if err != nil {
				return "", fmt.Errorf("update_page: get page: %w", err)
			}
			if getStatus < 200 || getStatus >= 300 {
				return "", fmt.Errorf("update_page: get page status %d: %s", getStatus, string(getData))
			}
			etag := getHdrs.Get("ETag")
			if etag == "" {
				return "", fmt.Errorf("update_page: server returned no ETag for page %s", p.PageID)
			}

			// Step 2: PUT with If-Match.
			body := map[string]any{
				"blocks":    p.Blocks,
				"candidate": p.Candidate,
			}
			putData, putStatus, _, err := restHdrs("PUT", "/v1/pages/"+p.PageID, body, map[string]string{"If-Match": etag})
			if err != nil {
				return "", fmt.Errorf("update_page: put: %w", err)
			}
			if putStatus < 200 || putStatus >= 300 {
				return "", fmt.Errorf("update_page: put status %d: %s", putStatus, string(putData))
			}
			return string(putData), nil
		},
	}
}
