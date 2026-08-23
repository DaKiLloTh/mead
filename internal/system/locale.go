package system

import (
	"context"
	"strings"
)

// SystemLocale returns the current macOS user's preferred locale (e.g.
// "en-US"), or "" if it can't be determined.
//
// This exists because the frontend runs inside a Wails-managed WKWebView,
// not a real browser: WKWebView's `navigator.language` does not reliably
// track the user's actual System Settings > General > Language & Region
// preference the way Safari or Chrome do -- it can lag behind or default to
// "en-US" regardless of the system setting, depending on how the webview
// was initialized. `defaults read -g AppleLocale` reads the same
// AppleLocale preference macOS itself uses for per-app localization, so
// it's the more reliable signal here. The frontend calls this once at
// startup and falls back to browser-based detection if it fails or comes
// back empty.
func SystemLocale(ctx context.Context) string {
	out, err := RunCmd(ctx, "defaults", "read", "-g", "AppleLocale")
	if err != nil {
		return ""
	}
	return normalizeLocale(out)
}

// normalizeLocale turns the raw output of `defaults read -g AppleLocale`
// (e.g. "en_US\n" or "zh_Hans_CN@calendar=chinese") into a BCP-47-ish tag
// i18next can consume ("en-US", "zh-Hans-CN"): trims whitespace, drops any
// "@..." variant suffix (AppleLocale can carry calendar/currency overrides
// there that aren't part of the language tag), and swaps underscores for
// hyphens.
func normalizeLocale(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if i := strings.IndexByte(s, '@'); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	return strings.ReplaceAll(s, "_", "-")
}
