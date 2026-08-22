package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// HistoryEntry records one completed brew action for the activity log.
type HistoryEntry struct {
	Time    string `json:"time"`
	Action  string `json:"action"`
	Name    string `json:"name"`
	IsCask  bool   `json:"isCask"`
	Success bool   `json:"success"`
}

// UserData is the small, locally persisted blob of user preferences that
// Homebrew itself has no concept of (favorites, tags, notes, snoozes, and
// a log of what mead has done).
type UserData struct {
	Favorites map[string]bool     `json:"favorites"`
	Tags      map[string][]string `json:"tags"`
	Notes     map[string]string   `json:"notes"`
	Snoozed   map[string]string   `json:"snoozed"` // key -> RFC3339 "snoozed until"
	History   []HistoryEntry      `json:"history"`
}

func newUserData() *UserData {
	return &UserData{
		Favorites: map[string]bool{},
		Tags:      map[string][]string{},
		Notes:     map[string]string{},
		Snoozed:   map[string]string{},
		History:   []HistoryEntry{},
	}
}

// Store persists UserData to a JSON file under the user's app-support dir.
type Store struct {
	mu   sync.Mutex
	path string
	data *UserData
}

func pkgKey(name string, isCask bool) string {
	if isCask {
		return "cask:" + name
	}
	return "formula:" + name
}

func NewStore() (*Store, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = os.TempDir()
	}
	appDir := filepath.Join(dir, "mead")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, err
	}
	s := &Store{path: filepath.Join(appDir, "store.json"), data: newUserData()}
	s.load()
	return s, nil
}

func (s *Store) load() {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	var d UserData
	if err := json.Unmarshal(raw, &d); err != nil {
		return
	}
	if d.Favorites == nil {
		d.Favorites = map[string]bool{}
	}
	if d.Tags == nil {
		d.Tags = map[string][]string{}
	}
	if d.Notes == nil {
		d.Notes = map[string]string{}
	}
	if d.Snoozed == nil {
		d.Snoozed = map[string]string{}
	}
	if d.History == nil {
		d.History = []HistoryEntry{}
	}
	s.data = &d
}

// saveLocked writes the current data to disk. Caller must hold s.mu.
func (s *Store) saveLocked() error {
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, raw, 0644)
}

func (s *Store) Snapshot() UserData {
	s.mu.Lock()
	defer s.mu.Unlock()
	// shallow copy of maps so callers can't mutate our internal state
	cp := UserData{
		Favorites: map[string]bool{},
		Tags:      map[string][]string{},
		Notes:     map[string]string{},
		Snoozed:   map[string]string{},
		History:   append([]HistoryEntry{}, s.data.History...),
	}
	for k, v := range s.data.Favorites {
		cp.Favorites[k] = v
	}
	for k, v := range s.data.Tags {
		cp.Tags[k] = append([]string{}, v...)
	}
	for k, v := range s.data.Notes {
		cp.Notes[k] = v
	}
	for k, v := range s.data.Snoozed {
		cp.Snoozed[k] = v
	}
	return cp
}

func (s *Store) ToggleFavorite(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.data.Favorites[key] {
		delete(s.data.Favorites, key)
	} else {
		s.data.Favorites[key] = true
	}
	return s.saveLocked()
}

func (s *Store) SetTags(key string, tags []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(tags) == 0 {
		delete(s.data.Tags, key)
	} else {
		s.data.Tags[key] = tags
	}
	return s.saveLocked()
}

func (s *Store) SetNote(key string, note string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if note == "" {
		delete(s.data.Notes, key)
	} else {
		s.data.Notes[key] = note
	}
	return s.saveLocked()
}

func (s *Store) Snooze(key string, until time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Snoozed[key] = until.Format(time.RFC3339)
	return s.saveLocked()
}

func (s *Store) Unsnooze(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data.Snoozed, key)
	return s.saveLocked()
}

const maxHistoryEntries = 500

func (s *Store) AppendHistory(entry HistoryEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.History = append(s.data.History, entry)
	if len(s.data.History) > maxHistoryEntries {
		s.data.History = s.data.History[len(s.data.History)-maxHistoryEntries:]
	}
	_ = s.saveLocked()
}

func (s *Store) ClearHistory() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.History = []HistoryEntry{}
	return s.saveLocked()
}
