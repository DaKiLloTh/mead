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

// Settings holds mead's own app-level preferences (as opposed to Homebrew's,
// which live in Homebrew's own config -- see the Analytics App methods).
type Settings struct {
	CaskAppDir string `json:"caskAppDir"` // blank = brew's default (/Applications)
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
	Settings  Settings            `json:"settings"`
}

func newUserData() *UserData {
	return &UserData{
		Favorites: map[string]bool{},
		Tags:      map[string][]string{},
		Notes:     map[string]string{},
		Snoozed:   map[string]string{},
		History:   []HistoryEntry{},
		Settings:  Settings{},
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
// If the Store has no path (e.g. the in-memory fallback used when
// NewStore fails to initialize a real config dir), persistence is
// disabled and this is a no-op: mutations still take effect in memory,
// they just aren't written to disk.
func (s *Store) saveLocked() error {
	if s.path == "" {
		return nil
	}
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
		Settings:  s.data.Settings,
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

func (s *Store) SetCaskAppDir(dir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Settings.CaskAppDir = dir
	return s.saveLocked()
}

func (s *Store) CaskAppDir() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.data.Settings.CaskAppDir
}

// ClearAll resets everything mead has persisted locally (favorites, tags,
// notes, snoozes, history) but keeps app-level Settings, since "clear my
// data" shouldn't also reset preferences like the cask install directory.
func (s *Store) ClearAll() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	settings := s.data.Settings
	s.data = newUserData()
	s.data.Settings = settings
	return s.saveLocked()
}
