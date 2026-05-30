package notify

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

const digestTokenTTL = 90 * 24 * time.Hour

func signDigestToken(key string, userID uuid.UUID) string {
	exp := time.Now().Add(digestTokenTTL).Unix()
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("digest:"))
	mac.Write(userID[:])
	mac.Write([]byte(fmt.Sprintf(":%d", exp)))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%s.%d.%s", userID.String(), exp, sig)
}

func verifyDigestToken(key, token string) (uuid.UUID, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return uuid.Nil, fmt.Errorf("invalid token")
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		return uuid.Nil, err
	}
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid token expiry")
	}
	if time.Now().Unix() > exp {
		return uuid.Nil, fmt.Errorf("token expired")
	}
	expected := signDigestTokenAt(key, id, exp)
	if !hmac.Equal([]byte(token), []byte(expected)) {
		return uuid.Nil, fmt.Errorf("invalid signature")
	}
	return id, nil
}

func signDigestTokenAt(key string, userID uuid.UUID, expUnix int64) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("digest:"))
	mac.Write(userID[:])
	mac.Write([]byte(fmt.Sprintf(":%d", expUnix)))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%s.%d.%s", userID.String(), expUnix, sig)
}
