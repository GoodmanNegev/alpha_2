package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

// IDs stay in the save and on disk; the public list exposes only name/floor/rank.
type ProgressEntry struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Floor int    `json:"floor"`
}

type ProgressRow struct {
	Name  string `json:"name"`
	Floor int    `json:"floor"`
	Rank  int    `json:"rank"`
}

var progressID = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)

func (e *ProgressEntry) validate() error {
	if !progressID.MatchString(e.ID) {
		return invalid("勇者编号无效")
	}
	e.Name = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, e.Name))
	if e.Name == "" {
		e.Name = "无名勇士"
	}
	if !utf8.ValidString(e.Name) || utf8.RuneCountInString(e.Name) > 16 {
		return invalid("名称最多 16 个字")
	}
	if e.Floor < 0 || e.Floor > 26 {
		return invalid("楼层无效")
	}
	return nil
}

func (b *Board) loadProgress() error {
	if b.path == "" {
		return nil
	}
	raw, err := os.ReadFile(b.path + ".progress.json")
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if err = json.Unmarshal(raw, &b.progress); err != nil {
		return err
	}
	for i := range b.progress {
		if err = b.progress[i].validate(); err != nil {
			return err
		}
	}
	sort.SliceStable(b.progress, func(i, j int) bool { return b.progress[i].Floor > b.progress[j].Floor })
	if len(b.progress) > maxEntries {
		b.progress = b.progress[:maxEntries]
	}
	return nil
}

func (b *Board) UpdateProgress(e ProgressEntry) error {
	if err := e.validate(); err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	next := append([]ProgressEntry(nil), b.progress...)
	found := false
	for i := range next {
		if next[i].ID == e.ID {
			if next[i].Floor > e.Floor {
				e.Floor = next[i].Floor
			}
			next[i] = e
			found = true
			break
		}
	}
	if !found {
		next = append(next, e)
	}
	sort.SliceStable(next, func(i, j int) bool { return next[i].Floor > next[j].Floor })
	if len(next) > maxEntries {
		next = next[:maxEntries]
	}
	if b.path != "" {
		if err := os.MkdirAll(filepath.Dir(b.path), 0755); err != nil {
			return err
		}
		raw, err := json.Marshal(next)
		if err != nil {
			return err
		}
		path := b.path + ".progress.json"
		if err = os.WriteFile(path+".tmp", raw, 0644); err != nil {
			return err
		}
		if err = os.Rename(path+".tmp", path); err != nil {
			return err
		}
	}
	b.progress = next
	return nil
}

func (b *Board) Progress() []ProgressRow {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]ProgressRow, 0, len(b.progress))
	rank := 1
	for i, e := range b.progress {
		if i > 0 && e.Floor != b.progress[i-1].Floor {
			rank = i + 1
		}
		out = append(out, ProgressRow{Name: e.Name, Floor: e.Floor, Rank: rank})
	}
	return out
}

func (s *server) handleProgress(w http.ResponseWriter, r *http.Request) {
	if !s.readLim.Allow(clientIP(r, s.trustProxy)) {
		writeError(w, 429, "请求过于频繁")
		return
	}
	if r.Method == http.MethodGet {
		writeJSON(w, 200, apiResponse{Success: true, Data: s.board.Progress()})
		return
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		writeError(w, 415, "需要 application/json")
		return
	}
	var e ProgressEntry
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&e); err != nil {
		writeError(w, 400, "无效的进度数据")
		return
	}
	if err := dec.Decode(new(interface{})); err != io.EOF {
		writeError(w, 400, "无效的进度数据")
		return
	}
	if err := s.board.UpdateProgress(e); err != nil {
		if isValidationError(err) {
			writeError(w, 400, err.Error())
		} else {
			writeError(w, 500, "进度保存失败")
		}
		return
	}
	writeJSON(w, 200, apiResponse{Success: true})
}
