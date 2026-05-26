# Graphene Lab — Web Frontend

React SPA frontend for the Graphene Lab project-management platform.

## Prerequisites

- **Node.js** ≥ 18, **pnpm** ≥ 8
- The Go API running at `:8080` (Postgres via Docker must be up):
  ```sh
  # from the repo root
  go run ./cmd/api
  ```

## Getting started

```sh
cd web
pnpm install
pnpm dev        # starts Vite dev server on http://localhost:5173
```

Dev credentials (seeded in the database): `dev@graphene-lab.org` / `devpassword`

The Vite dev server proxies all `/v1/*` requests to `http://localhost:8080`.

## Available scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server on :5173 |
| `pnpm build` | Type-check + production build into `dist/` |
| `pnpm test` | Run tests with Vitest (watch mode) |
| `pnpm test --run` | Run tests once and exit |
| `pnpm openapi` | Regenerate `src/api/schema.d.ts` from the live API |
| `pnpm typecheck` | Type-check without building |

## API type generation

```sh
# Ensure the API is running, then:
pnpm openapi
```

This runs `openapi-typescript http://localhost:8080/openapi.json -o src/api/schema.d.ts` and commits a typed representation of all 47 API endpoints.

## Auth flow

1. On app load, `AuthProvider` sends `POST /v1/auth/refresh` (uses the httpOnly `refresh_token` cookie). If it succeeds, the session is restored silently.
2. If not, the user is redirected to `/login`.
3. On successful login, the `access_token` is stored **in memory only** (never localStorage). All API calls receive `Authorization: Bearer <token>`.
4. On a 401 response, the client retries the refresh once, then re-fires the original request. If refresh also fails, the user is redirected to `/login`.
5. Logout calls `POST /v1/auth/logout`, clears the in-memory token, and redirects.

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | `LoginPage` | Email + password login |
| `/` | `HomePage` | Greeting + workspace list |
| `/workspaces` | `WorkspacesPage` | All workspaces + projects, create dialogs |
| `/projects/:projectId` | `ProjectDetailPage` | Project detail with tabbed sub-resources |

The `?tab=` query param on `/projects/:projectId` controls which tab is shown: `overview`, `samples`, `experiments`, `iterations`, `artifacts`.

## Architecture

```
web/
  src/
    api/
      client.ts      — typed fetch wrapper (Bearer + 401 retry)
      schema.d.ts    — generated OpenAPI types
      types.ts       — clean re-exports from schema
    components/
      AppShell.tsx   — sidebar + topbar + ⌘K palette
      Avatar.tsx     — initials avatar
      CommandPalette.tsx — fuzzy ⌘K project/workspace jump
      LoadingState.tsx   — loading / error / empty states
      StatusPill.tsx     — status + kind pills
    hooks/
      useAuth.tsx    — AuthProvider + useAuth context
      useQueries.ts  — TanStack Query hooks for all resources
    mocks/
      handlers.ts    — MSW request handlers (used in tests)
    pages/
      LoginPage.tsx
      HomePage.tsx
      WorkspacesPage.tsx
      ProjectDetailPage.tsx
    router.tsx       — TanStack Router route tree
    main.tsx         — app entry point
    styles/
      global.css     — design system CSS (from lab.css design ref)
    test/
      setup.ts       — Vitest + MSW global setup
      api-client.test.ts
      login-form.test.tsx
```

## Manual verification

1. `pnpm install` — should complete cleanly
2. Start the API (`go run ./cmd/api` from repo root)
3. `pnpm openapi` — generates `src/api/schema.d.ts`
4. `pnpm exec tsc --noEmit` — should be clean
5. `pnpm build` — produces `dist/`
6. `pnpm test --run` — all tests pass
7. `pnpm dev` — visit `http://localhost:5173`, log in with dev credentials, browse workspaces and projects
