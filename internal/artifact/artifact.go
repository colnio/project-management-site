// Package artifact implements the Artifact module (B6): presigned-upload
// handshake, artifact metadata management, and typed attachment joins for
// samples and experiments.
package artifact

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/colnio/project-management-site/internal/audit"
	"github.com/colnio/project-management-site/internal/config"
	"github.com/colnio/project-management-site/internal/experiment"
	"github.com/colnio/project-management-site/internal/org"
	"github.com/colnio/project-management-site/internal/platform"
	"github.com/colnio/project-management-site/internal/project"
	"github.com/colnio/project-management-site/internal/sample"
)

// Artifact is the domain struct for a stored file. ProcessingStatus is managed
// by a Track-D background worker; the upload handshake leaves it 'pending'.
type Artifact struct {
	ID               uuid.UUID       `json:"id"`
	ProjectID        uuid.UUID       `json:"project_id"`
	Type             string          `json:"type"`
	Filename         string          `json:"filename"`
	ContentType      string          `json:"content_type"`
	SizeBytes        int64           `json:"size_bytes"`
	StorageKey       string          `json:"storage_key"`
	OriginalURL      string          `json:"original_url"`
	RenderedURL      string          `json:"rendered_url"`
	ThumbnailURL     string          `json:"thumbnail_url"`
	Metadata         json.RawMessage `json:"metadata"`
	ProcessingStatus string          `json:"processing_status"`
	UploadedBy       uuid.UUID       `json:"uploaded_by"`
	UploadedAt       time.Time       `json:"uploaded_at"`
}

// SampleArtifact is the join record linking an artifact to a sample.
type SampleArtifact struct {
	ID         uuid.UUID  `json:"id"`
	SampleID   uuid.UUID  `json:"sample_id"`
	ArtifactID uuid.UUID  `json:"artifact_id"`
	Role       *string    `json:"role,omitempty"`
	AttachedBy uuid.UUID  `json:"attached_by"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ExperimentArtifact is the join record linking an artifact to an experiment.
type ExperimentArtifact struct {
	ID           uuid.UUID  `json:"id"`
	ExperimentID uuid.UUID  `json:"experiment_id"`
	ArtifactID   uuid.UUID  `json:"artifact_id"`
	Role         *string    `json:"role,omitempty"`
	AttachedBy   uuid.UUID  `json:"attached_by"`
	CreatedAt    time.Time  `json:"created_at"`
}

// Service is the artifact module's domain service.
type Service struct {
	pool        *pgxpool.Pool
	projects    *project.Service
	samples     *sample.Service
	experiments *experiment.Service
	cfg         *config.Config
	rec         audit.Recorder
	presign         *s3.PresignClient
	headChecker     objectHeadChecker
	objectDeleter   objectDeleter
	bucket          string
	bucketRendered  string
	log             *slog.Logger
	enqueuer        Enqueuer // optional; nil means skip enqueueing (keeps old tests green)
}

// SetEnqueuer wires a background-job enqueuer into the service after construction.
// This is called from cmd/api after both the artifact service and River client
// are built, avoiding circular construction dependencies.
func (s *Service) SetEnqueuer(e Enqueuer) { s.enqueuer = e }

// NewService constructs a Service and builds an S3/MinIO presign client.
// The presign client works offline — presigning is pure HMAC, no network call.
// NewService returns an error only for bad config (missing credentials), not
// for unreachable MinIO.
func NewService(
	pool *pgxpool.Pool,
	projects *project.Service,
	samples *sample.Service,
	experiments *experiment.Service,
	cfg *config.Config,
	rec audit.Recorder,
	log *slog.Logger,
) (*Service, error) {
	if cfg.S3AccessKey == "" || cfg.S3SecretKey == "" {
		return nil, fmt.Errorf("artifact: S3 credentials are required")
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(
		context.Background(),
		awsconfig.WithRegion(cfg.S3Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("artifact: build aws config: %w", err)
	}

	s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = &cfg.S3Endpoint
		o.UsePathStyle = cfg.S3UsePathStyle
	})

	presign := s3.NewPresignClient(s3Client)
	objOps := &s3ObjectOps{client: s3Client}

	return &Service{
		pool:           pool,
		projects:       projects,
		samples:        samples,
		experiments:    experiments,
		cfg:            cfg,
		rec:            rec,
		presign:        presign,
		headChecker:    objOps,
		objectDeleter:  objOps,
		bucket:         cfg.BucketOriginals,
		bucketRendered: cfg.BucketRendered,
		log:            log,
	}, nil
}

// ─── Core domain API ──────────────────────────────────────────────────────────

// GetArtifact loads an artifact by id. Returns platform.NotFound if absent.
func (s *Service) GetArtifact(ctx context.Context, id uuid.UUID) (*Artifact, error) {
	var a Artifact
	err := s.pool.QueryRow(ctx, `
		SELECT id, project_id, type, filename, content_type, size_bytes,
		       storage_key, original_url, rendered_url, thumbnail_url,
		       metadata, processing_status, uploaded_by, uploaded_at
		FROM artifacts WHERE id = $1`, id,
	).Scan(
		&a.ID, &a.ProjectID, &a.Type, &a.Filename, &a.ContentType, &a.SizeBytes,
		&a.StorageKey, &a.OriginalURL, &a.RenderedURL, &a.ThumbnailURL,
		&a.Metadata, &a.ProcessingStatus, &a.UploadedBy, &a.UploadedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, platform.NotFound("artifact.not_found", "artifact not found")
	}
	if err != nil {
		return nil, fmt.Errorf("artifact: get: %w", err)
	}
	return &a, nil
}

// BucketName returns the originals bucket name (useful for tests).
func (s *Service) BucketName() string { return s.bucket }

// CreateArtifact creates an artifact row and returns the artifact plus a presigned PUT URL.
// artType may be empty; if so it is inferred from contentType and filename.
func (s *Service) CreateArtifact(ctx context.Context, projectID uuid.UUID, filename, contentType, artType string, sizeBytes int64) (*Artifact, string, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, "", platform.Unauthorized("not authenticated")
	}

	if _, _, err := s.projects.Authorize(ctx, p, projectID, org.RoleEditor); err != nil {
		return nil, "", err
	}

	safeName, err := sanitizeFilename(filename)
	if err != nil {
		return nil, "", err
	}
	filename = safeName
	if err := validateContentType(contentType); err != nil {
		return nil, "", err
	}
	if sizeBytes <= 0 {
		return nil, "", platform.BadRequest("artifact.invalid_size", "size_bytes must be positive")
	}
	if sizeBytes > MaxArtifactBytes {
		return nil, "", platform.BadRequest("artifact.size_too_large", fmt.Sprintf("size_bytes exceeds maximum of %d", MaxArtifactBytes))
	}

	if artType == "" {
		artType = inferType(contentType, filename)
	}

	artID := uuid.New()
	storageKey := fmt.Sprintf("projects/%s/artifacts/%s/%s", projectID, artID, filename)

	var art Artifact
	err = s.pool.QueryRow(ctx, `
		INSERT INTO artifacts
		    (id, project_id, type, filename, content_type, size_bytes, storage_key, uploaded_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, project_id, type, filename, content_type, size_bytes,
		          storage_key, original_url, rendered_url, thumbnail_url,
		          metadata, processing_status, uploaded_by, uploaded_at`,
		artID, projectID, artType, filename, contentType, sizeBytes, storageKey, p.UserID,
	).Scan(
		&art.ID, &art.ProjectID, &art.Type, &art.Filename, &art.ContentType, &art.SizeBytes,
		&art.StorageKey, &art.OriginalURL, &art.RenderedURL, &art.ThumbnailURL,
		&art.Metadata, &art.ProcessingStatus, &art.UploadedBy, &art.UploadedAt,
	)
	if err != nil {
		return nil, "", fmt.Errorf("artifact: insert: %w", err)
	}

	// Enforce declared size via presigned Content-Length (S3 rejects mismatched PUT bodies).
	cl := sizeBytes
	req, err := s.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        &s.bucket,
		Key:           &storageKey,
		ContentType:   &contentType,
		ContentLength: &cl,
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return nil, "", fmt.Errorf("artifact: presign put: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "artifact.create",
		ResourceType: "artifact",
		ResourceID:   art.ID.String(),
	})

	return &art, req.URL, nil
}

// CompleteUpload sets original_url and records the upload_complete audit event.
func (s *Service) CompleteUpload(ctx context.Context, id uuid.UUID) (*Artifact, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	art, err := s.GetArtifact(ctx, id)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, art.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	if art.UploadedBy != p.UserID {
		if _, _, ownerErr := s.projects.Authorize(ctx, p, art.ProjectID, org.RoleOwner); ownerErr != nil {
			return nil, platform.Forbidden("only the uploader or project owner may complete this upload")
		}
	}

	if s.headChecker != nil {
		if err := s.headChecker.ObjectExists(ctx, s.bucket, art.StorageKey); err != nil {
			return nil, platform.BadRequest("artifact.upload_missing", "uploaded object not found in storage")
		}
	}

	originalURL := fmt.Sprintf("%s/%s/%s", s.cfg.S3PublicURLBase, s.bucket, art.StorageKey)

	err = s.pool.QueryRow(ctx, `
		UPDATE artifacts
		SET original_url = $2
		WHERE id = $1
		RETURNING id, project_id, type, filename, content_type, size_bytes,
		          storage_key, original_url, rendered_url, thumbnail_url,
		          metadata, processing_status, uploaded_by, uploaded_at`,
		id, originalURL,
	).Scan(
		&art.ID, &art.ProjectID, &art.Type, &art.Filename, &art.ContentType, &art.SizeBytes,
		&art.StorageKey, &art.OriginalURL, &art.RenderedURL, &art.ThumbnailURL,
		&art.Metadata, &art.ProcessingStatus, &art.UploadedBy, &art.UploadedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("artifact: complete upload: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "artifact.upload_complete",
		ResourceType: "artifact",
		ResourceID:   art.ID.String(),
	})

	// Enqueue background processing job (Track-D). nil-safe: if no enqueuer is
	// wired (e.g. in unit tests), skip silently so existing tests stay green.
	if s.enqueuer != nil {
		if enqErr := s.enqueuer.EnqueueProcessArtifact(ctx, art.ID); enqErr != nil {
			s.log.Error("artifact: enqueue processing job", "id", art.ID, "err", enqErr)
			// Best-effort: do not fail the HTTP response because of a queue error.
		}
	}

	return art, nil
}

// DeleteArtifact removes an artifact row. S3 object cleanup is best-effort/optional.
func (s *Service) DeleteArtifact(ctx context.Context, id uuid.UUID) error {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return platform.Unauthorized("not authenticated")
	}

	art, err := s.GetArtifact(ctx, id)
	if err != nil {
		return err
	}

	if _, _, err := s.projects.Authorize(ctx, p, art.ProjectID, org.RoleEditor); err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `DELETE FROM artifacts WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("artifact: delete: %w", err)
	}

	s.bestEffortDeleteObject(ctx, s.bucket, art.StorageKey)
	if art.RenderedURL != "" {
		s.bestEffortDeleteObject(ctx, s.bucketRendered, art.StorageKey+".html")
	}
	if art.ThumbnailURL != "" {
		s.bestEffortDeleteObject(ctx, s.bucketRendered, art.StorageKey+"_thumb_sm.jpg")
		s.bestEffortDeleteObject(ctx, s.bucketRendered, art.StorageKey+"_thumb_md.jpg")
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "artifact.delete",
		ResourceType: "artifact",
		ResourceID:   id.String(),
	})

	return nil
}

// AttachToSample inserts a sample_artifacts join record.
func (s *Service) AttachToSample(ctx context.Context, sampleID, artifactID uuid.UUID, role string) (*SampleArtifact, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	art, err := s.GetArtifact(ctx, artifactID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, art.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	// Verify the sample belongs to the same project as the artifact.
	sm, err := s.samples.GetSample(ctx, sampleID)
	if err != nil {
		return nil, err
	}
	if sm.ProjectID != art.ProjectID {
		return nil, platform.BadRequest("artifact.project_mismatch", "sample does not belong to artifact's project")
	}

	var rolePtr *string
	if role != "" {
		r := role
		rolePtr = &r
	}

	var sa SampleArtifact
	err = s.pool.QueryRow(ctx, `
		INSERT INTO sample_artifacts (sample_id, artifact_id, role, attached_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, sample_id, artifact_id, role, attached_by, created_at`,
		sampleID, artifactID, rolePtr, p.UserID,
	).Scan(&sa.ID, &sa.SampleID, &sa.ArtifactID, &sa.Role, &sa.AttachedBy, &sa.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("artifact: attach to sample: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "artifact.attach_sample",
		ResourceType: "sample_artifact",
		ResourceID:   sa.ID.String(),
	})

	return &sa, nil
}

// ListSampleArtifacts returns all artifacts attached to the given sample that the
// principal has read access to (403s are swallowed).
func (s *Service) ListSampleArtifacts(ctx context.Context, sampleID uuid.UUID) ([]*Artifact, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.project_id, a.type, a.filename, a.content_type, a.size_bytes,
		       a.storage_key, a.original_url, a.rendered_url, a.thumbnail_url,
		       a.metadata, a.processing_status, a.uploaded_by, a.uploaded_at
		FROM artifacts a
		JOIN sample_artifacts sa ON sa.artifact_id = a.id
		WHERE sa.sample_id = $1
		ORDER BY sa.created_at DESC`, sampleID,
	)
	if err != nil {
		return nil, fmt.Errorf("artifact: list sample artifacts: %w", err)
	}
	defer rows.Close()

	var result []*Artifact
	for rows.Next() {
		var a Artifact
		if err := rows.Scan(
			&a.ID, &a.ProjectID, &a.Type, &a.Filename, &a.ContentType, &a.SizeBytes,
			&a.StorageKey, &a.OriginalURL, &a.RenderedURL, &a.ThumbnailURL,
			&a.Metadata, &a.ProcessingStatus, &a.UploadedBy, &a.UploadedAt,
		); err != nil {
			return nil, fmt.Errorf("artifact: scan: %w", err)
		}
		if _, _, authErr := s.projects.Authorize(ctx, p, a.ProjectID, org.RoleViewer); authErr != nil {
			continue
		}
		result = append(result, &a)
	}
	return result, rows.Err()
}

// AttachToExperiment inserts an experiment_artifacts join record.
func (s *Service) AttachToExperiment(ctx context.Context, experimentID, artifactID uuid.UUID, role string) (*ExperimentArtifact, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	art, err := s.GetArtifact(ctx, artifactID)
	if err != nil {
		return nil, err
	}

	if _, _, err := s.projects.Authorize(ctx, p, art.ProjectID, org.RoleEditor); err != nil {
		return nil, err
	}

	// Verify the experiment belongs to the same project as the artifact.
	exp, err := s.experiments.GetExperiment(ctx, experimentID)
	if err != nil {
		return nil, err
	}
	if exp.ProjectID != art.ProjectID {
		return nil, platform.BadRequest("artifact.project_mismatch", "experiment does not belong to artifact's project")
	}

	var rolePtr *string
	if role != "" {
		r := role
		rolePtr = &r
	}

	var ea ExperimentArtifact
	err = s.pool.QueryRow(ctx, `
		INSERT INTO experiment_artifacts (experiment_id, artifact_id, role, attached_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, experiment_id, artifact_id, role, attached_by, created_at`,
		experimentID, artifactID, rolePtr, p.UserID,
	).Scan(&ea.ID, &ea.ExperimentID, &ea.ArtifactID, &ea.Role, &ea.AttachedBy, &ea.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("artifact: attach to experiment: %w", err)
	}

	_ = s.rec.Record(ctx, audit.Entry{
		Actor:        p.UserID,
		ViaTokenID:   p.ViaTokenID,
		Action:       "artifact.attach_experiment",
		ResourceType: "experiment_artifact",
		ResourceID:   ea.ID.String(),
	})

	return &ea, nil
}

// ListExperimentArtifacts returns all artifacts attached to the given experiment that the
// principal has read access to (403s are swallowed).
func (s *Service) ListExperimentArtifacts(ctx context.Context, experimentID uuid.UUID) ([]*Artifact, error) {
	p, ok := platform.PrincipalFrom(ctx)
	if !ok {
		return nil, platform.Unauthorized("not authenticated")
	}

	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.project_id, a.type, a.filename, a.content_type, a.size_bytes,
		       a.storage_key, a.original_url, a.rendered_url, a.thumbnail_url,
		       a.metadata, a.processing_status, a.uploaded_by, a.uploaded_at
		FROM artifacts a
		JOIN experiment_artifacts ea ON ea.artifact_id = a.id
		WHERE ea.experiment_id = $1
		ORDER BY ea.created_at DESC`, experimentID,
	)
	if err != nil {
		return nil, fmt.Errorf("artifact: list experiment artifacts: %w", err)
	}
	defer rows.Close()

	var result []*Artifact
	for rows.Next() {
		var a Artifact
		if err := rows.Scan(
			&a.ID, &a.ProjectID, &a.Type, &a.Filename, &a.ContentType, &a.SizeBytes,
			&a.StorageKey, &a.OriginalURL, &a.RenderedURL, &a.ThumbnailURL,
			&a.Metadata, &a.ProcessingStatus, &a.UploadedBy, &a.UploadedAt,
		); err != nil {
			return nil, fmt.Errorf("artifact: scan: %w", err)
		}
		if _, _, authErr := s.projects.Authorize(ctx, p, a.ProjectID, org.RoleViewer); authErr != nil {
			continue
		}
		result = append(result, &a)
	}
	return result, rows.Err()
}

// listByProject returns all artifacts for the given project.
func (s *Service) listByProject(ctx context.Context, projectID uuid.UUID) ([]*Artifact, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, type, filename, content_type, size_bytes,
		       storage_key, original_url, rendered_url, thumbnail_url,
		       metadata, processing_status, uploaded_by, uploaded_at
		FROM artifacts WHERE project_id = $1
		ORDER BY uploaded_at DESC`, projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("artifact: list by project: %w", err)
	}
	defer rows.Close()

	var result []*Artifact
	for rows.Next() {
		var a Artifact
		if err := rows.Scan(
			&a.ID, &a.ProjectID, &a.Type, &a.Filename, &a.ContentType, &a.SizeBytes,
			&a.StorageKey, &a.OriginalURL, &a.RenderedURL, &a.ThumbnailURL,
			&a.Metadata, &a.ProcessingStatus, &a.UploadedBy, &a.UploadedAt,
		); err != nil {
			return nil, fmt.Errorf("artifact: scan: %w", err)
		}
		result = append(result, &a)
	}
	return result, rows.Err()
}

// inferType maps content_type and filename extension to one of the artifact
// type enum values: pdf, ipynb, image, other.
func inferType(contentType, filename string) string {
	ct := strings.ToLower(contentType)
	switch {
	case ct == "application/pdf" || strings.HasSuffix(strings.ToLower(filename), ".pdf"):
		return "pdf"
	case strings.Contains(ct, "ipynb") || strings.HasSuffix(strings.ToLower(filename), ".ipynb"):
		return "ipynb"
	case strings.HasPrefix(ct, "image/"):
		return "image"
	}
	// Also infer image from extension.
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp":
		return "image"
	}
	return "other"
}

func (s *Service) bestEffortDeleteObject(ctx context.Context, bucket, key string) {
	if s.objectDeleter == nil || key == "" {
		return
	}
	if err := s.objectDeleter.DeleteObject(ctx, bucket, key); err != nil {
		s.log.Warn("artifact: best-effort s3 delete failed", "bucket", bucket, "key", key, "err", err)
	}
}
