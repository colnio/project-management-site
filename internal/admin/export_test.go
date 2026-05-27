package admin

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// ExportHandleListUsers exposes handleListUsers for external tests.
func ExportHandleListUsers(t *testing.T, svc *Service, ctx context.Context) (*listUsersOutput, error) {
	t.Helper()
	return svc.handleListUsers(ctx, nil)
}

// ExportHandleUpdateUser exposes handleUpdateUser for external tests.
func ExportHandleUpdateUser(t *testing.T, svc *Service, ctx context.Context, id uuid.UUID, status, globalRole *string) (*updateUserOutput, error) {
	t.Helper()
	in := &updateUserInput{ID: id}
	in.Body.Status = status
	in.Body.GlobalRole = globalRole
	return svc.handleUpdateUser(ctx, in)
}

// ExportHandleDeleteUser exposes handleDeleteUser for external tests.
func ExportHandleDeleteUser(t *testing.T, svc *Service, ctx context.Context, id uuid.UUID) (*deleteUserOutput, error) {
	t.Helper()
	in := &deleteUserInput{ID: id}
	return svc.handleDeleteUser(ctx, in)
}
