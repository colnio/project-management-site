# Deployment Architecture & Requirements

This document describes how to deploy the Lab Project-Management site: the
runtime components, their ports, the full configuration surface, and three
reference topologies — **single-VM**, **two-VM**, and **managed-cloud** — with
per-topology setup steps.

For local development setup see [DEVELOPMENT.md](DEVELOPMENT.md); for the
as-built internal design see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Components & ports

The system is a **modular monolith**: one Go binary (`cmd/api`) exposes the REST
API, the MCP server, and the background job worker (River) in a single process.
The web UI is a static React/Vite SPA. Everything else is an external service.

| Component | Default port | Required? | Can be remote? | Notes |
|-----------|-------------|-----------|----------------|-------|
| **Go API** (`cmd/api`) | 8080 | **Yes** | — | REST `/v1`, MCP at `/mcp`, runs goose migrations + River worker on boot |
| **Web SPA** (Vite build) | 5173 (dev) / 80–443 (prod) | **Yes** | Yes (CDN/static host) | Static files; the Go API does **not** serve them — a reverse proxy does |
| **PostgreSQL 16** | 5432 | **Yes** | Yes | Application data **and** River job queue tables |
| **S3 / MinIO** | 9000 (API), 9001 (console) | **Yes** | Yes | Artifact originals + rendered derivatives |
| **SMTP / SES** | 1025 (Mailpit dev) / 587 (SES) | **Yes** | Yes | Transactional email + daily digests |
| **nbconvert** sidecar | 8090 | Optional* | Yes | *Required to render Jupyter notebook artifacts to HTML |
| **SearXNG** | 8888 | Optional* | Yes | *Required only if the AI agent's web-search tool is used |
| **Ollama / OpenAI-compatible model** | 11434 (Ollama) | Optional* | Yes | *Required for AI chat + workflows; AI degrades gracefully (HTTP 503 `ai.unavailable`) if absent |

`*` Optional components disable only their feature; the core app runs without them.

### Process model
- A single API process handles HTTP **and** background jobs (River, Postgres-backed). No separate worker deployment is needed, but you may run multiple API replicas — River uses leader election so periodic jobs (the daily digest) fire once cluster-wide.
- Migrations (goose) and River schema setup run **idempotently on every boot** behind an advisory lock, so rolling deploys are safe.

---

## 2. Requirements

### Build-time
- **Go 1.25.x** (module targets `go 1.25.7`)
- **Node 20+ and pnpm** (web build: `pnpm install && pnpm build` → static `web/dist/`)
- **Docker + Docker Compose** (local dev stack and the nbconvert image)

### Runtime
- **PostgreSQL 16**
- **S3-compatible object store** (AWS S3, MinIO, etc.) with two buckets (originals, rendered)
- **SMTP relay** (or AWS SES)
- **An OpenAI-compatible chat-completions endpoint** for AI features — local Ollama or a hosted provider (OpenRouter, etc.). Must support function/tool calling.
- Optional sidecars: nbconvert (Python 3.12 image, built from `deploy/nbconvert/`), SearXNG.

### Resource sizing (guidance)
- **API**: modest — 1 vCPU / 1–2 GB RAM per replica is ample for a lab-scale workload.
- **Postgres**: 2 vCPU / 4 GB RAM + SSD for a small team; scale with data + job volume.
- **Local model (if self-hosting Ollama)**: the heavy component. `qwen2.5:14b-instruct` (the calibrated default, see [AI_E2E_TESTING.md](AI_E2E_TESTING.md)) needs ~9 GB of weights plus headroom — a GPU with ≥12 GB VRAM is strongly recommended; CPU-only works but is slow (raise the AI timeouts, §3). A 7B model halves the footprint at some quality cost.
- **MinIO**: disk sized to expected artifact volume (PDFs, notebooks, images + rendered derivatives).

---

## 3. Configuration reference

All configuration is environment variables, loaded by `internal/config` (a `.env`
file is read in dev; real environment wins in prod). The AI provider/model is
additionally selected by `aiconf.local.json` (gitignored; see
`aiconf.ollama.example.json`). Start from [`.env.example`](../.env.example).

### Server
| Var | Default | Prod notes |
|-----|---------|-----------|
| `APP_ENV` | development | set `production` |
| `PORT` | 8080 | |
| `WEB_ORIGIN` | http://localhost:5173 | browser-facing UI origin (CORS) — set to your real domain |

### Database
| Var | Default | Prod notes |
|-----|---------|-----------|
| `DATABASE_URL` | postgres://lab:lab@localhost:5432/lab?sslmode=disable | real creds + `sslmode=require` |

### Object storage (S3/MinIO)
| Var | Default | Prod notes |
|-----|---------|-----------|
| `S3_ENDPOINT` | http://localhost:9000 | S3 / MinIO endpoint |
| `S3_REGION` | us-east-1 | |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | minioadmin | **rotate** |
| `S3_USE_PATH_STYLE` | true | `true` for MinIO; usually `false` for AWS S3 |
| `S3_BUCKET_ORIGINALS` | artifacts-originals | |
| `S3_BUCKET_RENDERED` | artifacts-rendered | |
| `S3_PUBLIC_URL_BASE` | http://localhost:9000 | browser-reachable base for rendered assets |

### Email
| Var | Default | Prod notes |
|-----|---------|-----------|
| `SMTP_HOST` | localhost | SES/relay host |
| `SMTP_PORT` | 1025 | 587 for SES STARTTLS |
| `SMTP_FROM` | no-reply@graphene-lab.org | verified sender |
| `SMTP_USER` / `SMTP_PASSWORD` | (empty) | set for authenticated relays/SES |

### Auth & cookies
| Var | Default | Prod notes |
|-----|---------|-----------|
| `JWT_SIGNING_KEY` | dev-insecure-… | **rotate**, ≥32 bytes |
| `INVITE_SIGN_KEY` | dev-insecure-… | **rotate**, ≥32 bytes |
| `DIGEST_SIGN_KEY` | dev-insecure-… | **rotate**, ≥32 bytes |
| `ACCESS_TOKEN_TTL` | 15m | |
| `REFRESH_TOKEN_TTL` | 720h | |
| `COOKIE_DOMAIN` | localhost | set to your domain |
| `COOKIE_SECURE` | false | **`true`** in prod (HTTPS) |
| `ALLOWED_EMAIL_DOMAINS` | nus.edu.sg,u.nus.edu | self-registration allowlist |

### Sidecars
| Var | Default |
|-----|---------|
| `NBCONVERT_URL` | http://localhost:8090 |
| `SEARXNG_URL` | http://localhost:8888 |

### AI
| Var | Default | Notes |
|-----|---------|-------|
| `OLLAMA_BASE_URL` | http://localhost:11434 | base for the model endpoint |
| `AI_CHAT_MODEL` | qwen2.5:7b-instruct | fallback; `aiconf.local.json` selects the active model |
| `AI_WORKFLOW_MODEL` | qwen2.5:7b-instruct | |
| `AI_OUTBOUND_TIMEOUT_SECONDS` | 30 | raise (e.g. 240) for slow local models |
| `AI_WORKFLOW_TIMEOUT_SECONDS` | 150 | raise (e.g. 900) for slow local models |

### Digest scheduling
| Var | Default |
|-----|---------|
| `DIGEST_HOUR` | 7 |
| `LAB_TIMEZONE` | Asia/Singapore |

> **Must-rotate before any shared/prod deploy:** `JWT_SIGNING_KEY`,
> `INVITE_SIGN_KEY`, `DIGEST_SIGN_KEY`, `S3_ACCESS_KEY`/`S3_SECRET_KEY`, the
> Postgres credentials, plus `COOKIE_SECURE=true` and a real
> `COOKIE_DOMAIN`/`WEB_ORIGIN`.

---

## 4. Topologies

### 4.1 Single-VM (all-in-one)

Best for demos, evaluation, and small single-lab deployments. Everything runs on
one host; the data services come from Docker Compose, the API is a native binary
(or container), and the web SPA is served as static files by a reverse proxy that
also proxies `/v1` and `/mcp` to the API.

```
┌──────────────────────────── Single VM ────────────────────────────┐
│                                                                    │
│   Reverse proxy (nginx/Caddy) :80/:443                             │
│     ├── /            → static web/dist                             │
│     └── /v1, /mcp    → API :8080                                   │
│                                                                    │
│   API binary :8080  ──┬── Postgres :5432    (compose)             │
│   (+ River worker)    ├── MinIO :9000/9001  (compose)             │
│                       ├── Mailpit :1025     (compose, or real SMTP)│
│                       ├── nbconvert :8090   (compose)             │
│                       ├── SearXNG :8888     (compose)             │
│                       └── Ollama :11434     (local, GPU if present)│
└────────────────────────────────────────────────────────────────────┘
```

**Setup**
1. `cp .env.example .env`, fill in secrets (rotate the keys in §3), set `APP_ENV=production`, `COOKIE_SECURE=true`, real `WEB_ORIGIN`/`COOKIE_DOMAIN`.
2. `docker compose -f deploy/docker-compose.dev.yml up -d` (Postgres, MinIO + bucket init, Mailpit, nbconvert, SearXNG). For prod replace Mailpit with a real relay; the compose file already binds services to `127.0.0.1` only.
3. Provide a model: `ollama serve` + `ollama pull qwen2.5:14b-instruct`, then `cp aiconf.ollama.example.json aiconf.local.json` (or point it at a hosted endpoint).
4. Build the API: `go build -o /usr/local/bin/lab-pm-api ./cmd/api` and run it (systemd unit recommended). Migrations + River setup run on boot.
5. Build the web: `cd web && pnpm install && pnpm build` → serve `web/dist/` from the reverse proxy, proxying `/v1`, `/mcp`, `/openapi.json`, `/llms.txt` to `:8080`.
6. Seed demo data (optional): `go run ./cmd/seed`.

### 4.2 Two-VM (app / data split)

Best for self-hosted production at modest scale: isolate stateful data services
from the stateless app tier so each can be sized, backed up, and restarted
independently.

```
┌──────────── App VM ─────────────┐        ┌────────── Data VM ──────────┐
│  Reverse proxy :80/:443         │        │  Postgres :5432             │
│    ├── / → static web/dist      │        │  MinIO :9000/:9001          │
│    └── /v1,/mcp → API :8080     │──────▶ │  (private network only)     │
│  API binary :8080 (+ worker)    │  TLS / └─────────────────────────────┘
│  nbconvert :8090                │  private net
│  SearXNG :8888                  │
└─────────────────────────────────┘
   Model: Ollama on a 3rd GPU host, or a hosted OpenAI-compatible API
```

**Setup**
- **Data VM**: run Postgres 16 and MinIO (Compose subset or native), reachable from the App VM over a **private network only**. Configure backups/retention here.
- **App VM**: deploy the API binary + reverse proxy + static web + nbconvert/SearXNG sidecars. Point `DATABASE_URL`, `S3_ENDPOINT`, and `S3_PUBLIC_URL_BASE` at the Data VM. The model lives on a dedicated GPU host (`OLLAMA_BASE_URL`) or a hosted endpoint via `aiconf.local.json`.
- Scale the App VM horizontally if needed — River's leader election keeps the daily digest single-fire across replicas.

### 4.3 Managed-cloud

Best for hands-off operations: replace every self-hosted dependency with a
managed equivalent and run the API as a container.

```
┌── API container (ECS/Fly/Cloud Run/K8s) :8080 ──┐
│   (+ River worker; scale replicas freely)       │
└───┬───────────┬────────────┬───────────┬────────┘
    │           │            │           │
  RDS/Cloud   S3          SES        Hosted model
  SQL :5432   (buckets)   (SMTP)     (OpenRouter / etc.)
              + CloudFront for web/dist (static hosting/CDN)
```

**Mapping**
- Postgres → **RDS / Cloud SQL** (`DATABASE_URL`, `sslmode=require`).
- Object store → **S3** (`S3_USE_PATH_STYLE=false`, IAM-scoped keys, `S3_PUBLIC_URL_BASE` = CloudFront/bucket URL).
- Email → **SES** (`SMTP_HOST`/`PORT`/`USER`/`PASSWORD`, verified `SMTP_FROM`).
- Model → **hosted OpenAI-compatible API** via `aiconf.local.json` (no GPU to operate).
- nbconvert/SearXNG → run as sidecar containers in the same task/pod, or drop them if those features aren't needed.
- Web SPA → upload `web/dist/` to a static host/CDN; route `/v1`, `/mcp` to the API service.

**Setup**
1. Build and push the API image (`go build ./cmd/api` in a minimal container).
2. Provision RDS, S3 buckets, SES, and a model endpoint; inject all config from §3 as the task/pod environment (use a secrets manager for the keys).
3. Deploy the API service (migrations run on boot). Run ≥2 replicas for availability — River handles single-fire periodic jobs.
4. Publish `web/dist/` to the CDN; configure the edge/proxy to send `/v1`, `/mcp`, `/openapi.json`, `/llms.txt` to the API.

---

## 5. Operational notes

- **Migrations**: automatic and idempotent on boot (goose + River, advisory-locked). No manual migration step in any topology; rolling deploys are safe.
- **Health**: `GET /openapi.json` is a cheap liveness probe; the API listens on `PORT`.
- **TLS**: terminate at the reverse proxy / load balancer. Set `COOKIE_SECURE=true` and a correct `COOKIE_DOMAIN` so refresh-token cookies work.
- **MCP**: mounted at `/mcp` (SSE), authenticated with a Personal Access Token (create one in **Settings → API tokens**). Tools are read-only and forward the caller's PAT scopes.
- **Email sink (dev)**: Mailpit UI at `:8025`. **Object console (dev)**: MinIO at `:9001`.
- **AI graceful degradation**: with no reachable model / missing `aiconf.local.json`, AI endpoints return `503 ai.unavailable` and the rest of the app is unaffected.
</content>
