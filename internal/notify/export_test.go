package notify

import "github.com/google/uuid"

// ExportSignDigestToken exposes digest signing for tests in notify_test.
func ExportSignDigestToken(key string, userID uuid.UUID) string {
	return signDigestToken(key, userID)
}

// ExportVerifyDigestToken exposes digest verification for tests in notify_test.
func ExportVerifyDigestToken(key, token string) (uuid.UUID, error) {
	return verifyDigestToken(key, token)
}
