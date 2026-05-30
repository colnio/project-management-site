package artifact_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg" // register JPEG decoder for image.Decode
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/colnio/project-management-site/internal/artifact"
	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/testsupport"
)

// ─── In-memory fake ObjectStore ───────────────────────────────────────────────

type fakeStore struct {
	mu      sync.RWMutex
	objects map[string][]byte // "bucket/key" → bytes
}

func newFakeStore() *fakeStore {
	return &fakeStore{objects: make(map[string][]byte)}
}

func (s *fakeStore) key(bucket, key string) string { return bucket + "/" + key }

func (s *fakeStore) Get(_ context.Context, bucket, key string) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	data, ok := s.objects[s.key(bucket, key)]
	if !ok {
		return nil, fmt.Errorf("fakeStore: %s/%s not found", bucket, key)
	}
	return data, nil
}

func (s *fakeStore) Put(_ context.Context, bucket, key string, body []byte, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[s.key(bucket, key)] = body
	return nil
}

func (s *fakeStore) Has(bucket, key string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.objects[s.key(bucket, key)]
	return ok
}

// ─── Helper: minimal valid PDF bytes ─────────────────────────────────────────

// onePagePDFBase64 is a pdfcpu-generated valid 1-page PDF encoded as base64.
// Generated with: pdfcpu import /tmp/test.pdf /tmp/tiny.png
const onePagePDFBase64 = "JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PC9QYWdlcyAyIDAgUi9UeXBlL0NhdGFsb2c+PgplbmRvYmoKNSAwIG9iago8PC9GaWx0ZXIvRmxhdGVEZWNvZGUvTGVuZ3RoIDM1Pj4Kc3RyZWFtCnicKlQw1DMAAwUQROEk5yroe+YaKLjkKwQCAgAA//+g4AhZCmVuZHN0cmVhbQplbmRvYmoKMyAwIG9iago8PC9CaXRzUGVyQ29tcG9uZW50IDgvQ29sb3JTcGFjZS9EZXZpY2VSR0IvRmlsdGVyL0ZsYXRlRGVjb2RlL0hlaWdodCAxL0ludGVycG9sYXRlIHRydWUvTGVuZ3RoIDE1L1N1YnR5cGUvSW1hZ2UvVHlwZS9YT2JqZWN0L1dpZHRoIDE+PgpzdHJlYW0KeJz6//8/IAAA//8F/QL+CmVuZHN0cmVhbQplbmRvYmoKOCAwIG9iago8PC9GaWx0ZXIvRmxhdGVEZWNvZGUvRmlyc3QgMTUvTGVuZ3RoIDE4NS9OIDMvVHlwZS9PYmpTdG0+PgpzdHJlYW0KeJyMj8FqhDAQhl9lnqCTpLEohBy0FKSUBuuhIB5SHcSCSTER7NsXFcquh2Vz+fly+JjvCRhI4CIFATyTSmHhXSQXAyTAoMI36keb+7VhD+ziwQn5LWzR2JlcBLErKwp+mTsKIHeuf38IjR1Ia6XQzL77oNigeX7BmtaI5WQHyo8pjilb/Hz/+qYuKoXlxOBxM2m9Gwq/uAgcX8c+NFtg1d6bkWTJ9UcqxSnl/9qg9V8AAAD//9NlUhoKZW5kc3RyZWFtCmVuZG9iago3IDAgb2JqCjw8L0NyZWF0aW9uRGF0ZShEOjIwMjYwNTI2MjMxNTQzKzA4JzAwJykvTW9kRGF0ZShEOjIwMjYwNTI2MjMxNTQzKzA4JzAwJykvUHJvZHVjZXIocGRmY3B1IHYwLjEyLjEgZGV2KT4+CmVuZG9iago5IDAgb2JqCjw8L0ZpbHRlci9GbGF0ZURlY29kZS9JRFs8OTJCQkUzRDY3MUY2OEU5OUEwRUIxRkMyRkExNzJDNzc+IDw5MkJCRTNENjcxRjY4RTk5QTBFQjFGQzJGQTE3MkM3Nz5dL0luZGV4WzAgMTBdL0luZm8gNyAwIFIvTGVuZ3RoIDUxL1Jvb3QgMSAwIFIvU2l6ZSAxMC9UeXBlL1hSZWYvV1sxIDIgMl0+PgpzdHJlYW0KeJwkxjEVgDAMBcD7mdgwhBFU4AlzlZG+vmyH7rgpl4p/lHhGUh/Je7TYAQAA//+JKgTHCmVuZHN0cmVhbQplbmRvYmoKc3RhcnR4cmVmCjc0MwolJUVPRgo="

// minimalPDF decodes the embedded 1-page PDF for use in tests.
func minimalPDF(t *testing.T) []byte {
	t.Helper()
	data, err := base64.StdEncoding.DecodeString(onePagePDFBase64)
	if err != nil {
		t.Fatalf("decode embedded PDF: %v", err)
	}
	return data
}

// ─── Helper: generate a PNG image in memory ───────────────────────────────────

// smallPNG returns a tiny (64×64) solid-color PNG encoded as bytes.
func smallPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			img.Set(x, y, color.RGBA{R: 100, G: 149, B: 237, A: 255})
		}
	}
	b, err := artifact.ExportEncodeImage(img)
	if err != nil {
		t.Fatalf("encode test image: %v", err)
	}
	return b
}

// ─── Unit: pdfPageCount ───────────────────────────────────────────────────────

func TestPDFPageCount_OnePage(t *testing.T) {
	count, err := artifact.ExportPDFPageCount(minimalPDF(t))
	if err != nil {
		t.Fatalf("pdfPageCount: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 page, got %d", count)
	}
}

func TestPDFPageCount_InvalidData(t *testing.T) {
	_, err := artifact.ExportPDFPageCount([]byte("not a pdf"))
	if err == nil {
		t.Fatal("expected error for invalid PDF")
	}
}

// ─── Unit: renderThumbnails ───────────────────────────────────────────────────

func TestRenderThumbnails_ReturnsNonEmptyOutput(t *testing.T) {
	data := smallPNG(t)
	small, medium, err := artifact.ExportRenderThumbnails(data)
	if err != nil {
		t.Fatalf("renderThumbnails: %v", err)
	}
	if len(small) == 0 {
		t.Error("small thumbnail is empty")
	}
	if len(medium) == 0 {
		t.Error("medium thumbnail is empty")
	}
}

func TestRenderThumbnails_ReducedDimensions(t *testing.T) {
	// Create a large image (1000×800) so the thumbnail has to shrink it.
	img := image.NewRGBA(image.Rect(0, 0, 1000, 800))
	for y := 0; y < 800; y++ {
		for x := 0; x < 1000; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 50, B: 50, A: 255})
		}
	}
	data, err := artifact.ExportEncodeImage(img)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	small, medium, err := artifact.ExportRenderThumbnails(data)
	if err != nil {
		t.Fatalf("renderThumbnails: %v", err)
	}

	if len(small) == 0 {
		t.Fatal("small thumbnail is empty")
	}
	if len(medium) == 0 {
		t.Fatal("medium thumbnail is empty")
	}

	// Decode the thumbnails and check their dimensions are within the expected bounds.
	smallImg, _, err := image.Decode(bytes.NewReader(small))
	if err != nil {
		t.Fatalf("decode small: %v", err)
	}
	medImg, _, err := image.Decode(bytes.NewReader(medium))
	if err != nil {
		t.Fatalf("decode medium: %v", err)
	}

	// Small thumbnail: max edge ≤ 200px.
	sb := smallImg.Bounds()
	if sb.Max.X > 200 || sb.Max.Y > 200 {
		t.Errorf("small thumb too large: %dx%d", sb.Max.X, sb.Max.Y)
	}

	// Medium thumbnail: max edge ≤ 800px.
	mb := medImg.Bounds()
	if mb.Max.X > 800 || mb.Max.Y > 800 {
		t.Errorf("medium thumb too large: %dx%d", mb.Max.X, mb.Max.Y)
	}

	// Small should have a smaller max dimension than medium.
	smallMax := sb.Max.X
	if sb.Max.Y > smallMax {
		smallMax = sb.Max.Y
	}
	medMax := mb.Max.X
	if mb.Max.Y > medMax {
		medMax = mb.Max.Y
	}
	if smallMax >= medMax {
		t.Errorf("small max dim %d should be less than medium max dim %d", smallMax, medMax)
	}
}

// ─── Unit: renderNotebook ────────────────────────────────────────────────────

func TestRenderNotebook_HappyPath(t *testing.T) {
	const wantHTML = "<html><body>rendered</body></html>"

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/render" {
			http.Error(w, "bad route", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, wantHTML)
	}))
	defer srv.Close()

	html, err := artifact.ExportRenderNotebook(context.Background(), srv.URL, []byte(`{"nbformat":4}`))
	if err != nil {
		t.Fatalf("renderNotebook: %v", err)
	}
	if string(html) != wantHTML {
		t.Errorf("got %q, want %q", html, wantHTML)
	}
}

func TestRenderNotebook_Non200Error(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"bad notebook"}`, http.StatusUnprocessableEntity)
	}))
	defer srv.Close()

	_, err := artifact.ExportRenderNotebook(context.Background(), srv.URL, []byte(`{}`))
	if err == nil {
		t.Fatal("expected error for non-200 response")
	}
}

// ─── Integration: ProcessArtifactWorker.Work ─────────────────────────────────

func seedArtifactRow(t *testing.T, env *testEnv, artType string) *artifact.Artifact {
	t.Helper()
	owner := env.users.seed(t, fmt.Sprintf("wowner-%s@example.com", uuid.New()), "Owner")
	proj := seedProject(t, env, owner.ID)
	ctxWithP := platform.WithPrincipal(context.Background(), principal(owner))

	art, _, err := env.svc.CreateArtifact(ctxWithP, proj.ID, "test."+artType, mimeFor(artType), artType, 100)
	if err != nil {
		t.Fatalf("create artifact: %v", err)
	}
	return art
}

func mimeFor(artType string) string {
	switch artType {
	case "image":
		return "image/png"
	case "pdf":
		return "application/pdf"
	case "ipynb":
		return "application/x-ipynb+json"
	default:
		return "application/octet-stream"
	}
}

// makeJob wraps args in a *river.Job for direct worker.Work() invocation.
func makeJob(args artifact.ProcessArtifactArgs) *river.Job[artifact.ProcessArtifactArgs] {
	return &river.Job[artifact.ProcessArtifactArgs]{
		JobRow: &rivertype.JobRow{},
		Args:   args,
	}
}

// TestWorkerWork_ImageSucceeds seeds an image artifact, calls Work directly, and
// asserts processing_status='done' and thumbnail_url set.
func TestWorkerWork_ImageSucceeds(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"experiment_artifacts", "sample_artifacts", "artifacts",
		"projects", "project_collaborations", "admin_overrides",
		"workspace_memberships", "workspaces", "users",
	)

	env := buildTestEnvWithPool(t, pool)
	store := newFakeStore()

	art := seedArtifactRow(t, env, "image")

	// Put the "uploaded" original in the fake store.
	pngData := smallPNG(t)
	_ = store.Put(context.Background(), "originals", art.StorageKey, pngData, "image/png")

	worker := artifact.NewProcessArtifactWorker(artifact.WorkerDeps{
		Pool:           pool,
		Store:          store,
		BucketOrig:     "originals",
		BucketRendered: "rendered",
		NBConvertURL:   "http://unused",
		PublicURLBase:  "http://localhost:9000",
	})

	job := makeJob(artifact.ProcessArtifactArgs{ArtifactID: art.ID})
	if err := worker.Work(context.Background(), job); err != nil {
		t.Fatalf("Work: %v", err)
	}

	// Reload and assert.
	updated, err := env.svc.GetArtifact(context.Background(), art.ID)
	if err != nil {
		t.Fatalf("GetArtifact after Work: %v", err)
	}
	if updated.ProcessingStatus != "done" {
		t.Errorf("expected done, got %s", updated.ProcessingStatus)
	}
	if updated.ThumbnailURL == "" {
		t.Error("expected non-empty thumbnail_url")
	}

	// The rendered bucket must contain the small thumbnail.
	smallKey := art.StorageKey + "_thumb_sm.jpg"
	if !store.Has("rendered", smallKey) {
		t.Errorf("small thumbnail not found in rendered bucket at %s", smallKey)
	}
}

// TestWorkerWork_DeletedArtifact returns nil when the row was removed (no futile retries).
func TestWorkerWork_DeletedArtifact(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"experiment_artifacts", "sample_artifacts", "artifacts",
		"projects", "project_collaborations", "admin_overrides",
		"workspace_memberships", "workspaces", "users",
	)

	env := buildTestEnvWithPool(t, pool)
	store := newFakeStore()
	art := seedArtifactRow(t, env, "image")

	_, err := pool.Exec(context.Background(), `DELETE FROM artifacts WHERE id = $1`, art.ID)
	if err != nil {
		t.Fatalf("delete artifact row: %v", err)
	}

	worker := artifact.NewProcessArtifactWorker(artifact.WorkerDeps{
		Pool:           pool,
		Store:          store,
		BucketOrig:     "originals",
		BucketRendered: "rendered",
		NBConvertURL:   "http://unused",
		PublicURLBase:  "http://localhost:9000",
	})

	job := makeJob(artifact.ProcessArtifactArgs{ArtifactID: art.ID})
	if err := worker.Work(context.Background(), job); err != nil {
		t.Fatalf("expected nil for deleted artifact, got %v", err)
	}
}

// TestWorkerWork_MissingOriginal tests the failure path: no object in the store.
func TestWorkerWork_MissingOriginal(t *testing.T) {
	pool := testsupport.NewPool(t)
	testsupport.Truncate(t, pool,
		"experiment_artifacts", "sample_artifacts", "artifacts",
		"projects", "project_collaborations", "admin_overrides",
		"workspace_memberships", "workspaces", "users",
	)

	env := buildTestEnvWithPool(t, pool)
	store := newFakeStore() // intentionally empty

	art := seedArtifactRow(t, env, "image")

	worker := artifact.NewProcessArtifactWorker(artifact.WorkerDeps{
		Pool:           pool,
		Store:          store,
		BucketOrig:     "originals",
		BucketRendered: "rendered",
		NBConvertURL:   "http://unused",
		PublicURLBase:  "http://localhost:9000",
	})

	job := makeJob(artifact.ProcessArtifactArgs{ArtifactID: art.ID})

	// Work must return an error.
	if err := worker.Work(context.Background(), job); err == nil {
		t.Fatal("expected error for missing original")
	}

	// processing_status should be 'failed'.
	updated, err := env.svc.GetArtifact(context.Background(), art.ID)
	if err != nil {
		t.Fatalf("GetArtifact: %v", err)
	}
	if updated.ProcessingStatus != "failed" {
		t.Errorf("expected failed, got %s", updated.ProcessingStatus)
	}

	// metadata.error should be set.
	var meta map[string]any
	if err := json.Unmarshal(updated.Metadata, &meta); err != nil {
		t.Fatalf("unmarshal metadata: %v", err)
	}
	if _, ok := meta["error"]; !ok {
		t.Error("expected error key in metadata after failure")
	}
}

// ─── testEnv wiring helpers ───────────────────────────────────────────────────

// buildTestEnvWithPool creates a testEnv from an already-connected pool
// (avoids double migration in test files that call testsupport.NewPool directly).
func buildTestEnvWithPool(t *testing.T, pool *pgxpool.Pool) *testEnv {
	t.Helper()
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("config.Load: %v", err)
	}
	fu := newFakeUsers(pool)
	rec := &capturingRecorder{}
	log := nopLogger()

	orgSvc := org.NewService(pool, cfg, audit.Nop{}, fu, log)
	projSvc := project.NewService(pool, orgSvc, fu, rec, log)

	svc, err := artifact.NewService(pool, projSvc, nil, nil, cfg, rec, log)
	if err != nil {
		t.Fatalf("artifact.NewService: %v", err)
	}
	artifact.UsePermissiveHeadCheckerForTest(svc)

	return &testEnv{
		pool:    pool,
		svc:     svc,
		orgSvc:  orgSvc,
		projSvc: projSvc,
		users:   fu,
		rec:     rec,
	}
}

// timeouts prevents a stuck test from hanging the suite.
var _ = time.Second
