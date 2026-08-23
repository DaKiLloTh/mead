package main

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Notification approach
//
// mead-mon sends notifications by shelling out to
// `osascript -e 'display notification ...'` rather than calling
// UNUserNotificationCenter directly. That's a deliberate tradeoff, verified
// empirically on this machine rather than assumed, and documented in the
// README:
//
//   - A bare compiled Go binary crashes outright the moment it touches
//     UNUserNotificationCenter (NSInternalInconsistencyException,
//     "bundleProxyForCurrentProcess is nil"), because the API requires a
//     real NSBundle with a CFBundleIdentifier, which only exists inside a
//     proper .app bundle.
//   - Wrapping the binary in a minimal signed .app bundle (Info.plist +
//     LSUIElement) does get a real UNUserNotificationCenter instance, but
//     requestAuthorization silently and permanently denies with no prompt
//     at all when the bundle is launched from a non-standard path (a temp
//     build directory). Moved into ~/Applications and launched via `open`,
//     it does trigger a genuine system permission dialog -- but that
//     dialog requires a one-time interactive human click to grant, which
//     an unattended `go build && ./mead-mon` workflow can't satisfy, and
//     which turns "go build ./cmd/mead-mon" into "build a signed .app,
//     install it in /Applications, launch it once, and click Allow"
//     before a single notification works.
//
// `osascript -e 'display notification'` needs none of that: no bundle, no
// codesigning, no install location, no permission dialog to babysit. It's
// still routed through the modern system notification pipeline (it shows up
// in Notification Center and honors Do Not Disturb/Focus, not the
// deprecated-and-removed NSUserNotification API), the one real gap against
// "modern macOS notification standards" is that the notification is
// attributed to the small system helper that runs osascript's AppleScript
// commands (visible as its own entry in System Settings > Notifications),
// not to a "mead-mon" app identity with its own icon -- there is no
// UNUserNotificationCenter-level branding or click-through action tied back
// to mead-mon itself. For a lightweight, no-install-step companion binary,
// that's the right tradeoff.

// notifyTimeout bounds how long the osascript subprocess is allowed to run,
// so a hung/blocked notification helper can never wedge the polling loop.
const notifyTimeout = 5 * time.Second

// notify sends a native macOS notification with the given title and body.
// It is a thin wrapper around the `osascript` CLI; see the Notification
// approach note above for why. Kept isolated from the polling/diffing logic
// so that logic (shouldNotify, outdatedNames, notificationBody) can be unit
// tested without actually triggering OS notifications.
func notify(title, body string) error {
	script := fmt.Sprintf(
		`display notification %s with title %s`,
		appleScriptString(body),
		appleScriptString(title),
	)
	ctx, cancel := context.WithTimeout(context.Background(), notifyTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "osascript", "-e", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("sending notification: %s", msg)
	}
	return nil
}

// appleScriptString quotes and escapes an arbitrary string for safe
// embedding as a double-quoted AppleScript string literal (escaping
// backslashes and double quotes; AppleScript string literals don't support
// other C-style escapes, and package/version names never contain control
// characters that would need them). Split out from notify so the escaping
// itself -- the part that's actually worth getting right, since a package
// name could theoretically contain a quote -- is unit testable without
// shelling out.
func appleScriptString(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}
