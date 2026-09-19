package jobs

import (
	"reflect"
	"testing"
)

// TestSplitPTYChunk covers the one genuinely new, risky bit of StartMas's
// pty-based streaming: a chunk with no trailing newline at all (like sudo's
// "Password:" prompt) must still come back as a line, not be withheld
// waiting for a delimiter that will never arrive before the user responds.
func TestSplitPTYChunk(t *testing.T) {
	tests := []struct {
		name  string
		chunk string
		want  []string
	}{
		{"empty chunk", "", nil},
		{"only whitespace/newlines", "\n\r\n", nil},
		{
			name:  "prompt with no trailing newline still comes back as a line",
			chunk: "Password:",
			want:  []string{"Password:"},
		},
		{
			name:  "single complete line",
			chunk: "Installing Xcode...\n",
			want:  []string{"Installing Xcode..."},
		},
		{
			name:  "multiple complete lines in one read",
			chunk: "line one\nline two\r\nline three\n",
			want:  []string{"line one", "line two", "line three"},
		},
		{
			name:  "complete lines plus a trailing unterminated prompt",
			chunk: "Downloading...\nInstalling...\nPassword:",
			want:  []string{"Downloading...", "Installing...", "Password:"},
		},
		{
			name:  "blank lines within a chunk are dropped, same as pipe's scanLines",
			chunk: "one\n\ntwo\n",
			want:  []string{"one", "two"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitPTYChunk([]byte(tt.chunk))
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("splitPTYChunk(%q) = %#v, want %#v", tt.chunk, got, tt.want)
			}
		})
	}
}

// TestSendInputOnUnknownJob guards SendInput's failure path: it must report
// false rather than panicking or silently succeeding when asked to answer a
// job id that isn't a currently-running interactive job (already finished,
// never existed, or was a plain non-pty job in the first place).
func TestSendInputOnUnknownJob(t *testing.T) {
	jm := NewManager()
	if jm.SendInput("does-not-exist", "hunter2") {
		t.Error("SendInput on an unknown job id returned true, want false")
	}
}

func TestSplitPTYChunkStripsEscapeSequences(t *testing.T) {
	got := splitPTYChunk([]byte("\r\x1b[2K\x1b[1mPassword:\x1b[0m"))
	want := []string{"Password:"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("splitPTYChunk = %#v, want %#v", got, want)
	}
}
