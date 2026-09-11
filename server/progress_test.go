package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestConcurrentProgressDoesNotLoseHeroesOrHighestFloor(t *testing.T) {
	path := filepath.Join(t.TempDir(), "board.json")
	b, err := NewBoard(path)
	if err != nil {
		t.Fatal(err)
	}
	var workers sync.WaitGroup
	for i := 0; i < 24; i++ {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			e := ProgressEntry{ID: fmt.Sprintf("10000000-1000-4000-8000-%012x", i), Name: fmt.Sprintf("勇者%d", i), Floor: 20}
			if err := b.UpdateProgress(e); err != nil {
				t.Error(err)
				return
			}
			e.Floor = 1
			if err := b.UpdateProgress(e); err != nil {
				t.Error(err)
			}
			b.Progress()
		}(i)
	}
	workers.Wait()
	restored, err := NewBoard(path)
	if err != nil {
		t.Fatal(err)
	}
	rows := restored.Progress()
	if len(rows) != 24 {
		t.Fatalf("lost heroes: %d", len(rows))
	}
	for _, row := range rows {
		if row.Floor != 20 || row.Rank != 1 {
			t.Fatalf("lost highest floor: %+v", row)
		}
	}
}

func TestProgressIndependentHeroesAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "board.json")
	b, err := NewBoard(path)
	if err != nil {
		t.Fatal(err)
	}
	a := ProgressEntry{ID: "10000000-1000-4000-8000-000000000001", Name: "同名勇者", Floor: 3}
	other := ProgressEntry{ID: "10000000-1000-4000-8000-000000000002", Name: "同名勇者", Floor: 5}
	for _, e := range []ProgressEntry{a, other} {
		if err := b.UpdateProgress(e); err != nil {
			t.Fatal(err)
		}
	}
	a.Name = "改名后的勇者"
	a.Floor = 1
	if err := b.UpdateProgress(a); err != nil {
		t.Fatal(err)
	}
	rows := b.Progress()
	if len(rows) != 2 || rows[0].Floor != 5 || rows[1].Floor != 3 || rows[1].Name != a.Name {
		t.Fatalf("bad progress: %+v", rows)
	}
	a.Floor = 5
	if err := b.UpdateProgress(a); err != nil {
		t.Fatal(err)
	}
	restored, err := NewBoard(path)
	if err != nil {
		t.Fatal(err)
	}
	rows = restored.Progress()
	if len(rows) != 2 || rows[0].Rank != 1 || rows[1].Rank != 1 {
		t.Fatalf("ties/reload: %+v", rows)
	}
	raw, _ := json.Marshal(rows)
	if bytes.Contains(raw, []byte(a.ID)) {
		t.Fatal("public response leaked save identity")
	}
}

func TestProgressAPIValidation(t *testing.T) {
	b, _ := NewBoard("")
	s := newServer(b, t.TempDir(), false).routes()
	for _, tt := range []struct {
		body string
		code int
	}{
		{`{"id":"10000000-1000-4000-8000-000000000001","name":"旅人","floor":7}`, 200},
		{`{"id":"invalid","name":"旅人","floor":7}`, 400},
		{`{"id":"10000000-1000-4000-8000-000000000001","name":"旅人","floor":27}`, 400},
		{`{"id":"10000000-1000-4000-8000-000000000001","name":"旅人","floor":7} {}`, 400},
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/progress", strings.NewReader(tt.body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.ServeHTTP(w, req)
		if w.Code != tt.code {
			t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/progress", nil))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"floor":7`) || strings.Contains(w.Body.String(), `"id"`) {
		t.Fatal(w.Body.String())
	}
}
