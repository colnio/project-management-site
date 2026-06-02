package page

import (
	"context"

	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// ─── Restore ──────────────────────────────────────────────────────────────────

type restoreInput struct {
	ID   string `path:"id"`
	Body struct {
		RevisionID string `json:"revision_id" required:"true"`
	}
}

type restoreOutput struct {
	ETag string `header:"ETag"`
	Body struct {
		Page     *Page     `json:"page"`
		Revision *Revision `json:"revision"`
	}
}

func (s *Service) handleRestore(ctx context.Context, in *restoreInput) (*restoreOutput, error) {
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

	targetRevID, err := uuid.Parse(in.Body.RevisionID)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_id", "invalid revision_id")
	}

	// Auth: requires editor.
	if _, err := s.authPage(ctx, p, pageID, org.RoleEditor); err != nil {
		return nil, err
	}

	pg, rev, err := s.handleRestoreInternal(ctx, p, pageID, targetRevID)
	if err != nil {
		return nil, err
	}

	out := &restoreOutput{}
	out.ETag = platform.FormatETag(rev.ID.String())
	out.Body.Page = pg
	out.Body.Revision = rev
	return out, nil
}

// ─── Candidate approve ────────────────────────────────────────────────────────

type approveCandidateInput struct {
	ID     string `path:"id"`
	CandID string `path:"cand_id"`
}

type approveCandidateOutput struct {
	ETag string `header:"ETag"`
	Body struct {
		Page     *Page     `json:"page"`
		Revision *Revision `json:"revision"`
	}
}

func (s *Service) handleApproveCandidate(ctx context.Context, in *approveCandidateInput) (*approveCandidateOutput, error) {
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

	candID, err := uuid.Parse(in.CandID)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_id", "invalid candidate revision ID")
	}

	pg, err := s.authPage(ctx, p, pageID, org.RoleEditor)
	if err != nil {
		return nil, err
	}

	cand, err := s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}
	if cand.PageID != pageID {
		return nil, platform.BadRequest("revision.wrong_page", "candidate belongs to a different page")
	}
	if cand.Status != "candidate" {
		return nil, platform.BadRequest("revision.not_candidate", "revision is not a candidate")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Supersede current.
	if pg.CurrentRevisionID != nil {
		if _, err := tx.Exec(ctx,
			`UPDATE page_revisions SET status='superseded' WHERE id=$1`, *pg.CurrentRevisionID,
		); err != nil {
			return nil, err
		}
	}

	// Promote candidate.
	if _, err := tx.Exec(ctx,
		`UPDATE page_revisions SET status='current' WHERE id=$1`, candID,
	); err != nil {
		return nil, err
	}

	// Advance page pointer.
	if _, err := tx.Exec(ctx,
		`UPDATE pages SET current_revision_id=$1, updated_at=now() WHERE id=$2`,
		candID, pageID,
	); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "page.candidate_approve",
		ResourceType: "page",
		ResourceID:   pageID.String(),
	})

	pg, err = s.GetPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	cand, err = s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}

	out := &approveCandidateOutput{}
	out.ETag = platform.FormatETag(candID.String())
	out.Body.Page = pg
	out.Body.Revision = cand
	return out, nil
}

// ─── Candidate reject ─────────────────────────────────────────────────────────

type rejectCandidateInput struct {
	ID     string `path:"id"`
	CandID string `path:"cand_id"`
}

type rejectCandidateOutput struct {
	Body struct {
		Revision *Revision `json:"revision"`
	}
}

func (s *Service) handleRejectCandidate(ctx context.Context, in *rejectCandidateInput) (*rejectCandidateOutput, error) {
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

	candID, err := uuid.Parse(in.CandID)
	if err != nil {
		return nil, platform.BadRequest("revision.invalid_id", "invalid candidate revision ID")
	}

	if _, err := s.authPage(ctx, p, pageID, org.RoleEditor); err != nil {
		return nil, err
	}

	cand, err := s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}
	if cand.PageID != pageID {
		return nil, platform.BadRequest("revision.wrong_page", "candidate belongs to a different page")
	}
	if cand.Status != "candidate" {
		return nil, platform.BadRequest("revision.not_candidate", "revision is not a candidate")
	}

	if _, err := s.pool.Exec(ctx,
		`UPDATE page_revisions SET status='rejected' WHERE id=$1`, candID,
	); err != nil {
		return nil, err
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		Action:       "page.candidate_reject",
		ResourceType: "page",
		ResourceID:   pageID.String(),
	})

	cand, err = s.getRevision(ctx, candID)
	if err != nil {
		return nil, err
	}

	out := &rejectCandidateOutput{}
	out.Body.Revision = cand
	return out, nil
}
