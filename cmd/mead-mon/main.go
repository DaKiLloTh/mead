package main

import (
	"context"
	"log"

	"github.com/getlantern/systray"
)

func main() {
	cfg := LoadConfig()
	log.Printf("mead-mon: checking every %d minutes (greedy=%v)", cfg.IntervalMinutes, cfg.Greedy)

	ctx, cancel := context.WithCancel(context.Background())

	systray.Run(func() {
		tr := newTray()
		p := newPoller(cfg, tr)
		go p.run(ctx)
		go tr.runQuitListener()
	}, func() {
		cancel()
	})
}
