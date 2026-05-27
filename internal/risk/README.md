# Risk Module (H1)

First-class **Risk Register** scoped to projects (and optionally iterations). A
risk records likelihood, impact, mitigation, and a PI-review flag. Risks are
authored by humans or materialized by the AI risk-assessment workflows.

## Domain struct

```go
type Risk struct {
    ID                 uuid.UUID
    ProjectID          uuid.UUID
    IterationID        *uuid.UUID // optional; risk scoped to an iteration
    Seq                int        // human-facing # within the project
    Title              string
    Likelihood         string     // high|med|low
    ImpactHeadline     string
    ImpactDescription  string
    Mitigation         string
    PlanB              string
    Status             string     // open|mitigated|accepted|closed
    FlaggedForPIReview bool
    Source             string     // human|ai
    WorkflowRunID      *uuid.UUID // set when source=ai
    CreatedBy          uuid.UUID
    CreatedAt          time.Time
    UpdatedAt          time.Time
}
```

## Service

```go
func NewService(pool *pgxpool.Pool, projects *project.Service, rec audit.Recorder, log *slog.Logger) *Service
func Register(api huma.API, svc *Service)

// Called by the AI workflow engine (wired via ai.Service.SetRiskService) to
// materialize AI-sourced risks from a completed risk-assessment run. Idempotent
// per run: prior AI risks for the run are replaced.
func (s *Service) UpsertFromWorkflow(ctx context.Context, projectID uuid.UUID, iterationID *uuid.UUID, workflowKey string, runID uuid.UUID, output map[string]any, createdBy uuid.UUID) error
```

## Authorization

Delegates to `project.Service.Authorize`. Reads require `org.RoleViewer`; writes
require `org.RoleEditor`. `/v1/risks/{id}` and `/v1/iterations/{id}/risks` load
the owning project first to authorize.

## HTTP Endpoints

| Method | Path | Role | Notes |
|--------|------|------|-------|
| `POST` | `/v1/projects/{id}/risks` | Editor | Create. Per-project `seq` = `COALESCE(MAX(seq),0)+1`. |
| `GET` | `/v1/projects/{id}/risks` | Viewer | List project risks. |
| `GET` | `/v1/iterations/{id}/risks` | Viewer | List risks scoped to an iteration. |
| `PATCH` | `/v1/risks/{id}` | Editor | Partial update. |
| `DELETE` | `/v1/risks/{id}` | Editor | Delete. |
| `POST` | `/v1/risks/{id}/pi-review` | Editor | Body `{flagged bool}` — set/clear the PI-review flag. |

## PI sign-off gate

The iteration module blocks moving an iteration to `active`
(`409 iteration.blocked_by_risk`) while it has a `high`-likelihood risk that is
`flagged_for_pi_review` and still `open`. Clear the flag via the pi-review
endpoint to unblock activation.

## Migrations

- `00120_risks.sql`: creates the `risks` table + indexes on `project_id` and `iteration_id`.
