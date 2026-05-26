package ai

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Autonomy modes.
const (
	ModeReadOnly      = "read_only"
	ModeSuggestWrites = "suggest_writes"
	ModeAutoRoutine   = "auto_routine"
	ModeFull          = "full"
)

// modeRank maps autonomy modes to an ordinal for clamping.
var modeRank = map[string]int{
	ModeReadOnly:      0,
	ModeSuggestWrites: 1,
	ModeAutoRoutine:   2,
	ModeFull:          3,
}

// minMode returns the less permissive of two modes.
func minMode(a, b string) string {
	ra, oka := modeRank[a]
	rb, okb := modeRank[b]
	if !oka {
		return b
	}
	if !okb {
		return a
	}
	if ra <= rb {
		return a
	}
	return b
}

// intersectTools returns only the tools present in both slices.
// If workspace allows all ("*" sentinel or empty list meaning unconstrained),
// it returns project's list; both empty means unconstrained.
func intersectTools(workspaceTools, projectTools []string) []string {
	if len(workspaceTools) == 0 {
		return projectTools
	}
	if len(projectTools) == 0 {
		return workspaceTools
	}
	ws := make(map[string]bool, len(workspaceTools))
	for _, t := range workspaceTools {
		ws[t] = true
	}
	var out []string
	for _, t := range projectTools {
		if ws[t] {
			out = append(out, t)
		}
	}
	return out
}

// AutonomyConfig is a resolved autonomy configuration.
type AutonomyConfig struct {
	ID           uuid.UUID
	Scope        string
	ScopeID      uuid.UUID
	Mode         string
	AllowedTools []string
}

// ResolveAutonomy resolves the effective autonomy config for a (workspace, project) pair.
// Project config overrides workspace but may never be MORE permissive (clamped).
// Returns default read_only if no config is found.
func ResolveAutonomy(ctx context.Context, pool *pgxpool.Pool, workspaceID, projectID uuid.UUID) (mode string, allowedTools []string) {
	wsMode, wsTools := loadAutonomy(ctx, pool, "workspace", workspaceID)
	projMode, projTools := loadAutonomy(ctx, pool, "project", projectID)

	// If neither is configured, default read_only.
	if wsMode == "" && projMode == "" {
		return ModeReadOnly, nil
	}
	if wsMode == "" {
		wsMode = ModeReadOnly
	}
	if projMode == "" {
		// No project override — use workspace.
		return wsMode, wsTools
	}

	// Clamp project to workspace (project may never exceed workspace permissiveness).
	effectiveMode := minMode(projMode, wsMode)
	effectiveTools := intersectTools(wsTools, projTools)
	return effectiveMode, effectiveTools
}

func loadAutonomy(ctx context.Context, pool *pgxpool.Pool, scope string, scopeID uuid.UUID) (mode string, allowedTools []string) {
	err := pool.QueryRow(ctx,
		`SELECT mode, allowed_tools FROM autonomy_configs WHERE scope=$1 AND scope_id=$2`,
		scope, scopeID,
	).Scan(&mode, &allowedTools)
	if err == pgx.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", nil
	}
	return mode, allowedTools
}

// UpsertAutonomy creates or updates an autonomy config.
func UpsertAutonomy(ctx context.Context, pool *pgxpool.Pool, scope string, scopeID uuid.UUID, mode string, allowedTools []string) error {
	if allowedTools == nil {
		allowedTools = []string{}
	}
	_, err := pool.Exec(ctx,
		`INSERT INTO autonomy_configs (scope, scope_id, mode, allowed_tools)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (scope, scope_id) DO UPDATE
		   SET mode=$3, allowed_tools=$4, updated_at=now()`,
		scope, scopeID, mode, allowedTools,
	)
	if err != nil {
		return fmt.Errorf("ai: upsert autonomy: %w", err)
	}
	return nil
}

// GetAutonomy fetches an autonomy config by scope/scopeID.
func GetAutonomy(ctx context.Context, pool *pgxpool.Pool, scope string, scopeID uuid.UUID) (*AutonomyConfig, error) {
	var cfg AutonomyConfig
	err := pool.QueryRow(ctx,
		`SELECT id, scope, scope_id, mode, allowed_tools FROM autonomy_configs WHERE scope=$1 AND scope_id=$2`,
		scope, scopeID,
	).Scan(&cfg.ID, &cfg.Scope, &cfg.ScopeID, &cfg.Mode, &cfg.AllowedTools)
	if err == pgx.ErrNoRows {
		return &AutonomyConfig{
			Scope:        scope,
			ScopeID:      scopeID,
			Mode:         ModeReadOnly,
			AllowedTools: nil,
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("ai: get autonomy: %w", err)
	}
	return &cfg, nil
}

// IsWriteAllowed reports whether a write tool call should be executed given the mode and tool name.
// read tools always pass; write tools depend on mode.
func IsWriteAllowed(mode string, allowedTools []string, toolName string) (execute bool, propose bool) {
	switch mode {
	case ModeReadOnly:
		return false, false
	case ModeSuggestWrites:
		return false, true // always propose, never auto-execute
	case ModeAutoRoutine:
		// Whitelisted low-risk writes auto-execute; content writes stay proposed.
		if toolName == "draft_page" {
			return false, true
		}
		for _, t := range allowedTools {
			if t == toolName {
				return true, false
			}
		}
		return false, true
	case ModeFull:
		for _, t := range allowedTools {
			if t == toolName {
				return true, false
			}
		}
		// Not in whitelist but full mode — propose.
		return false, true
	}
	return false, false
}
