package ai

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/testsupport"
)

func TestResolveAutonomy_Default(t *testing.T) {
	pool := testsupport.NewPool(t)
	ctx := context.Background()

	mode, tools := ResolveAutonomy(ctx, pool, uuid.New(), uuid.New())
	if mode != ModeReadOnly {
		t.Errorf("expected read_only, got %q", mode)
	}
	if len(tools) != 0 {
		t.Errorf("expected empty tools, got %v", tools)
	}
}

func TestResolveAutonomy_ProjectClampsToWorkspace(t *testing.T) {
	pool := testsupport.NewPool(t)
	ctx := context.Background()
	testsupport.Truncate(t, pool, "autonomy_configs")

	wsID := uuid.New()
	projID := uuid.New()

	// Workspace: suggest_writes
	if err := UpsertAutonomy(ctx, pool, "workspace", wsID, ModeSuggestWrites, []string{"update_iteration_status"}); err != nil {
		t.Fatal(err)
	}
	// Project tries to be full — must be clamped to suggest_writes.
	if err := UpsertAutonomy(ctx, pool, "project", projID, ModeFull, []string{"update_iteration_status", "draft_page"}); err != nil {
		t.Fatal(err)
	}

	mode, tools := ResolveAutonomy(ctx, pool, wsID, projID)
	if mode != ModeSuggestWrites {
		t.Errorf("expected suggest_writes (clamped), got %q", mode)
	}
	// Tools must intersect: update_iteration_status is in both.
	found := false
	for _, tool := range tools {
		if tool == "update_iteration_status" {
			found = true
		}
		if tool == "draft_page" {
			t.Error("draft_page should be filtered out (not in workspace whitelist)")
		}
	}
	if !found {
		t.Error("update_iteration_status should be in effective tools")
	}
}

func TestIsWriteAllowed_ReadOnly(t *testing.T) {
	exec, propose := IsWriteAllowed(ModeReadOnly, nil, "draft_page")
	if exec || propose {
		t.Error("read_only should not exec or propose writes")
	}
}

func TestIsWriteAllowed_SuggestWrites(t *testing.T) {
	exec, propose := IsWriteAllowed(ModeSuggestWrites, []string{"draft_page"}, "draft_page")
	if exec {
		t.Error("suggest_writes should not auto-execute")
	}
	if !propose {
		t.Error("suggest_writes should propose")
	}
}

func TestIsWriteAllowed_AutoRoutine_DraftPage(t *testing.T) {
	exec, propose := IsWriteAllowed(ModeAutoRoutine, []string{"draft_page", "update_iteration_status"}, "draft_page")
	if exec {
		t.Error("auto_routine draft_page should not auto-execute")
	}
	if !propose {
		t.Error("auto_routine draft_page should be proposed")
	}
}

func TestIsWriteAllowed_AutoRoutine_LowRisk(t *testing.T) {
	exec, propose := IsWriteAllowed(ModeAutoRoutine, []string{"update_iteration_status"}, "update_iteration_status")
	if !exec {
		t.Error("auto_routine whitelisted tool should auto-execute")
	}
	if propose {
		t.Error("auto_routine whitelisted tool should not propose")
	}
}

func TestIsWriteAllowed_Full_Whitelisted(t *testing.T) {
	exec, propose := IsWriteAllowed(ModeFull, []string{"draft_page"}, "draft_page")
	if !exec {
		t.Error("full mode whitelisted tool should auto-execute")
	}
	if propose {
		t.Error("full mode whitelisted tool should not propose")
	}
}

func TestIsWriteAllowed_Full_NotWhitelisted(t *testing.T) {
	exec, propose := IsWriteAllowed(ModeFull, []string{"update_iteration_status"}, "draft_page")
	if exec {
		t.Error("full mode non-whitelisted tool should not auto-execute")
	}
	if !propose {
		t.Error("full mode non-whitelisted tool should be proposed")
	}
}
