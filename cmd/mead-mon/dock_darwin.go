package main

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

static void hideFromDock(void) {
	[NSApplication sharedApplication];
	[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
}
*/
import "C"

// hideFromDock keeps mead-mon out of the Dock and the app switcher.
// mead-mon runs from inside mead.app, so macOS reads mead's Info.plist and
// would otherwise give it a regular app's Dock tile. LSUIElement in that
// plist would hide mead itself too, so the helper sets the policy at runtime.
// Must run on the main thread before systray.Run.
func hideFromDock() {
	C.hideFromDock()
}
