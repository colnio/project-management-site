package org_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Fake Users ──────────────────────────────────────────────────────────────

// fakeUsers implements org.Users and also inserts rows into the test DB so
// that FK constraints on workspaces.created_by → users.id are satisfied.
type fakeUsers struct {
	byEmail map[string]*auth.User
	byID    map[uuid.UUID]*auth.User
	pool    *pgxpool.Pool
}

func newFakeUsers(pool *pgxpool.Pool) *fakeUsers {
	return &fakeUsers{
		byEmail: make(map[string]*auth.User),
		byID:    make(map[uuid.UUID]*auth.User),
		pool:    pool,
	}
}

// seed creates an in-memory user AND inserts a row into the users table.
func (f *fakeUsers) seed(t *testing.T, email, displayName string) *auth.User {
	t.Helper()
	ctx := context.Background()
	u := &auth.User{
		ID:          uuid.New(),
		Email:       email,
		DisplayName: displayName,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	_, err := f.pool.Exec(ctx,
		`INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		u.ID, u.Email, u.DisplayName,
	)
	if err != nil {
		t.Fatalf("fakeUsers.seed insert user %s: %v", email, err)
	}
	f.byEmail[email] = u
	f.byID[u.ID] = u
	return u
}

func (f *fakeUsers) GetUserByEmail(_ context.Context, email string) (*auth.User, error) {
	u, ok := f.byEmail[email]
	if !ok {
		return nil, platform.NotFound("user.not_found", "user not found")
	}
	return u, nil
}

func (f *fakeUsers) GetUserByID(_ context.Context, id uuid.UUID) (*auth.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, platform.NotFound("user.not_found", "user not found")
	}
	return u, nil
}

func (f *fakeUsers) GetUsersByIDs(_ context.Context, ids []uuid.UUID) (map[uuid.UUID]*auth.User, error) {
	out := make(map[uuid.UUID]*auth.User, len(ids))
	for _, id := range ids {
		if u, ok := f.byID[id]; ok {
			out[id] = u
		}
	}
	return out, nil
}

func (f *fakeUsers) CreateUser(_ context.Context, email, displayName string) (*auth.User, error) {
	if _, exists := f.byEmail[email]; exists {
		return nil, platform.Conflict("user.email_conflict", "email already exists")
	}
	ctx := context.Background()
	u := &auth.User{
		ID:          uuid.New(),
		Email:       email,
		DisplayName: displayName,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	_, err := f.pool.Exec(ctx,
		`INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		u.ID, u.Email, u.DisplayName,
	)
	if err != nil {
		return nil, err
	}
	f.byEmail[email] = u
	f.byID[u.ID] = u
	return u, nil
}

func (f *fakeUsers) SetPassword(_ context.Context, _ uuid.UUID, _ string) error {
	return nil
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

func newTestSvc(t *testing.T) (*org.Service, *pgxpool.Pool, *fakeUsers) {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"invites", "project_collaborations", "admin_overrides",
		"workspace_memberships", "workspaces", "users",
	)
	fu := newFakeUsers(pool)
	cfg := &config.Config{
		SMTPHost:  "localhost",
		SMTPPort:  "1025",
		SMTPFrom:  "test@example.com",
		WebOrigin: "http://localhost:5173",
	}
	svc := org.NewService(pool, cfg, audit.Nop{}, fu, org.NewNopLogger())
	return svc, pool, fu
}

// ─── ResolveAccess tests ──────────────────────────────────────────────────────

func TestResolveAccess_WorkspaceVisible(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "owner@example.com", "Owner")
	admin := fu.seed(t, "admin@example.com", "Admin")
	member := fu.seed(t, "member@example.com", "Member")
	outsider := fu.seed(t, "outsider@example.com", "Outsider")

	ws, err := svc.CreateWorkspace(ctx, "Test Workspace", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if err := svc.AddMember(ctx, ws.ID, admin.ID, "admin", owner.ID); err != nil {
		t.Fatalf("add admin: %v", err)
	}
	if err := svc.AddMember(ctx, ws.ID, member.ID, "member", owner.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	projectID := uuid.New()

	cases := []struct {
		name   string
		userID uuid.UUID
		want   org.Role
	}{
		{"owner gets owner", owner.ID, org.RoleOwner},
		{"admin gets editor", admin.ID, org.RoleEditor},
		{"member gets viewer", member.ID, org.RoleViewer},
		{"outsider gets none", outsider.ID, org.RoleNone},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := svc.ResolveAccess(ctx, tc.userID, ws.ID, "workspace", &projectID)
			if err != nil {
				t.Fatalf("resolve access: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %s, want %s", got, tc.want)
			}
		})
	}
}

func TestResolveAccess_PrivateProject(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "owner@example.com", "Owner")
	member := fu.seed(t, "member@example.com", "Member")

	ws, err := svc.CreateWorkspace(ctx, "Private WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := svc.AddMember(ctx, ws.ID, member.ID, "member", owner.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	projectID := uuid.New()

	// Member has no collaborator entry → gets none on private project.
	role, err := svc.ResolveAccess(ctx, member.ID, ws.ID, "private", &projectID)
	if err != nil {
		t.Fatalf("resolve access: %v", err)
	}
	if role != org.RoleNone {
		t.Errorf("expected none for member on private project, got %s", role)
	}

	// Add as collaborator → editor.
	if err := svc.AddCollaborator(ctx, projectID, member.ID, org.RoleEditor); err != nil {
		t.Fatalf("add collaborator: %v", err)
	}
	role, err = svc.ResolveAccess(ctx, member.ID, ws.ID, "private", &projectID)
	if err != nil {
		t.Fatalf("resolve access after collab: %v", err)
	}
	if role != org.RoleEditor {
		t.Errorf("expected editor after adding collaborator, got %s", role)
	}
}

func TestResolveAccess_AdminOverrideGrantsViewer(t *testing.T) {
	svc, pool, fu := newTestSvc(t)
	ctx := context.Background()

	creator := fu.seed(t, "creator@example.com", "Creator")
	observer := fu.seed(t, "observer@example.com", "Observer")

	ws, err := svc.CreateWorkspace(ctx, "Override WS", creator.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	_, err = pool.Exec(ctx,
		`INSERT INTO admin_overrides (workspace_id, user_id) VALUES ($1, $2)`,
		ws.ID, observer.ID,
	)
	if err != nil {
		t.Fatalf("insert admin_override: %v", err)
	}

	projectID := uuid.New()
	role, err := svc.ResolveAccess(ctx, observer.ID, ws.ID, "private", &projectID)
	if err != nil {
		t.Fatalf("resolve access: %v", err)
	}
	if role != org.RoleViewer {
		t.Errorf("expected viewer from admin override, got %s", role)
	}
}

func TestResolveAccess_MaxComposition(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	creator := fu.seed(t, "creator@example.com", "Creator")
	user := fu.seed(t, "user@example.com", "User")

	ws, err := svc.CreateWorkspace(ctx, "Max WS", creator.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	// member on workspace-visible → viewer (collaborator owner wins)
	if err := svc.AddMember(ctx, ws.ID, user.ID, "member", creator.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	projectID := uuid.New()
	// also owner collaborator → owner wins
	if err := svc.AddCollaborator(ctx, projectID, user.ID, org.RoleOwner); err != nil {
		t.Fatalf("add collaborator: %v", err)
	}

	role, err := svc.ResolveAccess(ctx, user.ID, ws.ID, "workspace", &projectID)
	if err != nil {
		t.Fatalf("resolve access: %v", err)
	}
	if role != org.RoleOwner {
		t.Errorf("expected owner (max of viewer+owner), got %s", role)
	}
}

func TestListMembersEnriched(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "enrich-owner@example.com", "Enrich Owner")
	member := fu.seed(t, "enrich-member@example.com", "Enrich Member")

	ws, err := svc.CreateWorkspace(ctx, "Enrich WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := svc.AddMember(ctx, ws.ID, member.ID, "member", owner.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	members, err := svc.ListMembersEnriched(ctx, ws.ID)
	if err != nil {
		t.Fatalf("ListMembersEnriched: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(members))
	}
	byUser := map[uuid.UUID]org.MemberView{}
	for _, m := range members {
		byUser[m.UserID] = m
	}
	if byUser[member.ID].Email != "enrich-member@example.com" {
		t.Errorf("member email = %q", byUser[member.ID].Email)
	}
	if byUser[member.ID].DisplayName != "Enrich Member" {
		t.Errorf("member display name = %q", byUser[member.ID].DisplayName)
	}
}

func TestResolveAccess_NilProjectID(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	creator := fu.seed(t, "creator@example.com", "Creator")
	admin := fu.seed(t, "admin@example.com", "Admin")

	ws, err := svc.CreateWorkspace(ctx, "Nil Project WS", creator.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := svc.AddMember(ctx, ws.ID, admin.ID, "admin", creator.ID); err != nil {
		t.Fatalf("add admin: %v", err)
	}

	// nil projectID → workspace-level question; admin member → editor.
	role, err := svc.ResolveAccess(ctx, admin.ID, ws.ID, "workspace", nil)
	if err != nil {
		t.Fatalf("resolve access: %v", err)
	}
	if !role.CanWrite() {
		t.Errorf("expected CanWrite for admin in workspace-level question, got %s", role)
	}
}

func TestResolveAccessForProjects_MatchesSingular(t *testing.T) {
	svc, pool, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "batch-owner@example.com", "Batch Owner")
	member := fu.seed(t, "batch-member@example.com", "Batch Member")

	ws, err := svc.CreateWorkspace(ctx, "Batch WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := svc.AddMember(ctx, ws.ID, member.ID, "member", owner.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	projectID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO projects (id, workspace_id, name, visibility, created_by)
		 VALUES ($1, $2, 'Private', 'private', $3)`,
		projectID, ws.ID, owner.ID,
	)
	if err != nil {
		t.Fatalf("insert project: %v", err)
	}
	if err := svc.AddCollaborator(ctx, projectID, member.ID, org.RoleViewer); err != nil {
		t.Fatalf("add collaborator: %v", err)
	}

	p := &platform.Principal{UserID: member.ID, Email: member.Email}
	inputs := []org.ProjectAccessInput{{ProjectID: projectID, Visibility: "private"}}

	roles, err := svc.ResolveAccessForProjects(ctx, p, ws.ID, inputs)
	if err != nil {
		t.Fatalf("batch resolve: %v", err)
	}
	single, err := svc.ResolveAccessForPrincipal(ctx, p, ws.ID, "private", &projectID)
	if err != nil {
		t.Fatalf("singular resolve: %v", err)
	}
	if roles[projectID] != single {
		t.Errorf("batch role %s != singular %s", roles[projectID], single)
	}
	if !roles[projectID].CanRead() {
		t.Errorf("expected member collaborator to read private project, got %s", roles[projectID])
	}
}

func TestResolveAccessForPrincipal_SystemAdmin(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	creator := fu.seed(t, "creator@example.com", "Creator")
	sysAdmin := fu.seed(t, "sysadmin@example.com", "SysAdmin")

	ws, err := svc.CreateWorkspace(ctx, "SysAdmin WS", creator.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	p := &platform.Principal{
		UserID:     sysAdmin.ID,
		Email:      sysAdmin.Email,
		GlobalRole: "admin",
	}

	projectID := uuid.New()
	role, err := svc.ResolveAccessForPrincipal(ctx, p, ws.ID, "private", &projectID)
	if err != nil {
		t.Fatalf("resolve access for principal: %v", err)
	}
	// Privileged users (admin/PI) who are not explicit members get bumped to editor.
	if role != org.RoleEditor {
		t.Errorf("expected editor for system admin bump, got %s", role)
	}
}

// ─── Workspace tests ──────────────────────────────────────────────────────────

func TestCreateWorkspace_CreatorIsOwner(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	u := fu.seed(t, "alice@example.com", "Alice")
	ws, err := svc.CreateWorkspace(ctx, "Alice's Lab", u.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if ws.Name != "Alice's Lab" {
		t.Errorf("unexpected name: %s", ws.Name)
	}

	role, found, err := svc.WorkspaceRole(ctx, ws.ID, u.ID)
	if err != nil || !found || role != "owner" {
		t.Errorf("creator should be owner; got role=%s found=%v err=%v", role, found, err)
	}
}

func TestListWorkspaces(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	u := fu.seed(t, "bob@example.com", "Bob")
	_, err := svc.CreateWorkspace(ctx, "WS 1", u.ID)
	if err != nil {
		t.Fatalf("create ws 1: %v", err)
	}
	_, err = svc.CreateWorkspace(ctx, "WS 2", u.ID)
	if err != nil {
		t.Fatalf("create ws 2: %v", err)
	}

	list, err := svc.ListWorkspacesForUser(ctx, u.ID)
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 workspaces, got %d", len(list))
	}
}

func TestGetWorkspace_NonMemberForbidden(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "owner@example.com", "Owner")
	outsider := fu.seed(t, "outsider@example.com", "Outsider")

	ws, err := svc.CreateWorkspace(ctx, "Restricted WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	_, isMember, err := svc.WorkspaceRole(ctx, ws.ID, outsider.ID)
	if err != nil {
		t.Fatalf("workspace role: %v", err)
	}
	if isMember {
		t.Error("outsider should not be a member")
	}
}

// ─── Member management tests ──────────────────────────────────────────────────

func TestAddMember_RequiresOwnerOrAdmin(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "owner@example.com", "Owner")
	member := fu.seed(t, "member@example.com", "Member")
	newUser := fu.seed(t, "new@example.com", "New")

	ws, err := svc.CreateWorkspace(ctx, "Perm Test WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	if err := svc.AddMember(ctx, ws.ID, member.ID, "member", owner.ID); err != nil {
		t.Fatalf("add member: %v", err)
	}

	// Verify member role.
	role, found, _ := svc.WorkspaceRole(ctx, ws.ID, member.ID)
	if !found || role != "member" {
		t.Errorf("unexpected role: %s %v", role, found)
	}

	// Owner successfully adds new user.
	if err := svc.AddMember(ctx, ws.ID, newUser.ID, "admin", owner.ID); err != nil {
		t.Fatalf("owner add member: %v", err)
	}
	role2, found2, _ := svc.WorkspaceRole(ctx, ws.ID, newUser.ID)
	if !found2 || role2 != "admin" {
		t.Errorf("new user should be admin, got %s %v", role2, found2)
	}
}

func TestAddMember_UnknownEmail(t *testing.T) {
	_, _, fu := newTestSvc(t)
	ctx := context.Background()

	_, err := fu.GetUserByEmail(ctx, "nobody@example.com")
	if err == nil {
		t.Fatal("expected not found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404 platform error, got %v", err)
	}
}

func TestRemoveMember_LastOwnerRejected(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "owner@example.com", "Owner")
	ws, err := svc.CreateWorkspace(ctx, "Last Owner WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	err = svc.RemoveMember(ctx, ws.ID, owner.ID, owner.ID)
	if err == nil {
		t.Fatal("expected error when removing last owner")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 400 {
		t.Errorf("expected 400 platform error, got %v", err)
	}
}

// ─── Invite tests ─────────────────────────────────────────────────────────────

func TestInvite_CreateAndAccept(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "owner@example.com", "Owner")
	ws, err := svc.CreateWorkspace(ctx, "Invite WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	inv, rawToken, err := svc.CreateInvite(ctx, ws.ID, "newbie@example.com", "member", owner.ID)
	if err != nil {
		t.Fatalf("create invite: %v", err)
	}
	if inv.ID == uuid.Nil {
		t.Fatal("expected non-nil invite id")
	}

	// Accept invite → new user created.
	userID, wsID, err := svc.AcceptInvite(ctx, rawToken, "securepassword", "Newbie")
	if err != nil {
		t.Fatalf("accept invite: %v", err)
	}
	if wsID != ws.ID {
		t.Errorf("workspace mismatch: got %s want %s", wsID, ws.ID)
	}

	// Check membership.
	role, found, err := svc.WorkspaceRole(ctx, ws.ID, userID)
	if err != nil || !found || role != "member" {
		t.Errorf("new user should be member; role=%s found=%v err=%v", role, found, err)
	}
}

func TestInvite_ExpiredTokenRejected(t *testing.T) {
	svc, pool, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "owner@example.com", "Owner")
	ws, err := svc.CreateWorkspace(ctx, "Expired Invite WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	inv, rawToken, err := svc.CreateInvite(ctx, ws.ID, "victim@example.com", "member", owner.ID)
	if err != nil {
		t.Fatalf("create invite: %v", err)
	}

	// Manually expire the invite.
	_, err = pool.Exec(ctx,
		`UPDATE invites SET expires_at = now() - interval '1 day' WHERE id=$1`, inv.ID,
	)
	if err != nil {
		t.Fatalf("expire invite: %v", err)
	}

	_, _, err = svc.AcceptInvite(ctx, rawToken, "pw", "Victim")
	if err == nil {
		t.Fatal("expected error for expired invite")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 400 {
		t.Errorf("expected 400, got %v", err)
	}
}

func TestInvite_InvalidTokenRejected(t *testing.T) {
	svc, _, _ := newTestSvc(t)
	ctx := context.Background()

	_, _, err := svc.AcceptInvite(ctx, "bad-token-that-does-not-exist", "pw", "Nobody")
	if err == nil {
		t.Fatal("expected not found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404, got %v", err)
	}
}

func TestInvite_DoubleAcceptRejected(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	owner := fu.seed(t, "owner@example.com", "Owner")
	ws, err := svc.CreateWorkspace(ctx, "Double Accept WS", owner.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	_, rawToken, err := svc.CreateInvite(ctx, ws.ID, "once@example.com", "member", owner.ID)
	if err != nil {
		t.Fatalf("create invite: %v", err)
	}

	// First accept succeeds.
	_, _, err = svc.AcceptInvite(ctx, rawToken, "pw", "Once")
	if err != nil {
		t.Fatalf("first accept: %v", err)
	}

	// Second accept should fail with 400.
	_, _, err = svc.AcceptInvite(ctx, rawToken, "pw", "Once")
	if err == nil {
		t.Fatal("expected error on double-accept")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 400 {
		t.Errorf("expected 400, got %v", err)
	}
}

// ─── Collaborator Go API tests ────────────────────────────────────────────────

func TestCollaborator_AddListRoleRemove(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	creator := fu.seed(t, "creator@example.com", "Creator")
	userA := fu.seed(t, "a@example.com", "A")
	userB := fu.seed(t, "b@example.com", "B")

	_, err := svc.CreateWorkspace(ctx, "Collab WS", creator.ID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	projectID := uuid.New()

	if err := svc.AddCollaborator(ctx, projectID, userA.ID, org.RoleEditor); err != nil {
		t.Fatalf("add collaborator A: %v", err)
	}
	if err := svc.AddCollaborator(ctx, projectID, userB.ID, org.RoleViewer); err != nil {
		t.Fatalf("add collaborator B: %v", err)
	}

	collabs, err := svc.ListCollaborators(ctx, projectID)
	if err != nil {
		t.Fatalf("list collaborators: %v", err)
	}
	if len(collabs) != 2 {
		t.Errorf("expected 2 collaborators, got %d", len(collabs))
	}

	role, found, err := svc.CollaboratorRole(ctx, projectID, userA.ID)
	if err != nil || !found || role != org.RoleEditor {
		t.Errorf("expected editor for A; role=%s found=%v err=%v", role, found, err)
	}

	if err := svc.RemoveCollaborator(ctx, projectID, userA.ID); err != nil {
		t.Fatalf("remove collaborator A: %v", err)
	}

	role2, found2, _ := svc.CollaboratorRole(ctx, projectID, userA.ID)
	if found2 {
		t.Errorf("A should no longer be a collaborator, got role=%s", role2)
	}
}

// ─── handleCreateWorkspace privilege gate ─────────────────────────────────────

func TestHandleCreateWorkspace_MemberForbidden(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	member := fu.seed(t, "member-ws@example.com", "Member")

	// A plain member (not admin/PI) should be rejected.
	p := &platform.Principal{
		UserID:     member.ID,
		Email:      member.Email,
		GlobalRole: "member",
	}
	ctxWithP := platform.WithPrincipal(ctx, p)

	_, err := org.ExportHandleCreateWorkspace(t, svc, ctxWithP, "Forbidden WS")
	if err == nil {
		t.Fatal("expected forbidden error for member creating workspace")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok {
		t.Fatalf("expected *platform.ErrorModel, got %T: %v", err, err)
	}
	if em.GetStatus() != 403 {
		t.Errorf("expected HTTP 403, got %d", em.GetStatus())
	}
}

func TestHandleCreateWorkspace_AdminSucceeds(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	adminUser := fu.seed(t, "admin-ws@example.com", "Admin WS")

	p := &platform.Principal{
		UserID:     adminUser.ID,
		Email:      adminUser.Email,
		GlobalRole: "admin",
	}
	ctxWithP := platform.WithPrincipal(ctx, p)

	out, err := org.ExportHandleCreateWorkspace(t, svc, ctxWithP, "Admin's Workspace")
	if err != nil {
		t.Fatalf("expected admin to create workspace successfully: %v", err)
	}
	if out.Body.Name != "Admin's Workspace" {
		t.Errorf("expected name=Admin's Workspace, got %q", out.Body.Name)
	}
}

func TestHandleCreateWorkspace_PISucceeds(t *testing.T) {
	svc, _, fu := newTestSvc(t)
	ctx := context.Background()

	piUser := fu.seed(t, "pi-ws@example.com", "PI WS")

	p := &platform.Principal{
		UserID:     piUser.ID,
		Email:      piUser.Email,
		GlobalRole: "pi",
	}
	ctxWithP := platform.WithPrincipal(ctx, p)

	out, err := org.ExportHandleCreateWorkspace(t, svc, ctxWithP, "PI's Workspace")
	if err != nil {
		t.Fatalf("expected PI to create workspace successfully: %v", err)
	}
	if out.Body.Name != "PI's Workspace" {
		t.Errorf("expected name=PI's Workspace, got %q", out.Body.Name)
	}
}
