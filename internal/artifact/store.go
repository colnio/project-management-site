package artifact

import (
	"bytes"
	"context"
	"fmt"
	"io"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/colnio/project-management-site/internal/config"
)

// ObjectStore is an abstraction over S3/MinIO object storage. It exists so
// tests can inject an in-memory fake without needing a real MinIO instance.
type ObjectStore interface {
	// Get downloads an object and returns its raw bytes.
	Get(ctx context.Context, bucket, key string) ([]byte, error)
	// Put uploads body as object with the given content-type, overwriting any
	// existing object at the same key.
	Put(ctx context.Context, bucket, key string, body []byte, contentType string) error
}

// s3Store is the production ObjectStore backed by AWS SDK v2.
type s3Store struct {
	client *s3.Client
}

// NewS3Store builds an ObjectStore that talks to the S3-compatible endpoint
// described in cfg (MinIO in dev, real S3 in prod). The caller is the only
// user of the returned store; no long-lived connection is kept.
func NewS3Store(cfg *config.Config) (ObjectStore, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(
		context.Background(),
		awsconfig.WithRegion(cfg.S3Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("artifact store: build aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = &cfg.S3Endpoint
		o.UsePathStyle = cfg.S3UsePathStyle
	})

	return &s3Store{client: client}, nil
}

func (s *s3Store) Get(ctx context.Context, bucket, key string) ([]byte, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: &bucket,
		Key:    &key,
	})
	if err != nil {
		return nil, fmt.Errorf("artifact store: get %s/%s: %w", bucket, key, err)
	}
	defer out.Body.Close()

	limited := io.LimitReader(out.Body, MaxArtifactBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("artifact store: read body %s/%s: %w", bucket, key, err)
	}
	if int64(len(data)) > MaxArtifactBytes {
		return nil, fmt.Errorf("artifact store: object %s/%s exceeds max size %d", bucket, key, MaxArtifactBytes)
	}
	return data, nil
}

func (s *s3Store) Put(ctx context.Context, bucket, key string, body []byte, contentType string) error {
	r := bytes.NewReader(body)
	size := int64(len(body))
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        &bucket,
		Key:           &key,
		Body:          r,
		ContentLength: &size,
		ContentType:   &contentType,
	})
	if err != nil {
		return fmt.Errorf("artifact store: put %s/%s: %w", bucket, key, err)
	}
	return nil
}
