.PHONY: up down migrate seed api web dev test openapi ollama tidy

COMPOSE := docker-compose -f deploy/docker-compose.dev.yml

up: ## start local services (all except ollama)
	$(COMPOSE) up -d

down: ## tear down the compose stack
	$(COMPOSE) down

ollama: ## verify ollama is running and the model is pulled
	@curl -sf http://localhost:11434/api/tags >/dev/null && echo "ollama: up" || echo "ollama: NOT running (run 'ollama serve')"

migrate: ## run goose migrations (also runs automatically on api boot)
	go run ./cmd/api -migrate-only 2>/dev/null || go run ./cmd/migrate 2>/dev/null || echo "migrations run on 'make api' boot"

seed: ## load demo workspace/projects/samples
	go run ./cmd/seed

api: ## air-reload Go server on :8080
	@command -v air >/dev/null 2>&1 && air || go run ./cmd/api

web: ## vite dev server on :5173 (proxies /v1 -> :8080)
	cd web && pnpm install && pnpm dev

dev: up ## up + migrate + api + web together
	@echo "services up; starting api + web"
	@$(MAKE) -j2 api web

test: ## go test ./... + vitest
	go test ./...
	@cd web && pnpm test --run 2>/dev/null || true

openapi: ## regenerate web/src/api types from /openapi.json
	cd web && pnpm openapi

tidy:
	go mod tidy
