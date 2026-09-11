package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func validEntry() Entry {
	return Entry{Name: "勇士", Ending: "normal", PlayMs: 90 * 60 * 1000, Steps: 4000, Kills: 120, Lv: 30, HP: 12000, Atk: 900, Def: 800}
}

func TestValidate(t *testing.T) {
	cases := []struct {
		name string
		mut  func(*Entry)
		ok   bool
	}{
		{"valid", func(e *Entry) {}, true},
		{"empty name gets a default", func(e *Entry) { e.Name = "  " }, true},
		{"control chars stripped", func(e *Entry) { e.Name = "a\x00b\n" }, true},
		{"name too long", func(e *Entry) { e.Name = strings.Repeat("魔", 17) }, false},
		{"invalid utf8", func(e *Entry) { e.Name = string([]byte{0xff, 0xfe}) }, false},
		{"bad ending", func(e *Entry) { e.Ending = "secret" }, false},
		{"too fast", func(e *Entry) { e.PlayMs = 1000 }, false},
		{"negative steps", func(e *Entry) { e.Steps = -1 }, false},
		{"absurd stats", func(e *Entry) { e.Atk = 1e12 }, false},
		{"level zero", func(e *Entry) { e.Lv = 0 }, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := validEntry()
			c.mut(&e)
			err := e.Validate()
			if (err == nil) != c.ok {
				t.Fatalf("Validate() = %v, want ok=%v", err, c.ok)
			}
			if err != nil && !isValidationError(err) {
				t.Fatalf("expected a ValidationError, got %T", err)
			}
		})
	}
	e := validEntry()
	e.Name = "a\x00b\n"
	_ = e.Validate()
	if e.Name != "ab" {
		t.Fatalf("control characters not stripped: %q", e.Name)
	}
}

func TestBoardRankAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lb", "board.json")
	b, err := NewBoard(path)
	if err != nil {
		t.Fatal(err)
	}
	slow := validEntry()
	slow.PlayMs = 3 * 3600e3
	fast := validEntry()
	fast.Name = "闪电"
	fast.PlayMs = 20 * 60e3
	other := validEntry()
	other.Ending = "true"
	other.PlayMs = 10 * 60e3

	if rank, err := b.Add(slow); err != nil || rank != 1 {
		t.Fatalf("first add rank=%d err=%v", rank, err)
	}
	if rank, err := b.Add(other); err != nil || rank != 1 {
		t.Fatalf("other ending rank=%d err=%v", rank, err)
	}
	if rank, err := b.Add(fast); err != nil || rank != 1 {
		t.Fatalf("fast rank=%d err=%v", rank, err)
	}
	top := b.Top("normal", 10)
	if len(top) != 2 || top[0].Name != "闪电" {
		t.Fatalf("unexpected order: %+v", top)
	}
	if got := b.Top("", 1); len(got) != 1 || got[0].Ending != "true" {
		t.Fatalf("Top('') should return the overall fastest, got %+v", got)
	}

	// reload from disk
	b2, err := NewBoard(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := b2.Top("", 10); len(got) != 3 {
		t.Fatalf("persisted %d entries, want 3", len(got))
	}
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("temp file should be renamed away")
	}
}

func TestBoardCapsEntries(t *testing.T) {
	b, _ := NewBoard("")
	for i := 0; i < maxEntries+5; i++ {
		e := validEntry()
		e.PlayMs = int64(minPlayMs + i*1000)
		if _, err := b.Add(e); err != nil {
			t.Fatal(err)
		}
	}
	if n := len(b.Top("", maxEntries+10)); n != maxEntries {
		t.Fatalf("board holds %d entries, want %d", n, maxEntries)
	}
	worst := validEntry()
	worst.PlayMs = maxPlayMs
	if rank, _ := b.Add(worst); rank != 0 {
		t.Fatalf("an entry that falls off the board should rank 0, got %d", rank)
	}
}

func TestLimiter(t *testing.T) {
	now := time.Unix(0, 0)
	l := &limiter{window: time.Minute, limit: 2, hits: map[string]*bucket{}, now: func() time.Time { return now }}
	if !l.Allow("a") || !l.Allow("a") {
		t.Fatal("first two should pass")
	}
	if l.Allow("a") {
		t.Fatal("third within the window should be blocked")
	}
	if !l.Allow("b") {
		t.Fatal("other keys are independent")
	}
	now = now.Add(time.Minute)
	if !l.Allow("a") {
		t.Fatal("window should reset")
	}
}

func newTestServer(t *testing.T) *server {
	t.Helper()
	static := t.TempDir()
	if err := os.WriteFile(filepath.Join(static, "index.html"), []byte("<!doctype html><title>魔塔</title>"), 0o644); err != nil {
		t.Fatal(err)
	}
	b, _ := NewBoard(filepath.Join(t.TempDir(), "board.json"))
	return newServer(b, static, false)
}

func TestHTTPSubmitAndList(t *testing.T) {
	s := newTestServer(t)
	h := s.routes()

	body, _ := json.Marshal(validEntry())
	req := httptest.NewRequest(http.MethodPost, "/api/leaderboard", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.0.0.1:1234"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("submit status %d body %s", rec.Code, rec.Body)
	}
	var resp struct {
		Success bool           `json:"success"`
		Data    map[string]int `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil || !resp.Success || resp.Data["rank"] != 1 {
		t.Fatalf("unexpected submit response: %s", rec.Body)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/leaderboard?ending=normal&limit=5", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"name":"勇士"`) {
		t.Fatalf("list status %d body %s", rec.Code, rec.Body)
	}
	if got := rec.Header().Get("Content-Security-Policy"); !strings.Contains(got, "default-src 'self'") {
		t.Fatalf("missing CSP header: %q", got)
	}

	// bad inputs
	for _, url := range []string{"/api/leaderboard?ending=hidden", "/api/leaderboard?limit=0", "/api/leaderboard?limit=abc"} {
		rec = httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: status %d, want 400", url, rec.Code)
		}
	}
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/leaderboard", strings.NewReader(`{"name":"x","ending":"normal","playMs":1}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "不合理") {
		t.Fatalf("invalid entry: status %d body %s", rec.Code, rec.Body)
	}
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/leaderboard", strings.NewReader(`{"name":"x","ending":"normal","playMs":100000,"steps":1,"kills":1,"lv":1,"hp":1,"atk":1,"def":1,"hack":true}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("unknown fields must be rejected, got %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/leaderboard", strings.NewReader("name=x"))
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("non-JSON content type: status %d", rec.Code)
	}
}

func TestHTTPRateLimit(t *testing.T) {
	s := newTestServer(t)
	h := s.routes()
	body, _ := json.Marshal(validEntry())
	var last int
	for i := 0; i < submitPerWindow+1; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/leaderboard", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "10.0.0.9:5"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after %d submissions, got %d", submitPerWindow, last)
	}
}

func TestStaticFiles(t *testing.T) {
	s := newTestServer(t)
	h := s.routes()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "魔塔") {
		t.Fatalf("index: %d %s", rec.Code, rec.Body)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Fatalf("index cache-control %q", cc)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/nope", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown api route should 404, got %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/index.html", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("DELETE should be 405, got %d", rec.Code)
	}
}

func TestStaticRootDoesNotExposePrivateFiles(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"server/progress.go", "data/board.progress.json", "src/main.js", "src/engine/reducer.js", "css/style.css"} {
		file := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte("test"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	h := staticHandler(dir)
	for _, url := range []string{"/server/progress.go", "/data/board.progress.json", "/src/", "/src/../data/board.progress.json"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("private path %s returned %d", url, rec.Code)
		}
	}
	for _, url := range []string{"/src/main.js", "/src/engine/reducer.js", "/css/style.css"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
		if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-cache" {
			t.Fatalf("asset %s: status=%d cache=%s", url, rec.Code, rec.Header().Get("Cache-Control"))
		}
		ct := rec.Header().Get("Content-Type")
		want := "text/javascript"
		if strings.HasSuffix(url, ".css") {
			want = "text/css"
		}
		if !strings.HasPrefix(ct, want) {
			t.Fatalf("asset %s: Content-Type=%q, want prefix %q", url, ct, want)
		}
	}
}

func TestLegacySubmitRejectsTrailingJSON(t *testing.T) {
	s := newTestServer(t)
	body, _ := json.Marshal(validEntry())
	req := httptest.NewRequest(http.MethodPost, "/api/leaderboard", strings.NewReader(string(body)+" {}"))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.routes().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || len(s.board.Top("", 10)) != 0 {
		t.Fatalf("trailing JSON accepted: %d", rec.Code)
	}
}

func TestClientIP(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "1.2.3.4:999"
	r.Header.Set("X-Forwarded-For", "9.9.9.9, 10.0.0.1")
	if ip := clientIP(r, false); ip != "1.2.3.4" {
		t.Fatalf("without proxy trust: %s", ip)
	}
	if ip := clientIP(r, true); ip != "9.9.9.9" {
		t.Fatalf("with proxy trust: %s", ip)
	}
}
