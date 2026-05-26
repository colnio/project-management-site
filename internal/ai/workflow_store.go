package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WorkflowRun represents a persisted workflow execution.
type WorkflowRun struct {
	ID            uuid.UUID       `json:"id"`
	WorkflowKey   string          `json:"workflow_key"`
	ProjectID     *uuid.UUID      `json:"project_id,omitempty"`
	SampleID      *uuid.UUID      `json:"sample_id,omitempty"`
	ExperimentID  *uuid.UUID      `json:"experiment_id,omitempty"`
	StartedBy     uuid.UUID       `json:"started_by"`
	Status        string          `json:"status"`
	StepResults   json.RawMessage `json:"step_results"`
	Output        json.RawMessage `json:"output,omitempty"`
	ResultPageID  *uuid.UUID      `json:"result_page_id,omitempty"`
	Error         string          `json:"error,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// WorkflowTarget holds the resource IDs for a workflow run.
type WorkflowTarget struct {
	ProjectID    uuid.UUID
	SampleID     *uuid.UUID
	ExperimentID *uuid.UUID
}

func createWorkflowRun(ctx context.Context, pool *pgxpool.Pool, key string, target WorkflowTarget, userID uuid.UUID) (*WorkflowRun, error) {
	var run WorkflowRun
	err := pool.QueryRow(ctx,
		`INSERT INTO ai_workflow_runs (workflow_key, project_id, sample_id, experiment_id, started_by, status)
		 VALUES ($1, $2, $3, $4, $5, 'running')
		 RETURNING id, workflow_key, project_id, sample_id, experiment_id, started_by, status,
		           step_results, output, result_page_id, error, created_at, updated_at`,
		key, target.ProjectID, target.SampleID, target.ExperimentID, userID,
	).Scan(
		&run.ID, &run.WorkflowKey, &run.ProjectID, &run.SampleID, &run.ExperimentID,
		&run.StartedBy, &run.Status, &run.StepResults, &run.Output, &run.ResultPageID,
		&run.Error, &run.CreatedAt, &run.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("ai: create workflow run: %w", err)
	}
	return &run, nil
}

// GetRun fetches a workflow run by ID.
func GetRun(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (*WorkflowRun, error) {
	var run WorkflowRun
	err := pool.QueryRow(ctx,
		`SELECT id, workflow_key, project_id, sample_id, experiment_id, started_by, status,
		        step_results, output, result_page_id, error, created_at, updated_at
		 FROM ai_workflow_runs WHERE id=$1`, id,
	).Scan(
		&run.ID, &run.WorkflowKey, &run.ProjectID, &run.SampleID, &run.ExperimentID,
		&run.StartedBy, &run.Status, &run.StepResults, &run.Output, &run.ResultPageID,
		&run.Error, &run.CreatedAt, &run.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ai: get workflow run: %w", err)
	}
	return &run, nil
}

func updateWorkflowRun(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, status string, stepResults json.RawMessage, output json.RawMessage, resultPageID *uuid.UUID, errMsg string) error {
	_, err := pool.Exec(ctx,
		`UPDATE ai_workflow_runs
		 SET status=$2, step_results=$3, output=$4, result_page_id=$5, error=$6, updated_at=now()
		 WHERE id=$1`,
		id, status, []byte(stepResults), []byte(output), resultPageID, errMsg,
	)
	if err != nil {
		return fmt.Errorf("ai: update workflow run: %w", err)
	}
	return nil
}
