package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// MaxPasswordBytes caps password length to mitigate DoS via expensive argon2 hashing.
const MaxPasswordBytes = 1024

// argon2id parameters. OWASP minimum for argon2id is memory=64MiB, time=1, parallelism=1.
const (
	argonMemory  uint32 = 64 * 1024 // 64 MiB
	argonTime    uint32 = 2
	argonThreads uint8  = 4
	argonSaltLen        = 16
	argonKeyLen  uint32 = 32
)

// HashPassword hashes pw using argon2id and returns a PHC-format string:
// $argon2id$v=19$m=<mem>,t=<time>,p=<threads>$<b64salt>$<b64hash>
func HashPassword(pw string) (string, error) {
	if len(pw) > MaxPasswordBytes {
		return "", fmt.Errorf("argon2id: password exceeds maximum length of %d bytes", MaxPasswordBytes)
	}
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("argon2id: salt generation: %w", err)
	}
	hash := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	encoded := fmt.Sprintf(
		"$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	)
	return encoded, nil
}

// VerifyPassword checks pw against an encoded PHC argon2id string.
// It uses constant-time comparison to prevent timing attacks.
func VerifyPassword(encoded, pw string) (bool, error) {
	if len(pw) > MaxPasswordBytes {
		return false, nil
	}
	parts := strings.Split(encoded, "$")
	// parts[0]="" parts[1]="argon2id" parts[2]="v=19" parts[3]="m=...,t=...,p=..." parts[4]=salt parts[5]=hash
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, fmt.Errorf("argon2id: invalid encoded string format")
	}

	var mem uint32
	var tim uint32
	var thr uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &tim, &thr); err != nil {
		return false, fmt.Errorf("argon2id: cannot parse params: %w", err)
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("argon2id: decode salt: %w", err)
	}
	wantHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("argon2id: decode hash: %w", err)
	}

	gotHash := argon2.IDKey([]byte(pw), salt, tim, mem, thr, uint32(len(wantHash)))
	if subtle.ConstantTimeCompare(gotHash, wantHash) != 1 {
		return false, nil
	}
	return true, nil
}
