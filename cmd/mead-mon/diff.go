package main

import (
	"sort"

	"mead/internal/brew"
)

// outdatedNames extracts and sorts the package names from a brew.Outdated
// result, so the polling loop has a plain, comparable snapshot to keep
// between ticks instead of comparing full OutdatedPackage structs (whose
// version fields can shift without the set of outdated names changing, e.g.
// a package moving between two outdated versions across checks).
func outdatedNames(pkgs []brew.OutdatedPackage) []string {
	names := make([]string, 0, len(pkgs))
	for _, p := range pkgs {
		names = append(names, p.Name)
	}
	sort.Strings(names)
	return names
}

// shouldNotify reports whether the set of outdated package names has
// genuinely changed since the last check. It intentionally ignores order
// (both slices are expected pre-sorted by outdatedNames) and does not
// notify when the set is unchanged, even if it's non-empty -- the whole
// point is to avoid re-notifying every tick for the same known-outdated
// packages.
func shouldNotify(previous, current []string) bool {
	if len(previous) != len(current) {
		return true
	}
	for i := range current {
		if previous[i] != current[i] {
			return true
		}
	}
	return false
}
