// Package admin exposes privileged user-management endpoints for admins and PIs.
// It owns no tables — it delegates to the auth service for user operations.
package admin

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/platform"
)

// AccountNotifier sends account status emails.
type AccountNotifier interface {
	EnqueueAccountApproved(ctx context.Context, userID uuid.UUID, toEmail string) error
	EnqueueAccountSuspended(ctx context.Context, userID uuid.UUID, toEmail string) error
}

// Service is the admin module's domain service.
type Service struct {
	auth   *auth.Service
	rec    audit.Recorder
	notify AccountNotifier
}

// NewService constructs an admin Service.
func NewService(authSvc *auth.Service, rec audit.Recorder) *Service {
	return &Service{auth: authSvc, rec: rec}
}

// SetAccountNotifier wires the notify module for account emails.
func (s *Service) SetAccountNotifier(n AccountNotifier) {
	s.notify = n
}

// Register wires admin HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	huma.Register(api, huma.Operation{
		OperationID: "admin-users-list",
		Method:      http.MethodGet,
		Path:        "/v1/admin/users",
		Summary:     "List all users",
		Description: "Returns all users in the system. Requires admin or PI global role.",
		Tags:        []string{"admin"},
	}, svc.handleListUsers)

	huma.Register(api, huma.Operation{
		OperationID: "admin-users-update",
		Method:      http.MethodPatch,
		Path:        "/v1/admin/users/{id}",
		Summary:     "Update a user's status or global role",
		Description: "Updates a user's status and/or global role. Requires admin or PI global role.",
		Tags:        []string{"admin"},
	}, svc.handleUpdateUser)

	huma.Register(api, huma.Operation{
		OperationID: "admin-users-delete",
		Method:      http.MethodDelete,
		Path:        "/v1/admin/users/{id}",
		Summary:     "Reject a pending user registration",
		Description: "Deletes a user only if their status is 'pending'. Used to reject pending registrations. Requires admin or PI global role.",
		Tags:        []string{"admin"},
	}, svc.handleDeleteUser)
}

// ─── User list ───────────────────────────────────────────────────────────────

type adminUserJSON struct {
	ID               uuid.UUID `json:"id"`
	Email            string    `json:"email"`
	DisplayName      string    `json:"display_name"`
	GlobalRole       string    `json:"global_role"`
	Status           string    `json:"status"`
	ProfileCompleted bool      `json:"profile_completed"`
	FirstName        string    `json:"first_name"`
	LastName         string    `json:"last_name"`
	Title            string    `json:"title"`
	CreatedAt        time.Time `json:"created_at"`
}

type listUsersOutput struct {
	Body []adminUserJSON
}

func (s *Service) handleListUsers(ctx context.Context, _ *struct{}) (*listUsersOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadAdmin); err != nil {
		return nil, err
	}
	if !p.IsPrivileged() {
		return nil, platform.Forbidden("only admins or PIs may access the admin panel")
	}

	users, err := s.auth.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]adminUserJSON, len(users))
	for i, u := range users {
		out[i] = adminUserJSON{
			ID:               u.ID,
			Email:            u.Email,
			DisplayName:      u.DisplayName,
			GlobalRole:       u.GlobalRole,
			Status:           u.Status,
			ProfileCompleted: u.ProfileCompleted,
			FirstName:        u.FirstName,
			LastName:         u.LastName,
			Title:            u.Title,
			CreatedAt:        u.CreatedAt,
		}
	}
	if out == nil {
		out = []adminUserJSON{}
	}
	return &listUsersOutput{Body: out}, nil
}

// ─── User update ─────────────────────────────────────────────────────────────

type updateUserInput struct {
	ID   uuid.UUID `path:"id"`
	Body struct {
		Status     *string `json:"status,omitempty"`
		GlobalRole *string `json:"global_role,omitempty"`
	}
}

type updateUserOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

var validStatuses = map[string]bool{"pending": true, "approved": true, "suspended": true}
var validRoles = map[string]bool{"admin": true, "pi": true, "member": true}

func (s *Service) handleUpdateUser(ctx context.Context, in *updateUserInput) (*updateUserOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteAdmin); err != nil {
		return nil, err
	}
	if !p.IsPrivileged() {
		return nil, platform.Forbidden("only admins or PIs may access the admin panel")
	}

	// Guard against self-lockout.
	if in.ID == p.UserID {
		if in.Body.Status != nil && *in.Body.Status == "suspended" {
			return nil, platform.BadRequest("admin.self_lockout", "cannot suspend your own account")
		}
		if in.Body.GlobalRole != nil && *in.Body.GlobalRole == "member" {
			return nil, platform.BadRequest("admin.self_lockout", "cannot remove your own admin/PI role")
		}
	}

	if in.Body.Status != nil {
		if !validStatuses[*in.Body.Status] {
			return nil, platform.BadRequest("admin.invalid_status", "status must be one of: pending, approved, suspended")
		}
		prev, err := s.auth.GetUserByID(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		if err := s.auth.SetUserStatus(ctx, in.ID, *in.Body.Status); err != nil {
			return nil, err
		}
		if *in.Body.Status == "suspended" {
			if err := s.auth.RevokeAllUserPATs(ctx, in.ID); err != nil {
				return nil, err
			}
			if err := s.auth.RevokeAllUserRefreshSessions(ctx, in.ID); err != nil {
				return nil, err
			}
		}
		if s.notify != nil && prev.Status != *in.Body.Status {
			switch *in.Body.Status {
			case "approved":
				if err := s.notify.EnqueueAccountApproved(ctx, in.ID, prev.Email); err != nil {
					// logged by caller pattern — admin has no log; use silent best-effort
					_ = err
				}
			case "suspended":
				if err := s.notify.EnqueueAccountSuspended(ctx, in.ID, prev.Email); err != nil {
					_ = err
				}
			}
		}
		_ = s.rec.Record(ctx, audit.Entry{
			Actor:        p.UserID,
			ViaTokenID:   p.ViaTokenID,
			Action:       "admin.user_status_update",
			ResourceType: "user",
			ResourceID:   in.ID.String(),
		})
	}

	if in.Body.GlobalRole != nil {
		if !validRoles[*in.Body.GlobalRole] {
			return nil, platform.BadRequest("admin.invalid_role", "global_role must be one of: admin, pi, member")
		}
		if err := s.auth.SetUserGlobalRole(ctx, in.ID, *in.Body.GlobalRole); err != nil {
			return nil, err
		}
		_ = s.rec.Record(ctx, audit.Entry{
			Actor:        p.UserID,
			ViaTokenID:   p.ViaTokenID,
			Action:       "admin.user_role_update",
			ResourceType: "user",
			ResourceID:   in.ID.String(),
		})
	}

	return &updateUserOutput{Body: struct{ OK bool `json:"ok"` }{OK: true}}, nil
}

// ─── User delete (reject pending) ────────────────────────────────────────────

type deleteUserInput struct {
	ID uuid.UUID `path:"id"`
}

type deleteUserOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleDeleteUser(ctx context.Context, in *deleteUserInput) (*deleteUserOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWriteAdmin); err != nil {
		return nil, err
	}
	if !p.IsPrivileged() {
		return nil, platform.Forbidden("only admins or PIs may access the admin panel")
	}

	// Fetch user to check status.
	u, err := s.auth.GetUserByID(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if u.Status != "pending" {
		return nil, platform.BadRequest("admin.not_pending", "only pending users may be deleted via this endpoint")
	}

	if err := s.auth.DeleteUser(ctx, in.ID); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "admin.user_reject",
		ResourceType: "user",
		ResourceID:   in.ID.String(),
	})

	return &deleteUserOutput{Body: struct{ OK bool `json:"ok"` }{OK: true}}, nil
}
