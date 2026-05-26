// Package sample implements the Sample module (B4): physical and digital
// sample tracking scoped to projects, with lineage graph support.
//
// Authorization always delegates to project.Service.Authorize so that
// workspace/visibility/collaborator rules are enforced consistently.
//
// The "properties" field is a freeform JSONB document. On PATCH it is
// REPLACED in full — callers that need merge behaviour must read-then-write.
// Deep merge is a v2 concern and intentionally out of scope here.
//
// Lineage traversal is bounded to 25 hops in each direction (ancestor /
// descendant) to prevent unbounded queries on cyclic graphs.
package sample

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
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
)

// Sample is the core domain struct for a lab sample.
type Sample struct {
	ID                uuid.UUID       `json:"id"`
	ProjectID         uuid.UUID       `json:"project_id"`
	Identifier        string          `json:"identifier"`
	Name              string          `json:"name"`
	Description       string          `json:"description"`
	Kind              string          `json:"kind"`
	Properties        json.RawMessage `json:"properties"`
	Status            string          `json:"status"`
	DescriptionPageID *uuid.UUID      `json:"description_page_id,omitempty"`
	CreatedBy         uuid.UUID       `json:"created_by"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// Service is the sample module's domain service.
type Service struct {
	pool     *pgxpool.Pool
	projects *project.Service
	rec      audit.Recorder
	log      *slog.Logger
}

// NewService constructs a Service.
func NewService(
	pool *pgxpool.Pool,
	projects *project.Service,
	rec audit.Recorder,
	log *slog.Logger,
) *Service {
	return &Service{
		pool:     pool,
		projects: projects,
		rec:      rec,
		log:      log,
	}
}

// GetSample loads a sample by id. Returns platform.NotFound if absent.
// Exported for future cross-module use (e.g. experiment module).
func (s *Service) GetSample(ctx context.Context, id uuid.UUID) (*Sample, error) {
	var sm Sample
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, identifier, name, description, kind,
		        properties, status, description_page_id, created_by, created_at, updated_at
		 FROM samples WHERE id = $1`,
		id,
	).Scan(
		&sm.ID, &sm.ProjectID, &sm.Identifier, &sm.Name, &sm.Description, &sm.Kind,
		&sm.Properties, &sm.Status, &sm.DescriptionPageID, &sm.CreatedBy, &sm.CreatedAt, &sm.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("sample.not_found", "sample not found")
	}
	if err != nil {
		return nil, fmt.Errorf("sample: get sample: %w", err)
	}
	return &sm, nil
}

// createSample inserts a new sample into the project.
func (s *Service) createSample(
	ctx context.Context,
	projectID uuid.UUID,
	identifier, name, description, kind string,
	properties json.RawMessage,
	status string,
	createdBy uuid.UUID,
) (*Sample, error) {
	if kind == "" {
		kind = "other"
	}
	if status == "" {
		status = "active"
	}
	if len(properties) == 0 {
		properties = json.RawMessage("{}")
	}

	var sm Sample
	err := s.pool.QueryRow(ctx,
		`INSERT INTO samples
		   (project_id, identifier, name, description, kind, properties, status, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, project_id, identifier, name, description, kind,
		           properties, status, description_page_id, created_by, created_at, updated_at`,
		projectID, identifier, name, description, kind, []byte(properties), status, createdBy,
	).Scan(
		&sm.ID, &sm.ProjectID, &sm.Identifier, &sm.Name, &sm.Description, &sm.Kind,
		&sm.Properties, &sm.Status, &sm.DescriptionPageID, &sm.CreatedBy, &sm.CreatedAt, &sm.UpdatedAt,
	)
	if err != nil {
		// Detect unique constraint violation on (project_id, identifier).
		if isUniqueViolation(err) {
			return nil, platform.Conflict("sample.identifier_taken", "a sample with this identifier already exists in the project")
		}
		return nil, fmt.Errorf("sample: create sample: %w", err)
	}
	return &sm, nil
}

// listSamples returns samples for a project, optionally filtered by kind.
func (s *Service) listSamples(ctx context.Context, projectID uuid.UUID, kind string) ([]*Sample, error) {
	query := `SELECT id, project_id, identifier, name, description, kind,
	                 properties, status, description_page_id, created_by, created_at, updated_at
	          FROM samples WHERE project_id = $1`
	args := []any{projectID}
	if kind != "" {
		query += " AND kind = $2"
		args = append(args, kind)
	}
	query += " ORDER BY created_at"

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("sample: list samples: %w", err)
	}
	defer rows.Close()

	var result []*Sample
	for rows.Next() {
		var sm Sample
		if err := rows.Scan(
			&sm.ID, &sm.ProjectID, &sm.Identifier, &sm.Name, &sm.Description, &sm.Kind,
			&sm.Properties, &sm.Status, &sm.DescriptionPageID, &sm.CreatedBy, &sm.CreatedAt, &sm.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("sample: scan sample: %w", err)
		}
		result = append(result, &sm)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("sample: rows error: %w", err)
	}
	return result, nil
}

// patchSample applies partial updates to a sample. Only non-empty/non-nil
// fields are applied. properties (when non-nil) replaces the existing JSONB.
func (s *Service) patchSample(
	ctx context.Context,
	id uuid.UUID,
	name, description, kind, status, identifier *string,
	properties json.RawMessage,
) (*Sample, error) {
	// Build dynamic SET clause.
	setClauses := []string{"updated_at = now()"}
	args := []any{id} // $1 = id
	argIdx := 2

	appendArg := func(clause string, val any) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", clause, argIdx))
		args = append(args, val)
		argIdx++
	}

	if name != nil {
		appendArg("name", *name)
	}
	if description != nil {
		appendArg("description", *description)
	}
	if kind != nil {
		appendArg("kind", *kind)
	}
	if status != nil {
		appendArg("status", *status)
	}
	if identifier != nil {
		appendArg("identifier", *identifier)
	}
	if len(properties) > 0 {
		appendArg("properties", []byte(properties))
	}

	query := "UPDATE samples SET "
	for i, c := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += c
	}
	query += ` WHERE id = $1
	           RETURNING id, project_id, identifier, name, description, kind,
	                     properties, status, description_page_id, created_by, created_at, updated_at`

	var sm Sample
	err := s.pool.QueryRow(ctx, query, args...).Scan(
		&sm.ID, &sm.ProjectID, &sm.Identifier, &sm.Name, &sm.Description, &sm.Kind,
		&sm.Properties, &sm.Status, &sm.DescriptionPageID, &sm.CreatedBy, &sm.CreatedAt, &sm.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("sample.not_found", "sample not found")
	}
	if err != nil {
		if isUniqueViolation(err) {
			return nil, platform.Conflict("sample.identifier_taken", "a sample with this identifier already exists in the project")
		}
		return nil, fmt.Errorf("sample: patch sample: %w", err)
	}
	return &sm, nil
}

// SampleRelation is an edge in the sample lineage graph.
type SampleRelation struct {
	ParentSampleID uuid.UUID `json:"parent_sample_id"`
	ChildSampleID  uuid.UUID `json:"child_sample_id"`
	RelationType   string    `json:"relation_type"`
	Notes          string    `json:"notes"`
}

// addRelation inserts a lineage edge. Both samples must be in the same project.
func (s *Service) addRelation(
	ctx context.Context,
	parentID, childID uuid.UUID,
	relationType, notes string,
) (*SampleRelation, error) {
	// Load parent and child to verify same project.
	parent, err := s.GetSample(ctx, parentID)
	if err != nil {
		return nil, err
	}
	child, err := s.GetSample(ctx, childID)
	if err != nil {
		return nil, err
	}
	if parent.ProjectID != child.ProjectID {
		return nil, platform.BadRequest("sample.cross_project_relation", "both samples must belong to the same project")
	}

	var rel SampleRelation
	err = s.pool.QueryRow(ctx,
		`INSERT INTO sample_relations (parent_sample_id, child_sample_id, relation_type, project_id, notes)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING parent_sample_id, child_sample_id, relation_type, notes`,
		parentID, childID, relationType, parent.ProjectID, notes,
	).Scan(&rel.ParentSampleID, &rel.ChildSampleID, &rel.RelationType, &rel.Notes)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, platform.Conflict("sample.relation_exists", "this relation already exists between these samples")
		}
		return nil, fmt.Errorf("sample: add relation: %w", err)
	}
	return &rel, nil
}

// LineageGraph holds the nodes and edges reachable from a focal sample.
type LineageGraph struct {
	Nodes []*Sample        `json:"nodes"`
	Edges []SampleRelation `json:"edges"`
}

// maxLineageDepth bounds BFS traversal to avoid runaway queries on large graphs.
const maxLineageDepth = 25

// getLineage traverses sample_relations up (ancestors) and down (descendants)
// from the given sample, returning the connected subgraph.
func (s *Service) getLineage(ctx context.Context, sampleID uuid.UUID) (*LineageGraph, error) {
	visited := map[uuid.UUID]bool{sampleID: true}
	var edgeList []SampleRelation

	// BFS queue — we expand one hop at a time.
	frontier := []uuid.UUID{sampleID}
	for depth := 0; depth < maxLineageDepth && len(frontier) > 0; depth++ {
		var next []uuid.UUID

		// Fetch edges where any frontier node is parent or child.
		rows, err := s.pool.Query(ctx,
			`SELECT parent_sample_id, child_sample_id, relation_type, notes
			 FROM sample_relations
			 WHERE parent_sample_id = ANY($1) OR child_sample_id = ANY($1)`,
			frontier,
		)
		if err != nil {
			return nil, fmt.Errorf("sample: lineage query: %w", err)
		}

		for rows.Next() {
			var edge SampleRelation
			if err := rows.Scan(&edge.ParentSampleID, &edge.ChildSampleID, &edge.RelationType, &edge.Notes); err != nil {
				rows.Close()
				return nil, fmt.Errorf("sample: scan edge: %w", err)
			}
			edgeList = append(edgeList, edge)
			for _, nid := range []uuid.UUID{edge.ParentSampleID, edge.ChildSampleID} {
				if !visited[nid] {
					visited[nid] = true
					next = append(next, nid)
				}
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("sample: lineage rows: %w", err)
		}
		frontier = next
	}

	// Deduplicate edges (same edge can appear when both parent and child are in frontier).
	seen := map[string]bool{}
	var uniqueEdges []SampleRelation
	for _, e := range edgeList {
		key := e.ParentSampleID.String() + "|" + e.ChildSampleID.String() + "|" + e.RelationType
		if !seen[key] {
			seen[key] = true
			uniqueEdges = append(uniqueEdges, e)
		}
	}

	// Load all node sample records.
	nodeIDs := make([]uuid.UUID, 0, len(visited))
	for id := range visited {
		nodeIDs = append(nodeIDs, id)
	}

	var nodes []*Sample
	if len(nodeIDs) > 0 {
		rows, err := s.pool.Query(ctx,
			`SELECT id, project_id, identifier, name, description, kind,
			        properties, status, description_page_id, created_by, created_at, updated_at
			 FROM samples WHERE id = ANY($1)
			 ORDER BY created_at`,
			nodeIDs,
		)
		if err != nil {
			return nil, fmt.Errorf("sample: load lineage nodes: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var sm Sample
			if err := rows.Scan(
				&sm.ID, &sm.ProjectID, &sm.Identifier, &sm.Name, &sm.Description, &sm.Kind,
				&sm.Properties, &sm.Status, &sm.DescriptionPageID, &sm.CreatedBy, &sm.CreatedAt, &sm.UpdatedAt,
			); err != nil {
				return nil, fmt.Errorf("sample: scan lineage node: %w", err)
			}
			nodes = append(nodes, &sm)
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("sample: lineage node rows: %w", err)
		}
	}

	if nodes == nil {
		nodes = []*Sample{}
	}
	if uniqueEdges == nil {
		uniqueEdges = []SampleRelation{}
	}

	return &LineageGraph{Nodes: nodes, Edges: uniqueEdges}, nil
}

// isUniqueViolation detects Postgres unique constraint violations (SQLSTATE 23505).
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	return contains(err.Error(), "23505") || contains(err.Error(), "unique constraint")
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
