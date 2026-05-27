package project

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires project HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// Projects under a workspace.
	huma.Register(api, huma.Operation{
		OperationID: "project-create",
		Method:      http.MethodPost,
		Path:        "/v1/workspaces/{id}/projects",
		Summary:     "Create a project",
		Description: "Creates a new project inside the given workspace. Requires the caller to be a workspace member.",
		Tags:        []string{"projects"},
	}, svc.handleCreateProject)

	huma.Register(api, huma.Operation{
		OperationID: "project-list",
		Method:      http.MethodGet,
		Path:        "/v1/workspaces/{id}/projects",
		Summary:     "List projects in a workspace",
		Description: "Returns all projects the caller can access in the workspace. Pass `include_archived=true` to include archived projects. Requires workspace membership.",
		Tags:        []string{"projects"},
	}, svc.handleListProjects)

	// Single project endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "project-get",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}",
		Summary:     "Get a project",
		Description: "Returns a single project by ID along with an ETag for optimistic-concurrency updates. Requires viewer role on the project.",
		Tags:        []string{"projects"},
	}, svc.handleGetProject)

	huma.Register(api, huma.Operation{
		OperationID: "project-update",
		Method:      http.MethodPatch,
		Path:        "/v1/projects/{id}",
		Summary:     "Update a project",
		Description: "Applies a partial update (name, description, visibility) to a project. Requires editor role on the project.",
		Tags:        []string{"projects"},
	}, svc.handleUpdateProject)

	huma.Register(api, huma.Operation{
		OperationID: "project-archive",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/archive",
		Summary:     "Archive a project",
		Description: "Marks a project as archived, hiding it from default list results. Requires owner role on the project.",
		Tags:        []string{"projects"},
	}, svc.handleArchiveProject)

	// Collaborators.
	huma.Register(api, huma.Operation{
		OperationID: "project-collaborators-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/collaborators",
		Summary:     "List project collaborators",
		Description: "Returns the list of per-project collaborators (role overrides beyond workspace membership). Requires viewer role on the project.",
		Tags:        []string{"projects"},
	}, svc.handleListCollaborators)

	huma.Register(api, huma.Operation{
		OperationID: "project-collaborator-add",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/collaborators",
		Summary:     "Add a project collaborator",
		Description: "Grants a user a specific role on the project, looked up by email. Requires owner role on the project.",
		Tags:        []string{"projects"},
	}, svc.handleAddCollaborator)

	huma.Register(api, huma.Operation{
		OperationID: "project-collaborator-remove",
		Method:      http.MethodDelete,
		Path:        "/v1/projects/{id}/collaborators/{user_id}",
		Summary:     "Remove a project collaborator",
		Description: "Removes a collaborator's per-project role, reverting them to their workspace-level access. Requires owner role on the project.",
		Tags:        []string{"projects"},
	}, svc.handleRemoveCollaborator)
}

// ─── Create project ────────────────────────────────────────────────────────────

type createProjectInput struct {
	ID   string `path:"id"`
	Body struct {
		Name        string `json:"name" required:"true" minLength:"1" example:"Solid-State Electrolyte Study"`
		Description string `json:"description,omitempty" example:"Investigating ionic conductivity of LLZO at room temperature."`
		Visibility  string `json:"visibility,omitempty" enum:"workspace,private" example:"workspace"`
	}
}

type createProjectOutput struct {
	Status int
	Body   *Project
}

func (s *Service) handleCreateProject(ctx context.Context, in *createProjectInput) (*createProjectOutput, error) {
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

	// Caller must be a workspace member.
	_, isMember, err := s.org.WorkspaceRole(ctx, wsID, p.UserID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, platform.Forbidden("you are not a member of this workspace")
	}

	proj, err := s.CreateProject(ctx, wsID, in.Body.Name, in.Body.Description, in.Body.Visibility, p.UserID)
	if err != nil {
		return nil, err
	}
	return &createProjectOutput{Status: http.StatusCreated, Body: proj}, nil
}

// ─── List projects ─────────────────────────────────────────────────────────────

type listProjectsInput struct {
	ID              string `path:"id"`
	IncludeArchived bool   `query:"include_archived"`
}

type listProjectsOutput struct {
	Body []*Project
}

func (s *Service) handleListProjects(ctx context.Context, in *listProjectsInput) (*listProjectsOutput, error) {
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

	list, err := s.ListProjectsForWorkspace(ctx, p, wsID, in.IncludeArchived)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Project{}
	}
	return &listProjectsOutput{Body: list}, nil
}

// ─── Get project ───────────────────────────────────────────────────────────────

type getProjectInput struct {
	ID string `path:"id"`
}

type getProjectOutput struct {
	ETag string `header:"ETag"`
	Body *Project
}

func (s *Service) handleGetProject(ctx context.Context, in *getProjectInput) (*getProjectOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	proj, _, err := s.Authorize(ctx, p, projectID, org.RoleViewer)
	if err != nil {
		return nil, err
	}

	etag := `"` + proj.UpdatedAt.UTC().Format("20060102150405.999999999") + `"`
	return &getProjectOutput{ETag: etag, Body: proj}, nil
}

// ─── Update project ────────────────────────────────────────────────────────────

type updateProjectInput struct {
	ID   string `path:"id"`
	Body struct {
		Name        string `json:"name,omitempty"`
		Description string `json:"description,omitempty"`
		Visibility  string `json:"visibility,omitempty" enum:"workspace,private"`
	}
}

type updateProjectOutput struct {
	Body *Project
}

func (s *Service) handleUpdateProject(ctx context.Context, in *updateProjectInput) (*updateProjectOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	proj, err := s.UpdateProject(ctx, projectID, in.Body.Name, in.Body.Description, in.Body.Visibility, p.UserID)
	if err != nil {
		return nil, err
	}
	return &updateProjectOutput{Body: proj}, nil
}

// ─── Archive project ───────────────────────────────────────────────────────────

type archiveProjectInput struct {
	ID string `path:"id"`
}

type archiveProjectOutput struct {
	Body *Project
}

func (s *Service) handleArchiveProject(ctx context.Context, in *archiveProjectInput) (*archiveProjectOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleOwner); err != nil {
		return nil, err
	}

	proj, err := s.ArchiveProject(ctx, projectID, p.UserID)
	if err != nil {
		return nil, err
	}
	return &archiveProjectOutput{Body: proj}, nil
}

// ─── List collaborators ────────────────────────────────────────────────────────

type listCollaboratorsInput struct {
	ID string `path:"id"`
}

type listCollaboratorsOutput struct {
	Body []org.Collaborator
}

func (s *Service) handleListCollaborators(ctx context.Context, in *listCollaboratorsInput) (*listCollaboratorsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	collabs, err := s.org.ListCollaborators(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if collabs == nil {
		collabs = []org.Collaborator{}
	}
	return &listCollaboratorsOutput{Body: collabs}, nil
}

// ─── Add collaborator ──────────────────────────────────────────────────────────

type addCollaboratorInput struct {
	ID   string `path:"id"`
	Body struct {
		Email string   `json:"email" required:"true"`
		Role  org.Role `json:"role" required:"true" enum:"owner,editor,viewer"`
	}
}

type addCollaboratorOutput struct {
	Status int
	Body   struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleAddCollaborator(ctx context.Context, in *addCollaboratorInput) (*addCollaboratorOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleOwner); err != nil {
		return nil, err
	}

	u, err := s.auth.GetUserByEmail(ctx, in.Body.Email)
	if err != nil {
		return nil, platform.NotFound("user.not_found", "no user found with that email")
	}

	if err := s.org.AddCollaborator(ctx, projectID, u.ID, in.Body.Role); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "project.collaborator_add",
		ResourceType: "project",
		ResourceID:   projectID.String(),
	})

	out := &addCollaboratorOutput{Status: http.StatusCreated}
	out.Body.OK = true
	return out, nil
}

// ─── Remove collaborator ───────────────────────────────────────────────────────

type removeCollaboratorInput struct {
	ID     string `path:"id"`
	UserID string `path:"user_id"`
}

type removeCollaboratorOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleRemoveCollaborator(ctx context.Context, in *removeCollaboratorInput) (*removeCollaboratorOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteProjects); err != nil {
		return nil, err
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	targetID, err := uuid.Parse(in.UserID)
	if err != nil {
		return nil, platform.BadRequest("user.invalid_id", "invalid user ID")
	}

	if _, _, err := s.Authorize(ctx, p, projectID, org.RoleOwner); err != nil {
		return nil, err
	}

	if err := s.org.RemoveCollaborator(ctx, projectID, targetID); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "project.collaborator_remove",
		ResourceType: "project",
		ResourceID:   projectID.String(),
	})

	return &removeCollaboratorOutput{Body: struct {
		OK bool `json:"ok"`
	}{OK: true}}, nil
}
