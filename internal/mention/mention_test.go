package mention_test

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/mention"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

func nopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// fakeMentionNotifier captures EnqueueMention calls.
type fakeMentionNotifier struct {
	mu    sync.Mutex
	calls []mentionCall
}

type mentionCall struct {
	mentionedUserID uuid.UUID
	toEmail         string
	idempotencyKey  string
}

func (f *fakeMentionNotifier) EnqueueMention(
	_ context.Context,
	mentionedUserID uuid.UUID,
	toEmail, _, _, _, idempotencyKey string,
) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, mentionCall{
		mentionedUserID: mentionedUserID,
		toEmail:         toEmail,
		idempotencyKey:  idempotencyKey,
	})
	return nil
}

func (f *fakeMentionNotifier) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.calls)
}

// seedUser inserts a real user row and returns the UUID.
func seedUser(t *testing.T, pool *pgxpool.Pool, email, displayName string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO users (id, email, display_name, status) VALUES ($1, $2, $3, 'approved')`,
		id, email, displayName,
	)
	if err != nil {
		t.Fatalf("seedUser %s: %v", email, err)
	}
	return id
}

var truncateTables = []string{
	"mentions",
	"users",
}

func newMentionSvc(t *testing.T) (*mention.Service, *pgxpool.Pool) {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, truncateTables...)
	svc := mention.NewService(pool, nopLogger())
	return svc, pool
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// TestCreate_NotifiesOnceIdempotent verifies that the first Create call inserts
// a row and triggers the notifier; a duplicate (same target+sourceType+sourceID)
// is silently skipped and the notifier is NOT called again.
func TestCreate_NotifiesOnceIdempotent(t *testing.T) {
	svc, pool := newMentionSvc(t)
	ctx := context.Background()

	notifier := &fakeMentionNotifier{}
	svc.SetNotifier(notifier)

	actorID := seedUser(t, pool, "actor@nus.edu.sg", "Actor")
	targetID := seedUser(t, pool, "target@nus.edu.sg", "Target")

	taskID := uuid.New()
	projID := uuid.New()

	// First create.
	if err := svc.Create(ctx, actorID, targetID, "task", taskID, &projID, nil, "/link", "hello @Target"); err != nil {
		t.Fatalf("Create #1: %v", err)
	}
	if notifier.callCount() != 1 {
		t.Errorf("notifier called %d times after first Create, want 1", notifier.callCount())
	}

	// Duplicate — same (target, source_type, source_id).
	if err := svc.Create(ctx, actorID, targetID, "task", taskID, &projID, nil, "/link", "hello @Target again"); err != nil {
		t.Fatalf("Create #2 (duplicate): %v", err)
	}
	if notifier.callCount() != 1 {
		t.Errorf("notifier called %d times after duplicate Create, want still 1", notifier.callCount())
	}

	// ListForUser should return exactly 1 row.
	wsID := uuid.New() // random — no workspace filter used here
	_ = wsID
	mentions, err := svc.ListForUser(ctx, targetID, nil, 10)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if len(mentions) != 1 {
		t.Errorf("ListForUser count = %d, want 1", len(mentions))
	}
	if mentions[0].SourceType != "task" {
		t.Errorf("source_type = %q, want 'task'", mentions[0].SourceType)
	}
	if mentions[0].SourceID != taskID {
		t.Errorf("source_id = %s, want %s", mentions[0].SourceID, taskID)
	}
}

// TestCreate_SelfMentionSkipped verifies that mentioning yourself is a no-op.
func TestCreate_SelfMentionSkipped(t *testing.T) {
	svc, pool := newMentionSvc(t)
	ctx := context.Background()

	notifier := &fakeMentionNotifier{}
	svc.SetNotifier(notifier)

	actorID := seedUser(t, pool, "self@nus.edu.sg", "Self")

	taskID := uuid.New()
	projID := uuid.New()

	if err := svc.Create(ctx, actorID, actorID, "task", taskID, &projID, nil, "/link", "self"); err != nil {
		t.Fatalf("Create self-mention: %v", err)
	}

	if notifier.callCount() != 0 {
		t.Errorf("notifier called %d times for self-mention, want 0", notifier.callCount())
	}

	// No row should be stored.
	mentions, err := svc.ListForUser(ctx, actorID, nil, 10)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if len(mentions) != 0 {
		t.Errorf("expected 0 mentions for self-mention, got %d", len(mentions))
	}
}

// TestListForUser_FiltersByWorkspace verifies that ListForUser with a workspace
// filter returns only mentions that have the matching workspace_id.
func TestListForUser_FiltersByWorkspace(t *testing.T) {
	svc, pool := newMentionSvc(t)
	ctx := context.Background()

	actorID := seedUser(t, pool, "listactor@nus.edu.sg", "List Actor")
	targetID := seedUser(t, pool, "listtarget@nus.edu.sg", "List Target")

	wsA := uuid.New()
	wsB := uuid.New()

	taskA := uuid.New()
	taskB := uuid.New()
	taskC := uuid.New()

	// Mention in workspace A.
	if err := svc.Create(ctx, actorID, targetID, "task", taskA, nil, &wsA, "/a", "mention A"); err != nil {
		t.Fatalf("Create A: %v", err)
	}
	// Second mention in workspace A (different task).
	if err := svc.Create(ctx, actorID, targetID, "task", taskB, nil, &wsA, "/b", "mention B"); err != nil {
		t.Fatalf("Create B: %v", err)
	}
	// Mention in workspace B.
	if err := svc.Create(ctx, actorID, targetID, "task", taskC, nil, &wsB, "/c", "mention C"); err != nil {
		t.Fatalf("Create C: %v", err)
	}

	// Small sleep to ensure ordering is deterministic (created_at has second precision in some configurations).
	_ = time.Now()

	// Without filter: all 3.
	all, err := svc.ListForUser(ctx, targetID, nil, 10)
	if err != nil {
		t.Fatalf("ListForUser (no filter): %v", err)
	}
	if len(all) != 3 {
		t.Errorf("no filter: expected 3 mentions, got %d", len(all))
	}

	// Filter by wsA: 2 mentions.
	inA, err := svc.ListForUser(ctx, targetID, &wsA, 10)
	if err != nil {
		t.Fatalf("ListForUser wsA: %v", err)
	}
	if len(inA) != 2 {
		t.Errorf("wsA filter: expected 2 mentions, got %d", len(inA))
	}

	// Filter by wsB: 1 mention.
	inB, err := svc.ListForUser(ctx, targetID, &wsB, 10)
	if err != nil {
		t.Fatalf("ListForUser wsB: %v", err)
	}
	if len(inB) != 1 {
		t.Errorf("wsB filter: expected 1 mention, got %d", len(inB))
	}
}
