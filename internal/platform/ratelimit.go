package platform

import (
	"net/http"
	"sync"
	"time"
)

// RateLimiter applies a simple per-token sliding-window limit. Only token-based
// callers (PAT / internal AI) are limited; first-party browser sessions are
// not. In production behind Caddy this is sufficient at lab scale; it is
// in-memory and resets on restart.
type RateLimiter struct {
	perMinute int
	mu        sync.Mutex
	hits      map[string][]time.Time
}

// NewRateLimiter builds a limiter allowing perMinute requests per token per
// rolling 60s window. perMinute <= 0 disables limiting.
func NewRateLimiter(perMinute int) *RateLimiter {
	return &RateLimiter{perMinute: perMinute, hits: make(map[string][]time.Time)}
}

// Middleware enforces the limit keyed by the principal's token id.
func (rl *RateLimiter) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rl == nil || rl.perMinute <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			p, ok := PrincipalFrom(r.Context())
			key := ""
			if ok {
				switch {
				case p.ViaTokenID != nil:
					key = "pat:" + p.ViaTokenID.String()
				case p.ViaAIConversationID != nil:
					key = "iai:" + p.ViaAIConversationID.String()
				default:
					// First-party JWT session: key by user ID.
					key = "user:" + p.UserID.String()
				}
			}
			if key == "" { // unauthenticated public route — don't limit
				next.ServeHTTP(w, r)
				return
			}
			if !rl.allow(key) {
				writeError(w, Errorf(http.StatusTooManyRequests, "rate_limited", "rate limit exceeded"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (rl *RateLimiter) allow(key string) bool {
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	rl.mu.Lock()
	defer rl.mu.Unlock()
	times := rl.hits[key]
	kept := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= rl.perMinute {
		rl.hits[key] = kept
		return false
	}
	rl.hits[key] = append(kept, now)
	return true
}
