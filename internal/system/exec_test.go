package system

import (
	"context"
	"strings"
	"testing"
)

func TestRunCmd_Success(t *testing.T) {
	out, err := RunCmd(context.Background(), "echo", "hello")
	if err != nil {
		t.Fatalf("RunCmd(echo) returned error: %v", err)
	}
	if strings.TrimSpace(out) != "hello" {
		t.Errorf("RunCmd(echo) output = %q, want %q", out, "hello")
	}
}

func TestRunCmd_NotFound(t *testing.T) {
	_, err := RunCmd(context.Background(), "definitely-not-a-real-binary-xyz")
	if err == nil {
		t.Fatal("RunCmd with a nonexistent binary returned nil error, want an error")
	}
}
