package brew

import (
	"context"
	"path/filepath"
	"regexp"
	"strings"

	"mead/internal/system"
)

// cfBundleShortVersionRe and cfBundleVersionRe extract the two possible
// version keys from an Info.plist that's already been normalized to XML
// text via `plutil -convert xml1` (see readInstalledAppVersion below).
//
// This mirrors the plutil-based plist reading in
// internal/security/icons.go (readPlistXML / parseCFBundleIconFile) --
// same tool, same "shell out to plutil, then run a narrow regex over the
// normalized XML" shape. It isn't reused directly: internal/security
// already imports this package (for leftover-cask lookups in
// leftovers.go), so this package importing internal/security back would
// be an import cycle. This is a small local copy of that same established
// technique, not a new approach.
var cfBundleShortVersionRe = regexp.MustCompile(`(?s)<key>CFBundleShortVersionString</key>\s*<string>([^<]*)</string>`)
var cfBundleVersionRe = regexp.MustCompile(`(?s)<key>CFBundleVersion</key>\s*<string>([^<]*)</string>`)

// parseInstalledAppVersion pulls an installed app's own version out of its
// Info.plist's normalized XML text. CFBundleShortVersionString (the
// user-facing "1.2.3" version) is preferred; CFBundleVersion (often just a
// build number) is used as a fallback when the short version key isn't
// present, since not every app sets both. Returns "" if neither key is
// present.
func parseInstalledAppVersion(plistXML string) string {
	if m := cfBundleShortVersionRe.FindStringSubmatch(plistXML); m != nil {
		if v := strings.TrimSpace(m[1]); v != "" {
			return v
		}
	}
	if m := cfBundleVersionRe.FindStringSubmatch(plistXML); m != nil {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// readInstalledAppVersion shells out to `plutil -convert xml1 -o -` to
// read an app bundle's Info.plist (handling both XML and binary plist
// storage) and returns its own version via parseInstalledAppVersion.
// Returns "" rather than an error on any failure -- missing Info.plist,
// unreadable plist, neither version key present -- since a version mead
// can't determine is treated the same as "not shown" throughout the adopt
// flow rather than a hard failure that would block the rest of the scan.
func readInstalledAppVersion(ctx context.Context, appPath string) string {
	plistPath := filepath.Join(appPath, "Contents", "Info.plist")
	out, err := system.RunCmd(ctx, "plutil", "-convert", "xml1", "-o", "-", plistPath)
	if err != nil {
		return ""
	}
	return parseInstalledAppVersion(out)
}
