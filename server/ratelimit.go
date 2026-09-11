package main

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// limiter is a small fixed-window rate limiter keyed by client IP.  It is
// deliberately simple: one core, one gigabyte, one goroutine of housekeeping.
type limiter struct {
	mu     sync.Mutex
	window time.Duration
	limit  int
	hits   map[string]*bucket
	now    func() time.Time
}

type bucket struct {
	count int
	start time.Time
}

func newLimiter(limit int, window time.Duration) *limiter {
	l := &limiter{window: window, limit: limit, hits: map[string]*bucket{}, now: time.Now}
	go l.sweep()
	return l
}

// Allow reports whether the key may proceed and records the hit.
func (l *limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b := l.hits[key]
	if b == nil || now.Sub(b.start) >= l.window {
		l.hits[key] = &bucket{count: 1, start: now}
		return true
	}
	if b.count >= l.limit {
		return false
	}
	b.count++
	return true
}

func (l *limiter) sweep() {
	t := time.NewTicker(l.window)
	defer t.Stop()
	for range t.C {
		l.mu.Lock()
		now := l.now()
		for k, b := range l.hits {
			if now.Sub(b.start) >= l.window {
				delete(l.hits, k)
			}
		}
		l.mu.Unlock()
	}
}

// clientIP trusts X-Forwarded-For only when trustProxy is set (i.e. behind nginx).
func clientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			if i := strings.IndexByte(xff, ','); i >= 0 {
				return strings.TrimSpace(xff[:i])
			}
			return strings.TrimSpace(xff)
		}
		if rip := r.Header.Get("X-Real-IP"); rip != "" {
			return strings.TrimSpace(rip)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
