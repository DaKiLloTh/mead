//go:build !darwin

package main

// hideFromDock is a no-op off macOS.
func hideFromDock() {}
