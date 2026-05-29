#!/usr/bin/env bash
# Start the lab PM stack on your machine (Docker, API, web, optional Ollama check).
# This script is meant to be run on the host — not inside the Cursor sandbox.
#
# Usage:
#   ./scripts/dev-local.sh              # infra + seed (if empty) + API + web
#   ./scripts/dev-local.sh infra        # docker compose only
#   ./scripts/dev-local.sh api          # Go API only (migrations on boot)
#   ./scripts/dev-local.sh web          # Vite dev server only
#   ./scripts/dev-local.sh seed         # demo data
#   ./scripts/dev-local.sh openapi      # regenerate web API types
#   ./scripts/dev-local.sh stop         # stop API/web PIDs + docker compose down
#   ./scripts/dev-local.sh status       # what's running
#
# Prerequisites: Docker, Go 1.23+, pnpm, curl
# Optional: ollama serve + aiconf.local.json for AI; air for hot reload

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${ROOT}/deploy/docker-compose.dev.yml"
PID_DIR="${ROOT}/.dev"
API_PID="${PID_DIR}/api.pid"
WEB_PID="${PID_DIR}/web.pid"
API_LOG="${PID_DIR}/api.log"
WEB_LOG="${PID_DIR}/web.log"

mkdir -p "$PID_DIR"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

# Use Compose V2 plugin if present, else standalone docker-compose (V1).
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
  else
    die "need Docker Compose: install the 'docker compose' plugin or 'docker-compose'"
  fi
}

load_env() {
  if [[ -f "${ROOT}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${ROOT}/.env"
    set +a
  elif [[ -f "${ROOT}/.env.example" ]]; then
    warn "no .env found — copying .env.example to .env"
    cp "${ROOT}/.env.example" "${ROOT}/.env"
    set -a
    # shellcheck disable=SC1091
    source "${ROOT}/.env"
    set +a
  fi
}

stop_pidfile() {
  local pidfile=$1 name=$2
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      log "stopping $name (pid $pid)"
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

stop_app_processes() {
  stop_pidfile "$API_PID" "API"
  stop_pidfile "$WEB_PID" "web"
}

check_ollama() {
  if [[ ! -f "${ROOT}/aiconf.local.json" ]]; then
    warn "no aiconf.local.json — AI chat/workflows will be disabled (copy aiconf.ollama.example.json if needed)"
    return 0
  fi
  if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    log "ollama: reachable at http://localhost:11434"
  else
    warn "ollama not reachable — run 'ollama serve' in another terminal for AI features"
  fi
}

wait_for_postgres() {
  log "waiting for Postgres on localhost:5432"
  local i
  for i in $(seq 1 60); do
    if compose exec -T postgres pg_isready -U lab -d lab >/dev/null 2>&1; then
      log "postgres: ready"
      return 0
    fi
    sleep 1
  done
  die "postgres did not become ready in time (is Docker running?)"
}

wait_for_mailpit() {
  if curl -sf http://localhost:8025/ >/dev/null 2>&1; then
    log "mailpit UI: http://localhost:8025"
  else
    warn "mailpit web UI not up yet (SMTP is usually :1025 once the container is running)"
  fi
}

cmd_infra() {
  need_cmd docker
  log "starting docker compose stack"
  compose up -d
  wait_for_postgres
  wait_for_mailpit
  log "minio console: http://localhost:9001"
}

cmd_seed() {
  need_cmd go
  load_env
  log "seeding demo data (go run ./cmd/seed)"
  go run ./cmd/seed
}

cmd_api() {
  need_cmd go
  load_env
  stop_pidfile "$API_PID" "API"
  log "starting API on :${PORT:-8080} (logs: $API_LOG)"
  if command -v air >/dev/null 2>&1; then
    (cd "$ROOT" && air >>"$API_LOG" 2>&1 & echo $! >"$API_PID")
  else
    (cd "$ROOT" && go run ./cmd/api >>"$API_LOG" 2>&1 & echo $! >"$API_PID")
  fi
  sleep 2
  if ! kill -0 "$(cat "$API_PID")" 2>/dev/null; then
    die "API exited immediately — see $API_LOG"
  fi
  log "API pid $(cat "$API_PID") — tail -f $API_LOG"
}

cmd_web() {
  need_cmd pnpm
  load_env
  stop_pidfile "$WEB_PID" "web"
  log "installing web deps if needed"
  (cd "${ROOT}/web" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
  log "starting Vite on http://localhost:5173 (logs: $WEB_LOG)"
  (cd "${ROOT}/web" && pnpm dev >>"$WEB_LOG" 2>&1 & echo $! >"$WEB_PID")
  sleep 2
  if ! kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
    die "web dev server exited — see $WEB_LOG"
  fi
  log "web pid $(cat "$WEB_PID") — tail -f $WEB_LOG"
}

cmd_openapi() {
  need_cmd pnpm curl
  load_env
  cmd_api
  local port="${PORT:-8080}"
  log "waiting for OpenAPI at http://127.0.0.1:${port}/openapi.json"
  local i
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${port}/openapi.json" >/dev/null; then
      break
    fi
    sleep 1
  done
  (cd "${ROOT}/web" && pnpm openapi)
  log "types updated in web/src/api/schema.d.ts"
}

cmd_status() {
  echo "Docker:"
  compose ps 2>/dev/null || warn "compose stack not running"
  echo
  if [[ -f "$API_PID" ]] && kill -0 "$(cat "$API_PID")" 2>/dev/null; then
    echo "API: running pid $(cat "$API_PID")"
  else
    echo "API: not running"
  fi
  if [[ -f "$WEB_PID" ]] && kill -0 "$(cat "$WEB_PID")" 2>/dev/null; then
    echo "web: running pid $(cat "$WEB_PID")"
  else
    echo "web: not running"
  fi
  echo
  echo "URLs:"
  echo "  app:      http://localhost:5173"
  echo "  API:      http://localhost:${PORT:-8080}"
  echo "  mailpit:  http://localhost:8025"
  echo "  minio:    http://localhost:9001"
}

cmd_stop() {
  stop_app_processes
  log "stopping docker compose"
  compose down 2>/dev/null || true
}

cmd_all() {
  need_cmd docker go pnpm curl
  load_env
  check_ollama
  cmd_infra

  # Seed once if the dev user is missing.
  if compose exec -T postgres psql -U lab -d lab -tAc \
    "SELECT 1 FROM users WHERE email='dev@graphene-lab.org' LIMIT 1" 2>/dev/null | grep -q 1; then
    log "seed data already present (dev user exists)"
  else
    cmd_seed
  fi

  cmd_api
  cmd_web

  echo
  log "stack is up"
  cmd_status
  echo
  log "login: dev@graphene-lab.org / devpassword"
  log "stop everything: ./scripts/dev-local.sh stop"
  log "follow logs: tail -f $API_LOG $WEB_LOG"
}

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  local sub="${1:-all}"
  case "$sub" in
    all|start)   cmd_all ;;
    infra|up)    cmd_infra ;;
    api)         cmd_api ;;
    web)         cmd_web ;;
    seed)        cmd_seed ;;
    openapi)     cmd_openapi ;;
    stop|down)   cmd_stop ;;
    status)      cmd_status ;;
    -h|--help|help) usage ;;
    *) die "unknown command: $sub (try --help)" ;;
  esac
}

main "$@"
