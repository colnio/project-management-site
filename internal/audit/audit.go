// Package audit records an immutable trail of every mutation, LLM tool call, and
// admin override. Every other module depends on the Recorder interface defined
// here; the Postgres-backed implementation and query endpoints live alongside
// in this package (A2). The interface is kept small and stable so modules can
// compile and unit-test against a fake.
package audit

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Entry is a single audit record. Actor is always the human principal even when
// the call arrived via a PAT or the in-app LLM (the Via* fields capture the
// delegation), so "who is ultimately responsible" is never ambiguous.
type Entry struct {
	Actor                uuid.UUID
	ViaTokenID           *uuid.UUID
	ViaAIConversationID  *uuid.UUID
	Action               string // e.g. "sample.create", "page.restore"
	ResourceType         string // e.g. "sample", "page"
	ResourceID           string // string so non-uuid ids (composite, slug) fit
	RequestPayloadDigest string // sha256 hex of the request body, never the body
	ResponseStatus       int
	CreatedAt            time.Time // set by the recorder if zero
}

// Recorder writes audit entries. Implementations must be safe for concurrent
// use. Recording failures should be logged but generally must not fail the
// originating request (audit is best-effort durable, not a 2PC participant) —
// callers decide, but the default Postgres recorder logs-and-continues.
type Recorder interface {
	Record(ctx context.Context, e Entry) error
}

// Nop is a no-op Recorder for tests and bootstrap paths.
type Nop struct{}

func (Nop) Record(context.Context, Entry) error { return nil }
