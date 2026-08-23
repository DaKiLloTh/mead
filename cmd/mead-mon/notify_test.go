package main

import "testing"

// These tests exercise appleScriptString, the pure escaping logic that
// notify's osascript invocation depends on for safety. They do not call
// notify itself, since that shells out to osascript and would fire a real
// OS notification -- see notify.go for how that's verified manually.
func TestAppleScriptString(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"plain text", "git", `"git"`},
		{"embedded double quote", `git "stable"`, `"git \"stable\""`},
		{"embedded backslash", `C:\brew`, `"C:\\brew"`},
		{"empty string", "", `""`},
		{"quote and backslash together", `a\"b`, `"a\\\"b"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := appleScriptString(tt.input); got != tt.want {
				t.Errorf("appleScriptString(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
