package org

import (
	"io"
	"log/slog"
)

// NewNopLogger returns a slog.Logger that discards all output (used in tests).
func NewNopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
