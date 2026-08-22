package main

import "testing"

// TestStoreEmptyPathIsUnpersistedNotBroken exercises the fallback path used
// by NewApp when NewStore fails to initialize a real config directory: a
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
