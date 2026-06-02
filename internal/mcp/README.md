# internal/mcp — MCP server + /llms.txt generator

This package implements **Track F3** (MCP server) and **Track F4** (/llms.txt) for the lab platform.

## Tools exposed

All tools run under the caller's own PAT scopes — no scope elevation occurs in the MCP layer.

### Projects

| Tool | Description | Required args |
|---|---|---|
| `list_projects` | List projects for the caller. Pass `workspace_id` to scope to one workspace, or omit to list all accessible workspaces. | — |
| `read_project` | Get a single project by ID. | `project_id` |
| `search_project_content` | Fan-out keyword search across samples, experiments, and artifacts in a project. | `project_id` |

### Iterations

| Tool | Description | Required args |
|---|---|---|
| `list_iterations` | List iterations in a project ordered by position. | `project_id` |
| `read_iteration` | Get a single iteration by ID. | `iteration_id` |
| `list_iteration_samples` | List samples linked to an iteration (roles, notes). | `iteration_id` |
| `list_iteration_risks` | List risks scoped to an iteration. | `iteration_id` |
| `create_iteration` | Create a new iteration within a project. | `project_id`, `title` |
| `update_iteration` | Partially update an iteration (title, description, status, dates, position). | `iteration_id` |
| `delete_iteration` | Permanently delete an iteration and its sample associations. | `iteration_id` |
| `link_iteration_sample` | Associate a sample with an iteration in a given role. | `iteration_id`, `sample_id` |
| `unlink_iteration_sample` | Remove the association between a sample and an iteration. | `iteration_id`, `sample_id` |

### Experiments

| Tool | Description | Required args |
|---|---|---|
| `list_experiments` | List experiments in a project. | `project_id` |
| `read_experiment` | Get a single experiment (including linked samples). | `experiment_id` |
| `list_experiment_tags` | List project-defined experiment tag labels. | `project_id` |
| `create_experiment` | Create a new experiment run within a project. | `project_id` |
| `update_experiment` | Partially update an experiment (method, parameters, result_summary, status, tags, etc.). | `experiment_id` |
| `link_experiment_sample` | Associate a sample with an experiment in a given role. | `experiment_id`, `sample_id` |
| `unlink_experiment_sample` | Remove the association between a sample and an experiment. | `experiment_id`, `sample_id` |

### Samples

| Tool | Description | Required args |
|---|---|---|
| `list_samples` | List samples in a project. | `project_id` |
| `read_sample` | Get a single sample (all properties, status). | `sample_id` |
| `get_sample_lineage` | Get the ancestor/descendant lineage graph for a sample. | `sample_id` |
| `list_sample_tags` | List project-defined sample tag labels. | `project_id` |
| `create_sample` | Create a new sample within a project. | `project_id`, `identifier` |
| `update_sample` | Partially update a sample (name, status, properties, tags, etc.). | `sample_id` |
| `add_sample_relation` | Record a directed lineage relation between two samples. | `sample_id`, `child_sample_id`, `relation_type` |

### Risks

| Tool | Description | Required args |
|---|---|---|
| `list_risks` | List risks in a project ordered by seq. | `project_id` |
| `list_iteration_risks` | List risks scoped to an iteration. | `iteration_id` |
| `create_risk` | Create a new risk entry within a project. | `project_id`, `title` |
| `update_risk` | Partially update a risk (title, likelihood, impact, mitigation, status, PI review flag). | `risk_id` |

### Pages

| Tool | Description | Required args |
|---|---|---|
| `list_pages` | List page summaries for a project. Supports optional `parent_type` / `parent_id` filters. | `project_id` |
| `read_page` | Get a page and its current content blocks. | `page_id` |
| `create_page` | Create a new page attached to a parent entity. | `project_id`, `parent_type`, `parent_id`, `blocks` |
| `update_page` | Write a new revision for a page. Auto-fetches the current ETag via GET; pass `if_match` explicitly for strict optimistic concurrency. | `page_id`, `blocks` |

### Approvals

| Tool | Description | Required args |
|---|---|---|
| `list_approvals` | List approval requests for a project (newest-first). | `project_id` |
| `create_approval_request` | Create a new approval request for a project. | `project_id`, `description` |

### Artifacts & Events

| Tool | Description | Required args |
|---|---|---|
| `list_artifacts` | List artifacts (uploaded files) in a project. | `project_id` |
| `list_events` | List calendar events in a project. | `project_id` |

## Auth bridging

The MCP client must provide the caller's PAT as:

```
Authorization: Bearer pat_<your-token>
```

The SSE transport layer extracts this header via `WithSSEContextFunc` and stores the raw token in the request context (`bearerKey{}`). Every tool handler reads the token from context and forwards it as `Authorization: Bearer <token>` on the outbound request to the local REST backend (e.g. `http://127.0.0.1:8080/v1/...`). This means all existing middleware — auth, audit, rate-limiting, permission checks — applies identically; the MCP layer adds no bypass.

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
