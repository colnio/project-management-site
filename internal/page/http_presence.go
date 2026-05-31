package page

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// ─── Presence heartbeat ───────────────────────────────────────────────────────

type presenceHeartbeatInput struct {
	ID   string `path:"id"`
	Body struct {
		ClientID string `json:"client_id" required:"true"`
	}
}

type presenceHeartbeatOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handlePresenceHeartbeat(ctx context.Context, in *presenceHeartbeatInput) (*presenceHeartbeatOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeWritePages); err != nil {
		return nil, err
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	if _, err := s.authPage(ctx, p, pageID, org.RoleViewer); err != nil {
		return nil, err
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO page_presence (page_id, user_id, client_id, since, last_heartbeat)
		 VALUES ($1, $2, $3, now(), now())
		 ON CONFLICT (page_id, client_id)
		 DO UPDATE SET last_heartbeat = now(), user_id = $2`,
		pageID, p.UserID, in.Body.ClientID,
	)
	if err != nil {
		return nil, err
	}

	out := &presenceHeartbeatOutput{}
	out.Body.OK = true
	return out, nil
}

// ─── Presence list ────────────────────────────────────────────────────────────

type presenceListInput struct {
	ID string `path:"id"`
}

type presenceEntry struct {
	UserID        uuid.UUID `json:"user_id"`
	Since         time.Time `json:"since"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
}

type presenceListOutput struct {
	Body struct {
		Present []presenceEntry `json:"present"`
	}
}

func (s *Service) handlePresenceList(ctx context.Context, in *presenceListInput) (*presenceListOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}
	if err := platform.RequireScope(p, platform.ScopeReadPages); err != nil {
		return nil, err
	}

	pageID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("page.invalid_id", "invalid page ID")
	}

	if _, err := s.authPage(ctx, p, pageID, org.RoleViewer); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT user_id, since, last_heartbeat
		 FROM page_presence
		 WHERE page_id = $1
		   AND last_heartbeat > now() - interval '30 seconds'
		 ORDER BY since`,
		pageID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []presenceEntry
	for rows.Next() {
		var e presenceEntry
		if err := rows.Scan(&e.UserID, &e.Since, &e.LastHeartbeat); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	if entries == nil {
		entries = []presenceEntry{}
	}

	out := &presenceListOutput{}
	out.Body.Present = entries
	return out, nil
}
