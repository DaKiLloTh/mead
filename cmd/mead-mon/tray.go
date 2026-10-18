package main

import (
	_ "embed"

	"fyne.io/systray"
)

// The menu bar glyphs: mead's mug as single-color template images, so macOS
// tints them to match the menu bar like any system icon. Sources and render
// commands are in icon/*.svg.
var (
	//go:embed icon/mead-mon-template.png
	iconIdle []byte
	//go:embed icon/mead-mon-template-alert.png
	iconAlert []byte
)

// tray owns the systray state: the mug icon and count beside it, a disabled
// header line saying how many updates there are, Update all, Open mead and
// Quit. What each shows is decided by menuView (format.go), which is pure
// and tested; this is only the thin wrapper that applies it.
type tray struct {
	header    *systray.MenuItem
	updateAll *systray.MenuItem
	openMead  *systray.MenuItem
	quit      *systray.MenuItem
	alert     *bool
}

func newTray() *tray {
	header := systray.AddMenuItem("", "")
	header.Disable()
	systray.AddSeparator()
	updateAll := systray.AddMenuItem("Update all", "Upgrade every outdated package")
	openMead := systray.AddMenuItem("Open mead", "")
	systray.AddSeparator()
	quit := systray.AddMenuItem("Quit", "")

	t := &tray{header: header, updateAll: updateAll, openMead: openMead, quit: quit}
	t.render(menuView(status{}))
	return t
}

func (t *tray) render(v view) {
	if t.alert == nil || *t.alert != v.alert {
		if v.alert {
			systray.SetTemplateIcon(iconAlert, iconAlert)
		} else {
			systray.SetTemplateIcon(iconIdle, iconIdle)
		}
		t.alert = &v.alert
	}
	systray.SetTitle(v.badge)
	systray.SetTooltip("mead: " + v.header)
	t.header.SetTitle(v.header)
	t.updateAll.SetTitle(v.updateAllTitle)
	if v.updateAllEnabled {
		t.updateAll.Enable()
	} else {
		t.updateAll.Disable()
	}
}
