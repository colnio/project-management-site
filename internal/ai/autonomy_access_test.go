package ai

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// TestGetWorkspaceAutonomy_NonMemberForbidden verifies that a principal who is
// NOT a workspace member receives a Forbidden error from GetWorkspaceAutonomy
// (Finding 1).
func TestGetWorkspaceAutonomy_NonMemberForbidden(t *testing.T) {
	pool := testsupport.NewPool(t)
	stub := NewStubClient(nil)
	svc, _ := newTestService(t, pool, stub)

	ctx := context.Background()

	// Build a second user who is NOT a member of the workspace in setupData.
	email := fmt.Sprintf("nonmember-%s@example.com", uuid.New().String()[:8])
	nonMember, err := svc.authSvc.CreateUser(ctx, email, "Non Member")
	if err != nil {
		t.Fatalf("create non-member: %v", err)
	}
	p := &platform.Principal{UserID: nonMember.ID, Email: email}

	// Pick any workspace ID that the non-member has no access to.
	randomWsID := uuid.New()

	_, err = svc.GetWorkspaceAutonomy(ctx, p, randomWsID)
	if err == nil {
		t.Fatal("expected Forbidden for non-member, got nil")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected 403, got %d: %v", em.GetStatus(), err)
	}
}

// TestGetUsageSummary_NonMemberForbidden verifies that GetUsageSummary denies a
// principal who is NOT a workspace member (Finding 1).
func TestGetUsageSummary_NonMemberForbidden(t *testing.T) {
	pool := testsupport.NewPool(t)
	stub := NewStubClient(nil)
	svc, _ := newTestService(t, pool, stub)

	ctx := context.Background()

	email := fmt.Sprintf("nonmember2-%s@example.com", uuid.New().String()[:8])
	nonMember, err := svc.authSvc.CreateUser(ctx, email, "Non Member 2")
	if err != nil {
		t.Fatalf("create non-member: %v", err)
	}
	p := &platform.Principal{UserID: nonMember.ID, Email: email}
	randomWsID := uuid.New()

	_, err = svc.GetUsageSummary(ctx, p, randomWsID)
	if err == nil {
		t.Fatal("expected Forbidden for non-member, got nil")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected 403, got %d: %v", em.GetStatus(), err)
	}
}

// TestSetWorkspaceAutonomy_NonOwnerForbidden verifies that SetWorkspaceAutonomy
// denies a non-owner workspace member (Finding 1).
func TestSetWorkspaceAutonomy_NonOwnerForbidden(t *testing.T) {
	pool := testsupport.NewPool(t)
	stub := NewStubClient(nil)
	svc, sd := newTestService(t, pool, stub)

	ctx := context.Background()

	// Add a second user as a member (not owner) of the workspace.
	memberEmail := fmt.Sprintf("member-%s@example.com", uuid.New().String()[:8])
	member, err := svc.authSvc.CreateUser(ctx, memberEmail, "Member")
	if err != nil {
		t.Fatalf("create member: %v", err)
	}
	if err := svc.orgSvc.AddMember(ctx, sd.WorkspaceID, member.ID, "member", sd.UserID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	p := &platform.Principal{UserID: member.ID, Email: memberEmail}
	err = svc.SetWorkspaceAutonomy(ctx, p, sd.WorkspaceID, ModeReadOnly, nil)
	if err == nil {
		t.Fatal("expected Forbidden for non-owner member, got nil")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected 403, got %d: %v", em.GetStatus(), err)
	}
}

// TestSetWorkspaceAutonomy_OwnerSucceedsAndEmitsAudit verifies that an owner
// can set the autonomy config and that an audit entry with action
// "ai.workspace_autonomy.update" is recorded (Finding 1).
func TestSetWorkspaceAutonomy_OwnerSucceedsAndEmitsAudit(t *testing.T) {
	pool := testsupport.NewPool(t)

	// Use a capturing recorder so we can inspect audit entries.
	rec := &capturingRec{}
	ctx := context.Background()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	authSvc, err := auth.NewService(ctx, pool, &config.Config{
		JWTSigningKey:   "test-key",
		AccessTokenTTL:  time.Minute,
		RefreshTokenTTL: time.Hour,
		OIDCIssuer:      "http://localhost:9999/nonexistent",
	}, audit.Nop{}, logger)
	if err != nil {
		t.Fatalf("auth service: %v", err)
	}

	orgSvc := org.NewService(pool, &config.Config{}, audit.Nop{}, authSvc, logger)
	projectSvc := project.NewService(pool, orgSvc, authSvc, audit.Nop{}, logger)

	svc := NewService(pool, &config.Config{Port: "19099"}, NewStubClient(nil), authSvc, orgSvc, projectSvc, rec, logger)

	email := fmt.Sprintf("owner-aut-%s@example.com", uuid.New().String()[:8])
	user, err := authSvc.CreateUser(ctx, email, "Owner Aut")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	ws, err := orgSvc.CreateWorkspace(ctx, "autws"+user.ID.String()[:8], user.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	p := &platform.Principal{UserID: user.ID, Email: email}
	err = svc.SetWorkspaceAutonomy(ctx, p, ws.ID, ModeSuggestWrites, []string{"draft_page"})
	if err != nil {
		t.Fatalf("SetWorkspaceAutonomy: %v", err)
	}

	if !rec.hasAction("ai.workspace_autonomy.update") {
		t.Error("expected ai.workspace_autonomy.update audit entry")
	}
}

// capturingRec is a capturing audit recorder local to these tests (the package
// already has one defined in chat_test.go but it is not exported).
type capturingRec struct {
	entries []audit.Entry
}

func (r *capturingRec) Record(_ context.Context, e audit.Entry) error {
	r.entries = append(r.entries, e)
	return nil
}

func (r *capturingRec) hasAction(action string) bool {
	for _, e := range r.entries {
		if e.Action == action {
			return true
		}
	}
	return false
}
