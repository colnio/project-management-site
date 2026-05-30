package artifact

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// objectHeadChecker verifies that an object exists in object storage before complete.
type objectHeadChecker interface {
	ObjectExists(ctx context.Context, bucket, key string) error
}

// objectDeleter removes objects from storage (best-effort on artifact delete).
type objectDeleter interface {
	DeleteObject(ctx context.Context, bucket, key string) error
}

type s3ObjectOps struct {
	client *s3.Client
}

func (o *s3ObjectOps) ObjectExists(ctx context.Context, bucket, key string) error {
	_, err := o.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: &bucket,
		Key:    &key,
	})
	if err != nil {
		var notFound *types.NotFound
		if errors.As(err, &notFound) {
			return fmt.Errorf("object not found")
		}
		return fmt.Errorf("head object: %w", err)
	}
	return nil
}

func (o *s3ObjectOps) DeleteObject(ctx context.Context, bucket, key string) error {
	_, err := o.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &bucket,
		Key:    &key,
	})
	if err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}
