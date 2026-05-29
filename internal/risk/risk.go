// Package risk implements the Risk Register module: structured risk tracking
// scoped to projects (and optionally iterations), with AI-workflow population
// and PI-review flagging.
//
// Authorization always delegates to project.Service.Authorize so that
// workspace/visibility/collaborator rules are enforced consistently.
//
// AI-sourced risks are upserted via UpsertFromWorkflow; prior AI risks for the
// same (project_id, workflow_run_id) are deleted before new ones are inserted
// to keep re-runs idempotent. More precisely: all AI-sourced risks for the
// project whose workflow_run_id is non-null are replaced so that each project
// ends up with exactly one set of AI risks at a time (from the latest run).
// Human-created risks are never touched by this operation.
package risk

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/iteration"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// Risk is the core domain struct for a project risk entry.
type Risk struct {
	ID                 uuid.UUID  `json:"id"`
	ProjectID          uuid.UUID  `json:"project_id"`
	IterationID        *uuid.UUID `json:"iteration_id,omitempty"`
	Seq                int        `json:"seq"`
	Title              string     `json:"title"`
	Likelihood         string     `json:"likelihood"`
	ImpactHeadline     string     `json:"impact_headline"`
	ImpactDescription  string     `json:"impact_description"`
	Mitigation         string     `json:"mitigation"`
	PlanB              string     `json:"plan_b"`
	Status             string     `json:"status"`
	FlaggedForPIReview bool       `json:"flagged_for_pi_review"`
	Source             string     `json:"source"`
	WorkflowRunID      *uuid.UUID `json:"workflow_run_id,omitempty"`
	CreatedBy          uuid.UUID  `json:"created_by"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// PIFlagNotifier notifies workspace owners when a risk is flagged for PI review.
type PIFlagNotifier interface {
	EnqueuePIFlagForWorkspaceOwners(ctx context.Context, workspaceID uuid.UUID, projectName, actionPath, riskTitle, idempotencyPrefix string) error
}

// Service is the risk module's domain service.
type Service struct {
	pool       *pgxpool.Pool
	projects   *project.Service
	iterations *iteration.Service
	rec        audit.Recorder
	log        *slog.Logger
	notify     PIFlagNotifier
}

// NewService constructs a Service.
func NewService(
	pool *pgxpool.Pool,
	projects *project.Service,
	iterations *iteration.Service,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:       pool,
		projects:   projects,
		iterations: iterations,
		rec:        rec,
		log:        log,
	}
}

// SetPIFlagNotifier wires the notify module for manual PI flag emails.
func (s *Service) SetPIFlagNotifier(n PIFlagNotifier) {
	s.notify = n
}

// ─── Scan helper ─────────────────────────────────────────────────────────────

func scanRisk(row pgx.Row) (*Risk, error) {
	var r Risk
	err := row.Scan(
		&r.ID, &r.ProjectID, &r.IterationID, &r.Seq, &r.Title, &r.Likelihood,
		&r.ImpactHeadline, &r.ImpactDescription, &r.Mitigation, &r.PlanB,
		&r.Status, &r.FlaggedForPIReview, &r.Source, &r.WorkflowRunID,
		&r.CreatedBy, &r.CreatedAt, &r.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("risk.not_found", "risk not found")
	}
	if err != nil {
		return nil, fmt.Errorf("risk: scan: %w", err)
	}
	return &r, nil
}

const riskCols = `id, project_id, iteration_id, seq, title, likelihood,
	impact_headline, impact_description, mitigation, plan_b,
	status, flagged_for_pi_review, source, workflow_run_id,
	created_by, created_at, updated_at`

// riskColsR is riskCols with every column qualified by the `r` alias, for
// queries that JOIN another table (e.g. projects) where id/project_id would
// otherwise be ambiguous. Column order matches riskCols so collectRisks scans it.
const riskColsR = `r.id, r.project_id, r.iteration_id, r.seq, r.title, r.likelihood,
	r.impact_headline, r.impact_description, r.mitigation, r.plan_b,
	r.status, r.flagged_for_pi_review, r.source, r.workflow_run_id,
	r.created_by, r.created_at, r.updated_at`

// ─── GetRisk ─────────────────────────────────────────────────────────────────

// GetRisk loads a risk by id. Returns platform.NotFound if absent.
func (s *Service) GetRisk(ctx context.Context, id uuid.UUID) (*Risk, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+riskCols+` FROM risks WHERE id = $1`, id)
	r, err := scanRisk(row)
	if err != nil {
		return nil, err
	}
	return r, nil
}

// ─── createRisk ──────────────────────────────────────────────────────────────

func (s *Service) createRisk(
	ctx context.Context,
	projectID uuid.UUID,
	iterationID *uuid.UUID,
	title, likelihood, impactHeadline, impactDescription, mitigation, planB string,
	createdBy uuid.UUID,
) (*Risk, error) {
	if likelihood == "" {
		likelihood = "low"
	}

	row := s.pool.QueryRow(ctx,
		`INSERT INTO risks
		   (project_id, iteration_id, seq, title, likelihood,
		    impact_headline, impact_description, mitigation, plan_b, created_by)
		 VALUES ($1, $2,
		         COALESCE((SELECT MAX(seq) FROM risks WHERE project_id = $1), 0) + 1,
		         $3, $4, $5, $6, $7, $8, $9)
		 RETURNING `+riskCols,
		projectID, iterationID, title, likelihood,
		impactHeadline, impactDescription, mitigation, planB, createdBy,
	)
	return scanRisk(row)
}

// ─── listByProject ───────────────────────────────────────────────────────────

func (s *Service) listByProject(ctx context.Context, projectID uuid.UUID) ([]*Risk, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+riskCols+` FROM risks WHERE project_id = $1 ORDER BY seq ASC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("risk: list by project: %w", err)
	}
	defer rows.Close()
	return collectRisks(rows)
}

// ─── listByIteration ────────────────────────────────────────────────────────

func (s *Service) listByIteration(ctx context.Context, iterationID uuid.UUID) ([]*Risk, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+riskCols+` FROM risks WHERE iteration_id = $1 ORDER BY seq ASC`,
		iterationID,
	)
	if err != nil {
		return nil, fmt.Errorf("risk: list by iteration: %w", err)
	}
	defer rows.Close()
	return collectRisks(rows)
}

func collectRisks(rows pgx.Rows) ([]*Risk, error) {
	var result []*Risk
	for rows.Next() {
		r, err := scanRisk(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("risk: rows error: %w", err)
	}
	return result, nil
}

// ─── patchRisk ───────────────────────────────────────────────────────────────

func (s *Service) patchRisk(
	ctx context.Context,
	id uuid.UUID,
	title, likelihood, impactHeadline, impactDescription, mitigation, planB, status *string,
	flaggedForPIReview *bool,
) (*Risk, error) {
	setClauses := []string{"updated_at = now()"}
	args := []any{id} // $1
	argIdx := 2

	appendArg := func(clause string, val any) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", clause, argIdx))
		args = append(args, val)
		argIdx++
	}

	if title != nil {
		appendArg("title", *title)
	}
	if likelihood != nil {
		appendArg("likelihood", *likelihood)
	}
	if impactHeadline != nil {
		appendArg("impact_headline", *impactHeadline)
	}
	if impactDescription != nil {
		appendArg("impact_description", *impactDescription)
	}
	if mitigation != nil {
		appendArg("mitigation", *mitigation)
	}
	if planB != nil {
		appendArg("plan_b", *planB)
	}
	if status != nil {
		appendArg("status", *status)
	}
	if flaggedForPIReview != nil {
		appendArg("flagged_for_pi_review", *flaggedForPIReview)
	}

	query := "UPDATE risks SET "
	for i, c := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += c
	}
	query += " WHERE id = $1 RETURNING " + riskCols

	row := s.pool.QueryRow(ctx, query, args...)
	return scanRisk(row)
}

// ─── deleteRisk ──────────────────────────────────────────────────────────────

func (s *Service) deleteRisk(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM risks WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("risk: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("risk.not_found", "risk not found")
	}
	return nil
}

// ─── setPIReview ─────────────────────────────────────────────────────────────

func (s *Service) setPIReview(ctx context.Context, id uuid.UUID, flagged bool) (*Risk, error) {
	row := s.pool.QueryRow(ctx,
		`UPDATE risks SET flagged_for_pi_review = $2, updated_at = now()
		 WHERE id = $1
		 RETURNING `+riskCols,
		id, flagged,
	)
	return scanRisk(row)
}

// ─── ListForReview ────────────────────────────────────────────────────────────

// ListForReview returns risks for a project suitable for AI review.
// If iterationID is non-nil, only risks for that iteration are returned;
// otherwise all risks for the project are returned.
// Authorization is the caller's responsibility.
func (s *Service) ListForReview(ctx context.Context, projectID uuid.UUID, iterationID *uuid.UUID) ([]*Risk, error) {
	if iterationID != nil {
		return s.listByIteration(ctx, *iterationID)
	}
	return s.listByProject(ctx, projectID)
}

// ─── ListFlaggedForPIReviewByWorkspace ────────────────────────────────────────

// ListFlaggedForPIReviewByWorkspace returns risks with flagged_for_pi_review=true
// across all projects in the workspace, ordered created_at DESC, limited to limit rows.
func (s *Service) ListFlaggedForPIReviewByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*Risk, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+riskColsR+`
		 FROM risks r
		 JOIN projects p ON p.id = r.project_id
		 WHERE p.workspace_id = $1
		   AND r.flagged_for_pi_review = true
		 ORDER BY r.created_at DESC
		 LIMIT $2`,
		workspaceID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("risk: list flagged for pi review by workspace: %w", err)
	}
	defer rows.Close()
	return collectRisks(rows)
}

// ─── UpsertFromWorkflow ──────────────────────────────────────────────────────

// UpsertFromWorkflow is called by the AI engine after a successful workflow
// run. It deletes prior AI-sourced risks for the project (that have a
// workflow_run_id set) and inserts fresh ones derived from output.
//
// Output shape expected:
//
//	{
//	  "overall_rating": <number>,
//	  "category_ratings": { "<category>": <number 1-5> },
//	  "mitigations": ["...", ...],
//	  "flagged_for_PI_review": <bool>,
//	  "summary": "..."
//	}
//
// One risk row is created per category_ratings entry. If category_ratings is
// absent or empty, one overall risk is created from overall_rating + summary.
func (s *Service) UpsertFromWorkflow(
	ctx context.Context,
	projectID uuid.UUID,
	iterationID *uuid.UUID,
	workflowKey string,
	runID uuid.UUID,
	output map[string]any,
	createdBy uuid.UUID,
) error {
	if output == nil {
		return nil
	}

	// Parse shared fields from output.
	overallRating := toInt(output["overall_rating"])
	globalFlagged := toBool(output["flagged_for_PI_review"])
	summary := toString(output["summary"])
	var mitigationParts []string
	if m, ok := output["mitigations"]; ok {
		if arr, ok := m.([]any); ok {
			for _, item := range arr {
				if str, ok := item.(string); ok {
					mitigationParts = append(mitigationParts, str)
				}
			}
		}
	}
	mitigationStr := strings.Join(mitigationParts, "; ")

	// Delete prior AI risks for this project (any workflow run).
	_, err := s.pool.Exec(ctx,
		`DELETE FROM risks WHERE project_id = $1 AND source = 'ai' AND workflow_run_id IS NOT NULL`,
		projectID,
	)
	if err != nil {
		return fmt.Errorf("risk: upsert workflow: delete prior: %w", err)
	}

	// Build risk rows to insert.
	type riskRow struct {
		title       string
		likelihood  string
		impactHead  string
		impactDesc  string
		mitigation  string
		flagged     bool
	}

	var rows []riskRow

	categoryRatings, hasCats := output["category_ratings"]
	if hasCats {
		if catMap, ok := categoryRatings.(map[string]any); ok && len(catMap) > 0 {
			for cat, ratingVal := range catMap {
				rating := toInt(ratingVal)
				likelihood := ratingToLikelihood(rating)
				flagged := globalFlagged || rating >= 4
				rows = append(rows, riskRow{
					title:      humanize(cat),
					likelihood: likelihood,
					impactHead: humanize(cat),
					impactDesc: "",
					mitigation: mitigationStr,
					flagged:    flagged,
				})
			}
		}
	}

	if len(rows) == 0 {
		// Fallback: single overall risk.
		likelihood := ratingToLikelihood(overallRating)
		rows = append(rows, riskRow{
			title:      "Overall Risk (" + workflowKey + ")",
			likelihood: likelihood,
			impactHead: "Overall assessment",
			impactDesc: summary,
			mitigation: mitigationStr,
			flagged:    globalFlagged || overallRating >= 4,
		})
	}

	// Insert each row.
	for _, row := range rows {
		_, err := s.pool.Exec(ctx,
			`INSERT INTO risks
			   (project_id, iteration_id, seq, title, likelihood,
			    impact_headline, impact_description, mitigation,
			    flagged_for_pi_review, source, workflow_run_id, created_by)
			 VALUES ($1, $2,
			         COALESCE((SELECT MAX(seq) FROM risks WHERE project_id = $1), 0) + 1,
			         $3, $4, $5, $6, $7, $8, 'ai', $9, $10)`,
			projectID, iterationID, row.title, row.likelihood,
			row.impactHead, row.impactDesc, row.mitigation,
			row.flagged, runID, createdBy,
		)
		if err != nil {
			s.log.Warn("risk: upsert workflow: insert row failed", "title", row.title, "err", err)
		}
	}

	return nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func ratingToLikelihood(rating int) string {
	switch {
	case rating >= 4:
		return "high"
	case rating == 3:
		return "med"
	default:
		return "low"
	}
}

// humanize converts snake_case or camelCase identifiers to "Title Case Words".
func humanize(s string) string {
	// Replace underscores and hyphens with spaces.
	s = strings.NewReplacer("_", " ", "-", " ").Replace(s)
	// Insert spaces before capital letters in camelCase.
	var out []rune
	for i, r := range s {
		if i > 0 && unicode.IsUpper(r) && !unicode.IsSpace(rune(s[i-1])) {
			out = append(out, ' ')
		}
		out = append(out, r)
	}
	s = string(out)
	// Title-case each word.
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

func toInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return 0
}

func toBool(v any) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

func toString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
