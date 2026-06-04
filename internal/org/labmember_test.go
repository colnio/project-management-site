package org_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// newTestSvcDomains builds an org.Service whose config carries the given allowed
// email domains, so IsLabMember (and the lab-member read floor) can be exercised.
func newTestSvcDomains(t *testing.T, domains []string) (*org.Service, *pgxpool.Pool, *fakeUsers) {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"invites", "project_collaborations", "admin_overrides",
		"workspace_memberships", "workspaces", "users",
	)
	fu := newFakeUsers(pool)
	cfg := &config.Config{
		SMTPHost:            "localhost",
		SMTPPort:            "1025",
		SMTPFrom:            "test@example.com",
		WebOrigin:           "http://localhost:5173",
		AllowedEmailDomains: domains,
	}
	svc := org.NewService(pool, cfg, audit.Nop{}, fu, org.NewNopLogger())
	return svc, pool, fu
}

func TestIsLabMember(t *testing.T) {
	svc, _, _ := newTestSvcDomains(t, []string{"nus.edu.sg", "u.nus.edu"})

	cases := []struct {
		email string
		want  bool
	}{
		{"alice@u.nus.edu", true},
		{"bob@nus.edu.sg", true},
		{"carol@U.NUS.EDU", true}, // case-insensitive
		{"ext@gmail.com", false},
		{"", false},
		{"noatsign", false},
	}
	for _, tc := range cases {
		p := &platform.Principal{UserID: uuid.New(), Email: tc.email}
		if got := svc.IsLabMember(p); got != tc.want {
			t.Errorf("IsLabMember(%q) = %v, want %v", tc.email, got, tc.want)
		}
	}

	// With no configured domains, a blank allowlist never grants lab membership.
	svcNoDomains, _, _ := newTestSvcDomains(t, nil)
	if svcNoDomains.IsLabMember(&platform.Principal{UserID: uuid.New(), Email: "alice@u.nus.edu"}) {
		t.Error("expected IsLabMember=false when no domains are configured")
	}
}

func TestLabMemberReadFloor(t *testing.T) {
	svc, _, fu := newTestSvcDomains(t, []string{"nus.edu.sg", "u.nus.edu"})
	ctx := context.Background()

	owner := fu.seed(t, "owner@nus.edu.sg", "Owner")
	lab := fu.seed(t, "lab@u.nus.edu", "Lab Member")    // approved NUS, NOT a workspace member
	external := fu.seed(t, "ext@gmail.com", "External")  // external collaborator, off-domain

	ws, err := svc.CreateWorkspace(ctx, "Lab WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	wsProj := uuid.New()   // workspace-visible project
	privProj := uuid.New() // private project

	pLab := &platform.Principal{UserID: lab.ID, Email: "lab@u.nus.edu"}
	pExt := &platform.Principal{UserID: external.ID, Email: "ext@gmail.com"}

	check := func(name string, got org.Role, want org.Role) {
		t.Helper()
		if got != want {
			t.Errorf("%s: got %s, want %s", name, got, want)
		}
	}

	// Workspace-visible project: lab member reads (viewer); external gets nothing.
	r, err := svc.ResolveAccessForPrincipal(ctx, pLab, ws.ID, "workspace", &wsProj)
	if err != nil {
		t.Fatalf("resolve lab/workspace: %v", err)
	}
	check("lab member on workspace-visible", r, org.RoleViewer)

	r, _ = svc.ResolveAccessForPrincipal(ctx, pExt, ws.ID, "workspace", &wsProj)
	check("external on workspace-visible", r, org.RoleNone)

	// Private project stays restricted even for a lab member.
	r, _ = svc.ResolveAccessForPrincipal(ctx, pLab, ws.ID, "private", &privProj)
	check("lab member on private", r, org.RoleNone)

	// Workspace-level question (no project): lab member can read the workspace.
	r, _ = svc.ResolveAccessForPrincipal(ctx, pLab, ws.ID, "", nil)
	check("lab member workspace-level", r, org.RoleViewer)

	// Batch resolution mirrors the singular path.
	roles, err := svc.ResolveAccessForProjects(ctx, pLab, ws.ID, []org.ProjectAccessInput{
		{ProjectID: wsProj, Visibility: "workspace"},
		{ProjectID: privProj, Visibility: "private"},
	})
	if err != nil {
		t.Fatalf("batch resolve: %v", err)
	}
	check("batch lab member workspace-visible", roles[wsProj], org.RoleViewer)
	check("batch lab member private", roles[privProj], org.RoleNone)

	roles, _ = svc.ResolveAccessForProjects(ctx, pExt, ws.ID, []org.ProjectAccessInput{
		{ProjectID: wsProj, Visibility: "workspace"},
	})
	check("batch external workspace-visible", roles[wsProj], org.RoleNone)

	// The floor never downgrades a higher real role: a lab member who is also an
	// explicit editor-collaborator on the private project keeps editor.
	if err := svc.AddCollaborator(ctx, privProj, lab.ID, org.RoleEditor); err != nil {
		t.Fatalf("add collaborator: %v", err)
	}
	r, _ = svc.ResolveAccessForPrincipal(ctx, pLab, ws.ID, "private", &privProj)
	check("lab member collaborator on private keeps editor", r, org.RoleEditor)
}
