// mota-server serves the game's static files and a tiny leaderboard API.
// It is a single ~8 MB binary that idles at a few megabytes of RAM, which is
// all a 1 CPU / 1 GB box should have to spend on a browser game.
//
//	mota-server -addr :8001 -static ./public -data ./data/leaderboard.json
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	maxBodyBytes    = 4 << 10
	defaultLimit    = 20
	maxLimit        = 100
	submitPerWindow = 5
	submitWindow    = time.Minute
	readPerWindow   = 60
)

type apiResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Error   *string     `json:"error"`
}

type server struct {
	board      *Board
	submitLim  *limiter
	readLim    *limiter
	trustProxy bool
	static     http.Handler
	version    string
}

func main() {
	addr := flag.String("addr", envOr("MOTA_ADDR", ":8001"), "listen address")
	static := flag.String("static", envOr("MOTA_STATIC", "./public"), "directory with the game files")
	data := flag.String("data", envOr("MOTA_DATA", "./data/leaderboard.json"), "leaderboard JSON file ('' disables persistence)")
	trustProxy := flag.Bool("trust-proxy", envOr("MOTA_TRUST_PROXY", "") == "1", "trust X-Forwarded-For (when behind nginx)")
	flag.Parse()

	board, err := NewBoard(*data)
	if err != nil {
		log.Fatalf("leaderboard: %v", err)
	}
	if _, err := os.Stat(filepath.Join(*static, "index.html")); err != nil {
		log.Fatalf("static dir %q does not contain index.html: %v", *static, err)
	}
	s := newServer(board, *static, *trustProxy)

	httpSrv := &http.Server{
		Addr:              *addr,
		Handler:           s.routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}

	go func() {
		log.Printf("魔塔 server listening on %s (static=%s data=%s)", *addr, *static, *data)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func newServer(board *Board, staticDir string, trustProxy bool) *server {
	return &server{
		board:      board,
		submitLim:  newLimiter(submitPerWindow, submitWindow),
		readLim:    newLimiter(readPerWindow, submitWindow),
		trustProxy: trustProxy,
		static:     staticHandler(staticDir),
		version:    "1.0.0",
	}
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/leaderboard", s.handleList)
	mux.HandleFunc("POST /api/leaderboard", s.handleSubmit)
	mux.HandleFunc("GET /api/progress", s.handleProgress)
	mux.HandleFunc("POST /api/progress", s.handleProgress)
	mux.Handle("/", s.static)
	return securityHeaders(mux)
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, apiResponse{Success: true, Data: map[string]string{"status": "ok", "version": s.version}})
}

func (s *server) handleList(w http.ResponseWriter, r *http.Request) {
	if !s.readLim.Allow(clientIP(r, s.trustProxy)) {
		writeError(w, http.StatusTooManyRequests, "请求过于频繁")
		return
	}
	q := r.URL.Query()
	ending := q.Get("ending")
	if ending != "" && ending != "normal" && ending != "true" {
		writeError(w, http.StatusBadRequest, "无效的结局类型")
		return
	}
	limit := defaultLimit
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > maxLimit {
			writeError(w, http.StatusBadRequest, "limit 必须是 1–100 的整数")
			return
		}
		limit = n
	}
	writeJSON(w, http.StatusOK, apiResponse{Success: true, Data: s.board.Top(ending, limit)})
}

func (s *server) handleSubmit(w http.ResponseWriter, r *http.Request) {
	if !s.submitLim.Allow(clientIP(r, s.trustProxy)) {
		writeError(w, http.StatusTooManyRequests, "提交过于频繁，请稍后再试")
		return
	}
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		writeError(w, http.StatusUnsupportedMediaType, "需要 application/json")
		return
	}
	var e Entry
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&e); err != nil {
		writeError(w, http.StatusBadRequest, "请求体不是有效的 JSON")
		return
	}
	if err := dec.Decode(new(interface{})); err != io.EOF {
		writeError(w, http.StatusBadRequest, "请求体不是有效的 JSON")
		return
	}
	e.At = time.Time{}
	rank, err := s.board.Add(e)
	if err != nil {
		var status = http.StatusBadRequest
		if !isValidationError(err) {
			log.Printf("leaderboard persist error: %v", err)
			status = http.StatusInternalServerError
			err = errors.New("服务器保存失败")
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, apiResponse{Success: true, Data: map[string]int{"rank": rank}})
}

// Validation errors come from Entry.Validate; anything else is I/O.
func isValidationError(err error) bool {
	var v ValidationError
	return errors.As(err, &v)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, apiResponse{Success: false, Error: &msg})
}

// Code has no versioned filenames: revalidate it together with the HTML.
// Serve only public game assets even when -static points at the project root.
func staticHandler(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		clean := path.Clean("/" + r.URL.Path)
		allowed := clean == "/" || clean == "/index.html" ||
			(strings.HasPrefix(clean, "/src/") && strings.HasSuffix(clean, ".js")) ||
			(strings.HasPrefix(clean, "/css/") && strings.HasSuffix(clean, ".css"))
		if !allowed {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		switch {
		case strings.HasSuffix(clean, ".js"):
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		case strings.HasSuffix(clean, ".css"):
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case clean == "/" || clean == "/index.html":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		}
		fs.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	csp := "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Content-Security-Policy", csp)
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}
