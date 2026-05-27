package org

import (
	"context"
	"io"
	"log/slog"
	"testing"
)

// NewNopLogger returns a slog.Logger that discards all output (used in tests).
func NewNopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// ExportHandleCreateWorkspace exposes handleCreateWorkspace for external tests.
func ExportHandleCreateWorkspace(t *testing.T, svc *Service, ctx context.Context, name string) (*createWorkspaceOutput, error) {
	t.Helper()
	in := &createWorkspaceInput{}
	in.Body.Name = name
	return svc.handleCreateWorkspace(ctx, in)
}
