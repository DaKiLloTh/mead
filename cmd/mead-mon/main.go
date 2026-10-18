package main

import (
	"context"
	"log"

	"fyne.io/systray"
)

func main() {
	cfg := LoadConfig()
	log.Printf("mead-mon: checking every %d minutes (greedy=%v)", cfg.IntervalMinutes, cfg.Greedy)

	ctx, cancel := context.WithCancel(context.Background())

	systray.Run(func() {
		tr := newTray()
		p := newPoller(cfg, tr)
		go p.run(ctx, tr.updateAll.ClickedCh)
		go tr.runMenuListener()
	}, func() {
		cancel()
	})
}
