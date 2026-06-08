package artifact_test

import (
	"context"
	"io"
	"log/slog"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/artifact"
	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/auth"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/experiment"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/sample"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

func nopLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// capturingRecorder records audit entries.
type capturingRecorder struct {
	entries []audit.Entry
}

func (r *capturingRecorder) Record(_ context.Context, e audit.Entry) error {
	r.entries = append(r.entries, e)
	return nil
}

func (r *capturingRecorder) hasAction(action string) bool {
	for _, e := range r.entries {
		if e.Action == action {
			return true
		}
	}
	return false
}

// fakeUsers satisfies org.Users and project.UserLookup.
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
		`INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		u.ID, u.Email, u.DisplayName,
	)
	if err != nil {
		t.Fatalf("seed user %s: %v", email, err)
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

func (f *fakeUsers) CreateUser(_ context.Context, email, displayName string) (*auth.User, error) {
	return nil, platform.BadRequest("not_supported", "not supported")
}
func (f *fakeUsers) SetPassword(_ context.Context, _ uuid.UUID, _ string) error { return nil }

// ─── Test environment ─────────────────────────────────────────────────────────

type testEnv struct {
	pool      *pgxpool.Pool
	svc       *artifact.Service
	orgSvc    *org.Service
	projSvc   *project.Service
	sampleSvc *sample.Service
	expSvc    *experiment.Service
	users     *fakeUsers
	rec       *capturingRecorder
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"experiment_artifacts", "sample_artifacts", "artifacts",
		"experiments", "samples",
		"projects", "project_collaborations", "admin_overrides",
		"workspace_memberships", "workspaces", "users",
	)

	fu := newFakeUsers(pool)
	rec := &capturingRecorder{}
	log := nopLogger()

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config.Load: %v", err)
	}

	orgSvc := org.NewService(pool, cfg, audit.Nop{}, fu, log)
	projSvc := project.NewService(pool, orgSvc, fu, rec, log)
	sampleSvc := sample.NewService(pool, projSvc, rec, log)
	expSvc := experiment.NewService(pool, projSvc, rec, log)

	svc, err := artifact.NewService(pool, projSvc, sampleSvc, expSvc, cfg, rec, log)
	if err != nil {
		t.Fatalf("artifact.NewService: %v", err)
	}
	artifact.UsePermissiveHeadCheckerForTest(svc)

	return &testEnv{
		pool:      pool,
		svc:       svc,
		orgSvc:    orgSvc,
		projSvc:   projSvc,
		sampleSvc: sampleSvc,
		expSvc:    expSvc,
		users:     fu,
		rec:       rec,
	}
}

// seedSample inserts a sample directly into the project (no public create API
// is exported from the sample package), returning its id.
func seedSample(t *testing.T, env *testEnv, projectID, createdBy uuid.UUID, identifier string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := env.pool.QueryRow(context.Background(),
		`INSERT INTO samples (project_id, identifier, name, kind, properties, status, created_by)
		 VALUES ($1, $2, $3, 'other', '{}', 'active', $4) RETURNING id`,
		projectID, identifier, identifier, createdBy,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed sample: %v", err)
	}
	return id
}

func principal(u *auth.User) *platform.Principal {
	return &platform.Principal{UserID: u.ID, Email: u.Email}
}

// seedProject creates a workspace, adds userID as owner member,
// creates a workspace-visible project, returns it.
func seedProject(t *testing.T, env *testEnv, ownerID uuid.UUID) *project.Project {
	t.Helper()
	ctx := context.Background()
	ws, err := env.orgSvc.CreateWorkspace(ctx, "Test WS", ownerID)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	proj, err := env.projSvc.CreateProject(ctx, ws.ID, "Test Project", "", "workspace", ownerID)
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	return proj
}

// ─── NewService ───────────────────────────────────────────────────────────────

func TestNewService_BadCredentials(t *testing.T) {
	pool := testsupport.NewPool(t)
	log := nopLogger()

	cfg, _ := config.Load()
	// Replace keys with empty strings to trigger validation.
	badCfg := *cfg
	badCfg.S3AccessKey = ""
	badCfg.S3SecretKey = ""

	fu := newFakeUsers(pool)
	orgSvc := org.NewService(pool, cfg, audit.Nop{}, fu, log)
	projSvc := project.NewService(pool, orgSvc, fu, audit.Nop{}, log)

	_, err := artifact.NewService(pool, projSvc, nil, nil, &badCfg, audit.Nop{}, log)
	if err == nil {
		t.Fatal("expected error for empty S3 credentials")
	}
}

// ─── Create artifact ──────────────────────────────────────────────────────────

func TestCreateArtifact_EditorSucceeds(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := seedProject(t, env, owner.ID)

	p := principal(owner)
	ctxWithP := platform.WithPrincipal(ctx, p)

	art, uploadURL, err := createArtifact(ctxWithP, env.svc, proj.ID, "report.pdf", "application/pdf", 1024)
	if err != nil {
		t.Fatalf("create artifact: %v", err)
	}
	if art.ID == uuid.Nil {
		t.Error("expected non-nil artifact ID")
	}
	if art.Type != "pdf" {
		t.Errorf("expected type pdf, got %s", art.Type)
	}
	if art.ProcessingStatus != "pending" {
		t.Errorf("expected pending status, got %s", art.ProcessingStatus)
	}
	if !strings.Contains(art.StorageKey, art.ID.String()) {
		t.Errorf("storage_key %q does not contain artifact id", art.StorageKey)
	}
	if !strings.Contains(art.StorageKey, "report.pdf") {
		t.Errorf("storage_key %q does not contain filename", art.StorageKey)
	}

	// Upload URL must be non-empty, parseable, and contain bucket + key.
	if uploadURL == "" {
		t.Fatal("expected non-empty upload_url")
	}
	u, err := url.Parse(uploadURL)
	if err != nil {
		t.Fatalf("upload_url is not a valid URL: %v", err)
	}
	if !strings.Contains(u.String(), env.svc.BucketName()) && !strings.Contains(u.Path, env.svc.BucketName()) {
		// Allow the bucket to appear in path or host for path-style vs virtual-hosted-style.
		if !strings.Contains(uploadURL, "artifacts-originals") {
			t.Errorf("upload_url %q does not contain bucket name", uploadURL)
		}
	}
	if !strings.Contains(uploadURL, art.ID.String()) {
		t.Errorf("upload_url %q does not contain artifact storage key segment", uploadURL)
	}

	// Audit entry recorded.
	if !env.rec.hasAction("artifact.create") {
		t.Error("expected artifact.create audit entry")
	}
}

func TestCreateArtifact_InferType(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	owner := env.users.seed(t, "o@example.com", "O")
	proj := seedProject(t, env, owner.ID)
	p := principal(owner)
	ctxWithP := platform.WithPrincipal(ctx, p)

	cases := []struct {
		filename    string
		contentType string
		wantType    string
	}{
		{"photo.png", "image/png", "image"},
		{"nb.ipynb", "application/x-ipynb+json", "ipynb"},
		{"doc.pdf", "application/pdf", "pdf"},
		{"data.csv", "text/csv", "other"},
	}

	for _, tc := range cases {
		art, _, err := createArtifact(ctxWithP, env.svc, proj.ID, tc.filename, tc.contentType, 100)
		if err != nil {
			t.Fatalf("create artifact %s: %v", tc.filename, err)
		}
		if art.Type != tc.wantType {
			t.Errorf("filename=%s ct=%s: want type %s, got %s", tc.filename, tc.contentType, tc.wantType, art.Type)
		}
	}
}

func TestCreateArtifact_RejectsHTML(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := seedProject(t, env, owner.ID)
	ctxWithP := platform.WithPrincipal(ctx, principal(owner))

	_, _, err := createArtifact(ctxWithP, env.svc, proj.ID, "page.html", "text/html", 100)
	if err == nil {
		t.Fatal("expected error for text/html")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 400 {
		t.Errorf("expected 400, got %v", err)
	}
}

func TestCreateArtifact_SanitizesPathInFilename(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	owner := env.users.seed(t, "owner@example.com", "Owner")
	proj := seedProject(t, env, owner.ID)
	ctxWithP := platform.WithPrincipal(ctx, principal(owner))

	art, _, err := createArtifact(ctxWithP, env.svc, proj.ID, "../../report.pdf", "application/pdf", 100)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !strings.HasSuffix(art.StorageKey, "/report.pdf") {
		t.Errorf("storage_key %q should end with sanitized report.pdf", art.StorageKey)
	}
	if strings.Contains(art.StorageKey, "..") {
		t.Errorf("storage_key %q must not contain ..", art.StorageKey)
	}
}

func TestCreateArtifact_ViewerForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner@example.com", "Owner")
	viewer := env.users.seed(t, "viewer@example.com", "Viewer")
	proj := seedProject(t, env, owner.ID)

	// Add viewer as explicit viewer collaborator on private project.
	privProj, err := env.projSvc.CreateProject(ctx, proj.WorkspaceID, "Priv", "", "private", owner.ID)
	if err != nil {
		t.Fatalf("create private project: %v", err)
	}
	_ = env.orgSvc.AddCollaborator(ctx, privProj.ID, viewer.ID, org.RoleViewer)

	p := principal(viewer)
	ctxWithP := platform.WithPrincipal(ctx, p)
	_, _, err = createArtifact(ctxWithP, env.svc, privProj.ID, "file.pdf", "application/pdf", 100)
	if err == nil {
		t.Fatal("expected forbidden error for viewer")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 403 {
		t.Errorf("expected 403, got %v", err)
	}
}

// ─── Get artifact ─────────────────────────────────────────────────────────────

func TestGetArtifact_NotFound(t *testing.T) {
	env := newTestEnv(t)
	_, err := env.svc.GetArtifact(context.Background(), uuid.New())
	if err == nil {
		t.Fatal("expected not-found error")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404, got %v", err)
	}
}

func TestGetArtifact_Found(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	owner := env.users.seed(t, "o@example.com", "O")
	proj := seedProject(t, env, owner.ID)
	ctxWithP := platform.WithPrincipal(ctx, principal(owner))

	art, _, err := createArtifact(ctxWithP, env.svc, proj.ID, "data.pdf", "application/pdf", 512)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := env.svc.GetArtifact(ctx, art.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.ID != art.ID {
		t.Errorf("id mismatch: %v != %v", got.ID, art.ID)
	}
}

// ─── Complete upload ──────────────────────────────────────────────────────────

func TestCompleteUpload_SetsOriginalURL(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	owner := env.users.seed(t, "o@example.com", "O")
	proj := seedProject(t, env, owner.ID)
	ctxWithP := platform.WithPrincipal(ctx, principal(owner))

	art, _, err := createArtifact(ctxWithP, env.svc, proj.ID, "img.png", "image/png", 200)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if art.OriginalURL != "" {
		t.Errorf("expected empty original_url before complete, got %q", art.OriginalURL)
	}

	completed, err := env.svc.CompleteUpload(ctxWithP, art.ID)
	if err != nil {
		t.Fatalf("complete: %v", err)
	}
	if completed.OriginalURL == "" {
		t.Error("expected non-empty original_url after complete")
	}
	if !strings.Contains(completed.OriginalURL, art.StorageKey) {
		t.Errorf("original_url %q does not contain storage_key", completed.OriginalURL)
	}
	// processing_status should still be pending (Track-D processes later).
	if completed.ProcessingStatus != "pending" {
		t.Errorf("expected pending, got %s", completed.ProcessingStatus)
	}
}

// ─── Sample attachment ────────────────────────────────────────────────────────

func TestAttachToSample_RoundTrip(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	owner := env.users.seed(t, "o@example.com", "O")
	proj := seedProject(t, env, owner.ID)
	ctxWithP := platform.WithPrincipal(ctx, principal(owner))

	art, _, err := createArtifact(ctxWithP, env.svc, proj.ID, "spec.tiff", "image/tiff", 300)
	if err != nil {
		t.Fatalf("create artifact: %v", err)
	}

	sampleID := seedSample(t, env, proj.ID, owner.ID, "S-1")
	sa, err := env.svc.AttachToSample(ctxWithP, sampleID, art.ID, "specimen_image")
	if err != nil {
		t.Fatalf("attach to sample: %v", err)
	}
	if sa.SampleID != sampleID {
		t.Errorf("sample_id mismatch")
	}
	if sa.ArtifactID != art.ID {
		t.Errorf("artifact_id mismatch")
	}
	if sa.Role == nil || *sa.Role != "specimen_image" {
		t.Errorf("unexpected role: %v", sa.Role)
	}

	// List artifacts for sample.
	list, err := env.svc.ListSampleArtifacts(ctxWithP, sampleID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 artifact, got %d", len(list))
	}
	if list[0].ID != art.ID {
		t.Errorf("artifact id mismatch in list")
	}
}

// ─── Experiment attachment ────────────────────────────────────────────────────

func TestAttachToExperiment_RoundTrip(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	owner := env.users.seed(t, "o@example.com", "O")
	proj := seedProject(t, env, owner.ID)
	ctxWithP := platform.WithPrincipal(ctx, principal(owner))

	art, _, err := createArtifact(ctxWithP, env.svc, proj.ID, "raw.csv", "text/csv", 1000)
	if err != nil {
		t.Fatalf("create artifact: %v", err)
	}

	exp, err := env.expSvc.CreateExperiment(ctxWithP, proj.ID, "", "XRD", nil, nil, "", nil, "planned", nil, nil, nil, owner.ID)
	if err != nil {
		t.Fatalf("create experiment: %v", err)
	}
	experimentID := exp.ID
	ea, err := env.svc.AttachToExperiment(ctxWithP, experimentID, art.ID, "raw_data")
	if err != nil {
		t.Fatalf("attach to experiment: %v", err)
	}
	if ea.ExperimentID != experimentID {
		t.Errorf("experiment_id mismatch")
	}
	if ea.Role == nil || *ea.Role != "raw_data" {
		t.Errorf("unexpected role: %v", ea.Role)
	}

	list, err := env.svc.ListExperimentArtifacts(ctxWithP, experimentID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 artifact, got %d", len(list))
	}
	if list[0].ID != art.ID {
		t.Errorf("artifact id mismatch in list")
	}
}

// ─── Delete ───────────────────────────────────────────────────────────────────

func TestDeleteArtifact(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	owner := env.users.seed(t, "o@example.com", "O")
	proj := seedProject(t, env, owner.ID)
	ctxWithP := platform.WithPrincipal(ctx, principal(owner))

	art, _, err := createArtifact(ctxWithP, env.svc, proj.ID, "todel.pdf", "application/pdf", 50)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := env.svc.DeleteArtifact(ctxWithP, art.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err = env.svc.GetArtifact(ctx, art.ID)
	if err == nil {
		t.Fatal("expected not-found after delete")
	}
	em, ok := err.(*platform.ErrorModel)
	if !ok || em.GetStatus() != 404 {
		t.Errorf("expected 404 after delete, got %v", err)
	}
}

// ─── UploadArtifact (server-side bytes) ───────────────────────────────────────

func TestUploadArtifact_StoresBytesAndCompletes(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "uploader@example.com", "Uploader")
	proj := seedProject(t, env, owner.ID)

	store := newMemStore()
	env.svc.SetObjectStore(store)

	ctxWithP := platform.WithPrincipal(ctx, principal(owner))

	data := []byte("\x89PNG\r\n\x1a\n-not-a-real-png-but-bytes")
	art, err := env.svc.UploadArtifact(ctxWithP, proj.ID, "figure.png", "image/png", "", data)
	if err != nil {
		t.Fatalf("UploadArtifact: %v", err)
	}
	if art.Type != "image" {
		t.Errorf("expected inferred type image, got %s", art.Type)
	}
	if art.SizeBytes != int64(len(data)) {
		t.Errorf("expected size %d, got %d", len(data), art.SizeBytes)
	}
	// Bytes landed in the originals bucket under the artifact's storage key.
	stored, err := store.Get(ctx, env.svc.BucketName(), art.StorageKey)
	if err != nil {
		t.Fatalf("expected object stored at %s: %v", art.StorageKey, err)
	}
	if string(stored) != string(data) {
		t.Error("stored bytes do not match uploaded data")
	}
	// CompleteUpload ran: original_url is set and the audit event recorded.
	if art.OriginalURL == "" {
		t.Error("expected original_url to be set after upload")
	}
	if !env.rec.hasAction("artifact.upload_complete") {
		t.Error("expected artifact.upload_complete audit entry")
	}
}

func TestUploadArtifact_ViewerForbidden(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := env.users.seed(t, "owner2@example.com", "Owner2")
	proj := seedProject(t, env, owner.ID)
	viewer := env.users.seed(t, "viewer2@example.com", "Viewer2")

	env.svc.SetObjectStore(newMemStore())
	ctxViewer := platform.WithPrincipal(ctx, principal(viewer))

	_, err := env.svc.UploadArtifact(ctxViewer, proj.ID, "x.png", "image/png", "", []byte("data"))
	if err == nil {
		t.Fatal("expected a non-editor upload to be rejected")
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// createArtifact is a convenience wrapper around the service method exposed for tests.
func createArtifact(ctx context.Context, svc *artifact.Service, projectID uuid.UUID, filename, contentType string, sizeBytes int64) (*artifact.Artifact, string, error) {
	return svc.CreateArtifact(ctx, projectID, filename, contentType, "", sizeBytes)
}

// memStore is an in-memory artifact.ObjectStore for exercising the server-side
// UploadArtifact path without a real MinIO.
type memStore struct {
	objects map[string][]byte
}

func newMemStore() *memStore { return &memStore{objects: map[string][]byte{}} }

func (m *memStore) Put(_ context.Context, bucket, key string, body []byte, _ string) error {
	m.objects[bucket+"/"+key] = append([]byte(nil), body...)
	return nil
}

func (m *memStore) Get(_ context.Context, bucket, key string) ([]byte, error) {
	if b, ok := m.objects[bucket+"/"+key]; ok {
		return b, nil
	}
	return nil, io.EOF
}
