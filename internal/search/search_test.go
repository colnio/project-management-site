package search_test

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/search"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

func nopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// fakeUsers satisfies org.Users and project.UserLookup and seeds real rows.
type fakeUsers struct {
	byEmail map[string]*auth.User
	byID    map[uuid.UUID]*auth.User
	pool    *pgxpool.Pool
}

func newFakeUsers(pool *pgxpool.Pool) *fakeUsers {
	return &fakeUsers{
		byEmail: make(map[string]*auth.User),
		byID:    make(map[uuid.UUID]*auth.User),
		pool:    pool,
	}
}

func (f *fakeUsers) seed(t *testing.T, email, name string) *auth.User {
	t.Helper()
	u := &auth.User{
		ID:          uuid.New(),
		Email:       email,
		DisplayName: name,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	_, err := f.pool.Exec(context.Background(),
		`INSERT INTO users (id, email, display_name, status) VALUES ($1, $2, $3, 'approved')`,
		u.ID, u.Email, u.DisplayName,
	)
	if err != nil {
		t.Fatalf("seed user %s: %v", email, err)
	}
	f.byEmail[email] = u
	f.byID[u.ID] = u
	return u
}

// seedWithStatus creates a user with an explicit status value.
func (f *fakeUsers) seedWithStatus(t *testing.T, email, name, status string) *auth.User {
	t.Helper()
	u := &auth.User{
		ID:          uuid.New(),
		Email:       email,
		DisplayName: name,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	_, err := f.pool.Exec(context.Background(),
		`INSERT INTO users (id, email, display_name, status) VALUES ($1, $2, $3, $4)`,
		u.ID, u.Email, u.DisplayName, status,
	)
	if err != nil {
		t.Fatalf("seed user %s (status=%s): %v", email, status, err)
	}
	f.byEmail[email] = u
	f.byID[u.ID] = u
	return u
}

func (f *fakeUsers) GetUserByEmail(_ context.Context, email string) (*auth.User, error) {
	u, ok := f.byEmail[email]
	if !ok {
		return nil, platform.NotFound("user.not_found", "not found")
	}
	return u, nil
}
func (f *fakeUsers) GetUserByID(_ context.Context, id uuid.UUID) (*auth.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, platform.NotFound("user.not_found", "not found")
	}
	return u, nil
}
func (f *fakeUsers) GetUsersByIDs(_ context.Context, ids []uuid.UUID) (map[uuid.UUID]*auth.User, error) {
	out := make(map[uuid.UUID]*auth.User, len(ids))
	for _, id := range ids {
		if u, ok := f.byID[id]; ok {
			out[id] = u
		}
	}
	return out, nil
}
func (f *fakeUsers) CreateUser(_ context.Context, _, _ string) (*auth.User, error) {
	return nil, platform.BadRequest("not_supported", "not supported")
}
func (f *fakeUsers) SetPassword(_ context.Context, _ uuid.UUID, _ string) error { return nil }

// searchEnv holds services for a search test.
type searchEnv struct {
	pool      *pgxpool.Pool
	orgSvc    *org.Service
	projSvc   *project.Service
	searchSvc *search.Service
	users     *fakeUsers
}

var truncateTables = []string{
	"mentions", "task_progress", "task_references", "tasks",
	"project_events",
	"risks", "iterations",
	"experiments", "samples",
	"projects", "project_collaborations", "admin_overrides",
	"workspace_memberships", "workspaces", "users",
}

func newSearchEnv(t *testing.T, domains []string) *searchEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool, truncateTables...)

	fu := newFakeUsers(pool)
	log := nopLogger()

	cfg := &config.Config{
		SMTPHost:            "localhost",
		SMTPPort:            "1025",
		SMTPFrom:            "test@example.com",
		WebOrigin:           "http://localhost:5173",
		AllowedEmailDomains: domains,
	}
	rec := audit.Nop{}
	orgSvc := org.NewService(pool, cfg, rec, fu, log)
	projSvc := project.NewService(pool, orgSvc, fu, rec, log)
	searchSvc := search.NewService(pool, projSvc)

	return &searchEnv{
		pool:      pool,
		orgSvc:    orgSvc,
		projSvc:   projSvc,
		searchSvc: searchSvc,
		users:     fu,
	}
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// TestSearch_AccessScopingAndTiers verifies that samples are returned only for
// readable projects and that tiers are assigned correctly (0=current project,
// 2=other workspace), with private projects excluded unless collaborator.
func TestSearch_AccessScopingAndTiers(t *testing.T) {
	env := newSearchEnv(t, []string{"nus.edu.sg"})
	ctx := context.Background()

	// Seed users.
	owner := env.users.seed(t, "search-owner@nus.edu.sg", "Owner")
	owner2 := env.users.seed(t, "search-owner2@nus.edu.sg", "Owner2")
	privateOwner := env.users.seed(t, "private-owner@nus.edu.sg", "Private Owner")
	labMember := env.users.seed(t, "lab-member@nus.edu.sg", "Lab Member")
	external := env.users.seedWithStatus(t, "external@gmail.com", "External", "approved")

	// Workspace W with project A (workspace-visible).
	wsW, err := env.orgSvc.CreateWorkspace(ctx, "Workspace W", owner.ID)
	if err != nil {
		t.Fatalf("create workspace W: %v", err)
	}
	projA, err := env.projSvc.CreateProject(ctx, wsW.ID, "Project A", "", "workspace", owner.ID)
	if err != nil {
		t.Fatalf("create project A: %v", err)
	}

	// Workspace W2 with project B (workspace-visible).
	wsW2, err := env.orgSvc.CreateWorkspace(ctx, "Workspace W2", owner2.ID)
	if err != nil {
		t.Fatalf("create workspace W2: %v", err)
	}
	projB, err := env.projSvc.CreateProject(ctx, wsW2.ID, "Project B", "", "workspace", owner2.ID)
	if err != nil {
		t.Fatalf("create project B: %v", err)
	}

	// Private project C in W (owned by a different user).
	projC, err := env.projSvc.CreateProject(ctx, wsW.ID, "Project C", "", "private", privateOwner.ID)
	if err != nil {
		t.Fatalf("create project C (private): %v", err)
	}

	// Seed samples.
	_, err = env.pool.Exec(ctx,
		`INSERT INTO samples (id, project_id, identifier, name, kind, created_by)
		 VALUES (gen_random_uuid(), $1, 'G-CVD-016', 'Sample in A', 'cell', $2)`,
		projA.ID, owner.ID,
	)
	if err != nil {
		t.Fatalf("insert sample G-CVD-016: %v", err)
	}
	_, err = env.pool.Exec(ctx,
		`INSERT INTO samples (id, project_id, identifier, name, kind, created_by)
		 VALUES (gen_random_uuid(), $1, 'G-CVD-099', 'Sample in B', 'cell', $2)`,
		projB.ID, owner2.ID,
	)
	if err != nil {
		t.Fatalf("insert sample G-CVD-099: %v", err)
	}
	_, err = env.pool.Exec(ctx,
		`INSERT INTO samples (id, project_id, identifier, name, kind, created_by)
		 VALUES (gen_random_uuid(), $1, 'SECRET-1', 'Secret Sample', 'other', $2)`,
		projC.ID, privateOwner.ID,
	)
	if err != nil {
		t.Fatalf("insert sample SECRET-1: %v", err)
	}

	// Seed experiment EX-9 in project A.
	_, err = env.pool.Exec(ctx,
		`INSERT INTO experiments (id, project_id, code, method, created_by)
		 VALUES (gen_random_uuid(), $1, 'EX-9', 'custom', $2)`,
		projA.ID, owner.ID,
	)
	if err != nil {
		t.Fatalf("insert experiment EX-9: %v", err)
	}

	t.Run("lab_member_sees_workspace_visible_not_private", func(t *testing.T) {
		// Lab member: email on nus.edu.sg, not a member of any workspace.
		p := &platform.Principal{UserID: labMember.ID, Email: labMember.Email}

		results, err := env.searchSvc.Search(ctx, p, "G-CVD", &projA.ID, []string{"sample"}, 10)
		if err != nil {
			t.Fatalf("Search: %v", err)
		}

		// Must find G-CVD-016 (tier 0, project A = currentProject) and G-CVD-099 (tier 2, other workspace).
		foundA, foundB, foundSecret := false, false, false
		for _, r := range results {
			switch r.Label {
			case "G-CVD-016":
				foundA = true
				if r.Tier != 0 {
					t.Errorf("G-CVD-016 tier = %d, want 0 (current project)", r.Tier)
				}
				if r.ProjectID == nil || *r.ProjectID != projA.ID {
					t.Errorf("G-CVD-016 project_id = %v, want %s", r.ProjectID, projA.ID)
				}
			case "G-CVD-016 — Sample in A":
				// label may include name
				foundA = true
				if r.Tier != 0 {
					t.Errorf("G-CVD-016 (with name) tier = %d, want 0", r.Tier)
				}
			case "G-CVD-099 — Sample in B", "G-CVD-099":
				foundB = true
				if r.Tier != 2 {
					t.Errorf("G-CVD-099 tier = %d, want 2 (other workspace)", r.Tier)
				}
			case "SECRET-1 — Secret Sample", "SECRET-1":
				foundSecret = true
			}
		}

		if !foundA {
			t.Errorf("expected G-CVD-016 in results; got %v", labelsOf(results))
		}
		if !foundB {
			t.Errorf("expected G-CVD-099 in results; got %v", labelsOf(results))
		}
		if foundSecret {
			t.Errorf("SECRET-1 must not appear (private project, not collaborator)")
		}
	})

	t.Run("external_sees_nothing", func(t *testing.T) {
		// External user: not on NUS domain, not a workspace member.
		p := &platform.Principal{UserID: external.ID, Email: external.Email}

		results, err := env.searchSvc.Search(ctx, p, "G-CVD", &projA.ID, []string{"sample"}, 10)
		if err != nil {
			t.Fatalf("Search: %v", err)
		}
		if len(results) != 0 {
			t.Errorf("external user: expected 0 results, got %d: %v", len(results), labelsOf(results))
		}
	})

	t.Run("lab_member_finds_experiment_by_code", func(t *testing.T) {
		p := &platform.Principal{UserID: labMember.ID, Email: labMember.Email}

		results, err := env.searchSvc.Search(ctx, p, "EX-9", &projA.ID, []string{"experiment"}, 10)
		if err != nil {
			t.Fatalf("Search (experiment): %v", err)
		}

		found := false
		for _, r := range results {
			if r.Type == "experiment" && r.Label == "EX-9" {
				found = true
				if r.Tier != 0 {
					t.Errorf("EX-9 tier = %d, want 0 (current project)", r.Tier)
				}
			}
		}
		if !found {
			t.Errorf("expected EX-9 in results; got %v", labelsOf(results))
		}
	})
}

// TestSearch_People verifies the people search type across approved/suspended users.
func TestSearch_People(t *testing.T) {
	env := newSearchEnv(t, []string{"nus.edu.sg"})
	ctx := context.Background()

	// Seed the searching principal (not part of the results we're asserting).
	searcher := env.users.seed(t, "searcher@nus.edu.sg", "Searcher")

	// Approved users.
	env.users.seed(t, "alice@nus.edu.sg", "Alice Smith")
	env.users.seed(t, "bob@nus.edu.sg", "Bob Jones")

	// Suspended user — must not appear.
	env.users.seedWithStatus(t, "suspended@nus.edu.sg", "Suspended User", "suspended")

	p := &platform.Principal{UserID: searcher.ID, Email: searcher.Email}

	t.Run("by_display_name", func(t *testing.T) {
		results, err := env.searchSvc.Search(ctx, p, "alice", nil, []string{"people"}, 10)
		if err != nil {
			t.Fatalf("Search people 'alice': %v", err)
		}
		found := false
		for _, r := range results {
			if r.Type == "people" && r.Email == "alice@nus.edu.sg" {
				found = true
			}
		}
		if !found {
			t.Errorf("expected alice in people results; got %v", labelsOf(results))
		}
	})

	t.Run("by_email_prefix", func(t *testing.T) {
		results, err := env.searchSvc.Search(ctx, p, "bob@nus", nil, []string{"people"}, 10)
		if err != nil {
			t.Fatalf("Search people 'bob@nus': %v", err)
		}
		found := false
		for _, r := range results {
			if r.Type == "people" && r.Email == "bob@nus.edu.sg" {
				found = true
			}
		}
		if !found {
			t.Errorf("expected bob in people results; got %v", labelsOf(results))
		}
	})

	t.Run("suspended_excluded", func(t *testing.T) {
		results, err := env.searchSvc.Search(ctx, p, "suspended", nil, []string{"people"}, 10)
		if err != nil {
			t.Fatalf("Search people 'suspended': %v", err)
		}
		for _, r := range results {
			if r.Email == "suspended@nus.edu.sg" {
				t.Errorf("suspended user must not appear in people results")
			}
		}
	})
}

// TestSearch_EmptyQuery verifies that an empty query returns an empty slice.
func TestSearch_EmptyQuery(t *testing.T) {
	env := newSearchEnv(t, []string{"nus.edu.sg"})
	ctx := context.Background()

	owner := env.users.seed(t, "empty-q-owner@nus.edu.sg", "Owner")
	p := &platform.Principal{UserID: owner.ID, Email: owner.Email}

	results, err := env.searchSvc.Search(ctx, p, "", nil, nil, 10)
	if err != nil {
		t.Fatalf("Search empty: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("empty query: expected 0 results, got %d", len(results))
	}
}

// labelsOf is a debug helper that extracts result labels for error messages.
func labelsOf(results []*search.Result) []string {
	out := make([]string, len(results))
	for i, r := range results {
		out[i] = r.Label
	}
	return out
}
