package artifact

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"strings"

	"github.com/disintegration/imaging"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pdfapi "github.com/pdfcpu/pdfcpu/pkg/api"
	pdfmodel "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/riverqueue/river"
)

// ─── Job args ─────────────────────────────────────────────────────────────────

// ProcessArtifactArgs is the River job payload for processing a newly uploaded
// artifact. Kind() maps to the river_job.kind column.
type ProcessArtifactArgs struct {
	ArtifactID uuid.UUID `json:"artifact_id"`
}

func (ProcessArtifactArgs) Kind() string { return "process_artifact" }

// ─── Enqueuer ─────────────────────────────────────────────────────────────────

// Enqueuer is the interface the artifact Service calls from the upload-complete
// handler. Keeping it as a small interface lets callers inject a fake in tests.
type Enqueuer interface {
	EnqueueProcessArtifact(ctx context.Context, id uuid.UUID) error
}

// riverEnqueuer wraps a River client to implement Enqueuer.
type riverEnqueuer struct {
	client *river.Client[pgx.Tx]
}

// NewRiverEnqueuer builds an Enqueuer backed by the given River client.
func NewRiverEnqueuer(client *river.Client[pgx.Tx]) Enqueuer {
	return &riverEnqueuer{client: client}
}

func (e *riverEnqueuer) EnqueueProcessArtifact(ctx context.Context, id uuid.UUID) error {
	_, err := e.client.Insert(ctx, ProcessArtifactArgs{ArtifactID: id}, nil)
	if err != nil {
		return fmt.Errorf("enqueue process_artifact for %s: %w", id, err)
	}
	return nil
}

// ─── Worker deps ──────────────────────────────────────────────────────────────

// WorkerDeps holds dependencies for the ProcessArtifactWorker.
type WorkerDeps struct {
	Pool           *pgxpool.Pool
	Store          ObjectStore
	BucketOrig     string // bucket where originals live
	BucketRendered string // bucket where rendered/thumbnail outputs go
	NBConvertURL   string
	PublicURLBase  string // base URL exposed to browsers (e.g. http://localhost:9000)
}

// ─── Worker ───────────────────────────────────────────────────────────────────

// ProcessArtifactWorker processes uploaded artifacts: extract metadata, generate
// thumbnails (images), render HTML (ipynb), or record page count (PDF).
type ProcessArtifactWorker struct {
	river.WorkerDefaults[ProcessArtifactArgs]
	deps WorkerDeps
}

// NewProcessArtifactWorker constructs the worker.
func NewProcessArtifactWorker(deps WorkerDeps) *ProcessArtifactWorker {
	return &ProcessArtifactWorker{deps: deps}
}

// RegisterWorkers registers the ProcessArtifactWorker with the River worker set.
func RegisterWorkers(w *river.Workers, deps WorkerDeps) {
	river.AddWorker(w, NewProcessArtifactWorker(deps))
}

// Work is called by River for each job. It:
//  1. Loads the artifact row.
//  2. Sets processing_status = 'processing'.
//  3. Downloads the original from object storage.
//  4. Dispatches to the appropriate transform function.
//  5. Updates the row to 'done' (or 'failed').
func (w *ProcessArtifactWorker) Work(ctx context.Context, job *river.Job[ProcessArtifactArgs]) error {
	id := job.Args.ArtifactID
	d := w.deps

	art, err := loadArtifact(ctx, d.Pool, id)
	if err != nil {
		return fmt.Errorf("worker: load artifact %s: %w", id, err)
	}

	// Mark as processing.
	if err := setStatus(ctx, d.Pool, id, "processing", nil); err != nil {
		return fmt.Errorf("worker: mark processing: %w", err)
	}

	// Download original.
	data, err := d.Store.Get(ctx, d.BucketOrig, art.StorageKey)
	if err != nil {
		_ = failArtifact(ctx, d.Pool, id, err)
		return fmt.Errorf("worker: download original: %w", err)
	}

	// Dispatch by type.
	switch art.Type {
	case "pdf":
		if err := w.processPDF(ctx, art, data); err != nil {
			_ = failArtifact(ctx, d.Pool, id, err)
			return err
		}
	case "ipynb":
		if err := w.processNotebook(ctx, art, data); err != nil {
			_ = failArtifact(ctx, d.Pool, id, err)
			return err
		}
	case "image":
		if err := w.processImage(ctx, art, data); err != nil {
			_ = failArtifact(ctx, d.Pool, id, err)
			return err
		}
	default:
		// Nothing to do for "other" types — just mark done.
		return setStatus(ctx, d.Pool, id, "done", nil)
	}

	return nil
}

// ─── PDF processing ───────────────────────────────────────────────────────────

func (w *ProcessArtifactWorker) processPDF(ctx context.Context, art *Artifact, data []byte) error {
	pages, err := pdfPageCount(data)
	if err != nil {
		return fmt.Errorf("worker: pdf page count: %w", err)
	}

	meta := map[string]any{"page_count": pages}
	// Note: pure-Go PDF→image rasterization is not available (pdfcpu does not
	// ship a rasterizer without CGo/native deps). No thumbnail is generated for
	// PDFs; thumbnail_url is left empty.
	return updateArtifactDone(ctx, w.deps.Pool, art.ID, "", "", meta)
}

// pdfPageCount extracts the number of pages from a PDF byte slice using pdfcpu.
func pdfPageCount(data []byte) (int, error) {
	r := bytes.NewReader(data)
	cfg := pdfmodel.NewDefaultConfiguration()
	info, err := pdfapi.PDFInfo(r, "", nil, false, cfg)
	if err != nil {
		return 0, fmt.Errorf("pdfcpu info: %w", err)
	}
	return info.PageCount, nil
}

// ─── Notebook processing ──────────────────────────────────────────────────────

func (w *ProcessArtifactWorker) processNotebook(ctx context.Context, art *Artifact, data []byte) error {
	html, err := renderNotebook(ctx, w.deps.NBConvertURL, data)
	if err != nil {
		return fmt.Errorf("worker: render notebook: %w", err)
	}

	// Store rendered HTML.
	renderedKey := art.StorageKey + ".html"
	if err := w.deps.Store.Put(ctx, w.deps.BucketRendered, renderedKey, html, "text/html; charset=utf-8"); err != nil {
		return fmt.Errorf("worker: upload rendered html: %w", err)
	}

	renderedURL := fmt.Sprintf("%s/%s/%s", w.deps.PublicURLBase, w.deps.BucketRendered, renderedKey)
	return updateArtifactDone(ctx, w.deps.Pool, art.ID, renderedURL, "", nil)
}

// renderNotebook sends the raw .ipynb bytes to the nbconvert sidecar and
// returns the HTML response body. The sidecar contract: POST /render with
// the raw JSON body → 200 text/html on success, non-200 on error.
func renderNotebook(ctx context.Context, nbconvertURL string, nb []byte) ([]byte, error) {
	url := strings.TrimRight(nbconvertURL, "/") + "/render"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(nb))
	if err != nil {
		return nil, fmt.Errorf("nbconvert: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-ipynb+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("nbconvert: POST /render: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("nbconvert: read body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nbconvert: non-200 status %d: %s", resp.StatusCode, body)
	}
	return body, nil
}

// ─── Image processing ─────────────────────────────────────────────────────────

const (
	thumbSmallMaxPx  = 200
	thumbMediumMaxPx = 800
)

func (w *ProcessArtifactWorker) processImage(ctx context.Context, art *Artifact, data []byte) error {
	small, medium, err := renderThumbnails(data)
	if err != nil {
		return fmt.Errorf("worker: render thumbnails: %w", err)
	}

	smallKey := art.StorageKey + "_thumb_sm.jpg"
	medKey := art.StorageKey + "_thumb_md.jpg"

	if err := w.deps.Store.Put(ctx, w.deps.BucketRendered, smallKey, small, "image/jpeg"); err != nil {
		return fmt.Errorf("worker: upload small thumb: %w", err)
	}
	if err := w.deps.Store.Put(ctx, w.deps.BucketRendered, medKey, medium, "image/jpeg"); err != nil {
		return fmt.Errorf("worker: upload medium thumb: %w", err)
	}

	smallURL := fmt.Sprintf("%s/%s/%s", w.deps.PublicURLBase, w.deps.BucketRendered, smallKey)
	medURL := fmt.Sprintf("%s/%s/%s", w.deps.PublicURLBase, w.deps.BucketRendered, medKey)

	return updateArtifactDone(ctx, w.deps.Pool, art.ID, "", smallURL, map[string]any{"thumbnail_medium_url": medURL})
}

// renderThumbnails decodes the image in data and produces JPEG-encoded small
// (≤200px max edge) and medium (≤800px max edge) thumbnails using the pure-Go
// imaging library. In production, swap to govips for speed on servers with
// libvips installed; the worker interface is identical.
func renderThumbnails(data []byte) (small, medium []byte, err error) {
	src, err := decodeImage(data)
	if err != nil {
		return nil, nil, fmt.Errorf("imaging: decode: %w", err)
	}

	imgSmall := imaging.Fit(src, thumbSmallMaxPx, thumbSmallMaxPx, imaging.Lanczos)
	imgMed := imaging.Fit(src, thumbMediumMaxPx, thumbMediumMaxPx, imaging.Lanczos)

	small, err = encodeJPEG(imgSmall)
	if err != nil {
		return nil, nil, fmt.Errorf("imaging: encode small: %w", err)
	}
	medium, err = encodeJPEG(imgMed)
	if err != nil {
		return nil, nil, fmt.Errorf("imaging: encode medium: %w", err)
	}
	return small, medium, nil
}

// decodeImage decodes PNG, JPEG, GIF, BMP, TIFF, and WEBP. It relies on
// imaging.Decode which uses the standard library plus golang.org/x/image.
func decodeImage(data []byte) (image.Image, error) {
	r := bytes.NewReader(data)
	return imaging.Decode(r, imaging.AutoOrientation(true))
}

func encodeJPEG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// encodeImage encodes an image to PNG (used in tests to create test fixtures).
func encodeImage(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

// loadArtifact fetches a minimal artifact row needed by the worker.
func loadArtifact(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (*Artifact, error) {
	var a Artifact
	err := pool.QueryRow(ctx, `
		SELECT id, project_id, type, filename, content_type, size_bytes,
		       storage_key, original_url, rendered_url, thumbnail_url,
		       metadata, processing_status, uploaded_by, uploaded_at
		FROM artifacts WHERE id = $1`, id,
	).Scan(
		&a.ID, &a.ProjectID, &a.Type, &a.Filename, &a.ContentType, &a.SizeBytes,
		&a.StorageKey, &a.OriginalURL, &a.RenderedURL, &a.ThumbnailURL,
		&a.Metadata, &a.ProcessingStatus, &a.UploadedBy, &a.UploadedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func setStatus(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, status string, meta map[string]any) error {
	if meta == nil {
		_, err := pool.Exec(ctx,
			`UPDATE artifacts SET processing_status = $2 WHERE id = $1`, id, status)
		return err
	}
	raw, err := json.Marshal(meta)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx,
		`UPDATE artifacts SET processing_status = $2, metadata = $3 WHERE id = $1`, id, status, raw)
	return err
}

func failArtifact(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, procErr error) error {
	meta := map[string]any{"error": procErr.Error()}
	raw, _ := json.Marshal(meta)
	_, err := pool.Exec(ctx,
		`UPDATE artifacts SET processing_status = 'failed', metadata = $2 WHERE id = $1`, id, raw)
	return err
}

// updateArtifactDone sets processing_status='done' and the output URLs/metadata.
// renderedURL and thumbnailURL may be empty (left unchanged if so).
// extraMeta is merged into the existing metadata JSON.
func updateArtifactDone(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, renderedURL, thumbnailURL string, extraMeta map[string]any) error {
	var metaRaw []byte
	if len(extraMeta) > 0 {
		var err error
		metaRaw, err = json.Marshal(extraMeta)
		if err != nil {
			return fmt.Errorf("marshal metadata: %w", err)
		}
	}

	_, err := pool.Exec(ctx, `
		UPDATE artifacts
		SET processing_status = 'done',
		    rendered_url   = CASE WHEN $2 <> '' THEN $2 ELSE rendered_url END,
		    thumbnail_url  = CASE WHEN $3 <> '' THEN $3 ELSE thumbnail_url END,
		    metadata       = CASE WHEN $4::jsonb IS NOT NULL
		                         THEN COALESCE(metadata, '{}'::jsonb) || $4::jsonb
		                         ELSE metadata END
		WHERE id = $1`,
		id, renderedURL, thumbnailURL, metaRaw,
	)
	return err
}
