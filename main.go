package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"

	"mead/internal/app"
)

//go:embed all:frontend/dist
var assets embed.FS

// appIcon is GTK's window icon on Linux (Wails' linux.Options.Icon wants
// raw image bytes, gdk-pixbuf loads PNG directly). macOS and Windows read
// their app icon from the platform bundle/resources instead, so this is
// only referenced from the Linux options block below.
//
//go:embed build/appicon.png
var appIcon []byte

func main() {
	// Create an instance of the app structure
	application := app.New()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "mead",
		Width:     1180,
		Height:    800,
		MinWidth:  820,
		MinHeight: 520,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		OnStartup:        application.Startup,
		Bind: []any{
			application,
		},
		// Wails ignores Mac/Windows/Linux options fields for platforms the
		// binary isn't built for, so it's fine for all three to coexist here
		// unconditionally rather than needing their own build tags (verified
		// by building this file for linux/amd64 and linux/arm64 with this
		// Mac block still present, see docker/linux-build/README.md).
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.DefaultAppearance,
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			About: &mac.AboutInfo{
				Title:   "mead",
				Message: "A native Homebrew GUI.",
			},
		},
		// Linux has no equivalent to mac.Options' TitleBar customization --
		// Wails' Linux (GTK/webkit2gtk) backend always draws the window
		// manager's own native decorations, there is no Frameless or
		// hidden-inset titlebar option at all (see linux.Options' source).
		// So there is nothing here to mirror mac.Options.TitleBar with; the
		// window just gets a normal native title bar for free.
		Linux: &linux.Options{
			ProgramName: "mead",
			Icon:        appIcon,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
