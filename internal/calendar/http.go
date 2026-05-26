package calendar

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
)

// Register wires calendar HTTP endpoints onto the huma API.
func Register(api huma.API, svc *Service) {
	// E1 — Events under a project.
	huma.Register(api, huma.Operation{
		OperationID: "calendar-event-create",
		Method:      http.MethodPost,
		Path:        "/v1/projects/{id}/events",
		Summary:     "Create a project event",
		Description: "Creates a calendar event (deadline, milestone, meeting, reminder, or custom) within a project. Supports recurring events via an RFC 5545 recurrence rule. Requires editor role on the project.",
		Tags:        []string{"calendar"},
	}, svc.handleCreateEvent)

	huma.Register(api, huma.Operation{
		OperationID: "calendar-event-list",
		Method:      http.MethodGet,
		Path:        "/v1/projects/{id}/events",
		Summary:     "List project events",
		Description: "Returns events for a project, optionally bounded by `from` and `to` timestamps (RFC 3339). Requires viewer role on the project.",
		Tags:        []string{"calendar"},
	}, svc.handleListEvents)

	// E1 — Single event endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "calendar-event-get",
		Method:      http.MethodGet,
		Path:        "/v1/events/{id}",
		Summary:     "Get an event",
		Description: "Returns a single calendar event by ID. Requires viewer role on the event's project.",
		Tags:        []string{"calendar"},
	}, svc.handleGetEvent)

	huma.Register(api, huma.Operation{
		OperationID: "calendar-event-update",
		Method:      http.MethodPatch,
		Path:        "/v1/events/{id}",
		Summary:     "Update an event",
		Description: "Applies a partial update to a calendar event. All fields are optional; omit to keep existing values. Requires editor role on the event's project.",
		Tags:        []string{"calendar"},
	}, svc.handleUpdateEvent)

	huma.Register(api, huma.Operation{
		OperationID: "calendar-event-delete",
		Method:      http.MethodDelete,
		Path:        "/v1/events/{id}",
		Summary:     "Delete an event",
		Description: "Permanently deletes a calendar event. Requires editor role on the event's project.",
		Tags:        []string{"calendar"},
	}, svc.handleDeleteEvent)

	// E2 — Subscription endpoints.
	huma.Register(api, huma.Operation{
		OperationID: "calendar-subscription-get",
		Method:      http.MethodGet,
		Path:        "/v1/cal/me/subscription",
		Summary:     "Get or lazily create the caller's iCal subscription",
		Description: "Returns the caller's iCal subscription details including the feed URL (`ics_url`). A subscription is created automatically on first call. Requires an authenticated session.",
		Tags:        []string{"calendar"},
	}, svc.handleGetSubscription)

	huma.Register(api, huma.Operation{
		OperationID: "calendar-subscription-rotate",
		Method:      http.MethodPost,
		Path:        "/v1/cal/me/subscription/rotate",
		Summary:     "Rotate the caller's iCal subscription token",
		Description: "Invalidates the current iCal token and generates a new one. The old feed URL stops working immediately. Requires an authenticated session.",
		Tags:        []string{"calendar"},
	}, svc.handleRotateToken)

	huma.Register(api, huma.Operation{
		OperationID: "calendar-subscription-update",
		Method:      http.MethodPatch,
		Path:        "/v1/cal/me/subscription",
		Summary:     "Update the caller's iCal subscription scope",
		Description: "Changes the iCal feed scope to `all_visible_projects` or `per_project` (with an explicit `project_ids` list). Requires an authenticated session.",
		Tags:        []string{"calendar"},
	}, svc.handleUpdateSubscription)
}

// ─── E1: Create event ─────────────────────────────────────────────────────────

type createEventInput struct {
	ID   string `path:"id"`
	Body struct {
		Kind           string     `json:"kind,omitempty" enum:"deadline,milestone_end,meeting,reminder,custom"`
		Title          string     `json:"title" required:"true" minLength:"1"`
		Description    string     `json:"description,omitempty"`
		StartAt        time.Time  `json:"start_at" required:"true"`
		EndAt          *time.Time `json:"end_at,omitempty"`
		AllDay         bool       `json:"all_day,omitempty"`
		RecurrenceRule string     `json:"recurrence_rule,omitempty"`
		IterationID    *uuid.UUID `json:"iteration_id,omitempty"`
		SampleID       *uuid.UUID `json:"sample_id,omitempty"`
		ExperimentID   *uuid.UUID `json:"experiment_id,omitempty"`
	}
}

type createEventOutput struct {
	Status int
	Body   *Event
}

func (s *Service) handleCreateEvent(ctx context.Context, in *createEventInput) (*createEventOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, err
	}

	e, err := s.CreateEvent(ctx, projectID,
		in.Body.Kind, in.Body.Title, in.Body.Description,
		in.Body.StartAt, in.Body.EndAt, in.Body.AllDay, in.Body.RecurrenceRule,
		in.Body.IterationID, in.Body.SampleID, in.Body.ExperimentID,
		p.UserID,
	)
	if err != nil {
		return nil, err
	}
	return &createEventOutput{Status: http.StatusCreated, Body: e}, nil
}

// ─── E1: List events ──────────────────────────────────────────────────────────

type listEventsInput struct {
	ID   string    `path:"id"`
	From time.Time `query:"from"`
	To   time.Time `query:"to"`
}

type listEventsOutput struct {
	Body []*Event
}

func (s *Service) handleListEvents(ctx context.Context, in *listEventsInput) (*listEventsOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	projectID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("project.invalid_id", "invalid project ID")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleViewer); err != nil {
		return nil, err
	}

	var from, to *time.Time
	if !in.From.IsZero() {
		from = &in.From
	}
	if !in.To.IsZero() {
		to = &in.To
	}
	list, err := s.ListEvents(ctx, projectID, from, to)
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []*Event{}
	}
	return &listEventsOutput{Body: list}, nil
}

// ─── E1: Get event ────────────────────────────────────────────────────────────

type getEventInput struct {
	ID string `path:"id"`
}

type getEventOutput struct {
	Body *Event
}

func (s *Service) handleGetEvent(ctx context.Context, in *getEventInput) (*getEventOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	eventID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("event.invalid_id", "invalid event ID")
	}

	e, err := s.GetEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, e.ProjectID, org.RoleViewer); err != nil {
		return nil, err
	}

	return &getEventOutput{Body: e}, nil
}

// ─── E1: Update event ─────────────────────────────────────────────────────────

type updateEventInput struct {
	ID   string `path:"id"`
	Body struct {
		Kind           *string    `json:"kind,omitempty" enum:"deadline,milestone_end,meeting,reminder,custom"`
		Title          *string    `json:"title,omitempty"`
		Description    *string    `json:"description,omitempty"`
		StartAt        *time.Time `json:"start_at,omitempty"`
		EndAt          **time.Time `json:"end_at,omitempty"`
		AllDay         *bool      `json:"all_day,omitempty"`
		RecurrenceRule *string    `json:"recurrence_rule,omitempty"`
		IterationID    **uuid.UUID `json:"iteration_id,omitempty"`
		SampleID       **uuid.UUID `json:"sample_id,omitempty"`
		ExperimentID   **uuid.UUID `json:"experiment_id,omitempty"`
	}
}

type updateEventOutput struct {
	Body *Event
}

func (s *Service) handleUpdateEvent(ctx context.Context, in *updateEventInput) (*updateEventOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	eventID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("event.invalid_id", "invalid event ID")
	}

	e, err := s.GetEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, e.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	updated, err := s.UpdateEvent(ctx, eventID,
		in.Body.Kind, in.Body.Title, in.Body.Description,
		in.Body.StartAt, in.Body.EndAt, in.Body.AllDay, in.Body.RecurrenceRule,
		in.Body.IterationID, in.Body.SampleID, in.Body.ExperimentID,
		p.UserID,
	)
	if err != nil {
		return nil, err
	}
	return &updateEventOutput{Body: updated}, nil
}

// ─── E1: Delete event ─────────────────────────────────────────────────────────

type deleteEventInput struct {
	ID string `path:"id"`
}

type deleteEventOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

func (s *Service) handleDeleteEvent(ctx context.Context, in *deleteEventInput) (*deleteEventOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	eventID, err := uuid.Parse(in.ID)
	if err != nil {
		return nil, platform.BadRequest("event.invalid_id", "invalid event ID")
	}

	e, err := s.GetEvent(ctx, eventID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, e.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if err := s.DeleteEvent(ctx, eventID, p.UserID); err != nil {
		return nil, err
	}

	out := &deleteEventOutput{}
	out.Body.OK = true
	return out, nil
}

// ─── E2: Get or create subscription ──────────────────────────────────────────

type subscriptionResponse struct {
	Token      string      `json:"token"`
	Scope      string      `json:"scope"`
	ProjectIDs []uuid.UUID `json:"project_ids"`
	ICSURL     string      `json:"ics_url"`
}

type getSubscriptionOutput struct {
	Body *subscriptionResponse
}

func (s *Service) handleGetSubscription(ctx context.Context, _ *struct{}) (*getSubscriptionOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	sub, err := s.GetOrCreateSubscription(ctx, p.UserID)
	if err != nil {
		return nil, err
	}

	return &getSubscriptionOutput{Body: toSubResponse(sub)}, nil
}

// ─── E2: Rotate token ─────────────────────────────────────────────────────────

type rotateTokenOutput struct {
	Body *subscriptionResponse
}

func (s *Service) handleRotateToken(ctx context.Context, _ *struct{}) (*rotateTokenOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	// Ensure subscription exists before rotating.
	if _, err := s.GetOrCreateSubscription(ctx, p.UserID); err != nil {
		return nil, err
	}

	sub, err := s.RotateToken(ctx, p.UserID)
	if err != nil {
		return nil, err
	}

	return &rotateTokenOutput{Body: toSubResponse(sub)}, nil
}

// ─── E2: Update subscription ──────────────────────────────────────────────────

type updateSubscriptionInput struct {
	Body struct {
		Scope      *string     `json:"scope,omitempty" enum:"all_visible_projects,per_project"`
		ProjectIDs *[]uuid.UUID `json:"project_ids,omitempty"`
	}
}

type updateSubscriptionOutput struct {
	Body *subscriptionResponse
}

func (s *Service) handleUpdateSubscription(ctx context.Context, in *updateSubscriptionInput) (*updateSubscriptionOutput, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	// Ensure subscription exists.
	if _, err := s.GetOrCreateSubscription(ctx, p.UserID); err != nil {
		return nil, err
	}

	sub, err := s.UpdateSubscription(ctx, p.UserID, in.Body.Scope, in.Body.ProjectIDs)
	if err != nil {
		return nil, err
	}

	return &updateSubscriptionOutput{Body: toSubResponse(sub)}, nil
}

// ─── E2: ICS feed (plain http.Handler, mounted by orchestrator) ───────────────

// ICSHandler serves the RFC 5545 iCalendar feed. It is mounted by the
// orchestrator at the chi route /v1/cal/{user_id}/{token} (the real URL ends
// in .ics, so the captured {token} param may include a trailing ".ics").
func (s *Service) ICSHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Parse user_id and token from chi path params.
	rawUserID := chi.URLParam(r, "user_id")
	rawToken := chi.URLParam(r, "token")

	// Strip trailing ".ics" suffix from the token if present.
	rawToken = strings.TrimSuffix(rawToken, ".ics")

	userID, err := uuid.Parse(rawUserID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Look up the subscription for this user.
	sub, err := s.getSubscriptionByUserID(ctx, userID)
	if err != nil || sub == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Validate token and revocation.
	if sub.Token != rawToken || sub.RevokedAt != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Build synthetic principal (first-party, unrestricted).
	synthetic := &platform.Principal{UserID: userID}

	// Gather project IDs with events that this user can read.
	projectIDs, err := s.listDistinctProjectIDsForSubscription(ctx, sub)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Filter to projects the synthetic principal can actually read.
	var accessibleProjects []uuid.UUID
	for _, pid := range projectIDs {
		if _, _, authErr := s.projects.Authorize(ctx, synthetic, pid, org.RoleViewer); authErr == nil {
			accessibleProjects = append(accessibleProjects, pid)
		}
	}

	// Collect all events from accessible projects.
	var events []*Event
	for _, pid := range accessibleProjects {
		evs, listErr := s.ListEvents(ctx, pid, nil, nil)
		if listErr != nil {
			continue
		}
		events = append(events, evs...)
	}

	// Update last_fetched_at asynchronously (best-effort).
	go s.updateLastFetched(context.Background(), sub.ID)

	// Emit RFC 5545 iCalendar body.
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=calendar.ics")

	now := time.Now().UTC()
	body := buildICS(events, now)
	_, _ = w.Write([]byte(body))
}

// ─── RFC 5545 helpers ─────────────────────────────────────────────────────────

func buildICS(events []*Event, now time.Time) string {
	var sb strings.Builder
	sb.WriteString("BEGIN:VCALENDAR\r\n")
	sb.WriteString("VERSION:2.0\r\n")
	sb.WriteString("PRODID:-//Graphene Lab//PM//EN\r\n")
	sb.WriteString("CALSCALE:GREGORIAN\r\n")

	for _, e := range events {
		sb.WriteString("BEGIN:VEVENT\r\n")
		fmt.Fprintf(&sb, "UID:%s@graphene-lab\r\n", e.ID.String())
		fmt.Fprintf(&sb, "DTSTAMP:%s\r\n", now.Format("20060102T150405Z"))

		if e.AllDay {
			fmt.Fprintf(&sb, "DTSTART;VALUE=DATE:%s\r\n", e.StartAt.UTC().Format("20060102"))
			if e.EndAt != nil {
				fmt.Fprintf(&sb, "DTEND;VALUE=DATE:%s\r\n", e.EndAt.UTC().Format("20060102"))
			}
		} else {
			fmt.Fprintf(&sb, "DTSTART:%s\r\n", e.StartAt.UTC().Format("20060102T150405Z"))
			if e.EndAt != nil {
				fmt.Fprintf(&sb, "DTEND:%s\r\n", e.EndAt.UTC().Format("20060102T150405Z"))
			}
		}

		fmt.Fprintf(&sb, "SUMMARY:%s\r\n", icsEscape(e.Title))
		if e.Description != "" {
			fmt.Fprintf(&sb, "DESCRIPTION:%s\r\n", icsEscape(e.Description))
		}
		if e.RecurrenceRule != "" {
			fmt.Fprintf(&sb, "RRULE:%s\r\n", e.RecurrenceRule)
		}
		sb.WriteString("END:VEVENT\r\n")
	}

	sb.WriteString("END:VCALENDAR\r\n")
	return sb.String()
}

// icsEscape escapes text per RFC 5545 §3.3.11: backslash, semicolon, comma,
// and newlines (\n) are escaped.
func icsEscape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, ";", `\;`)
	s = strings.ReplaceAll(s, ",", `\,`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r\n", `\n`)
	return s
}

// toSubResponse converts a Subscription to the API response struct.
func toSubResponse(sub *Subscription) *subscriptionResponse {
	pids := sub.ProjectIDs
	if pids == nil {
		pids = []uuid.UUID{}
	}
	return &subscriptionResponse{
		Token:      sub.Token,
		Scope:      sub.Scope,
		ProjectIDs: pids,
		ICSURL:     fmt.Sprintf("/v1/cal/%s/%s.ics", sub.UserID, sub.Token),
	}
}
