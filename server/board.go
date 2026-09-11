package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Entry is one finished run.  Only fields the client reports are stored;
// there is no server-side proof of play, so treat the board as a fun list,
// not a competition.
type Entry struct {
	Name   string    `json:"name"`
	Ending string    `json:"ending"` // "normal" | "true"
	PlayMs int64     `json:"playMs"`
	Steps  int       `json:"steps"`
	Kills  int       `json:"kills"`
	Lv     int       `json:"lv"`
	HP     int64     `json:"hp"`
	Atk    int64     `json:"atk"`
	Def    int64     `json:"def"`
	At     time.Time `json:"at"`
}

const (
	maxNameRunes  = 16
	maxEntries    = 500
	minPlayMs     = 60 * 1000        // one minute
	maxPlayMs     = 30 * 24 * 3600e3 // thirty days
	maxStatValue  = 100_000_000
	maxStepsValue = 10_000_000
	maxKillsValue = 10_000
	maxLevelValue = 100_000
)

// ValidationError carries a user-facing (Chinese) message for the API.
type ValidationError struct{ Msg string }

func (v ValidationError) Error() string { return v.Msg }

func invalid(msg string) error { return ValidationError{Msg: msg} }

// Validate normalises the entry and rejects nonsense.
func (e *Entry) Validate() error {
	e.Name = strings.TrimSpace(e.Name)
	if !utf8.ValidString(e.Name) {
		return invalid("名字不是有效的 UTF-8 文本")
	}
	e.Name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, e.Name)
	if e.Name == "" {
		e.Name = "无名勇士"
	}
	if utf8.RuneCountInString(e.Name) > maxNameRunes {
		return invalid("名字太长（最多 16 个字符）")
	}
	if e.Ending != "normal" && e.Ending != "true" {
		return invalid("无效的结局类型")
	}
	if e.PlayMs < minPlayMs || e.PlayMs > maxPlayMs {
		return invalid("通关时间不合理")
	}
	if e.Steps < 0 || e.Steps > maxStepsValue || e.Kills < 0 || e.Kills > maxKillsValue {
		return invalid("步数或击杀数不合理")
	}
	if e.Lv < 1 || e.Lv > maxLevelValue {
		return invalid("等级不合理")
	}
	if e.HP < 0 || e.HP > maxStatValue || e.Atk < 0 || e.Atk > maxStatValue || e.Def < 0 || e.Def > maxStatValue {
		return invalid("属性数值不合理")
	}
	return nil
}

// Board keeps the best runs per ending in memory and mirrors them to a JSON
// file with atomic writes.
type Board struct {
	mu       sync.Mutex
	path     string
	entries  []Entry
	progress []ProgressEntry
}

func NewBoard(path string) (*Board, error) {
	b := &Board{path: path}
	if err := b.loadProgress(); err != nil {
		return nil, err
	}
	if path == "" {
		return b, nil
	}
	raw, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return b, nil
	case err != nil:
		return nil, fmt.Errorf("read leaderboard: %w", err)
	}
	if len(raw) == 0 {
		return b, nil
	}
	if err := json.Unmarshal(raw, &b.entries); err != nil {
		return nil, fmt.Errorf("parse leaderboard %s: %w", path, err)
	}
	b.sortLocked()
	return b, nil
}

func (b *Board) sortLocked() {
	sort.SliceStable(b.entries, func(i, j int) bool {
		return b.entries[i].PlayMs < b.entries[j].PlayMs
	})
}

// Add inserts a validated entry and returns its 1-based rank within its ending.
func (b *Board) Add(e Entry) (int, error) {
	if err := e.Validate(); err != nil {
		return 0, err
	}
	if e.At.IsZero() {
		e.At = time.Now().UTC()
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.entries = append(b.entries, e)
	b.sortLocked()
	if len(b.entries) > maxEntries {
		b.entries = b.entries[:maxEntries]
	}
	rank := 0
	found := false
	for _, x := range b.entries {
		if x.Ending != e.Ending {
			continue
		}
		rank++
		if x == e {
			found = true
			break
		}
	}
	if !found {
		rank = 0 // fell off the board
	}
	if err := b.persistLocked(); err != nil {
		return rank, err
	}
	return rank, nil
}

// Top returns up to limit entries for the given ending ("" = all).
func (b *Board) Top(ending string, limit int) []Entry {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]Entry, 0, limit)
	for _, e := range b.entries {
		if ending != "" && e.Ending != ending {
			continue
		}
		out = append(out, e)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func (b *Board) persistLocked() error {
	if b.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(b.path), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(b.entries)
	if err != nil {
		return err
	}
	tmp := b.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, b.path)
}
