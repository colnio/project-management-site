package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// defaultWorkflowRunTimeout bounds a single synchronous workflow run so a stuck
// model provider returns a clean 504 rather than hanging for minutes. Override
// via AI_WORKFLOW_TIMEOUT_SECONDS for slow local models, where a multi-step LLM run
// (parallel questions + synthesis) on a 14B can exceed 150s.
const defaultWorkflowRunTimeout = 150 * time.Second

// Context-truncation budgets (characters). Sized for a model with a large
// context window (e.g. qwen2.5 at 32k tokens); a small-context model would need
// these lowered.
const (
	questionContextChars  = 8000
	synthesisContextChars = 6000
)

func workflowRunTimeoutDur() time.Duration {
	if v := os.Getenv("AI_WORKFLOW_TIMEOUT_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return defaultWorkflowRunTimeout
}

// mapWorkflowError turns a raw workflow execution error into a typed platform
// error so huma emits a meaningful status (502/504) instead of an opaque 500.
// Errors that are already platform errors (e.g. 402 spend cap) pass through.
func mapWorkflowError(err error) error {
	if err == nil {
		return nil
	}
	var pe *platform.ErrorModel
	if errors.As(err, &pe) {
		return err
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return platform.Errorf(504, "ai.upstream_timeout", "LLM provider timed out: "+err.Error())
	}
	return platform.Errorf(502, "ai.upstream_error", "LLM provider error: "+err.Error())
}

// ─── Workflow runner ──────────────────────────────────────────────────────────

// RunWorkflow executes a workflow synchronously and returns the completed run.
// It authorizes the caller, gathers context via internal-token REST calls,
// runs each LLM step, creates a result page, and flags for PI review if needed.
func (s *Service) RunWorkflow(ctx context.Context, p *platform.Principal, key string, target WorkflowTarget) (*WorkflowRun, error) {
	// Load workflow registry.
	workflows, err := LoadWorkflows()
	if err != nil {
		return nil, fmt.Errorf("ai: load workflows: %w", err)
	}
	wf, ok := workflows[key]
	if !ok {
		return nil, platform.NotFound("ai.workflow_not_found", "workflow not found: "+key)
	}

	// Authorize the caller on the project.
	proj, _, err := s.projects.Authorize(ctx, p, target.ProjectID, org.RoleEditor)
	if err != nil {
		return nil, err
	}

	// Check spend cap.
	cap, err := checkSpendCap(ctx, s.pool, proj.WorkspaceID)
	if err != nil {
		s.log.Warn("ai: workflow: spend cap check failed", "err", err)
	} else if !cap.Allowed {
		return nil, platform.Errorf(402, "ai.spend_cap_exceeded", "workspace LLM spend cap exceeded")
	}

	// Create a running row.
	run, err := createWorkflowRun(ctx, s.pool, key, target, p.UserID)
	if err != nil {
		return nil, err
	}

	// Mint a run-scoped internal token with the full set of scopes needed by LLM tools.
	iaiToken, err := s.authSvc.MintInternalAIToken(ctx, p.UserID, run.ID, []string{
		platform.ScopeReadProjects,
		platform.ScopeReadSamples,
		platform.ScopeReadExperiments,
		platform.ScopeReadPages,
		platform.ScopeReadArtifacts,
		platform.ScopeWritePages,
		platform.ScopeWriteIterations,
		platform.ScopeWriteCalendar,
	}, nil)
	if err != nil {
		_ = s.markRunFailed(ctx, run.ID, "{}", "failed to mint internal token: "+err.Error())
		return nil, fmt.Errorf("ai: workflow: mint token: %w", err)
	}
	defer func() { _ = s.authSvc.RevokeInternalAITokens(ctx, run.ID) }()

	restCall := makeRESTCaller(s.restBase, iaiToken)

	// Execute workflow under a bounded deadline (separate from ctx so the
	// persistence/audit below still runs even if execution times out).
	execCtx, cancel := context.WithTimeout(ctx, workflowRunTimeoutDur())
	defer cancel()
	stepResults, output, resultPageID, runErr := s.executeWorkflow(execCtx, wf, target, proj.WorkspaceID, p, run.ID, restCall)

	stepResultsJSON, _ := json.Marshal(stepResults)
	var outputJSON json.RawMessage
	if output != nil {
		outputJSON, _ = json.Marshal(output)
	} else {
		outputJSON = json.RawMessage("{}")
	}

	status := "completed"
	errMsg := ""
	if runErr != nil {
		status = "failed"
		errMsg = runErr.Error()
		// Still store partial step results.
	}

	// Handle PI flagging (even on error, if we have output).
	if output != nil && status == "completed" {
		s.handlePIFlag(ctx, output, proj.WorkspaceID, target.ProjectID, p, run.ID)

		// Populate the risk register from workflow output.
		if s.risks != nil {
			if upsertErr := s.risks.UpsertFromWorkflow(ctx, target.ProjectID, nil, key, run.ID, output, stepResults, p.UserID); upsertErr != nil {
				s.log.Warn("ai: workflow: risk upsert failed", "run_id", run.ID, "err", upsertErr)
			}
		}
	}

	// Persist final state.
	if err := updateWorkflowRun(ctx, s.pool, run.ID, status, stepResultsJSON, outputJSON, resultPageID, errMsg); err != nil {
		s.log.Error("ai: workflow: update run failed", "run_id", run.ID, "err", err)
	}

	// Audit.
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "ai.workflow_run",
		ResourceType: "ai_workflow_run",
		ResourceID:   run.ID.String(),
	})

	// Reload final state.
	final, err := GetRun(ctx, s.pool, run.ID)
	if err != nil || final == nil {
		// Fallback to in-memory.
		run.Status = status
		run.StepResults = stepResultsJSON
		run.Output = outputJSON
		run.ResultPageID = resultPageID
		run.Error = errMsg
		return run, mapWorkflowError(runErr)
	}
	return final, mapWorkflowError(runErr)
}

// executeWorkflow runs all steps and returns (stepResults, outputMap, resultPageID, error).
func (s *Service) executeWorkflow(
	ctx context.Context,
	wf *Workflow,
	target WorkflowTarget,
	workspaceID uuid.UUID,
	p *platform.Principal,
	runID uuid.UUID,
	restCall restCallFn,
) (map[string]any, map[string]any, *uuid.UUID, error) {
	stepResults := make(map[string]any)
	var contextBlob string
	var output map[string]any
	var mu sync.Mutex // guards stepResults across the parallel question batch

	// Independent ai_question steps depend only on the gathered context, not on
	// each other, so they run concurrently. They are collected and flushed as a
	// batch just before the synthesis step (or at the end of the workflow).
	var pendingQuestions []WorkflowStep
	flushQuestions := func() error {
		if len(pendingQuestions) == 0 {
			return nil
		}
		if s.client == nil {
			return s.unavailableErr()
		}
		// Single spend-cap check for the whole batch.
		if cap, _ := checkSpendCap(ctx, s.pool, workspaceID); !cap.Allowed {
			return platform.Errorf(402, "ai.spend_cap_exceeded", "workspace LLM spend cap exceeded")
		}
		var wg sync.WaitGroup
		for _, step := range pendingQuestions {
			wg.Add(1)
			go func(step WorkflowStep) {
				defer wg.Done()
				result, usage, err := s.runAIQuestion(ctx, step, contextBlob)
				mu.Lock()
				if err != nil {
					s.log.Warn("ai: workflow: ai_question failed", "step", step.ID, "err", err)
					stepResults[step.ID] = map[string]any{"error": err.Error()}
				} else {
					stepResults[step.ID] = result
				}
				mu.Unlock()
				// Meter usage (concurrent inserts are safe).
				_ = recordUsage(ctx, s.pool, workspaceID, target.ProjectID, p.UserID, "workflow", "ai", usage)
			}(step)
		}
		wg.Wait()
		pendingQuestions = nil
		return nil
	}

	for _, step := range wf.Steps {
		switch step.Type {
		case "gather_context":
			blob, err := s.gatherContext(ctx, step.Sources, target, restCall)
			if err != nil {
				s.log.Warn("ai: workflow: gather_context partial failure", "err", err)
				// Continue with whatever we got.
			}
			contextBlob = blob
			stepResults[step.ID] = map[string]any{"context_length": len(blob)}

		case "ai_question":
			pendingQuestions = append(pendingQuestions, step)

		case "ai_synthesis":
			// Run any collected questions concurrently before synthesizing.
			if err := flushQuestions(); err != nil {
				return stepResults, nil, nil, err
			}
			if s.client == nil {
				return stepResults, nil, nil, s.unavailableErr()
			}
			// Check spend cap before model call.
			cap, _ := checkSpendCap(ctx, s.pool, workspaceID)
			if !cap.Allowed {
				return stepResults, nil, nil, platform.Errorf(402, "ai.spend_cap_exceeded", "workspace LLM spend cap exceeded")
			}

			md, outMap, usage, err := s.runAISynthesis(ctx, step, wf.OutputSchema, stepResults, contextBlob)
			if err != nil {
				return stepResults, nil, nil, fmt.Errorf("ai: synthesis step: %w", err)
			}
			output = outMap
			stepResults[step.ID] = map[string]any{"markdown": md}
			// Meter usage.
			_ = recordUsage(ctx, s.pool, workspaceID, target.ProjectID, p.UserID, "workflow", "ai", usage)

			// Create result page.
			pageID, pageErr := s.createResultPage(ctx, wf, target, md, restCall)
			if pageErr != nil {
				s.log.Warn("ai: workflow: result page creation failed", "err", pageErr)
			}
			return stepResults, output, pageID, nil
		}
	}
	// Flush any trailing questions for workflows without a synthesis step.
	if err := flushQuestions(); err != nil {
		return stepResults, nil, nil, err
	}
	return stepResults, output, nil, nil
}

// handlePIFlag checks if the output warrants PI review and sends notifications.
func (s *Service) handlePIFlag(ctx context.Context, output map[string]any, workspaceID, projectID uuid.UUID, p *platform.Principal, runID uuid.UUID) {
	flagged := false

	if v, ok := output["flagged_for_PI_review"]; ok {
		if b, ok := v.(bool); ok && b {
			flagged = true
		}
	}
	if !flagged {
		if v, ok := output["overall_rating"]; ok {
			rating := toInt(v)
			if rating >= 4 {
				flagged = true
			}
		}
	}

	if !flagged {
		return
	}

	// Audit the flag.
	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "ai.workflow_pi_flag",
		ResourceType: "ai_workflow_run",
		ResourceID:   runID.String(),
	})

	if s.piNotify != nil {
		proj, err := s.projects.GetProject(ctx, projectID)
		if err != nil {
			s.log.Warn("ai: workflow: load project for pi flag email", "err", err)
			return
		}
		idem := fmt.Sprintf("pi_flag_workflow:%s", runID)
		actionPath := "/projects/" + projectID.String()
		go func() {
			if err := s.piNotify.EnqueuePIFlagForWorkspaceOwners(
				context.Background(), proj.WorkspaceID, proj.Name, actionPath, "", idem,
			); err != nil {
				s.log.Warn("ai: workflow: enqueue PI flag emails failed", "err", err)
			}
		}()
	}
}

func (s *Service) markRunFailed(ctx context.Context, runID uuid.UUID, stepResults, errMsg string) error {
	return updateWorkflowRun(ctx, s.pool, runID, "failed",
		json.RawMessage(stepResults), json.RawMessage("{}"), nil, errMsg)
}
