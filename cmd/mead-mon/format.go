package main

import (
	"fmt"

	"mead/internal/brew"
)

// tooltipText formats the tray icon's tooltip/title for a given outdated
// count.
func tooltipText(count int) string {
	switch count {
	case 0:
		return "mead-mon: up to date"
	case 1:
		return "mead-mon: 1 update available"
	default:
		return fmt.Sprintf("mead-mon: %d updates available", count)
	}
}

// menuLine formats one outdated package as a "name (old -> new)" entry for
// the tray's expandable list.
func menuLine(p brew.OutdatedPackage) string {
	installed := "unknown"
	if len(p.InstalledVersions) > 0 {
		installed = p.InstalledVersions[len(p.InstalledVersions)-1]
	}
	current := p.CurrentVersion
	if current == "" {
		current = "unknown"
	}
	return fmt.Sprintf("%s (%s -> %s)", p.Name, installed, current)
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
