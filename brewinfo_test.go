package main

import (
	"errors"
	"testing"
)

func TestBuildSystemInfo_Success(t *testing.T) {
	base := &SystemInfo{
		BrewPath:    "/opt/homebrew/bin/brew",
		BrewVersion: "Homebrew 4.0.0",
		Prefix:      "/opt/homebrew",
		Cellar:      "/opt/homebrew/Cellar",
		Caskroom:    "/opt/homebrew/Caskroom",
	}
	installed := []BrewPackage{
		{Name: "wget", IsCask: false},
		{Name: "git", IsCask: false, Deprecated: true},
		{Name: "firefox", IsCask: true},
		{Name: "docker", IsCask: true, Disabled: true},
		{Name: "python@3.9", IsCask: false, Pinned: true},
	}
	outdated := []OutdatedPackage{
		{Name: "wget"},
		{Name: "firefox"},
	}

	info, err := buildSystemInfo(base, installed, nil, outdated, nil)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}

	if info.InstalledForm != 3 {
		t.Errorf("InstalledForm = %d, want 3", info.InstalledForm)
	}
	if info.InstalledCask != 2 {
		t.Errorf("InstalledCask = %d, want 2", info.InstalledCask)
	}
	if info.OutdatedCount != 2 {
		t.Errorf("OutdatedCount = %d, want 2", info.OutdatedCount)
	}
	if info.DeprecatedCount != 1 {
		t.Errorf("DeprecatedCount = %d, want 1", info.DeprecatedCount)
	}
	if info.DisabledCount != 1 {
		t.Errorf("DisabledCount = %d, want 1", info.DisabledCount)
	}
	if info.PinnedCount != 1 {
		t.Errorf("PinnedCount = %d, want 1", info.PinnedCount)
	}

	// Base fields should pass through untouched.
	if info.BrewPath != base.BrewPath || info.BrewVersion != base.BrewVersion || info.Prefix != base.Prefix {
		t.Errorf("base fields not preserved: got %+v", info)
	}
}

func TestBuildSystemInfo_EmptySystem(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}

	info, err := buildSystemInfo(base, []BrewPackage{}, nil, []OutdatedPackage{}, nil)
	if err != nil {
		t.Fatalf("expected no error for a genuinely empty system, got %v", err)
	}
	if info.InstalledForm != 0 || info.InstalledCask != 0 || info.OutdatedCount != 0 {
		t.Errorf("expected all-zero counts for empty system, got %+v", info)
	}
}

func TestBuildSystemInfo_ListInstalledError(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	wantErr := errors.New("brew: command not found")

	info, err := buildSystemInfo(base, nil, wantErr, []OutdatedPackage{}, nil)
	if err == nil {
		t.Fatal("expected an error when ListInstalled fails, got nil")
	}
	if info != nil {
		t.Errorf("expected nil info on error, got %+v", info)
	}
	if !errors.Is(err, wantErr) {
		t.Errorf("expected returned error to wrap %v, got %v", wantErr, err)
	}
}

func TestBuildSystemInfo_OutdatedError(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	wantErr := errors.New("brew: timeout")
	installed := []BrewPackage{{Name: "wget"}}

	info, err := buildSystemInfo(base, installed, nil, nil, wantErr)
	if err == nil {
		t.Fatal("expected an error when Outdated fails, got nil")
	}
	if info != nil {
		t.Errorf("expected nil info on error, got %+v", info)
	}
	if !errors.Is(err, wantErr) {
		t.Errorf("expected returned error to wrap %v, got %v", wantErr, err)
	}
}

func TestBuildSystemInfo_BothFail_ListInstalledErrorTakesPrecedence(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	listErr := errors.New("list failed")
	outdatedErr := errors.New("outdated failed")

	_, err := buildSystemInfo(base, nil, listErr, nil, outdatedErr)
	if err == nil {
		t.Fatal("expected an error when both sub-calls fail, got nil")
	}
	if !errors.Is(err, listErr) {
		t.Errorf("expected the ListInstalled error to be the one surfaced, got %v", err)
	}
}
