package audit

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	defaultLimit = 50
	maxLimit     = 200
)

// ListFilter controls which audit_log rows are returned by List.
type ListFilter struct {
	Actor        *uuid.UUID
	ResourceType string
	ResourceID   string
	Before       *time.Time
	After        *time.Time
	Limit        int
	// Cursor is an opaque pagination token (base64 of "created_at|id").
	Cursor string
}

// List returns audit entries newest-first with keyset pagination.
// Returns (entries, nextCursor, error). nextCursor is empty on the last page.
func (r *PgRecorder) List(ctx context.Context, f ListFilter) ([]Entry, string, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	var cursorTime time.Time
	var cursorID uuid.UUID
	hasCursor := false
	if f.Cursor != "" {
		if raw, err := base64.StdEncoding.DecodeString(f.Cursor); err == nil {
			parts := strings.SplitN(string(raw), "|", 2)
			if len(parts) == 2 {
				t, terr := time.Parse(time.RFC3339Nano, parts[0])
				id, uerr := uuid.Parse(parts[1])
				if terr == nil && uerr == nil {
					cursorTime = t
					cursorID = id
					hasCursor = true
				}
			}
		}
		// Invalid cursor is silently treated as no cursor (start from beginning).
	}

	// Build WHERE clause dynamically with positional args.
	var args []any
	argN := 0
	nextArg := func(v any) int {
		args = append(args, v)
		argN++
		return argN
	}

	var conditions []string
	if f.Actor != nil {
		i := nextArg(*f.Actor)
		conditions = append(conditions, fmt.Sprintf("actor = $%d", i))
	}
	if f.ResourceType != "" {
		i := nextArg(f.ResourceType)
		conditions = append(conditions, fmt.Sprintf("resource_type = $%d", i))
	}
	if f.ResourceID != "" {
		i := nextArg(f.ResourceID)
		conditions = append(conditions, fmt.Sprintf("resource_id = $%d", i))
	}
	if f.Before != nil {
		i := nextArg(*f.Before)
		conditions = append(conditions, fmt.Sprintf("created_at < $%d", i))
	}
	if f.After != nil {
		i := nextArg(*f.After)
		conditions = append(conditions, fmt.Sprintf("created_at > $%d", i))
	}
	if hasCursor {
		// Keyset: rows strictly before the cursor position (created_at DESC, id DESC).
		ti := nextArg(cursorTime)
		ii := nextArg(cursorID)
		conditions = append(conditions,
			fmt.Sprintf("(created_at < $%d OR (created_at = $%d AND id < $%d))", ti, ti, ii))
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Fetch one extra row to detect whether a next page exists.
	fetchN := limit + 1
	li := nextArg(fetchN)

	q := fmt.Sprintf(`
		SELECT id, actor, via_token_id, via_ai_conversation_id,
		       action, resource_type, resource_id,
		       request_payload_digest, response_status, created_at
		FROM audit_log
		%s
		ORDER BY created_at DESC, id DESC
		LIMIT $%d`, where, li)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, "", fmt.Errorf("audit list query: %w", err)
	}
	defer rows.Close()

	type row struct {
		id uuid.UUID
		e  Entry
	}
	var results []row
	for rows.Next() {
		var rr row
		if err := rows.Scan(
			&rr.id,
			&rr.e.Actor,
			&rr.e.ViaTokenID,
			&rr.e.ViaAIConversationID,
			&rr.e.Action,
			&rr.e.ResourceType,
			&rr.e.ResourceID,
			&rr.e.RequestPayloadDigest,
			&rr.e.ResponseStatus,
			&rr.e.CreatedAt,
		); err != nil {
			return nil, "", fmt.Errorf("audit list scan: %w", err)
		}
		results = append(results, rr)
	}
	if err := rows.Err(); err != nil {
		return nil, "", fmt.Errorf("audit list rows: %w", err)
	}

	hasMore := len(results) > limit
	if hasMore {
		results = results[:limit]
	}

	entries := make([]Entry, len(results))
	for i, rr := range results {
		entries[i] = rr.e
	}

	var nextCursor string
	if hasMore && len(results) > 0 {
		last := results[len(results)-1]
		nextCursor = encodeCursor(last.e.CreatedAt, last.id)
	}

	return entries, nextCursor, nil
}

// encodeCursor builds an opaque pagination cursor from a timestamp and row ID.
func encodeCursor(t time.Time, id uuid.UUID) string {
	raw := t.UTC().Format(time.RFC3339Nano) + "|" + id.String()
	return base64.StdEncoding.EncodeToString([]byte(raw))
}
