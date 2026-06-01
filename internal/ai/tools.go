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

// allTools returns the full list of tool definitions (read + write).
// The projectID and workspaceID are injected so tools know their scope.
func allTools(projectID, workspaceID string) []toolDef {
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
		draftPageTool(projectID),
		updateIterationStatusTool(),
		createReminderTool(projectID),
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
func dispatchTool(ctx context.Context, name string, argsJSON string, projectID, workspaceID string, rest restCallFn) (string, bool, error) {
	for _, td := range allTools(projectID, workspaceID) {
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
				Type   string `json:"type"`
				Text   string `json:"text"`
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
