# AI Workflows — End-to-End Testing Report

_Date: 2026-05-31 · Branch: `ai-workflow-e2e-testing` · Tester: Claude (Opus 4.8)_

This report documents an end-to-end shakeout of every AI feature in the platform against a
**real local model**, the prompt-engineering done to push risk-assessment quality, five new
workflows added to exercise the engine, and the bugs/limits found along the way. The goal was
"can a user actually use this, and is the output good?" — verified backend-first and then
through the live UI with Playwright.

> TL;DR — All three AI modes work end-to-end against a local `qwen2.5:14b-instruct`. Risk-
> assessment quality is **genuinely good** (evidence-grounded, calibrated) for the synchronous
> workflows and the one-shot risk review. The agentic **chat** mode is functional but
> **unreliable on the local model** (inconsistent tool-calling). Four real bugs were found and
> fixed; the remaining limits are small-model/Ollama ceilings that a hosted API in production
> will remove.

---

## 1. Test environment

| Piece | Value |
|---|---|
| Model | `qwen2.5:14b-instruct` (Q4, ~9 GB, 32k context) via **Ollama** |
| Host | Apple Silicon, 32 GB RAM |
| Provider config | `aiconf.local.json` → `http://localhost:11434/v1` |
| API / Web / DB | Go API `:8080`, Vite `:5173`, Postgres `:5432` (all local) |
| Auth | dev admin `dev@graphene-lab.org`; scripted via a scoped PAT |

**Seed data** (so `gather_context` had real content): one Li-ion/graphene battery project —
6 experiments (formation cycling, rate capability, EIS, CV, long-cycle fade with a **real
safety incident** at cycle 187, electrolyte screening), 4 samples + a parent→child lineage,
3 lab-notebook pages, and 3 human-authored risks (thermal runaway, electrolyte/HF, dendrites).

### Limit tuning (committed, prod-safe)
The non-streaming provider timeout (30 s) and workflow run timeout (150 s) are too tight for a
local 14B doing 1–2k-token generations. Both were made env-configurable so **production
(hosted API) keeps the original defaults**:

- `AI_OUTBOUND_TIMEOUT_SECONDS=240`, `AI_WORKFLOW_TIMEOUT_SECONDS=900` (set in `.env` for tests).
- Context-truncation budgets raised 3000→8000 (questions) / 2000→6000 (synthesis) for the 32k model.

---

## 2. The three AI "modes" — results

### Mode A — Synchronous risk workflows  ✅ good quality
`gather_context → parallel ai_question (temp 0.1) → ai_synthesis (temp 0.2, <json>) → result
page + risk-register upsert + PI-flag`.

| Workflow | Latency | Overall | Notable |
|---|---|---|---|
| project_risk_v1 (baseline) | 120–134 s | 3 | grounded, but uniform 3s, no summary |
| project_risk_v1 (tuned) | 120 s | mixed | summary + evidence (voltage plateaus, SEI growth) |
| battery_safety_risk_v1 | 137 s | 4 (PI) | correctly flagged electrolyte handling worst |
| experimental_risk_v1 | 137 s | 4 (PI) | energy/reagent/procedural high |
| experiment_design_critique_v1 | 118 s | 4 (PI) | **calibrated**: reproducibility 1, sample_size 4 |
| next_iteration_plan_v1 | 114 s | 3 | grounded in RSEI/voltage anomalies; `proposed_goals` |
| data_quality_audit_v1 | 107 s | 4 (PI) | calibration_records 4; `completeness_score` 85 |
| safety_readiness_checklist_v1 | 111 s | 3 (PI) | `go_no_go` false; training_readiness 4 |
| sample_lineage_integrity_v1 | 80 s | 2 | correctly **low** — did not over-rate |

Quality is grounded in the seeded data (it cites the cycle-187 incident, RSEI growth, HF risk,
etc.), ratings are differentiated, and PI-flagging fires appropriately.

### Mode B — One-shot risk review  ✅ excellent
`POST /v1/projects/{id}/ai/risk-review` — 42 s. Correctly summarized the register (both human
and AI risks), ranked thermal-runaway + HF as top concerns, and produced a coherent readiness
recommendation.

### Mode C — Agentic chat (SSE + tools)  ⚠️ works, but unreliable on local model
- **read_only** mode auto-executes read tools (no approval). A backend run did 3 tool calls
  (`list_experiments`, `search_project_content`) and produced a correct analysis identifying
  EX-5's safety incident as the highest risk.
- **Autonomy** GET/PUT works; `suggest_writes` correctly offers write tools; approve/reject
  logic is unit-tested.
- **Usage metering** works and is shown in the UI (`$0.0000 today · 0% of $50/mo`; $0 because
  dev pricing is free).
- **Limitations** (see §4) — the local model is inconsistent at emitting structured tool calls.

---

## 3. Prompt engineering & engine improvements

- **Schema-driven synthesis** (`runAISynthesis`): previously the synthesis prompt hard-coded the
  risk schema, so *every* workflow emitted the same shape and a workflow's declared
  `outputSchema` was ignored. Now the JSON instruction is built from each workflow's
  `outputSchema` via `describeSchema()`, with calibrated guidance for known fields. This is what
  lets the 5 new workflows emit custom fields (`open_questions`, `go_no_go`,
  `completeness_score`, `proposed_goals`).
- **`summary` field** added to the synthesis contract — the WorkflowRunner UI already reads
  `output.summary` (it was never populated) and the risk register uses it for impact text.
- **Calibrated prompts** — every `ai_question` now embeds an anchored 1–5 rubric (1 negligible →
  5 critical/blocking) and an explicit "cite specific evidence from context" instruction. This
  moved project_risk off uniform 3s and produced discriminating ratings in the new workflows.
- **Chat prompt hardening** — restate `project_id` as a plain value for tool calls (the model
  copied the literal `<project_id>` XML tag), and pin the response language to English.

The 5 new workflows: `experiment_design_critique_v1`, `next_iteration_plan_v1`,
`data_quality_audit_v1`, `safety_readiness_checklist_v1`, `sample_lineage_integrity_v1` — chosen
to exercise different `gather_context` sources (incl. `sample`/`sample_lineage`) and output shapes.

---

## 4. Bugs found & fixed

| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | **High** | `risk.UpsertFromWorkflow` INSERT had 13 VALUES for 12 columns (stray `$9`, dangling `$11`) → **every** AI workflow run failed register population (`SQLSTATE 42601`). | Realigned placeholders (`fix(risk)`). AI risks now persist. |
| 2 | **High** | `WorkflowRunner` `RatingBadge` called `rating.toLowerCase()` on the integer ratings the workflow emits → **crashes the result panel** (and otherwise rendered badges muted). | `resolveRating()` handles numbers→colors + `n/5` display (`fix(web)`). |
| 3 | **High** | AI workflow **result pages rendered completely blank** — `buildMarkdownBlocks` emits `heading_3`/`bulleted_list_item`, which aren't BlockNote schema types, so BlockNote silently dropped them. | `normalizeBlocks` now maps legacy types → `heading`+`props.level` / `bulletListItem` (`fix(web)`). Verified the report renders. |
| 4 | Medium | Chat: model echoed the literal `<project_id>` XML tag as a tool argument; language drift mid-conversation. | Plain-text project_id + English pin in chat system prompt (`fix(ai)`). |

All four are committed on the branch. Touched-package tests pass (`internal/risk`, 128 web
tests). See §6 for the unrelated pre-existing failures.

---

## 5. Limitations / architectural ceiling (local model)

These are **expected** small-model + Ollama limits; production targets a hosted API and will not
hit them. Documented per the testing brief ("ok if not achievable with this architecture").

1. **Inconsistent tool-calling in chat.** `qwen2.5:14b` via Ollama sometimes emits a tool call
   as **structured** `tool_calls` (executed correctly), and other times as **leaked text** in the
   Qwen/Hermes `<tool_call>{…}</tool_call>` format (raw JSON shown to the user, tool *not*
   executed) — observed live in the UI (screenshot `e2e-06`). For write tools it frequently
   **narrates** intent ("Let me use the draft_page tool…") without emitting the call, or returns
   an empty turn. The agentic chat is therefore not dependable on this local stack.
   - _Recommendation:_ use a hosted model with robust function-calling in prod; optionally add a
     server-side fallback parser in `sse.go` that extracts inline `<tool_call>` blocks from the
     streamed content and dispatches them (would harden any local-model deployment).
2. **Latency vs. the 30 s default.** A 14B synthesis (2048 tokens) exceeds the stock 30 s
   non-streaming timeout; we raised it for testing. Hosted APIs are fast enough that the default
   is fine.
3. **Language drift** in multi-round chat (mitigated by the English pin, but a small-model trait).
4. **Register overwrite semantics.** `UpsertFromWorkflow` deletes *all* prior AI risks for the
   project before inserting — so running a sample-scoped workflow overwrites the project-level AI
   risks. Worth revisiting (scope AI-risk replacement by workflow key, or attach to the run).
5. **Register detail.** AI category-risks share one joined mitigation string and an empty
   per-category impact description. Fine, but per-category detail would be richer.

---

## 6. Pre-existing issues (NOT introduced here)

- `go test ./internal/ai/` has **2 pre-existing failures** that fail identically on the
  pristine pre-change code: `TestHandleMessageStream_RequiresWriteAIScope` (scope check not
  rejecting in the test harness) and `TestInternalTokenMintedAndRevoked` ("account awaiting
  approval" test-DB state). Out of scope for this task.
- `go run ./cmd/seed` demo data aborts on a meeting insert (`inconsistent types deduced for
  parameter $4`, `SQLSTATE 42P08`) — the dev user is still created.

---

## 7. End-to-end UI verification (Playwright)

Driven live via the Playwright MCP browser; screenshots in the repo root:

- `e2e-01-workflow-runner.png` — all 8 workflows in the picker.
- `e2e-02-workflow-result.png` — result panel: **Overall 4/5**, **PI Review Required**, summary,
  colored category badges, mitigations (validates bug #2 fix).
- `e2e-03-result-page.png` / `e2e-04-result-page-fixed.png` — report page **before/after** the
  block-type fix (blank → renders heading + synthesis) (validates bug #3 fix).
- `e2e-05-risk-register.png` — Risk Register "7 / 4 PI review": 3 human + **4 AI-tagged** risks.
- `e2e-06-chat-panel.png` — chat panel + usage metering; shows the tool-call-leak limitation.

---

## 8. Recommendations for production

1. **Use a hosted model** (e.g. Claude) for the agentic chat — resolves tool-calling reliability,
   language drift, and latency in one move. Keep the env timeout defaults (30 s / 150 s).
2. **Optionally** add the inline-`<tool_call>` fallback parser so a local model remains usable.
3. Keep the schema-driven synthesis + `summary` contract (already merged) — it makes the workflow
   engine genuinely general-purpose.
4. Revisit `UpsertFromWorkflow` replacement scope and per-category risk detail.

## Commits on this branch
```
test(ai): env-gate provider timeouts and bump context budgets for local models
fix(risk): correct column/placeholder mismatch in workflow risk upsert
feat(ai): schema-driven synthesis + 5 new workflows + calibrated prompts
fix(web): render numeric workflow ratings instead of crashing/muting
fix(ai): harden chat system prompt for small local models
fix(web): render legacy block types so AI result pages aren't blank
```
