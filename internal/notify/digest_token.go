package notify

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

func signDigestToken(key string, userID uuid.UUID) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("digest:"))
	mac.Write(userID[:])
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return userID.String() + "." + sig
}

func verifyDigestToken(key, token string) (uuid.UUID, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return uuid.Nil, fmt.Errorf("invalid token")
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		return uuid.Nil, err
	}
	expected := signDigestToken(key, id)
	if !hmac.Equal([]byte(token), []byte(expected)) {
		return uuid.Nil, fmt.Errorf("invalid signature")
	}
	return id, nil
}
