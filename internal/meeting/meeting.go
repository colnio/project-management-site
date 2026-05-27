// Package meeting implements the Meetings module: workspace-scoped meeting
// records with optional project linkage, attendees, decisions, and action
// items stored as freeform JSONB arrays.
//
// Authorization: read operations require workspace membership (any role);
// write operations also require workspace membership. Project-scoped meetings
// can additionally be checked via projects.Authorize, but workspace membership
// is the primary gate.
package meeting

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// Meeting is the core domain struct for a meeting record.
type Meeting struct {
	ID          uuid.UUID       `json:"id"`
	WorkspaceID uuid.UUID       `json:"workspace_id"`
	ProjectID   *uuid.UUID      `json:"project_id,omitempty"`
	Title       string          `json:"title"`
	Kind        string          `json:"kind"`
	Chair       *uuid.UUID      `json:"chair,omitempty"`
	StartAt     time.Time       `json:"start_at"`
	EndAt       *time.Time      `json:"end_at,omitempty"`
	Location    string          `json:"location"`
	Agenda      string          `json:"agenda"`
	Notes       string          `json:"notes"`
	Attendees   json.RawMessage `json:"attendees"`
	Decisions   json.RawMessage `json:"decisions"`
	ActionItems json.RawMessage `json:"action_items"`
	CreatedBy   uuid.UUID       `json:"created_by"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// Service is the meeting module's domain service.
type Service struct {
	pool     *pgxpool.Pool
	org      *org.Service
	projects *project.Service
	rec      audit.Recorder
	log      *slog.Logger
}

// NewService constructs a Service.
func NewService(
	pool *pgxpool.Pool,
	orgSvc *org.Service,
	projects *project.Service,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:     pool,
		org:      orgSvc,
		projects: projects,
		rec:      rec,
		log:      log,
	}
}

// ─── Scan helper ─────────────────────────────────────────────────────────────

const meetingCols = `id, workspace_id, project_id, title, kind, chair,
	start_at, end_at, location, agenda, notes,
	attendees, decisions, action_items,
	created_by, created_at, updated_at`

func scanMeeting(row pgx.Row) (*Meeting, error) {
	var m Meeting
	err := row.Scan(
		&m.ID, &m.WorkspaceID, &m.ProjectID, &m.Title, &m.Kind, &m.Chair,
		&m.StartAt, &m.EndAt, &m.Location, &m.Agenda, &m.Notes,
		&m.Attendees, &m.Decisions, &m.ActionItems,
		&m.CreatedBy, &m.CreatedAt, &m.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("meeting.not_found", "meeting not found")
	}
	if err != nil {
		return nil, fmt.Errorf("meeting: scan: %w", err)
	}
	return &m, nil
}

// ─── checkWorkspaceMember ────────────────────────────────────────────────────

// checkWorkspaceMember returns a Forbidden error if the principal is not a
// member of the workspace (and not a system admin).
func (s *Service) checkWorkspaceMember(ctx context.Context, p *platform.Principal, workspaceID uuid.UUID) error {
	_, isMember, err := s.org.WorkspaceRole(ctx, workspaceID, p.UserID)
	if err != nil {
		return err
	}
	if !isMember && !p.IsSystemAdmin {
		return platform.Forbidden("not a member of this workspace")
	}
	return nil
}

// ─── GetMeeting ──────────────────────────────────────────────────────────────

// GetMeeting loads a meeting by id.
func (s *Service) GetMeeting(ctx context.Context, id uuid.UUID) (*Meeting, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT `+meetingCols+` FROM meetings WHERE id = $1`, id)
	return scanMeeting(row)
}

// ─── createMeeting ───────────────────────────────────────────────────────────

func (s *Service) createMeeting(
	ctx context.Context,
	workspaceID uuid.UUID,
	projectID *uuid.UUID,
	title, kind string,
	chair *uuid.UUID,
	startAt time.Time,
	endAt *time.Time,
	location, agenda, notes string,
	attendees, decisions, actionItems json.RawMessage,
	createdBy uuid.UUID,
) (*Meeting, error) {
	if kind == "" {
		kind = "sync"
	}
	if len(attendees) == 0 {
		attendees = json.RawMessage("[]")
	}
	if len(decisions) == 0 {
		decisions = json.RawMessage("[]")
	}
	if len(actionItems) == 0 {
		actionItems = json.RawMessage("[]")
	}

	row := s.pool.QueryRow(ctx,
		`INSERT INTO meetings
		   (workspace_id, project_id, title, kind, chair,
		    start_at, end_at, location, agenda, notes,
		    attendees, decisions, action_items, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		 RETURNING `+meetingCols,
		workspaceID, projectID, title, kind, chair,
		startAt, endAt, location, agenda, notes,
		[]byte(attendees), []byte(decisions), []byte(actionItems), createdBy,
	)
	return scanMeeting(row)
}

// ─── listByWorkspace ─────────────────────────────────────────────────────────

func (s *Service) listByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*Meeting, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+meetingCols+`
		 FROM meetings WHERE workspace_id = $1
		 ORDER BY start_at DESC`,
		workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("meeting: list by workspace: %w", err)
	}
	defer rows.Close()

	var result []*Meeting
	for rows.Next() {
		m, err := scanMeeting(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("meeting: list rows: %w", err)
	}
	return result, nil
}

// ─── patchMeeting ────────────────────────────────────────────────────────────

func (s *Service) patchMeeting(
	ctx context.Context,
	id uuid.UUID,
	title, kind, location, agenda, notes *string,
	chair **uuid.UUID, // pointer-to-pointer: nil = no change
	startAt *time.Time,
	endAt **time.Time,
	attendees, decisions, actionItems json.RawMessage,
) (*Meeting, error) {
	setClauses := []string{"updated_at = now()"}
	args := []any{id} // $1
	argIdx := 2

	appendArg := func(col string, val any) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, argIdx))
		args = append(args, val)
		argIdx++
	}

	if title != nil {
		appendArg("title", *title)
	}
	if kind != nil {
		appendArg("kind", *kind)
	}
	if location != nil {
		appendArg("location", *location)
	}
	if agenda != nil {
		appendArg("agenda", *agenda)
	}
	if notes != nil {
		appendArg("notes", *notes)
	}
	if chair != nil {
		appendArg("chair", *chair) // *chair may be nil (clear chair)
	}
	if startAt != nil {
		appendArg("start_at", *startAt)
	}
	if endAt != nil {
		appendArg("end_at", *endAt) // *endAt may be nil (clear end_at)
	}
	if len(attendees) > 0 {
		appendArg("attendees", []byte(attendees))
	}
	if len(decisions) > 0 {
		appendArg("decisions", []byte(decisions))
	}
	if len(actionItems) > 0 {
		appendArg("action_items", []byte(actionItems))
	}

	query := "UPDATE meetings SET "
	for i, c := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += c
	}
	query += " WHERE id = $1 RETURNING " + meetingCols

	row := s.pool.QueryRow(ctx, query, args...)
	m, err := scanMeeting(row)
	if err != nil {
		return nil, fmt.Errorf("meeting: patch: %w", err)
	}
	return m, nil
}

// ─── deleteMeeting ───────────────────────────────────────────────────────────

func (s *Service) deleteMeeting(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM meetings WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("meeting: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return platform.NotFound("meeting.not_found", "meeting not found")
	}
	return nil
}
