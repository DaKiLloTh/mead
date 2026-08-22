package app

import (
	"fmt"

	"mead/internal/brew"
)

func (a *App) GetCollections() []brew.Collection {
	return brew.GetCollections()
}

// buildCollectionInstallArgs builds the `brew install` argument list for a
// collection. Homebrew resolves each name as a formula or cask on its own
// (see the doc comment on brew.GetCollections), so unlike a single-cask
// install (see caskFlagsFor) this must NOT force --cask -- doing so would
// make brew try to resolve every name in the command as a cask, breaking
// any formula packages in the same collection. If the collection contains
// at least one cask and the user has configured a custom cask install
// directory, --appdir is still appended so those casks land there instead
// of brew's default. Pure so it's directly unit testable.
func buildCollectionInstallArgs(pkgs []brew.CollectionPackage, caskAppDir string) []string {
	args := []string{"install"}
	if caskAppDir != "" {
		for _, p := range pkgs {
			if p.IsCask {
				args = append(args, "--appdir="+caskAppDir)
				break
			}
		}
	}
	for _, p := range pkgs {
		args = append(args, p.Name)
	}
	return args
}

func (a *App) InstallCollection(name string) string {
	c := brew.FindCollection(name)
	if c == nil {
		return a.jobs.Fail(fmt.Sprintf("Install %s", name), "unknown collection")
	}
	args := buildCollectionInstallArgs(c.Packages, a.store.CaskAppDir())
	return a.jobs.Start(fmt.Sprintf("Install collection: %s", c.Name), args...)
}
