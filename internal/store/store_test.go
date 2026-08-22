package store

import "testing"

// TestStoreEmptyPathIsUnpersistedNotBroken exercises the fallback path used
// by app.New when NewStore fails to initialize a real config directory: a
// Store constructed directly with an empty path (persistence disabled)
// should still accept mutations and reflect them in memory, rather than
// returning an error from every call because saveLocked unconditionally
// tries to write to an empty path.
func TestStoreEmptyPathIsUnpersistedNotBroken(t *testing.T) {
	s := &Store{data: newUserData()}

	if err := s.ToggleFavorite("cask:some-app"); err != nil {
		t.Fatalf("ToggleFavorite on in-memory store returned error: %v", err)
	}

	snap := s.Snapshot()
	if !snap.Favorites["cask:some-app"] {
		t.Fatalf("expected favorite to be set in memory, snapshot = %+v", snap.Favorites)
	}

	// A second mutation (unfavoriting) should likewise succeed and be
	// reflected.
	if err := s.ToggleFavorite("cask:some-app"); err != nil {
		t.Fatalf("ToggleFavorite (unset) on in-memory store returned error: %v", err)
	}
	if s.Snapshot().Favorites["cask:some-app"] {
		t.Fatalf("expected favorite to be cleared in memory")
	}

	// Other mutating methods should behave the same way.
	if err := s.SetNote("formula:foo", "hello"); err != nil {
		t.Fatalf("SetNote on in-memory store returned error: %v", err)
	}
	if got := s.Snapshot().Notes["formula:foo"]; got != "hello" {
		t.Fatalf("expected note to be set in memory, got %q", got)
	}
}

// TestStoreImportReplacesDataButKeepsSettings covers the main precedent
// Import is expected to follow (matching ClearAll): a valid import replaces
// favorites/tags/notes/snoozes/history wholesale, but an existing
// Settings.CaskAppDir survives untouched.
func TestStoreImportReplacesDataButKeepsSettings(t *testing.T) {
	s := &Store{data: newUserData()}

	// Seed some existing state, including a Settings value that a naive
	// import (one that didn't special-case Settings) would clobber.
	if err := s.ToggleFavorite("cask:old-app"); err != nil {
		t.Fatalf("seed ToggleFavorite: %v", err)
	}
	if err := s.SetCaskAppDir("/Users/me/Applications"); err != nil {
		t.Fatalf("seed SetCaskAppDir: %v", err)
	}

	imported := UserData{
		Favorites: map[string]bool{"cask:new-app": true},
		Tags:      map[string][]string{"formula:foo": {"dev"}},
		Notes:     map[string]string{"formula:foo": "a note"},
		Snoozed:   map[string]string{"cask:bar": "2099-01-01T00:00:00Z"},
		History:   []HistoryEntry{{Time: "2099-01-01T00:00:00Z", Action: "install", Name: "foo"}},
		// An imported Settings value should be ignored -- the current
		// CaskAppDir must survive, not this bogus one.
		Settings: Settings{CaskAppDir: "/should/not/be/used"},
	}

	if err := s.Import(imported); err != nil {
		t.Fatalf("Import returned error for well-formed data: %v", err)
	}

	snap := s.Snapshot()
	if snap.Favorites["cask:old-app"] {
		t.Fatalf("expected old favorite to be replaced, snapshot = %+v", snap.Favorites)
	}
	if !snap.Favorites["cask:new-app"] {
		t.Fatalf("expected imported favorite to be present, snapshot = %+v", snap.Favorites)
	}
	if got := snap.Tags["formula:foo"]; len(got) != 1 || got[0] != "dev" {
		t.Fatalf("expected imported tags, got %+v", got)
	}
	if got := snap.Notes["formula:foo"]; got != "a note" {
		t.Fatalf("expected imported note, got %q", got)
	}
	if got := snap.Snoozed["cask:bar"]; got != "2099-01-01T00:00:00Z" {
		t.Fatalf("expected imported snooze, got %q", got)
	}
	if len(snap.History) != 1 || snap.History[0].Name != "foo" {
		t.Fatalf("expected imported history, got %+v", snap.History)
	}
	if got := snap.Settings.CaskAppDir; got != "/Users/me/Applications" {
		t.Fatalf("expected existing Settings.CaskAppDir to survive import, got %q", got)
	}
}

// TestStoreImportRejectsGarbage covers the other half: data that doesn't
// look like a genuine UserData export (e.g. the zero value, which is what
// unrelated/garbage JSON unmarshals into) must be rejected, and rejecting
// it must not disturb whatever the store already had.
func TestStoreImportRejectsGarbage(t *testing.T) {
	s := &Store{data: newUserData()}

	if err := s.ToggleFavorite("cask:keep-me"); err != nil {
		t.Fatalf("seed ToggleFavorite: %v", err)
	}

	if err := s.Import(UserData{}); err == nil {
		t.Fatalf("expected Import to reject the zero-value UserData, got nil error")
	}

	snap := s.Snapshot()
	if !snap.Favorites["cask:keep-me"] {
		t.Fatalf("expected existing state to survive a rejected import, snapshot = %+v", snap.Favorites)
	}
}
