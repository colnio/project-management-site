# internal/mcp — MCP server + /llms.txt generator

This package implements **Track F3** (MCP server) and **Track F4** (/llms.txt) for the lab platform.

## Tools exposed (read-only)

| Tool | Description | Required args |
|---|---|---|
| `list_projects` | List projects for the caller. Pass `workspace_id` to scope to one workspace, or omit to list all accessible workspaces. | — |
| `search_project_content` | Fan-out keyword search across samples, experiments, and artifacts in a project. | `project_id` |
| `list_samples` | List samples in a project. | `project_id` |
| `read_sample` | Get a single sample (all properties, status). | `sample_id` |
| `get_sample_lineage` | Get the ancestor/descendant lineage graph for a sample. | `sample_id` |
| `list_experiments` | List experiments in a project. | `project_id` |
| `read_experiment` | Get a single experiment (including linked samples). | `experiment_id` |
| `read_page` | Get a page and its current content blocks. | `page_id` |
| `list_artifacts` | List artifacts (uploaded files) in a project. | `project_id` |

Write tools (create/update/delete) are deliberately omitted — they are gated by AI autonomy config (Track G).

## Auth bridging

The MCP client must provide the caller's PAT as:

```
Authorization: Bearer pat_<your-token>
```

The SSE transport layer extracts this header via `WithSSEContextFunc` and stores the raw token in the request context (`bearerKey{}`). Every tool handler reads the token from context and forwards it as `Authorization: Bearer <token>` on the outbound `GET` to the local REST backend (e.g. `http://127.0.0.1:8080/v1/...`). This means all existing middleware — auth, audit, rate-limiting, permission checks — applies identically; the MCP layer adds no bypass.

HTTP error codes from the REST backend are mapped to MCP tool errors:
- 401 → tool error with "Unauthorized" message
- 403 → tool error with "Forbidden" message
- 404 → tool error with "Not Found" message
- other non-2xx → tool error with status code and body

## Pointing an MCP client at the server

```
SSE endpoint:      http://localhost:8080/mcp/sse
Message endpoint:  http://localhost:8080/mcp/message
```

Example (any MCP-compatible client):
```json
{
  "mcpServers": {
    "lab-platform": {
      "url": "http://localhost:8080/mcp/sse",
      "headers": {
        "Authorization": "Bearer pat_your_token_here"
      }
    }
  }
}
```

## /llms.txt

`LLMSText(oapi *huma.OpenAPI) string` generates the agent-discovery document from the live OpenAPI spec. It is called after all modules register their routes, so it reflects every endpoint at runtime. Served at `GET /llms.txt`.

## Public API

```go
// NewServer constructs the MCP server.
// restBaseURL: "http://127.0.0.1:<port>"
func NewServer(restBaseURL string, log *slog.Logger) *Server

// Handler returns the http.Handler for chi.Mount("/mcp", ...).
func (s *Server) Handler() http.Handler

// LLMSText generates the /llms.txt body from the live OpenAPI spec.
func LLMSText(oapi *huma.OpenAPI) string
```

Wiring in `cmd/api/main.go`:
```go
srv.MountLLMSTxt(labmcp.LLMSText(srv.API.OpenAPI()))
mcpSrv := labmcp.NewServer("http://127.0.0.1:"+cfg.Port, logger)
srv.Router.Mount("/mcp", mcpSrv.Handler())
```
