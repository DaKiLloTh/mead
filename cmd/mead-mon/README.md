# mead-mon

A lightweight, standalone macOS menu bar notifier for outdated Homebrew
packages.

This is a separate, minimal process from the main mead.app, not a mode of
it. It has no Wails dependency and no webview: just a tray icon, a polling
loop against `internal/brew`, and native notifications. It shares mead's
`internal/brew` package for the actual "what's outdated" logic, but is
otherwise fully independent of the main app's runtime.

## Building

From the repo root:

```
go build ./cmd/mead-mon
```

This produces a `mead-mon` binary in the current directory.

## Running

```
./mead-mon
```

It adds an icon to your menu bar showing the current count of outdated
Homebrew packages (blank when everything is up to date). Click it to see the
full list, each entry formatted as `name (installed -> latest)`. Use "Quit
mead-mon" in that menu to exit.

On startup it checks immediately, then again on the configured interval
(default: every 60 minutes). Config is loaded once at startup; restart
mead-mon after editing the config file for changes to take effect.

## Config

A small JSON file, created with defaults on first run if it doesn't exist:

```
~/Library/Application Support/mead-mon/config.json
```

```json
{
  "intervalMinutes": 60,
  "greedy": false
}
```

- `intervalMinutes`: how often to check for outdated packages. Values below
  5 minutes are treated as invalid and fall back to the 60-minute default,
  so a config typo can't turn this into a busy loop hammering brew.
- `greedy`: whether to include casks that auto-update in the outdated check
  (mirrors `brew outdated --greedy`, and `internal/brew.Outdated`'s own
  `greedy` parameter).

This is a different directory (and a different file) from the main mead
app's own config (`~/Library/Application Support/mead/store.json`), so the
two never collide.

## Notifications: which approach, and why

mead-mon sends notifications by shelling out to
`osascript -e 'display notification ...'`, not by calling
`UNUserNotificationCenter` directly from Go. That's a deliberate tradeoff,
and it was verified empirically on real hardware rather than assumed. Here
is what was actually tested, in order:

1. **A bare compiled Go binary calling `UNUserNotificationCenter` crashes
   outright.** The moment `+[UNUserNotificationCenter currentNotificationCenter]`
   is touched from a process with no bundle, it throws
   `NSInternalInconsistencyException: bundleProxyForCurrentProcess is nil`
   and the process dies. `UNUserNotificationCenter` requires a real
   `NSBundle` with a `CFBundleIdentifier`, which only exists inside a
   proper `.app` bundle. A bare `go build` binary doesn't have one.

2. **Wrapping the binary in a minimal signed `.app` bundle** (an
   `Info.plist` with `LSUIElement = true` so it doesn't show a Dock icon,
   plus `codesign -s -`) does get past the crash: `currentNotificationCenter`
   returns a real object. But `requestAuthorization` **silently and
   permanently denied, with no permission prompt shown at all**, when the
   bundle was launched from a non-standard location (a scratch build
   directory). No dialog, no way for a user to grant it: `error:
   Notifications are not allowed for this application`.

3. **The same bundle, moved into `~/Applications` and launched via `open`**,
   did trigger a real system permission dialog (confirmed: the process
   stayed alive waiting on the authorization callback, which macOS only
   does while a dialog is pending). That's the correct, working path for
   `UNUserNotificationCenter` -- but it requires a one-time interactive
   human click on a system dialog to grant permission before a single
   notification can be sent.

That last requirement is the deciding factor. Turning "`go build
./cmd/mead-mon` and run it" into "build a signed `.app`, install it in
`/Applications`, launch it once, and click Allow on a system dialog" is a
lot of packaging weight for what's supposed to be a lightweight companion
binary with no install step.

`osascript -e 'display notification'` needs none of that: no bundle, no
codesigning, no fixed install location, no permission dialog to babysit.
Verified end-to-end on this machine (checked in the unified system log,
`usernoted` process): a notification sent this way genuinely goes through
the modern notification pipeline -- it's queued, scheduled, and
"presented ... as banner" through the same delivery path as any other app's
notifications, and it honors Do Not Disturb / Focus. It is not the
deprecated (and since-removed) `NSUserNotification` API.

The one real gap against "modern macOS notification standards" is
attribution: the notification is delivered under the identity of the small
system helper that runs AppleScript commands (visible as its own entry in
System Settings > Notifications, labeled after Script Editor), not under a
"mead-mon" app identity with its own icon. There's no
`UNUserNotificationCenter`-level branding, action buttons, or click-through
handler tied back to mead-mon itself. For a lightweight, no-install-step
companion binary, that's the right tradeoff, but it's worth knowing about.

`notify(title, body string) error` in `notify.go` isolates this behind a
plain function so the polling/diffing logic that decides *when* to notify
can be (and is) unit tested without ever touching `osascript` or the real
OS notification system. See `diff_test.go` and `format_test.go`.

## Testing

```
go test ./cmd/mead-mon/...
```

Config parsing/defaults, the notify-diffing decision (`shouldNotify`), tray
tooltip/menu-line formatting, and the AppleScript string escaping used by
`notify` are all plain functions with real unit tests. The systray wiring,
the actual `osascript` call, and the polling ticker are thin wrappers around
that tested logic and are exercised by actually running the binary, not by
unit tests (matches how the rest of this codebase separates pure logic from
OS/exec calls, e.g. `internal/system`).
