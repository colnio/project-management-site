// export_test.go exposes internal functions so the external test package
// (artifact_test) can reach them without making them part of the public API.
package artifact

import (
	"context"
	"image"
)

// ExportEncodeImage encodes an image to PNG bytes (used to create test fixtures).
func ExportEncodeImage(img image.Image) ([]byte, error) { return encodeImage(img) }

// ExportPDFPageCount wraps the internal pdfPageCount for unit tests.
func ExportPDFPageCount(data []byte) (int, error) { return pdfPageCount(data) }

// ExportRenderThumbnails wraps the internal renderThumbnails for unit tests.
func ExportRenderThumbnails(data []byte) (small, medium []byte, err error) {
	return renderThumbnails(data)
}

// ExportRenderNotebook wraps the internal renderNotebook for unit tests.
func ExportRenderNotebook(ctx context.Context, nbconvertURL string, nb []byte) ([]byte, error) {
	return renderNotebook(ctx, nbconvertURL, nb)
}
