package org

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires org HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// Workspace CRUD.
	huma.Register(api, huma.Operation{
		OperationID: "org-workspace-create",
		Method:      http.MethodPost,
		Path:        "/v1/workspaces",
		Summary:     "Create a workspace",
		Description: "Creates a new workspace. The authenticated user becomes the workspace owner automatically.",
		Tags:        []string{"org"},
	}, svc.handleCreateWorkspace)

	huma.Register(api, huma.Operation{
		OperationID: "org-workspace-list",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces",
		Summary:     "List workspaces the caller is a member of",
		Description: "Returns all workspaces the authenticated user belongs to. System admins see all workspaces.",
		Tags:        []string{"org"},
	}, svc.handleListWorkspaces)

	huma.Register(api, huma.Operation{
		OperationID: "org-workspace-get",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces/{id}",
		Summary:     "Get a workspace",
		Description: "Returns a single workspace by ID. Requires workspace membership or system-admin role.",
		Tags:        []string{"org"},
	}, svc.handleGetWorkspace)

	// Members.
	huma.Register(api, huma.Operation{
		OperationID: "org-workspace-members-list",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces/{id}/members",
		Summary:     "List workspace members",
		Description: "Returns all members and their workspace roles. Requires workspace membership or system-admin role.",
		Tags:        []string{"org"},
	}, svc.handleListMembers)

	huma.Register(api, huma.Operation{
		OperationID: "org-workspace-member-add",
		Method:      http.MethodPost,
		Path:        "/v1/workspaces/{id}/members",
		Summary:     "Add or update a workspace member",
		Description: "Grants an existing user a role in the workspace, or updates their role if already a member. Requires workspace owner or admin role. To invite a new user first use the invite endpoint.",
		Tags:        []string{"org"},
	}, svc.handleAddMember)

	huma.Register(api, huma.Operation{
		OperationID: "org-workspace-member-remove",
		Method:      http.MethodDelete,
		Path:        "/v1/workspaces/{id}/members/{user_id}",
		Summary:     "Remove a workspace member",
		Description: "Removes a user from the workspace, revoking access to all workspace-visible projects. Requires workspace owner or admin role.",
		Tags:        []string{"org"},
	}, svc.handleRemoveMember)

	// Invites.
	huma.Register(api, huma.Operation{
		OperationID: "org-invite-create",
		Method:      http.MethodPost,
		Path:        "/v1/workspaces/{id}/invites",
		Summary:     "Invite a user to a workspace",
		Description: "Generates an invite token for a given email address and desired role. Send the token to the recipient; they use the accept endpoint to join. Requires workspace owner or admin role.",
		Tags:        []string{"org"},
	}, svc.handleCreateInvite)

	huma.Register(api, huma.Operation{
		OperationID: "org-invite-accept",
		Method:      http.MethodPost,
		Path:        "/v1/invites/accept",
		Summary:     "Accept a workspace invite",
		Description: "Accepts a workspace invite by token, creating an account for the user if they don't exist yet. No authentication required — the invite token acts as a one-time credential.",
		Tags:        []string{"org"},
	}, svc.handleAcceptInvite)
}

// ─── Workspace handlers ───────────────────────────────────────────────────────

type createWorkspaceInput struct {
	Body struct {
		Name string `json:"name" required:"true" minLength:"1"`
	}
}

type createWorkspaceOutput struct {
	Body *Workspace
}

func (s *Service) handleCreateWorkspace(ctx context.Context, in *createWorkspaceInput) (*createWorkspaceOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeAdminOrg); err != nil {
		return nil, err
	}
	if !p.IsPrivileged() {
		return nil, platform.Forbidden("only admins or PIs can create workspaces")
	}

	ws, err := s.CreateWorkspace(ctx, in.Body.Name, p.UserID)
	if err != nil {
		return nil, err
	}
	return &createWorkspaceOutput{Body: ws}, nil
}

type listWorkspacesOutput struct {
	Body []*Workspace
}

func (s *Service) handleListWorkspaces(ctx context.Context, _ *struct{}) (*listWorkspacesOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadProjects); err != nil {
		return nil, err
	}

	list, err := s.ListWorkspacesForUser(ctx, p.UserID)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Workspace{}
	}
	return &listWorkspacesOutput{Body: list}, nil
}

type getWorkspaceInput struct {
	ID string `path:"id"`
}

type getWorkspaceOutput struct {
	Body *Workspace
}

func (s *Service) handleGetWorkspace(ctx context.Context, in *getWorkspaceInput) (*getWorkspaceOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadProjects); err != nil {
		return nil, err
	}

	wsID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("workspace.invalid_id", "invalid workspace ID")
	}

	ws, err := s.GetWorkspace(ctx, wsID)
	if err != nil {
		return nil, err
	}

	// Only members (or privileged users) may view.
	_, isMember, err := s.WorkspaceRole(ctx, wsID, p.UserID)
	if err != nil {
		return nil, err
	}
	if !isMember && !p.IsPrivileged() {
		return nil, platform.Forbidden("not a member of this workspace")
	}

	return &getWorkspaceOutput{Body: ws}, nil
}

// ─── Member handlers ──────────────────────────────────────────────────────────

type listMembersInput struct {
	ID string `path:"id"`
}

type listMembersOutput struct {
	Body []MemberView
}

func (s *Service) handleListMembers(ctx context.Context, in *listMembersInput) (*listMembersOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadProjects); err != nil {
		return nil, err
	}

	wsID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("workspace.invalid_id", "invalid workspace ID")
	}

	_, isMember, err := s.WorkspaceRole(ctx, wsID, p.UserID)
	if err != nil {
		return nil, err
	}
	if !isMember && !p.IsPrivileged() {
		return nil, platform.Forbidden("not a member of this workspace")
	}

	members, err := s.ListMembersEnriched(ctx, wsID)
	if err != nil {
		return nil, err
	}
	if members == nil {
		members = []MemberView{}
	}
	return &listMembersOutput{Body: members}, nil
}

type addMemberInput struct {
	ID   string `path:"id"`
	Body struct {
		Email string `json:"email" required:"true"`
		Role  string `json:"role" required:"true" enum:"owner,admin,member"`
	}
}

type addMemberOutput struct {
	Body Membership
}

func (s *Service) handleAddMember(ctx context.Context, in *addMemberInput) (*addMemberOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	wsID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("workspace.invalid_id", "invalid workspace ID")
	}

	callerRole, isMember, err := s.WorkspaceRole(ctx, wsID, p.UserID)
	if err != nil {
		return nil, err
	}
	if !p.IsPrivileged() && (!isMember || (callerRole != "owner" && callerRole != "admin")) {
		return nil, platform.Forbidden("only workspace owners and admins may add members")
	}

	// Require user to already exist.
	u, err := s.users.GetUserByEmail(ctx, in.Body.Email)
	if err != nil {
		return nil, platform.NotFound("user.not_found", "no user found with that email; invite them first")
	}

	if err := s.AddMember(ctx, wsID, u.ID, in.Body.Role, p.UserID); err != nil {
		return nil, err
	}

	// Return the (possibly new) membership row.
	members, err := s.ListMembers(ctx, wsID)
	if err != nil {
		return nil, err
	}
	for _, m := range members {
		if m.UserID == u.ID {
			return &addMemberOutput{Body: m}, nil
		}
	}
	return &addMemberOutput{}, nil
}

type removeMemberInput struct {
	ID     string `path:"id"`
	UserID string `path:"user_id"`
}

type removeMemberOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleRemoveMember(ctx context.Context, in *removeMemberInput) (*removeMemberOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	wsID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("workspace.invalid_id", "invalid workspace ID")
	}
	targetID, err := uuid.Parse(in.UserID)
	if err != nil {
		return nil, platform.BadRequest("user.invalid_id", "invalid user ID")
	}

	callerRole, isMember, err := s.WorkspaceRole(ctx, wsID, p.UserID)
	if err != nil {
		return nil, err
	}
	if !p.IsPrivileged() && (!isMember || (callerRole != "owner" && callerRole != "admin")) {
		return nil, platform.Forbidden("only workspace owners and admins may remove members")
	}

	if err := s.RemoveMember(ctx, wsID, targetID, p.UserID); err != nil {
		return nil, err
	}
	return &removeMemberOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}

// ─── Invite handlers ──────────────────────────────────────────────────────────

type createInviteInput struct {
	ID   string `path:"id"`
	Body struct {
		Email string `json:"email" required:"true"`
		Role  string `json:"role" required:"true" enum:"owner,admin,member"`
	}
}

type createInviteOutput struct {
	Status int
	Body   struct {
		ID          uuid.UUID `json:"id"`
		WorkspaceID uuid.UUID `json:"workspace_id"`
		Email       string    `json:"email"`
		Role        string    `json:"role"`
	}
}

func (s *Service) handleCreateInvite(ctx context.Context, in *createInviteInput) (*createInviteOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	wsID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("workspace.invalid_id", "invalid workspace ID")
	}

	callerRole, isMember, err := s.WorkspaceRole(ctx, wsID, p.UserID)
	if err != nil {
		return nil, err
	}
	if !isMember || (callerRole != "owner" && callerRole != "admin") {
		return nil, platform.Forbidden("only workspace owners and admins may invite members")
	}

	inv, _, err := s.CreateInvite(ctx, wsID, in.Body.Email, in.Body.Role, p.UserID)
	if err != nil {
		return nil, err
	}

	out := &createInviteOutput{Status: http.StatusCreated}
	out.Body.ID = inv.ID
	out.Body.WorkspaceID = inv.WorkspaceID
	out.Body.Email = inv.Email
	out.Body.Role = inv.Role
	return out, nil
}

type acceptInviteInput struct {
	Body struct {
		Token       string `json:"token" required:"true"`
		Password    string `json:"password,omitempty"`
		DisplayName string `json:"display_name,omitempty"`
	}
}

type acceptInviteOutput struct {
	Body struct {
		UserID      uuid.UUID `json:"user_id"`
		WorkspaceID uuid.UUID `json:"workspace_id"`
	}
}

func (s *Service) handleAcceptInvite(ctx context.Context, in *acceptInviteInput) (*acceptInviteOutput, error) {
	// No auth required for this endpoint.
	userID, workspaceID, err := s.AcceptInvite(ctx, in.Body.Token, in.Body.Password, in.Body.DisplayName)
	if err != nil {
		return nil, err
	}

	out := &acceptInviteOutput{}
	out.Body.UserID = userID
	out.Body.WorkspaceID = workspaceID
	return out, nil
}
