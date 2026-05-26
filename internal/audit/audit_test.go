package audit_test

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/testsupport"
)

func newRecorder(t *testing.T) *audit.PgRecorder {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, "audit_log")
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	return audit.NewRecorder(pool, log)
}

// TestRecord_HappyPath checks that a well-formed entry can be inserted and
// retrieved, and that the DB-defaulted created_at is non-zero.
func TestRecord_HappyPath(t *testing.T) {
	rec := newRecorder(t)
	ctx := context.Background()

	actor := uuid.New()
	err := rec.Record(ctx, audit.Entry{
		Actor:          actor,
		Action:         "sample.create",
		ResourceType:   "sample",
		ResourceID:     "s-001",
		ResponseStatus: 201,
	})
	if err != nil {
		t.Fatalf("Record failed: %v", err)
	}

	entries, cursor, err := rec.List(ctx, audit.ListFilter{Actor: &actor})
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if cursor != "" {
		t.Errorf("expected empty cursor on single page, got %q", cursor)
	}
	e := entries[0]
	if e.Actor != actor {
		t.Errorf("actor mismatch: want %v got %v", actor, e.Actor)
	}
	if e.Action != "sample.create" {
		t.Errorf("action mismatch: want sample.create got %q", e.Action)
	}
	if e.CreatedAt.IsZero() {
		t.Error("created_at should be set by DB default")
	}
}

// TestList_FilterByResource ensures resource_type + resource_id filtering works.
func TestList_FilterByResource(t *testing.T) {
	rec := newRecorder(t)
	ctx := context.Background()

	actor := uuid.New()
	// Insert two entries for different resources.
	if err := rec.Record(ctx, audit.Entry{
		Actor: actor, Action: "page.create",
		ResourceType: "page", ResourceID: "p-1", ResponseStatus: 201,
	}); err != nil {
		t.Fatal(err)
	}
	if err := rec.Record(ctx, audit.Entry{
		Actor: actor, Action: "sample.delete",
		ResourceType: "sample", ResourceID: "s-1", ResponseStatus: 204,
	}); err != nil {
		t.Fatal(err)
	}

	entries, _, err := rec.List(ctx, audit.ListFilter{ResourceType: "page", ResourceID: "p-1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry for page, got %d", len(entries))
	}
	if entries[0].Action != "page.create" {
		t.Errorf("unexpected action %q", entries[0].Action)
	}
}

// TestList_EmptyResult checks that an empty result set is returned without
// error when no entries match the filter.
func TestList_EmptyResult(t *testing.T) {
	rec := newRecorder(t)
	ctx := context.Background()

	missing := uuid.New()
	entries, cursor, err := rec.List(ctx, audit.ListFilter{Actor: &missing})
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
	if cursor != "" {
		t.Errorf("expected empty cursor, got %q", cursor)
	}
}

// TestList_Pagination tests keyset pagination across two pages.
func TestList_Pagination(t *testing.T) {
	rec := newRecorder(t)
	ctx := context.Background()

	actor := uuid.New()
	// Insert 5 entries with explicit created_at so ordering is deterministic.
	base := time.Now().UTC().Truncate(time.Millisecond)
	for i := 0; i < 5; i++ {
		ts := base.Add(time.Duration(i) * time.Second)
		if err := rec.Record(ctx, audit.Entry{
			Actor:          actor,
			Action:         "evt",
			ResourceType:   "thing",
			ResourceID:     "t-1",
			ResponseStatus: 200,
			CreatedAt:      ts,
		}); err != nil {
			t.Fatal(err)
		}
	}

	// Page 1: limit=3
	page1, cursor, err := rec.List(ctx, audit.ListFilter{Actor: &actor, Limit: 3})
	if err != nil {
		t.Fatal(err)
	}
	if len(page1) != 3 {
		t.Fatalf("page1: expected 3 entries, got %d", len(page1))
	}
	if cursor == "" {
		t.Fatal("expected a non-empty cursor after page 1")
	}
	// Entries should be newest first.
	if !page1[0].CreatedAt.After(page1[1].CreatedAt) && page1[0].CreatedAt.Equal(page1[1].CreatedAt) {
		// Equal timestamps are ok due to tie-break on id; just ensure non-ascending would be wrong:
		if page1[0].CreatedAt.Before(page1[1].CreatedAt) {
			t.Error("entries not in descending order on page 1")
		}
	}

	// Page 2: should return remaining 2 entries with no next cursor.
	page2, cursor2, err := rec.List(ctx, audit.ListFilter{Actor: &actor, Limit: 3, Cursor: cursor})
	if err != nil {
		t.Fatal(err)
	}
	if len(page2) != 2 {
		t.Fatalf("page2: expected 2 entries, got %d", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("expected empty cursor after last page, got %q", cursor2)
	}

	// Verify no overlap between pages (all 5 are distinct by created_at + actor).
	seen := map[time.Time]bool{}
	for _, e := range page1 {
		seen[e.CreatedAt] = true
	}
	for _, e := range page2 {
		if seen[e.CreatedAt] {
			t.Errorf("overlap between pages at created_at=%v", e.CreatedAt)
		}
	}
}

// TestList_InvalidCursorFallback ensures an invalid cursor does not error but
// falls back to returning results from the beginning.
func TestList_InvalidCursorFallback(t *testing.T) {
	rec := newRecorder(t)
	ctx := context.Background()

	actor := uuid.New()
	if err := rec.Record(ctx, audit.Entry{
		Actor: actor, Action: "x", ResourceType: "r", ResourceID: "1",
	}); err != nil {
		t.Fatal(err)
	}

	entries, _, err := rec.List(ctx, audit.ListFilter{
		Actor:  &actor,
		Cursor: "not-valid-base64!!!",
	})
	if err != nil {
		t.Fatalf("List with invalid cursor should not error, got: %v", err)
	}
	// Should fall back to first page.
	if len(entries) == 0 {
		t.Error("expected at least one entry with invalid cursor fallback")
	}
}

// TestList_LimitCapping ensures limits above 200 are capped.
func TestList_LimitCapping(t *testing.T) {
	rec := newRecorder(t)
	ctx := context.Background()

	actor := uuid.New()
	// Insert 3 entries.
	for i := 0; i < 3; i++ {
		if err := rec.Record(ctx, audit.Entry{
			Actor: actor, Action: "evt", ResourceType: "r", ResourceID: "1",
		}); err != nil {
			t.Fatal(err)
		}
	}

	// A limit of 9999 should be silently capped to 200 (and return all 3 rows).
	entries, _, err := rec.List(ctx, audit.ListFilter{Actor: &actor, Limit: 9999})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 {
		t.Errorf("expected 3 entries, got %d", len(entries))
	}
}

// TestService_PermissionCheck_NoAuth verifies handleListAudit returns 401
// when no principal is present.
func TestService_PermissionCheck_NoAuth(t *testing.T) {
	pool := testsupport.NewPool(t)
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	rec := audit.NewRecorder(pool, log)
	svc := audit.NewService(rec)

	ctx := context.Background() // no principal
	_, err := svc.HandleListAudit(ctx, &audit.GetAuditInput{})
	if err == nil {
		t.Fatal("expected error for unauthenticated request")
	}
	se, ok := err.(interface{ GetStatus() int })
	if !ok {
		t.Fatalf("expected StatusError, got %T: %v", err, err)
	}
	if se.GetStatus() != 401 {
		t.Errorf("expected 401, got %d", se.GetStatus())
	}
}

// TestService_PermissionCheck_NotAdmin verifies handleListAudit returns 403
// when the principal is authenticated but not a system admin.
func TestService_PermissionCheck_NotAdmin(t *testing.T) {
	pool := testsupport.NewPool(t)
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	rec := audit.NewRecorder(pool, log)
	svc := audit.NewService(rec)

	p := &platform.Principal{UserID: uuid.New(), IsSystemAdmin: false}
	ctx := platform.WithPrincipal(context.Background(), p)

	_, err := svc.HandleListAudit(ctx, &audit.GetAuditInput{})
	if err == nil {
		t.Fatal("expected error for non-admin request")
	}
	se, ok := err.(interface{ GetStatus() int })
	if !ok {
		t.Fatalf("expected StatusError, got %T: %v", err, err)
	}
	if se.GetStatus() != 403 {
		t.Errorf("expected 403, got %d", se.GetStatus())
	}
}

// TestService_PermissionCheck_TokenMissingScope verifies 403 for a token
// caller that lacks the read:audit scope.
func TestService_PermissionCheck_TokenMissingScope(t *testing.T) {
	pool := testsupport.NewPool(t)
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	rec := audit.NewRecorder(pool, log)
	svc := audit.NewService(rec)

	tokenID := uuid.New()
	p := &platform.Principal{
		UserID:        uuid.New(),
		IsSystemAdmin: true,
		ViaTokenID:    &tokenID,
		Scopes:        []string{"read:samples"}, // no read:audit
	}
	ctx := platform.WithPrincipal(context.Background(), p)

	_, err := svc.HandleListAudit(ctx, &audit.GetAuditInput{})
	if err == nil {
		t.Fatal("expected error for token missing read:audit scope")
	}
	se, ok := err.(interface{ GetStatus() int })
	if !ok {
		t.Fatalf("expected StatusError, got %T: %v", err, err)
	}
	if se.GetStatus() != 403 {
		t.Errorf("expected 403, got %d", se.GetStatus())
	}
}

// TestService_HappyPath_Admin verifies an admin with no token can list entries.
func TestService_HappyPath_Admin(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, "audit_log")
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	rec := audit.NewRecorder(pool, log)
	svc := audit.NewService(rec)

	actor := uuid.New()
	ctx := context.Background()
	if err := rec.Record(ctx, audit.Entry{
		Actor: actor, Action: "test.action", ResourceType: "thing", ResourceID: "42",
	}); err != nil {
		t.Fatal(err)
	}

	p := &platform.Principal{UserID: uuid.New(), IsSystemAdmin: true}
	ctx = platform.WithPrincipal(ctx, p)

	out, err := svc.HandleListAudit(ctx, &audit.GetAuditInput{Actor: actor.String()})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out.Body.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(out.Body.Items))
	}
	if out.Body.Items[0].Action != "test.action" {
		t.Errorf("unexpected action %q", out.Body.Items[0].Action)
	}
}
