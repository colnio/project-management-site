// Package platform wires the HTTP server: chi router, huma API, the middleware
// chain, and the structured error envelope. Domain modules register their
// routes against the *huma.API returned here.
package platform

import (
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Server bundles the chi router and the huma API so cmd/api can register
// module routes and start listening.
type Server struct {
	Router chi.Router
	API    huma.API
	Logger *slog.Logger
}

// New constructs the server with the full middleware chain and a huma API that
// emits OpenAPI 3.1 and uses the structured error envelope. Middleware is
// installed here (before huma mounts routes) in the order:
// requestID → logging → recover → CORS → auth → rate-limit → idempotency.
func New(deps *ServerDeps) *Server {
	logger := deps.Logger
	// Route framework errors through our envelope.
	huma.NewError = humaNewError

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(RequestLogger(logger))
	r.Use(middleware.Recoverer)
	r.Use(CORS(deps.WebOrigin))
	r.Use(AuthResolver(deps.Verifier))
	r.Use(NewRateLimiter(deps.PerMinute).Middleware())
	r.Use(Idempotency(deps.Idempotency))

	config := huma.DefaultConfig("Lab Project Management API", "1.0.0")
	config.DocsPath = "/docs"
	config.OpenAPIPath = "/openapi"
	config.Info.Description = "REST API for the lab project-management platform. " +
		"Every action available in the UI is available here; the in-app AI assistant " +
		"uses the same surface. See /llms.txt for an agent-oriented summary."
	config.Servers = []*huma.Server{{URL: "/"}}

	api := humachi.New(r, config)

	s := &Server{Router: r, API: api, Logger: logger}
	s.registerSystemRoutes()
	return s
}

func (s *Server) registerSystemRoutes() {
	// Liveness probe (plain handler, outside huma so it has no auth).
	// huma serves the spec at /openapi.json and /openapi.yaml automatically.
	s.Router.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
}

// MountLLMSTxt serves a static /llms.txt agent-discovery stub. Track F4 will
// generate this from the OpenAPI spec; for now it points agents at the docs.
func (s *Server) MountLLMSTxt(body string) {
	s.Router.Get("/llms.txt", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte(body))
	})
}
