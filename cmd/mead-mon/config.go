// Command mead-mon is a lightweight standalone macOS menu bar notifier for
// outdated Homebrew packages. It is a separate, minimal process from the
// main mead.app: no Wails, no webview, just a tray icon, a polling loop
// against internal/brew, and native notifications.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// defaultIntervalMinutes is used whenever no config file exists yet, or the
// file exists but leaves intervalMinutes unset (zero).
const defaultIntervalMinutes = 60

// minIntervalMinutes guards against a config typo (e.g. "0" or a negative
// number) turning the polling loop into a busy loop that hammers brew.
const minIntervalMinutes = 5

// Config is mead-mon's own tiny persisted settings blob: how often to check
// for outdated packages, and whether that check should be greedy (include
// casks that auto-update, matching internal/brew's Outdated(ctx, greedy)
// parameter).
type Config struct {
	IntervalMinutes int  `json:"intervalMinutes"`
	Greedy          bool `json:"greedy"`
}

// DefaultConfig returns the settings mead-mon uses when no config file
// exists yet.
func DefaultConfig() Config {
	return Config{IntervalMinutes: defaultIntervalMinutes, Greedy: false}
}

// normalize fills in sensible defaults for zero/invalid fields, so a
// hand-edited or partial config file (or one from an older mead-mon version)
// never produces a broken polling interval.
func (c Config) normalize() Config {
	if c.IntervalMinutes < minIntervalMinutes {
		c.IntervalMinutes = defaultIntervalMinutes
	}
	return c
}

// parseConfig decodes raw JSON config bytes into a normalized Config. Split
// out from LoadConfig so the actual parsing/defaulting logic is testable
// without touching the filesystem.
func parseConfig(data []byte) (Config, error) {
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return Config{}, fmt.Errorf("parsing config: %w", err)
	}
	return c.normalize(), nil
}

// configDir mirrors the convention internal/store/store.go uses for the main
// mead app's own config directory (os.UserConfigDir() + a subdirectory under
// it), just with a different subdirectory name so the two never collide.
func configDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "mead-mon"), nil
}

func configPath() (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

// LoadConfig reads mead-mon's config file, creating it with defaults if it
// doesn't exist yet, and normalizing whatever it finds. A missing/unwritable
// config directory is not fatal: mead-mon still runs with in-memory
// defaults, it just can't persist them.
func LoadConfig() Config {
	path, err := configPath()
	if err != nil {
		return DefaultConfig()
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := DefaultConfig()
			_ = writeConfig(path, cfg)
			return cfg
		}
		return DefaultConfig()
	}

	cfg, err := parseConfig(data)
	if err != nil {
		return DefaultConfig()
	}
	return cfg
}

func writeConfig(path string, cfg Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0644)
}
