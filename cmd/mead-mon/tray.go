package main

import (
	"log"
	"strconv"

	"github.com/getlantern/systray"

	"mead/internal/brew"
)

// maxMenuSlots caps how many outdated-package rows the tray menu can show.
// getlantern/systray has no API to remove a menu item once added, only to
// hide/show it, so the menu is built once with this many pre-created hidden
// slots and each refresh just updates and shows/hides them. Homebrew
// installs rarely have anywhere near this many packages outdated at once;
// if they do, the header count is still accurate even though the list is
// truncated.
const maxMenuSlots = 60

// tray owns all the systray state: the always-visible header item (shows
// the current count), the pre-created package-row slots, and the quit item.
// Everything here is a thin wrapper around the systray library; the actual
// formatting logic it calls into (tooltipText, menuLine) is pure and tested
// separately.
type tray struct {
	header *systray.MenuItem
	slots  []*systray.MenuItem
	quit   *systray.MenuItem
}

func newTray() *tray {
	header := systray.AddMenuItem(tooltipText(0), "")
	header.Disable()
	systray.AddSeparator()

	slots := make([]*systray.MenuItem, maxMenuSlots)
	for i := range slots {
		slots[i] = systray.AddMenuItem("", "")
		slots[i].Hide()
	}

	systray.AddSeparator()
	quit := systray.AddMenuItem("Quit mead-mon", "")

	return &tray{header: header, slots: slots, quit: quit}
}

// update refreshes the header count and the package-row slots to reflect
// the current outdated list, and sets the icon title/tooltip so the count
// is visible without even opening the menu.
func (t *tray) update(pkgs []brew.OutdatedPackage) {
	systray.SetTitle(countBadge(len(pkgs)))
	systray.SetTooltip(tooltipText(len(pkgs)))
	t.header.SetTitle(tooltipText(len(pkgs)))

	for i, slot := range t.slots {
		if i < len(pkgs) {
			slot.SetTitle(menuLine(pkgs[i]))
			slot.Show()
		} else {
			slot.Hide()
		}
	}

	if len(pkgs) > len(t.slots) {
		log.Printf("mead-mon: %d outdated packages, showing first %d in the tray menu", len(pkgs), len(t.slots))
	}
}

// runQuitListener blocks (intended to run in its own goroutine) until the
// Quit menu item is clicked, then tells systray to shut down.
func (t *tray) runQuitListener() {
	<-t.quit.ClickedCh
	systray.Quit()
}

// countBadge is the short text shown directly next to the tray icon (macOS
// menu bar items can show a title alongside/instead of an icon glyph).
func countBadge(count int) string {
	if count == 0 {
		return ""
	}
	return strconv.Itoa(count)
}
