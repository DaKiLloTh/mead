package security

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"mead/internal/system"
)

// cfBundleIconFileRe extracts the CFBundleIconFile value from an Info.plist
// that's already been normalized to XML text (see readCFBundleIconFile
// below) -- Info.plist ships as either XML or binary property-list format,
// and `plutil -convert xml1` normalizes either into predictable XML text,
// so this regex only ever has to understand the XML shape, never the
// binary plist format itself.
var cfBundleIconFileRe = regexp.MustCompile(`(?s)<key>CFBundleIconFile</key>\s*<string>([^<]*)</string>`)

// parseCFBundleIconFile pulls the CFBundleIconFile value out of an
// Info.plist's XML text. It's a narrow regex rather than a full plist
// parser -- deliberately, since this is the one key mead ever needs out of
// Info.plist -- and returns "" if the key isn't present (or is present but
// empty), which callers treat as "no icon determinable" rather than as an
// error worth surfacing.
func parseCFBundleIconFile(plistXML string) string {
	m := cfBundleIconFileRe.FindStringSubmatch(plistXML)
	if m == nil {
		return ""
	}
	return strings.TrimSpace(m[1])
}

// readCFBundleIconFile shells out to `plutil -convert xml1 -o -` to read an
// app bundle's Info.plist regardless of whether it's stored as XML or
// binary (bplist00) on disk -- both are common depending on how the app was
// built -- and extracts CFBundleIconFile from the normalized XML text.
func readCFBundleIconFile(ctx context.Context, plistPath string) (string, error) {
	xmlOut, err := system.RunCmd(ctx, "plutil", "-convert", "xml1", "-o", "-", plistPath)
	if err != nil {
		return "", fmt.Errorf("couldn't read Info.plist: %w", err)
	}
	iconFile := parseCFBundleIconFile(xmlOut)
	if iconFile == "" {
		return "", fmt.Errorf("no CFBundleIconFile in %s", plistPath)
	}
	return iconFile, nil
}

// resolveIconFilePath finds the actual icon file inside an app bundle's
// Contents/Resources for a given CFBundleIconFile value. macOS lets
// bundles list that value with or without the ".icns" extension, so both
// forms are tried.
func resolveIconFilePath(appPath, iconFile string) (string, error) {
	if iconFile == "" {
		return "", fmt.Errorf("no CFBundleIconFile value")
	}
	resourcesDir := filepath.Join(appPath, "Contents", "Resources")
	candidate := filepath.Join(resourcesDir, iconFile)
	if _, err := os.Stat(candidate); err == nil {
		return candidate, nil
	}
	if !strings.HasSuffix(strings.ToLower(iconFile), ".icns") {
		withExt := candidate + ".icns"
		if _, err := os.Stat(withExt); err == nil {
			return withExt, nil
		}
	}
	return "", fmt.Errorf("icon file %q not found in %s", iconFile, resourcesDir)
}

// ExtractAppIcon reads an app bundle's Info.plist to find its
// CFBundleIconFile, converts the referenced .icns to a PNG via `sips` (a
// local shell-out to a macOS built-in tool -- no network, no new
// dependency), and returns it as a base64 "data:image/png;base64,..." URI
// ready to hand straight to an <img> tag across the Wails RPC boundary.
//
// Any failure along the way -- a missing or corrupt Info.plist, no icon
// key, a missing .icns file, a `sips` failure -- is returned as a plain
// error. Callers are expected to treat that as "no icon" and fall back to
// a generated placeholder (the colored monogram tile) rather than surface
// it as a hard failure or let it block anything else from rendering.
func ExtractAppIcon(ctx context.Context, appPath string) (string, error) {
	if appPath == "" {
		return "", fmt.Errorf("no app path given")
	}
	plistPath := filepath.Join(appPath, "Contents", "Info.plist")
	if _, err := os.Stat(plistPath); err != nil {
		return "", fmt.Errorf("no Info.plist at %s", plistPath)
	}

	iconFile, err := readCFBundleIconFile(ctx, plistPath)
	if err != nil {
		return "", err
	}
	icnsPath, err := resolveIconFilePath(appPath, iconFile)
	if err != nil {
		return "", err
	}

	tmpDir, err := os.MkdirTemp("", "mead-icon-*")
	if err != nil {
		return "", err
	}
	defer func() { _ = os.RemoveAll(tmpDir) }()
	pngPath := filepath.Join(tmpDir, "icon.png")

	if out, err := system.RunCmd(ctx, "sips", "-s", "format", "png", icnsPath, "--out", pngPath); err != nil {
		msg := strings.TrimSpace(out)
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("sips conversion failed: %s", msg)
	}

	data, err := os.ReadFile(pngPath)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data), nil
}

// OpenApp launches an app bundle via `open`, as if the user had
// double-clicked it in Finder -- distinct from RevealInFinder (`open -R`),
// which only selects the app there without launching it.
func OpenApp(ctx context.Context, path string) error {
	if path == "" {
		return fmt.Errorf("no path to open")
	}
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("not found: %s", path)
	}
	_, err := system.RunCmd(ctx, "open", path)
	return err
}
