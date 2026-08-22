package brew

import (
	"context"
	"os"
	"path/filepath"
	"sort"
)

// PackageSize is the on-disk footprint of a single installed formula or
// cask, as measured by walking its own directory under the Cellar or
// Caskroom.
type PackageSize struct {
	Name      string `json:"name"`
	IsCask    bool   `json:"isCask"`
	SizeBytes int64  `json:"sizeBytes"`
	SizeHuman string `json:"sizeHuman"`
}

// defaultLargestInstalledLimit caps how many entries LargestInstalled
// returns when the caller doesn't specify a limit (e.g. passes 0 or a
// negative number). A user can have hundreds of installed packages; the
// frontend only needs a "biggest offenders" list, not a full inventory.
const defaultLargestInstalledLimit = 20

// LargestInstalled scans the Cellar (formulae) and Caskroom (casks)
// directories and reports the on-disk size of each installed package's own
// directory, sorted largest-first and capped at limit entries (a limit <= 0
// falls back to defaultLargestInstalledLimit).
//
// Like GetCacheInfo, the sizes are best-effort: dirSize silently ignores any
// filepath.Walk error it hits partway through a directory, so a size may be
// a truncated undercount rather than exact. That's acceptable here -- this
// report is a rough "what's biggest" ranking for deciding what to look at
// uninstalling, not a byte-exact audit.
func LargestInstalled(ctx context.Context, limit int) ([]PackageSize, error) {
	_, cellar, caskroom, err := cellarAndCaskroomPaths(ctx)
	if err != nil {
		return nil, err
	}

	sizes := []PackageSize{}
	sizes = append(sizes, scanPackageDir(cellar, false)...)
	sizes = append(sizes, scanPackageDir(caskroom, true)...)

	return topNBySize(sizes, limit), nil
}

// scanPackageDir lists the top-level entries of dir (each one an installed
// package's own directory) and measures each with dirSize. A dir that
// doesn't exist or can't be read (e.g. no casks ever installed, so no
// Caskroom) yields no entries rather than an error -- that's a normal,
// healthy state, not a failure.
func scanPackageDir(dir string, isCask bool) []PackageSize {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	out := make([]PackageSize, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		size := dirSize(filepath.Join(dir, e.Name()))
		out = append(out, PackageSize{
			Name:      e.Name(),
			IsCask:    isCask,
			SizeBytes: size,
			SizeHuman: humanBytes(size),
		})
	}
	return out
}

// topNBySize is the pure decision logic behind LargestInstalled: given
// already-computed sizes, return them sorted largest-first and capped at n
// entries (n <= 0 falls back to defaultLargestInstalledLimit). Extracted
// from the directory-scanning I/O so it can be tested directly, the same
// way buildSystemInfo separates GetSystemInfo's pure decision logic from its
// I/O.
func topNBySize(sizes []PackageSize, n int) []PackageSize {
	if n <= 0 {
		n = defaultLargestInstalledLimit
	}

	sorted := make([]PackageSize, len(sizes))
	copy(sorted, sizes)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].SizeBytes > sorted[j].SizeBytes
	})

	if len(sorted) > n {
		sorted = sorted[:n]
	}
	return sorted
}
