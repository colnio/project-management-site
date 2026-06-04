package notify

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// EnqueueWorkspaceInvite sends an invite email (always delivered).
func (s *Service) EnqueueWorkspaceInvite(ctx context.Context, inviteID uuid.UUID, toEmail, inviteLink string) error {
	return s.Enqueue(ctx, EnqueueParams{
		ToEmail:        toEmail,
		Category:       CategorySecurity,
		TemplateKey:    TemplateWorkspaceInvite,
		IdempotencyKey: fmt.Sprintf("invite:%s", inviteID),
		Payload: map[string]any{
			"InviteLink": inviteLink,
			"PrefsURL":   s.prefsURL(),
		},
	})
}

// EnqueueApprovalPending notifies one approval recipient.
func (s *Service) EnqueueApprovalPending(ctx context.Context, requestID, projectID, recipientUserID uuid.UUID, toEmail, projectName, description, aiReview string) error {
	snippet := strings.TrimSpace(aiReview)
	if len(snippet) > 200 {
		snippet = snippet[:200] + "..."
	}
	uid := recipientUserID
	return s.Enqueue(ctx, EnqueueParams{
		UserID:         &uid,
		ToEmail:        toEmail,
		Category:       CategoryApproval,
		TemplateKey:    TemplateApprovalRequestPending,
		IdempotencyKey: fmt.Sprintf("approval:%s:%s", requestID, recipientUserID),
		Payload: map[string]any{
			"ProjectName":      projectName,
			"Description":      description,
			"AIReviewSnippet":  snippet,
			"ActionPath":       "/projects/" + projectID.String(),
		},
	})
}

// EnqueueApprovalComment notifies one participant that a new comment was posted.
func (s *Service) EnqueueApprovalComment(ctx context.Context, requestID, projectID, recipientUserID uuid.UUID, toEmail, projectName, authorName, commentBody string) error {
	snippet := strings.TrimSpace(commentBody)
	if len(snippet) > 200 {
		snippet = snippet[:200] + "..."
	}
	uid := recipientUserID
	return s.Enqueue(ctx, EnqueueParams{
		UserID:         &uid,
		ToEmail:        toEmail,
		Category:       CategoryApproval,
		TemplateKey:    TemplateApprovalComment,
		IdempotencyKey: fmt.Sprintf("approval-comment:%s:%s", requestID, recipientUserID),
		Payload: map[string]any{
			"ProjectName":    projectName,
			"AuthorName":     authorName,
			"CommentSnippet": snippet,
			"ActionPath":     "/projects/" + projectID.String(),
		},
	})
}

// EnqueuePIFlagReview notifies a workspace owner about a PI flag.
func (s *Service) EnqueuePIFlagReview(ctx context.Context, idempotencyKey string, ownerUserID *uuid.UUID, toEmail, projectName, actionPath, riskTitle string) error {
	return s.Enqueue(ctx, EnqueueParams{
		UserID:         ownerUserID,
		ToEmail:        toEmail,
		Category:       CategoryPIFlag,
		TemplateKey:    TemplatePIFlagReview,
		IdempotencyKey: idempotencyKey,
		Payload: map[string]any{
			"ProjectName": projectName,
			"RiskTitle":   riskTitle,
			"ActionPath":  actionPath,
		},
	})
}

// EnqueueTaskAssigned notifies a user that a task has been assigned to them
// (on take or reassign). Best-effort; the caller never fails the mutation on
// error. idempotencyKey should encode task + assignee so a reassign to the same
// person isn't re-sent.
func (s *Service) EnqueueTaskAssigned(ctx context.Context, taskID, projectID, assigneeUserID uuid.UUID, toEmail, projectName, taskTitle, actionPath, idempotencyKey string) error {
	uid := assigneeUserID
	return s.Enqueue(ctx, EnqueueParams{
		UserID:         &uid,
		ToEmail:        toEmail,
		Category:       CategoryTask,
		TemplateKey:    TemplateTaskAssigned,
		IdempotencyKey: idempotencyKey,
		Payload: map[string]any{
			"ProjectName": projectName,
			"TaskTitle":   taskTitle,
			"ActionPath":  actionPath,
		},
	})
}

// EnqueueMention notifies a user that they were @-mentioned in a task or page.
// Best-effort; the caller never fails the mutation on error. idempotencyKey
// should encode the source so repeated edits don't re-notify.
func (s *Service) EnqueueMention(ctx context.Context, mentionedUserID uuid.UUID, toEmail, actorName, snippet, actionPath, idempotencyKey string) error {
	uid := mentionedUserID
	sn := strings.TrimSpace(snippet)
	if len(sn) > 200 {
		sn = sn[:200] + "..."
	}
	return s.Enqueue(ctx, EnqueueParams{
		UserID:         &uid,
		ToEmail:        toEmail,
		Category:       CategoryMention,
		TemplateKey:    TemplateMention,
		IdempotencyKey: idempotencyKey,
		Payload: map[string]any{
			"ActorName":  actorName,
			"Snippet":    sn,
			"ActionPath": actionPath,
		},
	})
}

// EnqueueAccountApproved sends mandatory account approval email.
func (s *Service) EnqueueAccountApproved(ctx context.Context, userID uuid.UUID, toEmail string) error {
	uid := userID
	return s.Enqueue(ctx, EnqueueParams{
		UserID:         &uid,
		ToEmail:        toEmail,
		Category:       CategoryAccount,
		TemplateKey:    TemplateAccountApproved,
		IdempotencyKey: fmt.Sprintf("account_approved:%s", userID),
		Payload: map[string]any{
			"ActionPath": "/login",
		},
	})
}

// EnqueueAccountSuspended sends mandatory suspension notice.
func (s *Service) EnqueueAccountSuspended(ctx context.Context, userID uuid.UUID, toEmail string) error {
	uid := userID
	return s.Enqueue(ctx, EnqueueParams{
		UserID:         &uid,
		ToEmail:        toEmail,
		Category:       CategoryAccount,
		TemplateKey:    TemplateAccountSuspended,
		IdempotencyKey: fmt.Sprintf("account_suspended:%s", userID),
		Payload:        map[string]any{},
	})
}
