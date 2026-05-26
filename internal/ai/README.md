# internal/ai — AI Agentic-Chat Backend (Track G1+G2+G5)

## Provider boundary

The AI model client is contained in **`client.go`** only. To swap providers, change `NewHTTPClient` — the rest of the codebase sees only the `Client` interface. Both supported providers (GlowByte/litellm and OpenRouter) are OpenAI-compatible (`POST {APIBase}/chat/completions`).

Config is loaded from `aiconf.local.json` (gitignored) via `LoadProvider()`. The active provider's token is **never logged**. If the config file is absent or unparseable, `LoadProvider` returns `nil` and the service boots in disabled mode (all AI endpoints return 503 `ai.unavailable`).

## Internal-token → REST tool pattern

When a streaming chat session starts:

1. `auth.MintInternalAIToken(ctx, userID, convID, scopes, nil)` creates a short-lived `iai_` token (15 min TTL) bound to the conversation.
2. Each tool call uses `makeRESTCaller(restBase, iaiToken)` — a `func(method, path, body) ([]byte, int, error)` that calls `http://127.0.0.1:{port}/v1/...` with `Authorization: Bearer iai_...`.
3. The auth middleware resolves `iai_` tokens to a `Principal` with `ViaAIConversationID` set, so every REST call is fully audited as the user, not the AI.
4. After the stream completes (or on error), `RevokeInternalAITokens(ctx, convID)` is called.

This is identical to the MCP server pattern in `internal/mcp/server.go`.

## Autonomy gating

Table `autonomy_configs(scope, scope_id, mode, allowed_tools)` stores workspace- and project-level configs.

`ResolveAutonomy(ctx, pool, wsID, projID)` returns the effective `(mode, allowedTools)`:
- Project config overrides workspace, but **project is clamped to workspace** (project may never be more permissive than workspace).
- Default: `read_only` if neither is configured.

Modes:
| Mode | Read tools | Write tools |
|------|-----------|-------------|
| `read_only` | Always execute | Refused |
| `suggest_writes` | Always execute | Proposed (status=proposed in ai_tool_calls) |
| `auto_routine` | Always execute | Whitelisted tools execute; `draft_page` always proposed |
| `full` | Always execute | Whitelisted tools execute; others proposed |

`IsWriteAllowed(mode, allowedTools, toolName)` returns `(execute bool, propose bool)`.

## Metering and spend caps

After each model call, `recordUsage(ctx, pool, wsID, projID, userID, feature, model, usage)` inserts an `ai_usage_records` row. Cost is computed as `(prompt+completion)/1000 * pricePer1k` (default 0.0 USD for dev; the real signal is token counts).

Before each model call, `checkSpendCap(ctx, pool, wsID)` sums this month's USD for the workspace. If >= cap (default $50/month), the request is refused with `ai.spend_cap_exceeded`. A soft warning is emitted at 80% of cap as an SSE `warn` event.

## Conversation and usage schema

Migrations 00110–00114:
- `autonomy_configs` — scope/mode/allowed_tools
- `ai_conversations` — chat sessions tied to a project and user
- `ai_messages` — ordered messages with tool_calls jsonb
- `ai_tool_calls` — tool invocations (proposed/approved/executed/rejected)
- `ai_usage_records` — per-call token usage and cost

## SSE chat loop

`POST /v1/ai/conversations/{id}/messages` (chi route, not huma):

1. Parse body `{content}`.
2. Load conversation → authorize project (RoleViewer).
3. Check spend cap.
4. Resolve autonomy.
5. Mint iai_ token → build REST caller.
6. Load message history from DB.
7. Persist user message.
8. Set SSE headers; loop up to 5 tool rounds:
   a. `client.ChatStream(ctx, chatReq)` — stream text deltas as `event: token` SSE events.
   b. On tool_calls: emit `event: tool_call`; execute or propose based on autonomy; emit `event: tool_result`.
   c. Append tool results to history; continue if more tool rounds needed.
9. Persist final assistant message.
10. Meter usage (each round).
11. Revoke iai_ token.
12. Emit `event: done`.

SSE event types: `token`, `tool_call`, `tool_result`, `done`, `error`, `warn`.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/projects/{id}/ai/conversations` | user, RoleViewer | Create conversation |
| `GET` | `/v1/projects/{id}/ai/conversations` | user, RoleViewer | List conversations |
| `GET` | `/v1/ai/conversations/{id}` | user, RoleViewer | Get messages |
| `POST` | `/v1/ai/conversations/{id}/messages` | user, RoleViewer | Streaming chat (SSE) |
| `POST` | `/v1/ai/conversations/{id}/tool-calls/{tcid}/approve` | user, RoleEditor | Approve proposed write |
| `POST` | `/v1/ai/conversations/{id}/tool-calls/{tcid}/reject` | user, RoleEditor | Reject proposed write |
| `GET/PUT` | `/v1/workspaces/{id}/autonomy` | user, workspace owner | Workspace autonomy |
| `GET/PUT` | `/v1/projects/{id}/autonomy` | user, RoleOwner | Project autonomy |

## How to run the live smoke test

```bash
# 1. Ensure aiconf.local.json exists with a live provider key.
# 2. Start the server:
go build -o /tmp/apibin ./cmd/api && /tmp/apibin &
sleep 5

# 3. Login.
ACCESS=$(curl -sf -X POST localhost:8080/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@halide-lab.org","password":"devpassword"}' | jq -r '.access_token')

# 4. Get workspace + create project.
WS=$(curl -sf -H "Authorization: Bearer $ACCESS" localhost:8080/v1/workspaces | jq -r '.[0].id')
PROJ=$(curl -sf -X POST -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' -d '{"name":"smoke","visibility":"workspace"}' \
  "localhost:8080/v1/workspaces/$WS/projects" | jq -r '.id')

# 5. Create conversation.
CONV=$(curl -sf -X POST -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' -d '{"title":"smoke"}' \
  "localhost:8080/v1/projects/$PROJ/ai/conversations" | jq -r '.id')

# 6. Stream a message (one short call).
curl -N -X POST -H "Authorization: Bearer $ACCESS" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Reply with exactly three words."}' \
  "localhost:8080/v1/ai/conversations/$CONV/messages"

# 7. Clean up.
pkill -f /tmp/apibin
```

## Notes on deferred depth

- `suggest_writes` approval depth: the `POST .../approve` endpoint re-executes the tool via a freshly-minted iai_ token. Full approval-queue UI (listing proposed calls, bulk approve) is deferred.
- `flag_for_review` write tool: currently recorded as a proposed audit entry + reminder event pattern; a dedicated workflow step is deferred.
- Stream resume / checkpoint on disconnect: not implemented (stateless SSE per request).

## Workflows (Tracks G3 + G4)

Workflow definitions live as JSON files in the repo-root `workflows/` directory and are embedded at compile time via the `workflows` package (`workflows/embed.go`). All definitions are loaded at boot into an in-memory registry.

### Workflow JSON format

```json
{
  "key": "battery_safety_risk_v1",
  "title": "...",
  "description": "...",
  "scope": "system",
  "steps": [...],
  "outputSchema": { "overall_rating": "int", ... }
}
```

### Step types

| Type | Behaviour |
|------|-----------|
| `gather_context` | Fetches data from REST endpoints via a run-scoped `iai_` token. Sources: `sample`, `sample_lineage`, `recent_experiments`, `related_artifacts`, `recent_iteration_pages`. Assembles a prose context blob. No model call. |
| `ai_question` | Calls `client.Chat` at temperature 0.1 with the context + step prompt. If `expects` is set, instructs the model to answer as JSON and parses + validates. On parse failure, retries once with a stricter instruction; if the retry also fails, stores the raw text. |
| `ai_synthesis` | Calls `client.Chat` to produce (a) a markdown summary and (b) a JSON object conforming to `outputSchema` inside `<json>...</json>` tags. Validates each field against its type hint; on failure retries once then falls back to a computed output. |

### PI-flag logic

A run is flagged for PI review if **either**:
- `output.flagged_for_PI_review == true` (as returned by the synthesis model), or
- `output.overall_rating >= 4`.

When flagged:
1. An `ai.workflow_pi_flag` audit entry is recorded.
2. An email is sent via SMTP (cfg.SMTPHost:cfg.SMTPPort, from cfg.SMTPFrom) to all `owner`-role members of the workspace. Email failures are logged and do **not** fail the run.

### Result-page rendering

After synthesis, `RunWorkflow` POSTs to `POST /v1/projects/{projectID}/pages` via the run-scoped internal token with `parent_type`/`parent_id` set to the most specific target entity (sample > experiment > project). Blocks are built from the synthesis markdown (headings, bullets, paragraphs). The resulting page ID is stored in `result_page_id`.

### Metering

Each `ai_question` and `ai_synthesis` call inserts a row into `ai_usage_records` with `feature = 'workflow'`. A spend-cap check is performed before every model call; if the workspace is over cap the run is failed with `ai.spend_cap_exceeded`.

### Execution model

Runs are **synchronous** for v1 — `POST /v1/ai/workflows/{key}/run` blocks until the run completes. Async execution via River workers is deferred.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/ai/workflows` | any authenticated user | List workflow definitions (key/title/description/scope) |
| `POST` | `/v1/ai/workflows/{key}/run` | user, RoleEditor on project | Run a workflow synchronously; returns the completed `WorkflowRun` |
| `GET` | `/v1/ai/runs/{id}` | user, RoleViewer on project | Fetch a run by ID |

### Schema (migration 00115)

`ai_workflow_runs(id, workflow_key, project_id, sample_id, experiment_id, started_by, status, step_results jsonb, output jsonb, result_page_id, error, created_at, updated_at)`

Status values: `running` → `completed` | `failed`.
