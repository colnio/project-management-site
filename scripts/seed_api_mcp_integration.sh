#!/usr/bin/env bash
# Seed a realistic API/MCP integration project into the local lab PM stack.
#
# Usage:
#   ./scripts/seed_api_mcp_integration.sh
#   LAB_PM_PAT=pat_... ./scripts/seed_api_mcp_integration.sh
#   ./scripts/seed_api_mcp_integration.sh --skip-mcp

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8080}"
APP_BASE_URL="${APP_BASE_URL:-http://localhost:5173}"
WORKSPACE_NAME="${WORKSPACE_NAME:-}"
PROJECT_NAME="${PROJECT_NAME:-Project Management Site - Customer Zero API/MCP Shakeout}"
WORK_DIR="${WORK_DIR:-/private/tmp/api-mcp-integration-assets}"
SUMMARY_PATH="${SUMMARY_PATH:-/private/tmp/api-mcp-integration-summary.json}"
RUN_MCP_CHECK=1

usage() {
  cat <<'EOF'
Seed the API + PAT + MCP integration dataset for the local lab PM stack.

Options:
  --skip-mcp                 Skip the live MCP readback check.
  --api-base-url URL         Override the API base URL (default: http://127.0.0.1:8080; must match server bind address to avoid MCP SSE origin mismatch).
  --app-base-url URL         Override the app base URL (default: http://127.0.0.1:5173).
  --workspace-name NAME      Target a specific workspace by name or slug.
  --work-dir PATH            Override the generated asset directory.
  --summary-path PATH        Override the summary JSON output path.
  -h, --help                 Show this help text.

Environment:
  LAB_PM_PAT                 Required PAT. If unset, the script prompts for it.
  WORKSPACE_NAME             Workspace to target. If unset, prefer Graphene Lab,
                             then fall back to the only available workspace.
  PROJECT_NAME               Project to create/reuse.
EOF
}

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

while (($#)); do
  case "$1" in
    --skip-mcp)
      RUN_MCP_CHECK=0
      ;;
    --api-base-url)
      shift
      API_BASE_URL="${1:-}"
      [[ -n "$API_BASE_URL" ]] || die "--api-base-url requires a value"
      ;;
    --app-base-url)
      shift
      APP_BASE_URL="${1:-}"
      [[ -n "$APP_BASE_URL" ]] || die "--app-base-url requires a value"
      ;;
    --workspace-name)
      shift
      WORKSPACE_NAME="${1:-}"
      [[ -n "$WORKSPACE_NAME" ]] || die "--workspace-name requires a value"
      ;;
    --work-dir)
      shift
      WORK_DIR="${1:-}"
      [[ -n "$WORK_DIR" ]] || die "--work-dir requires a value"
      ;;
    --summary-path)
      shift
      SUMMARY_PATH="${1:-}"
      [[ -n "$SUMMARY_PATH" ]] || die "--summary-path requires a value"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown argument: $1"
      ;;
  esac
  shift
done

need_cmd python3
need_cmd git
if [[ "$RUN_MCP_CHECK" -eq 1 ]]; then
  need_cmd go
fi

if [[ -z "${LAB_PM_PAT:-}" ]]; then
  read -r -s -p "Personal access token (pat_...): " LAB_PM_PAT
  printf '\n'
fi
[[ "$LAB_PM_PAT" == pat_* ]] || die "LAB_PM_PAT must start with pat_"

export ROOT API_BASE_URL APP_BASE_URL WORKSPACE_NAME PROJECT_NAME WORK_DIR SUMMARY_PATH LAB_PM_PAT

log "Seeding project data through the REST API"
python3 <<'PY'
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(os.environ["ROOT"])
API_BASE_URL = os.environ["API_BASE_URL"].rstrip("/")
APP_BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
WORKSPACE_NAME = os.environ.get("WORKSPACE_NAME", "").strip()
DEFAULT_WORKSPACE_NAME = "Graphene Lab"
PROJECT_NAME = os.environ["PROJECT_NAME"]
WORK_DIR = Path(os.environ["WORK_DIR"])
SUMMARY_PATH = Path(os.environ["SUMMARY_PATH"])
PAT = os.environ["LAB_PM_PAT"].strip()

WORK_DIR.mkdir(parents=True, exist_ok=True)
SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def log(message: str) -> None:
    print(f"  - {message}")


def request(
    method: str,
    path: str,
    *,
    body: object | None = None,
    headers: dict[str, str] | None = None,
    expected: tuple[int, ...] = (200, 201),
    auth: bool = True,
) -> tuple[object | None, dict[str, str], int]:
    url = path if path.startswith("http://") or path.startswith("https://") else f"{API_BASE_URL}{path}"
    request_headers = {"Accept": "application/json"}
    if auth:
        request_headers["Authorization"] = f"Bearer {PAT}"
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    if headers:
        request_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            status = resp.status
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        detail = raw.decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            pass
        else:
            detail = json.dumps(parsed, indent=2, sort_keys=True)
        fail(f"{method} {url} returned {exc.code}\n{detail}")
    except urllib.error.URLError as exc:
        fail(f"{method} {url} failed: {exc.reason}")

    if status not in expected:
        fail(f"{method} {url} returned unexpected status {status}")

    if not raw.strip():
        return None, resp_headers, status
    try:
        return json.loads(raw), resp_headers, status
    except json.JSONDecodeError:
        return raw.decode("utf-8", errors="replace"), resp_headers, status


def upload_file(upload_url: str, file_path: Path, headers: dict[str, str]) -> None:
    payload = file_path.read_bytes()
    upload_headers = dict(headers)
    upload_headers["Content-Length"] = str(len(payload))
    req = urllib.request.Request(upload_url, data=payload, headers=upload_headers, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status not in (200, 201):
                fail(f"PUT {upload_url} returned unexpected status {resp.status}")
    except urllib.error.HTTPError as exc:
        fail(f"PUT {upload_url} returned {exc.code}: {exc.read().decode('utf-8', errors='replace')}")
    except urllib.error.URLError as exc:
        fail(f"PUT {upload_url} failed: {exc.reason}")


def heading(level: int, text: str) -> dict[str, object]:
    return {
        "type": "heading",
        "props": {"level": level},
        "content": [{"type": "text", "text": text, "styles": {}}],
    }


def paragraph(text: str) -> dict[str, object]:
    return {
        "type": "paragraph",
        "content": [{"type": "text", "text": text, "styles": {}}],
    }


def html_embed_block(artifact_id: str) -> dict[str, object]:
    return {"type": "htmlEmbed", "props": {"artifactId": artifact_id}}


def artifact_ref_block(artifact: dict[str, object]) -> dict[str, object]:
    return {
        "type": "artifactRef",
        "props": {
            "refId": artifact["id"],
            "filename": artifact.get("filename", ""),
            "contentType": artifact.get("content_type", ""),
            "artType": artifact.get("type", ""),
        },
    }


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_app_health() -> None:
    request("GET", "/openapi.json", auth=False, expected=(200,))
    # Vite returns 404 for requests with Accept: application/json; use a plain urllib check.
    plain_req = urllib.request.Request(APP_BASE_URL + "/", method="GET")
    try:
        with urllib.request.urlopen(plain_req, timeout=10) as resp:
            if resp.status != 200:
                fail(f"GET {APP_BASE_URL}/ returned {resp.status}")
    except urllib.error.URLError as exc:
        fail(f"GET {APP_BASE_URL}/ failed: {exc.reason}")


def read_git_commits(limit: int = 32) -> list[dict[str, str]]:
    try:
        output = subprocess.check_output(
            [
                "git",
                "log",
                "--date=short",
                "--pretty=format:%h\t%ad\t%s",
                f"-n{limit}",
            ],
            cwd=ROOT,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []

    commits: list[dict[str, str]] = []
    for line in output.splitlines():
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        sha, date, subject = parts
        commits.append({"sha": sha, "date": date, "subject": subject})
    return commits


def chunk_commits(commits: list[dict[str, str]], titles: list[str]) -> list[list[dict[str, str]]]:
    if not commits:
        return [[] for _ in titles]
    ordered = list(reversed(commits))
    chunk_size = max(1, math.ceil(len(ordered) / len(titles)))
    clusters = [ordered[i * chunk_size:(i + 1) * chunk_size] for i in range(len(titles))]
    while len(clusters) < len(titles):
        clusters.append([])
    return clusters[: len(titles)]


def notebook(cells: list[dict[str, object]]) -> dict[str, object]:
    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def markdown_cell(source: str) -> dict[str, object]:
    return {"cell_type": "markdown", "metadata": {}, "source": source}


def code_cell(source: str) -> dict[str, object]:
    return {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": source}


def render_commit_list(commits: list[dict[str, str]]) -> str:
    if not commits:
        return "- No recent commits available in this checkout.\n"
    return "\n".join(f"- `{c['sha']}` ({c['date']}) {c['subject']}" for c in commits)


def write_assets() -> dict[str, Path]:
    titles = [
        "Identity & Approval Hardening",
        "AI Workflow & Approval Loop",
        "Entity Pages & Collaboration",
        "UX Polish & Integration Stabilization",
    ]
    commits = read_git_commits()
    clusters = chunk_commits(commits, titles)
    cluster_map = dict(zip(titles, clusters))

    repo_notebook = notebook(
        [
            markdown_cell(
                "# Repository commit map\n\n"
                "This notebook treats the current checkout as the source material for the\n"
                "integration test project and groups recent commits into four representative iterations."
            ),
            markdown_cell(
                "\n\n".join(
                    f"## {title}\n\n{render_commit_list(cluster_map[title])}"
                    for title in titles
                )
            ),
            code_cell(
                "iterations = {\n"
                + ",\n".join(
                    f"    {title!r}: {[commit['sha'] for commit in cluster_map[title]]!r}"
                    for title in titles
                )
                + "\n}\niterations"
            ),
        ]
    )

    checklist_notebook = notebook(
        [
            markdown_cell(
                "# MCP readback checklist\n\n"
                "Use the PAT-backed MCP transport to verify that the REST-seeded project is readable\n"
                "through the same project, sample, experiment, page, and artifact tools exposed to agents."
            ),
            markdown_cell(
                "## Expected checks\n\n"
                "- initialize / ping succeeds\n"
                "- list_tools exposes the seeded read-only lab tools\n"
                "- list_projects returns the integration project inside Graphene Lab\n"
                "- list_samples and get_sample_lineage return the PMS sample chain\n"
                "- list_experiments and read_experiment return the two custom sweeps\n"
                "- read_page returns embedded notebook preview + notebook reference blocks\n"
                "- list_artifacts returns the generated notebook assets"
            ),
            code_cell(
                "checks = [\n"
                "    'initialize', 'ping', 'list_tools', 'list_projects',\n"
                "    'list_samples', 'read_sample', 'get_sample_lineage',\n"
                "    'list_experiments', 'read_experiment', 'read_page', 'list_artifacts',\n"
                "]\nchecks"
            ),
        ]
    )

    files: dict[str, Path] = {
        "repo_commit_map.ipynb": WORK_DIR / "repo_commit_map.ipynb",
        "mcp_readback_checklist.ipynb": WORK_DIR / "mcp_readback_checklist.ipynb",
    }

    files["repo_commit_map.ipynb"].write_text(json.dumps(repo_notebook, indent=2) + "\n", encoding="utf-8")
    files["mcp_readback_checklist.ipynb"].write_text(json.dumps(checklist_notebook, indent=2) + "\n", encoding="utf-8")

    for index, title in enumerate(titles, start=1):
        cluster = cluster_map[title]
        iter_notebook = notebook(
            [
                markdown_cell(
                    f"# {title}\n\n"
                    "This notebook summary is uploaded as an artifact and rendered inline through the notebook worker."
                ),
                markdown_cell(f"## Commit slice\n\n{render_commit_list(cluster)}"),
                code_cell(
                    "commit_subjects = [\n"
                    + ",\n".join(f"    {commit['subject']!r}" for commit in cluster)
                    + "\n]\nlen(commit_subjects)"
                ),
            ]
        )
        iter_path = WORK_DIR / f"iter{index}-summary.ipynb"
        iter_path.write_text(json.dumps(iter_notebook, indent=2) + "\n", encoding="utf-8")
        files[iter_path.name] = iter_path

    return files


def find_by_name(items: list[dict[str, object]], key: str, value: str) -> dict[str, object] | None:
    for item in items:
        if item.get(key) == value:
            return item
    return None


def find_workspace_match(workspaces: list[dict[str, object]], needle: str) -> dict[str, object] | None:
    lowered = needle.lower()
    for workspace in workspaces:
        name = str(workspace.get("name", "")).lower()
        slug = str(workspace.get("slug", "")).lower()
        if name == lowered or slug == lowered:
            return workspace
    return None


def find_workspace() -> dict[str, object]:
    payload, _, _ = request("GET", "/v1/workspaces", expected=(200,))
    workspaces = payload if isinstance(payload, list) else []
    available = ", ".join(sorted(str(ws.get("name", "?")) for ws in workspaces)) or "(none)"
    if not workspaces:
        fail("no workspaces are visible to this PAT")

    workspace = None
    if WORKSPACE_NAME:
        workspace = find_workspace_match(workspaces, WORKSPACE_NAME)
        if workspace is None:
            fail(f"workspace {WORKSPACE_NAME!r} not found; available workspaces: {available}")
    else:
        workspace = find_workspace_match(workspaces, DEFAULT_WORKSPACE_NAME)
        if workspace is None and len(workspaces) == 1:
            workspace = workspaces[0]
            log(f"workspace fallback: using only visible workspace {workspace['name']}")
        if workspace is None:
            fail(
                "Graphene Lab was not found and multiple workspaces are visible; "
                f"set WORKSPACE_NAME explicitly. Available workspaces: {available}"
            )
    log(f"workspace: {workspace['name']} ({workspace['id']})")
    return workspace


def ensure_project(workspace_id: str) -> dict[str, object]:
    payload, _, _ = request("GET", f"/v1/workspaces/{workspace_id}/projects", expected=(200,))
    projects = payload if isinstance(payload, list) else []
    project = find_by_name(projects, "name", PROJECT_NAME)
    if project is not None:
        log(f"project exists: {PROJECT_NAME}")
        return project

    project_body = {
        "name": PROJECT_NAME,
        "description": "Customer-zero PAT + MCP integration shakeout seeded from recent repository commits.",
        "visibility": "workspace",
    }
    created, _, _ = request("POST", f"/v1/workspaces/{workspace_id}/projects", body=project_body, expected=(201,))
    assert isinstance(created, dict)
    log("project created")
    return created


def list_iterations(project_id: str) -> list[dict[str, object]]:
    payload, _, _ = request("GET", f"/v1/projects/{project_id}/iterations", expected=(200,))
    return payload if isinstance(payload, list) else []


def list_risks(project_id: str) -> list[dict[str, object]]:
    payload, _, _ = request("GET", f"/v1/projects/{project_id}/risks", expected=(200,))
    return payload if isinstance(payload, list) else []


def list_samples(project_id: str) -> list[dict[str, object]]:
    payload, _, _ = request("GET", f"/v1/projects/{project_id}/samples", expected=(200,))
    return payload if isinstance(payload, list) else []


def list_experiments(project_id: str) -> list[dict[str, object]]:
    payload, _, _ = request("GET", f"/v1/projects/{project_id}/experiments", expected=(200,))
    return payload if isinstance(payload, list) else []


def ensure_experiment_tags(project_id: str, labels: list[str]) -> None:
    payload, _, _ = request("GET", f"/v1/projects/{project_id}/experiment-tags", expected=(200,))
    existing = {tag["label"].lower() for tag in (payload if isinstance(payload, list) else [])}
    for label in labels:
        if label.lower() not in existing:
            request("POST", f"/v1/projects/{project_id}/experiment-tags", body={"label": label}, expected=(201,))
            existing.add(label.lower())
            log(f"experiment tag created: {label}")
        else:
            log(f"experiment tag exists: {label}")


def list_project_artifacts(project_id: str) -> list[dict[str, object]]:
    payload, _, _ = request("GET", f"/v1/projects/{project_id}/artifacts", expected=(200,))
    return payload if isinstance(payload, list) else []


def ensure_iterations(project_id: str) -> dict[str, dict[str, object]]:
    now = datetime.now(timezone.utc)
    specs = [
        {
            "key": "identity_hardening",
            "title": "Identity & Approval Hardening",
            "description": "Tightened account approval, pending-user gating, and role-aware project access.",
            "status": "done",
            "start_at": iso(now - timedelta(days=28)),
            "end_at": iso(now - timedelta(days=21)),
        },
        {
            "key": "ai_workflow_loop",
            "title": "AI Workflow & Approval Loop",
            "description": "Shaped AI conversation loops, workflow synthesis, and approval-driven risk follow-up.",
            "status": "done",
            "start_at": iso(now - timedelta(days=20)),
            "end_at": iso(now - timedelta(days=13)),
        },
        {
            "key": "entity_pages",
            "title": "Entity Pages & Collaboration",
            "description": "Expanded entity page editing, slot-aware notes, and collaborative artifact references.",
            "status": "active",
            "start_at": iso(now - timedelta(days=6)),
            "end_at": iso(now + timedelta(days=7)),
        },
        {
            "key": "ux_polish",
            "title": "UX Polish & Integration Stabilization",
            "description": "Finalized PAT UX, integration smoke coverage, and local automation helpers.",
            "status": "planned",
            "start_at": iso(now + timedelta(days=8)),
            "end_at": iso(now + timedelta(days=21)),
        },
    ]
    existing = list_iterations(project_id)
    results: dict[str, dict[str, object]] = {}
    for spec in specs:
        found = find_by_name(existing, "title", spec["title"])
        if found is None:
            body = {
                "title": spec["title"],
                "description": spec["description"],
                "status": spec["status"],
                "start_at": spec["start_at"],
                "end_at": spec["end_at"],
            }
            created, _, _ = request("POST", f"/v1/projects/{project_id}/iterations", body=body, expected=(201,))
            assert isinstance(created, dict)
            found = created
            existing.append(found)
            log(f"iteration created: {spec['title']}")
        else:
            log(f"iteration exists: {spec['title']}")
        results[spec["key"]] = found
    return results


def ensure_risks(project_id: str, iteration_ids: dict[str, str]) -> dict[str, dict[str, object]]:
    specs = [
        {
            "key": "project_contract_drift",
            "title": "MCP read contract drifts from live REST-backed data",
            "likelihood": "med",
            "impact_headline": "Agents may report stale or incomplete state.",
            "impact_description": "If the MCP wrapper diverges from the REST payloads, downstream automation can read the wrong project state.",
            "mitigation": "Keep MCP tool assertions tied to the same seeded IDs, titles, and artifact filenames created through the PAT.",
            "plan_b": "Fall back to direct REST validation for the failing resource class while MCP is repaired.",
        },
        {
            "key": "approval_gate",
            "title": "Approval gate can strand legitimate users",
            "likelihood": "med",
            "impact_headline": "New contributors can be blocked from project access.",
            "impact_description": "Approval-state regressions can stop valid users from obtaining fresh access tokens.",
            "mitigation": "Exercise login, approval, and scoped PAT creation flows together in the seeded workspace.",
            "plan_b": "Temporarily issue a replacement token through an approved admin session.",
            "iteration_key": "identity_hardening",
        },
        {
            "key": "approval_noise",
            "title": "AI workflow outputs can create noisy approval traffic",
            "likelihood": "med",
            "impact_headline": "Review queues become harder to triage.",
            "impact_description": "Workflow-assisted updates can generate unnecessary approval requests if summaries are too broad.",
            "mitigation": "Keep result summaries concise and tie approvals to the specific affected entity set.",
            "plan_b": "Drop to read-only autonomy and use manual follow-up notes until the workflow is tuned.",
            "iteration_key": "ai_workflow_loop",
        },
        {
            "key": "page_schema_drift",
            "title": "Embedded reference blocks can drift from page schema",
            "likelihood": "med",
            "impact_headline": "Entity pages can render broken embeds.",
            "impact_description": "If custom BlockNote block payloads change shape, HTML and notebook references may stop rendering correctly.",
            "mitigation": "Seed slot pages through the public API with the same block types the editor writes in the browser.",
            "plan_b": "Replace custom embeds with plain artifact references until the schema is stabilized.",
            "iteration_key": "entity_pages",
        },
        {
            "key": "token_scope_drift",
            "title": "Token scope drift blocks PAT automation",
            "likelihood": "high",
            "impact_headline": "Seed scripts and MCP clients fail with scope errors.",
            "impact_description": "If the settings UI diverges from the backend allowlist, the created PAT can miss write scopes needed for project automation.",
            "mitigation": "Share one frontend taxonomy source that mirrors the backend scope allowlist and reject empty selections.",
            "plan_b": "Create a replacement PAT from a trusted session and rerun the smoke flow against the same project.",
            "iteration_key": "ux_polish",
            "flag_pi_review": True,
        },
    ]
    existing = list_risks(project_id)
    results: dict[str, dict[str, object]] = {}
    for spec in specs:
        found = find_by_name(existing, "title", spec["title"])
        body = {
            "title": spec["title"],
            "likelihood": spec["likelihood"],
            "impact_headline": spec["impact_headline"],
            "impact_description": spec["impact_description"],
            "mitigation": spec["mitigation"],
            "plan_b": spec["plan_b"],
        }
        if "iteration_key" in spec:
            body["iteration_id"] = iteration_ids[spec["iteration_key"]]
        if found is None:
            created, _, _ = request("POST", f"/v1/projects/{project_id}/risks", body=body, expected=(201,))
            assert isinstance(created, dict)
            found = created
            existing.append(found)
            log(f"risk created: {spec['title']}")
        else:
            log(f"risk exists: {spec['title']}")
        if spec.get("flag_pi_review") and not found.get("flagged_for_pi_review"):
            flagged, _, _ = request("POST", f"/v1/risks/{found['id']}/pi-review", body={"flagged": True}, expected=(200,))
            assert isinstance(flagged, dict)
            found = flagged
            log(f"risk flagged for PI review: {spec['title']}")
        results[spec["key"]] = found
    return results


def ensure_samples(project_id: str) -> dict[str, dict[str, object]]:
    specs = [
        {
            "key": "base",
            "identifier": "PMS-BASE-001",
            "name": "Platform baseline sample",
            "description": "Baseline specimen representing the pre-hardening repository state.",
            "kind": "module",
            "status": "active",
            "properties": {"repo_role": "baseline", "focus": "auth surface"},
        },
        {
            "key": "auth",
            "identifier": "PMS-AUTH-002",
            "name": "Approval workflow sample",
            "description": "Derived sample capturing approval and scoped-token hardening changes.",
            "kind": "derivative",
            "status": "active",
            "properties": {"repo_role": "auth", "focus": "approval and PAT flows"},
        },
        {
            "key": "mcp",
            "identifier": "PMS-MCP-003",
            "name": "MCP readback sample",
            "description": "Split sample used to validate MCP parity with REST-backed project content.",
            "kind": "derivative",
            "status": "active",
            "properties": {"repo_role": "mcp", "focus": "agent readback"},
        },
    ]
    existing = list_samples(project_id)
    results: dict[str, dict[str, object]] = {}
    for spec in specs:
        found = find_by_name(existing, "identifier", spec["identifier"])
        if found is None:
            created, _, _ = request(
                "POST",
                f"/v1/projects/{project_id}/samples",
                body={
                    "identifier": spec["identifier"],
                    "name": spec["name"],
                    "description": spec["description"],
                    "kind": spec["kind"],
                    "status": spec["status"],
                    "properties": spec["properties"],
                },
                expected=(201,),
            )
            assert isinstance(created, dict)
            found = created
            existing.append(found)
            log(f"sample created: {spec['identifier']}")
        else:
            log(f"sample exists: {spec['identifier']}")
        results[spec["key"]] = found
    return results


def ensure_sample_relations(samples: dict[str, dict[str, object]]) -> None:
    lineage, _, _ = request("GET", f"/v1/samples/{samples['mcp']['id']}/lineage", expected=(200,))
    edges = lineage.get("edges", []) if isinstance(lineage, dict) else []
    existing_pairs = {
        (edge.get("parent_sample_id"), edge.get("child_sample_id"), edge.get("relation_type"))
        for edge in edges
    }
    desired = [
        (samples["base"]["id"], samples["auth"]["id"], "derived_from", "Auth flow hardening lineage"),
        (samples["auth"]["id"], samples["mcp"]["id"], "split_from", "MCP-specific readback branch"),
    ]
    for parent_id, child_id, relation_type, notes in desired:
        if (parent_id, child_id, relation_type) in existing_pairs:
            continue
        request(
            "POST",
            f"/v1/samples/{parent_id}/relations",
            body={"child_sample_id": child_id, "relation_type": relation_type, "notes": notes},
            expected=(201,),
        )
        log(f"sample relation added: {relation_type} {parent_id} -> {child_id}")


def ensure_iteration_sample_links(iterations: dict[str, dict[str, object]], samples: dict[str, dict[str, object]]) -> None:
    desired = [
        (iterations["identity_hardening"]["id"], samples["base"]["id"], "input", "Baseline auth surface"),
        (iterations["ai_workflow_loop"]["id"], samples["auth"]["id"], "output", "Approval workflow output"),
        (iterations["entity_pages"]["id"], samples["auth"]["id"], "input", "Reference entity-page sample"),
        (iterations["entity_pages"]["id"], samples["mcp"]["id"], "output", "MCP-ready derivative"),
        (iterations["ux_polish"]["id"], samples["mcp"]["id"], "input", "Final PAT/MCP validation sample"),
    ]
    for iteration_id, sample_id, role, note in desired:
        payload, _, _ = request("GET", f"/v1/iterations/{iteration_id}/samples", expected=(200,))
        existing = payload if isinstance(payload, list) else []
        if any(row.get("sample_id") == sample_id for row in existing):
            continue
        request(
            "POST",
            f"/v1/iterations/{iteration_id}/samples",
            body={"sample_id": sample_id, "role": role, "note": note},
            expected=(201,),
        )
        log(f"iteration sample linked: {iteration_id} <- {sample_id}")


def ensure_experiments(project_id: str, iterations: dict[str, dict[str, object]]) -> dict[str, dict[str, object]]:
    now = datetime.now(timezone.utc)
    specs = [
        {
            "key": "approval_regression",
            "result_summary": "Approval Gate Regression Sweep",
            "method": "custom",
            "tags": ["approval", "auth", "regression"],
            "parameters": {"focus": "approval gate", "expected_outcome": "approved users retain access"},
            "iteration_id": iterations["entity_pages"]["id"],
            "status": "completed",
            "performed_at": iso(now - timedelta(days=2)),
        },
        {
            "key": "mcp_readback",
            "result_summary": "PAT/MCP Readback Sweep",
            "method": "custom",
            "tags": ["mcp", "pat", "readback"],
            "parameters": {"focus": "mcp parity", "expected_outcome": "tools mirror REST data"},
            "iteration_id": iterations["ux_polish"]["id"],
            "status": "completed",
            "performed_at": iso(now - timedelta(days=1)),
        },
    ]
    existing = list_experiments(project_id)
    results: dict[str, dict[str, object]] = {}
    for spec in specs:
        found = find_by_name(existing, "result_summary", spec["result_summary"])
        if found is None:
            created, _, _ = request(
                "POST",
                f"/v1/projects/{project_id}/experiments",
                body={
                    "method": spec["method"],
                    "tags": spec["tags"],
                    "parameters": spec["parameters"],
                    "result_summary": spec["result_summary"],
                    "iteration_id": spec["iteration_id"],
                    "status": spec["status"],
                    "performed_at": spec["performed_at"],
                },
                expected=(201,),
            )
            assert isinstance(created, dict)
            found = created
            existing.append(found)
            log(f"experiment created: {spec['result_summary']}")
        else:
            log(f"experiment exists: {spec['result_summary']}")
        results[spec["key"]] = found
    return results


def ensure_experiment_sample_links(experiments: dict[str, dict[str, object]], samples: dict[str, dict[str, object]]) -> None:
    desired = [
        (experiments["approval_regression"]["id"], samples["auth"]["id"], "subject", "Primary approval-path sample"),
        (experiments["approval_regression"]["id"], samples["base"]["id"], "reference", "Pre-hardening comparison"),
        (experiments["mcp_readback"]["id"], samples["mcp"]["id"], "subject", "PAT + MCP validation sample"),
        (experiments["mcp_readback"]["id"], samples["auth"]["id"], "reference", "Lineage comparison sample"),
    ]
    for experiment_id, sample_id, role, note in desired:
        payload, _, _ = request("GET", f"/v1/experiments/{experiment_id}/samples", expected=(200,))
        existing = payload if isinstance(payload, list) else []
        if any(row.get("sample_id") == sample_id for row in existing):
            continue
        request(
            "POST",
            f"/v1/experiments/{experiment_id}/samples",
            body={"sample_id": sample_id, "role": role, "note": note},
            expected=(201,),
        )
        log(f"experiment sample linked: {experiment_id} <- {sample_id}")


def ensure_artifact(project_id: str, file_path: Path, content_type: str, artifact_type: str, cache: dict[str, dict[str, object]]) -> dict[str, object]:
    existing = cache.get(file_path.name)
    if existing is not None:
        if existing.get("processing_status") == "failed":
            # Delete the failed artifact so we can re-upload cleanly.
            request("DELETE", f"/v1/artifacts/{existing['id']}", expected=(204,))
            del cache[file_path.name]
            log(f"artifact deleted (was failed): {file_path.name}")
        else:
            log(f"artifact exists: {file_path.name}")
            return existing

    created, _, _ = request(
        "POST",
        f"/v1/projects/{project_id}/artifacts",
        body={
            "filename": file_path.name,
            "content_type": content_type,
            "size_bytes": file_path.stat().st_size,
            "type": artifact_type,
        },
        expected=(201,),
    )
    assert isinstance(created, dict)
    artifact = created["artifact"]
    upload_file(created["upload_url"], file_path, created.get("headers", {}))
    completed, _, _ = request("POST", f"/v1/artifacts/{artifact['id']}/complete", expected=(200,))
    assert isinstance(completed, dict)
    cache[file_path.name] = completed
    log(f"artifact uploaded: {file_path.name}")
    return completed


def wait_for_artifact_render(artifact_id: str, *, require_rendered_url: bool = False, timeout_seconds: int = 90) -> dict[str, object]:
    deadline = datetime.now(timezone.utc) + timedelta(seconds=timeout_seconds)
    last_seen: dict[str, object] | None = None
    while datetime.now(timezone.utc) < deadline:
        artifact, _, _ = request("GET", f"/v1/artifacts/{artifact_id}", expected=(200,))
        assert isinstance(artifact, dict)
        last_seen = artifact
        status = str(artifact.get("processing_status", ""))
        rendered_url = str(artifact.get("rendered_url", "") or "")
        if status == "failed":
            fail(f"artifact processing failed for {artifact.get('filename', artifact_id)}")
        if status == "done" and (not require_rendered_url or rendered_url):
            return artifact
        time.sleep(2)
    if last_seen is None:
        fail(f"artifact {artifact_id} never became visible")
    fail(
        f"artifact {last_seen.get('filename', artifact_id)} did not finish processing in time "
        f"(status={last_seen.get('processing_status')}, rendered_url={bool(last_seen.get('rendered_url'))})"
    )


def ensure_experiment_artifact_link(experiment_id: str, artifact_id: str, role: str) -> None:
    payload, _, _ = request("GET", f"/v1/experiments/{experiment_id}/artifacts", expected=(200,))
    existing = payload if isinstance(payload, list) else []
    if any(artifact.get("id") == artifact_id for artifact in existing):
        return
    request(
        "POST",
        f"/v1/experiments/{experiment_id}/artifacts",
        body={"artifact_id": artifact_id, "role": role},
        expected=(201,),
    )
    log(f"experiment artifact linked: {experiment_id} <- {artifact_id}")


def ensure_slot_page(
    project_id: str,
    parent_type: str,
    parent_id: str,
    slot: str,
    blocks: list[dict[str, object]],
) -> dict[str, object]:
    query = urllib.parse.urlencode({"parent_type": parent_type, "parent_id": parent_id})
    payload, _, _ = request("GET", f"/v1/projects/{project_id}/pages?{query}", expected=(200,))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    match = None
    for item in items:
        if item.get("slot") == slot:
            match = item
            break

    if match is None:
        created, response_headers, _ = request(
            "POST",
            f"/v1/projects/{project_id}/pages",
            body={
                "parent_type": parent_type,
                "parent_id": parent_id,
                "slot": slot,
                "blocks": blocks,
            },
            expected=(201,),
        )
        assert isinstance(created, dict)
        page = dict(created["page"])
        page["_etag"] = response_headers.get("ETag", "")
        log(f"page created: {parent_type}:{slot}:{parent_id}")
        return page

    page_payload, response_headers, _ = request("GET", f"/v1/pages/{match['id']}", expected=(200,))
    etag = response_headers.get("etag")
    if not etag:
        fail(f"missing ETag for page {match['id']}")
    updated, response_headers, _ = request(
        "PUT",
        f"/v1/pages/{match['id']}",
        body={"blocks": blocks, "source": "human"},
        headers={"If-Match": etag},
        expected=(200,),
    )
    assert isinstance(updated, dict)
    page = dict(updated["page"])
    page["_etag"] = response_headers.get("ETag", "")
    log(f"page updated: {parent_type}:{slot}:{parent_id}")
    return page


def build_pages(
    project: dict[str, object],
    iterations: dict[str, dict[str, object]],
    samples: dict[str, dict[str, object]],
    experiments: dict[str, dict[str, object]],
    artifacts: dict[str, dict[str, object]],
) -> dict[str, dict[str, object]]:
    project_id = str(project["id"])
    pages: dict[str, dict[str, object]] = {}

    pages["project_description"] = ensure_slot_page(
        project_id,
        "project",
        project_id,
        "description",
        [
            heading(1, PROJECT_NAME),
            paragraph("This seeded integration project treats the current repository as customer-zero input and splits recent commit history into four representative iterations."),
            paragraph("The notebook preview and reference block below were uploaded through the public artifact handshake and attached back to the project through page blocks only."),
            html_embed_block(str(artifacts["repo_commit_map.ipynb"]["id"])),
            paragraph("Reference notebook:"),
            artifact_ref_block(artifacts["repo_commit_map.ipynb"]),
        ],
    )
    pages["project_notes"] = ensure_slot_page(
        project_id,
        "project",
        project_id,
        "notes",
        [
            heading(2, "MCP verification notes"),
            paragraph("Use this page to confirm that the same PAT-backed dataset is visible through the live MCP transport."),
            artifact_ref_block(artifacts["mcp_readback_checklist.ipynb"]),
        ],
    )

    iteration_page_specs = [
        ("identity_hardening", "iter1-summary.ipynb"),
        ("ai_workflow_loop", "iter2-summary.ipynb"),
        ("entity_pages", "iter3-summary.ipynb"),
        ("ux_polish", "iter4-summary.ipynb"),
    ]
    for key, notebook_name in iteration_page_specs:
        iteration = iterations[key]
        pages[f"{key}_description"] = ensure_slot_page(
            project_id,
            "iteration",
            str(iteration["id"]),
            "description",
            [
                heading(2, str(iteration["title"])),
                paragraph(str(iteration.get("description", ""))),
                paragraph("This slot is managed through the same page API used by the browser editor."),
            ],
        )
        pages[f"{key}_notes"] = ensure_slot_page(
            project_id,
            "iteration",
            str(iteration["id"]),
            "notes",
            [
                heading(2, f"{iteration['title']} notes"),
                paragraph("The embedded notebook preview below is a project artifact referenced from the iteration notes slot."),
                html_embed_block(str(artifacts[notebook_name]["id"])),
            ],
        )

    pages["approval_regression_description"] = ensure_slot_page(
        project_id,
        "experiment",
        str(experiments["approval_regression"]["id"]),
        "description",
        [
            heading(2, "Approval Gate Regression Sweep"),
            paragraph("Experiment summary page seeded through the public page API."),
            artifact_ref_block(artifacts["repo_commit_map.ipynb"]),
        ],
    )
    pages["mcp_readback_description"] = ensure_slot_page(
        project_id,
        "experiment",
        str(experiments["mcp_readback"]["id"]),
        "description",
        [
            heading(2, "PAT/MCP Readback Sweep"),
            paragraph("This page links the notebook used to validate tool parity against the seeded REST data."),
            artifact_ref_block(artifacts["mcp_readback_checklist.ipynb"]),
        ],
    )

    sample_page_specs = [
        ("base", "Platform baseline sample used as the lineage root for the seeded project."),
        ("auth", "Derived approval-focused sample created to exercise scoped PAT writes."),
        ("mcp", "Readback-focused sample used by the MCP smoke verification."),
    ]
    for sample_key, text in sample_page_specs:
        sample = samples[sample_key]
        pages[f"sample_{sample_key}_description"] = ensure_slot_page(
            project_id,
            "sample",
            str(sample["id"]),
            "description",
            [
                heading(2, str(sample["identifier"])),
                paragraph(text),
            ],
        )

    return pages


ensure_app_health()
assets = write_assets()
workspace = find_workspace()
project = ensure_project(str(workspace["id"]))
iterations = ensure_iterations(str(project["id"]))
ensure_iteration_sample_links(iterations, ensure_samples(str(project["id"])))

# Re-read samples after linking to avoid stale references from ensure_samples.
samples = ensure_samples(str(project["id"]))
ensure_sample_relations(samples)
ensure_iteration_sample_links(iterations, samples)

ensure_experiment_tags(str(project["id"]), ["approval", "auth", "regression", "mcp", "pat", "readback"])
experiments = ensure_experiments(str(project["id"]), iterations)
ensure_experiment_sample_links(experiments, samples)
risks = ensure_risks(str(project["id"]), {k: str(v["id"]) for k, v in iterations.items()})

artifact_cache = {artifact["filename"]: artifact for artifact in list_project_artifacts(str(project["id"]))}
artifacts = {
    "repo_commit_map.ipynb": ensure_artifact(str(project["id"]), assets["repo_commit_map.ipynb"], "application/x-ipynb+json", "ipynb", artifact_cache),
    "mcp_readback_checklist.ipynb": ensure_artifact(str(project["id"]), assets["mcp_readback_checklist.ipynb"], "application/x-ipynb+json", "ipynb", artifact_cache),
    "iter1-summary.ipynb": ensure_artifact(str(project["id"]), assets["iter1-summary.ipynb"], "application/x-ipynb+json", "ipynb", artifact_cache),
    "iter2-summary.ipynb": ensure_artifact(str(project["id"]), assets["iter2-summary.ipynb"], "application/x-ipynb+json", "ipynb", artifact_cache),
    "iter3-summary.ipynb": ensure_artifact(str(project["id"]), assets["iter3-summary.ipynb"], "application/x-ipynb+json", "ipynb", artifact_cache),
    "iter4-summary.ipynb": ensure_artifact(str(project["id"]), assets["iter4-summary.ipynb"], "application/x-ipynb+json", "ipynb", artifact_cache),
}

for artifact_name in list(artifacts):
    if artifact_name.endswith(".ipynb"):
        artifacts[artifact_name] = wait_for_artifact_render(str(artifacts[artifact_name]["id"]), require_rendered_url=True)

ensure_experiment_artifact_link(str(experiments["approval_regression"]["id"]), str(artifacts["repo_commit_map.ipynb"]["id"]), "analysis")
ensure_experiment_artifact_link(str(experiments["mcp_readback"]["id"]), str(artifacts["mcp_readback_checklist.ipynb"]["id"]), "report")

pages = build_pages(project, iterations, samples, experiments, artifacts)

# Final readback smoke on the REST side.
final_samples = list_samples(str(project["id"]))
final_experiments = list_experiments(str(project["id"]))
final_artifacts = list_project_artifacts(str(project["id"]))
if not any(item.get("identifier") == "PMS-MCP-003" for item in final_samples):
    fail("REST validation failed: PMS-MCP-003 missing from /samples")
if not any(item.get("result_summary") == "PAT/MCP Readback Sweep" for item in final_experiments):
    fail("REST validation failed: PAT/MCP Readback Sweep missing from /experiments")
if not any(item.get("filename") == "repo_commit_map.ipynb" for item in final_artifacts):
    fail("REST validation failed: repo_commit_map.ipynb missing from /artifacts")
if not any(item.get("filename") == "iter4-summary.ipynb" for item in final_artifacts):
    fail("REST validation failed: iter4-summary.ipynb missing from /artifacts")

summary = {
    "generated_at": iso(datetime.now(timezone.utc)),
    "workspace": {"id": workspace["id"], "name": workspace["name"]},
    "project": {
        "id": project["id"],
        "name": project["name"],
        "url": f"{APP_BASE_URL}/projects/{project['id']}",
    },
    "iterations": {
        key: {
            "id": value["id"],
            "title": value["title"],
            "url": f"{APP_BASE_URL}/iterations/{value['id']}",
        }
        for key, value in iterations.items()
    },
    "risks": {
        key: {"id": value["id"], "title": value["title"]}
        for key, value in risks.items()
    },
    "samples": {
        key: {
            "id": value["id"],
            "identifier": value["identifier"],
            "name": value.get("name", ""),
            "url": f"{APP_BASE_URL}/samples/{value['id']}",
        }
        for key, value in samples.items()
    },
    "experiments": {
        key: {
            "id": value["id"],
            "result_summary": value.get("result_summary", ""),
            "url": f"{APP_BASE_URL}/experiments/{value['id']}",
        }
        for key, value in experiments.items()
    },
    "artifacts": {
        key: {
            "id": value["id"],
            "filename": value["filename"],
            "content_type": value.get("content_type", ""),
            "url": f"{APP_BASE_URL}/artifacts/{value['id']}",
        }
        for key, value in artifacts.items()
    },
    "pages": {
        key: {
            "id": value["id"],
            "parent_type": value["parent_type"],
            "parent_id": value["parent_id"],
            "slot": value.get("slot", ""),
            "url": f"{APP_BASE_URL}/pages/{value['id']}",
        }
        for key, value in pages.items()
    },
    "generated_files": {
        name: str(path)
        for name, path in assets.items()
    },
    "mcp": {"status": "pending"},
}
SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"summary: {SUMMARY_PATH}")
print(f"project url: {summary['project']['url']}")
PY

if [[ "$RUN_MCP_CHECK" -eq 1 ]]; then
  log "Running live MCP readback check"
  MCP_GO_FILE="${ROOT}/.dev/api-mcp-integration-mcp-check.go"
  mkdir -p "${ROOT}/.dev"
  trap 'rm -f "${MCP_GO_FILE}"' EXIT
  cat >"${MCP_GO_FILE}" <<'EOF'
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
)

type namedRecord struct {
	ID            string `json:"id"`
	Name          string `json:"name,omitempty"`
	Title         string `json:"title,omitempty"`
	Identifier    string `json:"identifier,omitempty"`
	ResultSummary string `json:"result_summary,omitempty"`
	URL           string `json:"url,omitempty"`
}

type summaryFile struct {
	Workspace struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"workspace"`
	Project struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		URL  string `json:"url"`
	} `json:"project"`
	Samples map[string]namedRecord `json:"samples"`
	Experiments map[string]namedRecord `json:"experiments"`
	Artifacts map[string]namedRecord `json:"artifacts"`
	Pages map[string]namedRecord `json:"pages"`
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "error: "+format+"\n", args...)
	os.Exit(1)
}

func collectText(result *mcp.CallToolResult) string {
	if result == nil {
		return ""
	}
	var parts []string
	for _, item := range result.Content {
		switch content := item.(type) {
		case mcp.TextContent:
			parts = append(parts, content.Text)
		default:
			raw, _ := json.Marshal(content)
			parts = append(parts, string(raw))
		}
	}
	return strings.Join(parts, "\n")
}

func mustContain(label, haystack string, wants ...string) {
	for _, want := range wants {
		if want == "" {
			continue
		}
		if !strings.Contains(haystack, want) {
			fail("%s did not contain %q", label, want)
		}
	}
}

func callToolText(ctx context.Context, c *client.Client, name string, args map[string]any) string {
	req := mcp.CallToolRequest{}
	req.Params.Name = name
	req.Params.Arguments = args
	result, err := c.CallTool(ctx, req)
	if err != nil {
		fail("tool %s failed: %v", name, err)
	}
	if result.IsError {
		fail("tool %s returned an MCP tool error: %s", name, collectText(result))
	}
	return collectText(result)
}

func main() {
	summaryPath := os.Getenv("SUMMARY_PATH")
	apiBaseURL := strings.TrimSuffix(os.Getenv("API_BASE_URL"), "/")
	pat := os.Getenv("LAB_PM_PAT")
	if summaryPath == "" || apiBaseURL == "" || pat == "" {
		fail("SUMMARY_PATH, API_BASE_URL, and LAB_PM_PAT are required")
	}

	raw, err := os.ReadFile(summaryPath)
	if err != nil {
		fail("read summary: %v", err)
	}
	var summary summaryFile
	if err := json.Unmarshal(raw, &summary); err != nil {
		fail("parse summary: %v", err)
	}

	mcpClient, err := client.NewSSEMCPClient(
		apiBaseURL+"/mcp/sse",
		client.WithHeaders(map[string]string{
			"Authorization": "Bearer " + pat,
		}),
	)
	if err != nil {
		fail("create MCP client: %v", err)
	}
	defer mcpClient.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := mcpClient.Start(ctx); err != nil {
		fail("start MCP client: %v", err)
	}

	initReq := mcp.InitializeRequest{}
	initReq.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initReq.Params.ClientInfo = mcp.Implementation{
		Name:    "api-mcp-integration-smoke",
		Version: "1.0.0",
	}
	if _, err := mcpClient.Initialize(ctx, initReq); err != nil {
		fail("initialize MCP client: %v", err)
	}

	if err := mcpClient.Ping(ctx); err != nil {
		fail("ping MCP server: %v", err)
	}

	toolList, err := mcpClient.ListTools(ctx, mcp.ListToolsRequest{})
	if err != nil {
		fail("list tools: %v", err)
	}
	var toolNames []string
	for _, tool := range toolList.Tools {
		toolNames = append(toolNames, tool.Name)
	}
	requiredTools := []string{
		"list_projects",
		"search_project_content",
		"list_samples",
		"read_sample",
		"get_sample_lineage",
		"list_experiments",
		"read_experiment",
		"read_page",
		"list_artifacts",
	}
	for _, name := range requiredTools {
		if !slices.Contains(toolNames, name) {
			fail("required MCP tool %q missing; got %v", name, toolNames)
		}
	}

	listProjects := callToolText(ctx, mcpClient, "list_projects", map[string]any{
		"workspace_id": summary.Workspace.ID,
	})
	mustContain("list_projects", listProjects, summary.Project.ID, summary.Project.Name)

	searchProject := callToolText(ctx, mcpClient, "search_project_content", map[string]any{
		"project_id": summary.Project.ID,
		"query":      "MCP",
	})
	mustContain(
		"search_project_content",
		searchProject,
		summary.Samples["mcp"].Identifier,
		summary.Experiments["mcp_readback"].ResultSummary,
		summary.Artifacts["mcp_readback_checklist.ipynb"].ID,
	)

	listSamples := callToolText(ctx, mcpClient, "list_samples", map[string]any{
		"project_id": summary.Project.ID,
	})
	mustContain(
		"list_samples",
		listSamples,
		summary.Samples["base"].Identifier,
		summary.Samples["auth"].Identifier,
		summary.Samples["mcp"].Identifier,
	)

	readSample := callToolText(ctx, mcpClient, "read_sample", map[string]any{
		"sample_id": summary.Samples["mcp"].ID,
	})
	mustContain("read_sample", readSample, summary.Samples["mcp"].Identifier)

	lineage := callToolText(ctx, mcpClient, "get_sample_lineage", map[string]any{
		"sample_id": summary.Samples["mcp"].ID,
	})
	mustContain(
		"get_sample_lineage",
		lineage,
		summary.Samples["base"].ID,
		summary.Samples["auth"].ID,
		summary.Samples["mcp"].ID,
		"split_from",
	)

	listExperiments := callToolText(ctx, mcpClient, "list_experiments", map[string]any{
		"project_id": summary.Project.ID,
	})
	mustContain(
		"list_experiments",
		listExperiments,
		summary.Experiments["approval_regression"].ResultSummary,
		summary.Experiments["mcp_readback"].ResultSummary,
	)

	readExperiment := callToolText(ctx, mcpClient, "read_experiment", map[string]any{
		"experiment_id": summary.Experiments["mcp_readback"].ID,
	})
	mustContain(
		"read_experiment",
		readExperiment,
		summary.Experiments["mcp_readback"].ResultSummary,
	)

	readPage := callToolText(ctx, mcpClient, "read_page", map[string]any{
		"page_id": summary.Pages["project_description"].ID,
	})
	mustContain(
		"read_page",
		readPage,
		summary.Artifacts["repo_commit_map.ipynb"].ID,
		"htmlEmbed",
		"description",
	)

	listArtifacts := callToolText(ctx, mcpClient, "list_artifacts", map[string]any{
		"project_id": summary.Project.ID,
	})
	mustContain(
		"list_artifacts",
		listArtifacts,
		summary.Artifacts["repo_commit_map.ipynb"].ID,
		summary.Artifacts["mcp_readback_checklist.ipynb"].ID,
		summary.Artifacts["iter4-summary.ipynb"].ID,
	)

	fmt.Printf("mcp-ok project=%s tools=%d\n", summary.Project.ID, len(toolNames))
}
EOF
  GO111MODULE=on go run "${MCP_GO_FILE}"

  python3 <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

summary_path = Path(os.environ["SUMMARY_PATH"])
summary = json.loads(summary_path.read_text(encoding="utf-8"))
summary["mcp"] = {
    "status": "passed",
    "checked_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
}
summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"mcp summary updated: {summary_path}")
PY
fi

log "Seed complete"
printf 'Project URL: %s\n' "${APP_BASE_URL}/projects/$(python3 - <<'PY'
import json
import os
from pathlib import Path

summary = json.loads(Path(os.environ["SUMMARY_PATH"]).read_text(encoding="utf-8"))
print(summary["project"]["id"])
PY
)"
