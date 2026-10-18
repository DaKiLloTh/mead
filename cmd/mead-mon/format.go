package main

import (
	"fmt"
	"strconv"
)

// status is everything the tray shows, gathered in one place so menuView
// can turn it into menu text without touching systray.
type status struct {
	// count is the number of outdated packages from the last successful
	// check. Meaningless until checked is true.
	count     int
	checked   bool
	checking  bool
	upgrading bool
	// checkFailed is true when the most recent check errored. The last good
	// count, if any, is kept and still shown.
	checkFailed bool
}

// view is the rendered tray: which mug glyph to show, the text beside it,
// the disabled header line at the top of the menu, and the Update all item.
type view struct {
	// alert picks the mug with the exclamation mark, shown whenever the last
	// good check found updates.
	alert            bool
	badge            string
	header           string
	updateAllTitle   string
	updateAllEnabled bool
}

func menuView(s status) view {
	v := view{
		badge:          countBadge(s.count),
		header:         countText(s.count),
		updateAllTitle: "Update all",
	}
	switch {
	case s.upgrading:
		v.header = "Updating…"
		v.updateAllTitle = "Updating…"
	case !s.checked && s.checking:
		v.header = "Checking for updates…"
	case !s.checked && s.checkFailed:
		v.header = "Couldn't check for updates"
	case !s.checked:
		v.header = "Not checked yet"
	case s.checkFailed:
		v.header = countText(s.count) + " (last check failed)"
	}
	if !s.checked {
		v.badge = ""
	}
	v.alert = s.checked && s.count > 0
	v.updateAllEnabled = s.checked && s.count > 0 && !s.checking && !s.upgrading
	return v
}

// countText is the menu's header line for a known outdated count.
func countText(count int) string {
	switch count {
	case 0:
		return "Up to date"
	case 1:
		return "1 update available"
	default:
		return fmt.Sprintf("%d updates available", count)
	}
}

// countBadge is the short text shown directly next to the tray icon, blank
// when there's nothing to update so the icon stands alone.
func countBadge(count int) string {
	if count == 0 {
		return ""
	}
	return strconv.Itoa(count)
}

// upgradeArgs is the brew command Update all runs, matching the main app's
// UpgradeAll in internal/app.
func upgradeArgs(greedy bool) []string {
	if greedy {
		return []string{"upgrade", "--greedy"}
	}
	return []string{"upgrade"}
}

// openMeadArgs launches (or brings forward) the main mead app.
func openMeadArgs() []string {
	return []string{"-a", "mead"}
}

// upgradeResultText is the notification body after Update all finishes.
func upgradeResultText(err error) string {
	if err == nil {
		return "All packages are up to date."
	}
	return "Update all failed: " + err.Error()
}

// notificationBody formats the body text for a "packages changed" native
// notification, listing up to a handful of names before summarizing the
// rest so the notification stays readable.
func notificationBody(names []string) string {
	const maxListed = 5
	if len(names) == 0 {
		return "No outdated packages."
	}
	if len(names) <= maxListed {
		return joinWithCommas(names)
	}
	shown := joinWithCommas(names[:maxListed])
	return fmt.Sprintf("%s, and %d more", shown, len(names)-maxListed)
}

func joinWithCommas(names []string) string {
	out := ""
	for i, n := range names {
		if i > 0 {
			out += ", "
		}
		out += n
	}
	return out
}
