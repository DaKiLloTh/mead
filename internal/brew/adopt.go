package brew

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// adoptInfoBatchSize caps how many cask tokens go into a single `brew info`
// invocation. Homebrew happily accepts far more, but a huge argv (someone
// with hundreds of /Applications entries) is worth avoiding, so candidates
// are split into batches of this size rather than one unbounded call.
const adoptInfoBatchSize = 25

// stripAccents best-effort transliterates accented Latin characters to
// their base ASCII form (e.g. "é" -> "e") by Unicode-decomposing the string
// (NFD) and dropping the resulting combining marks. This covers the common
// case of accented app names -- it isn't a full transliteration of every
// script, but that's disproportionate for what is ultimately a best-effort
// heuristic scan, and this keeps a legitimate accented app name from being
// silently mangled or dropped.
func stripAccents(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(s) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// slugifyAppName turns "Google Chrome.app" into a plausible cask token
// "google-chrome", the naming convention Homebrew casks follow. Accented
// characters are transliterated to their base ASCII form first (e.g.
// "Café.app" -> "cafe") so they contribute a real character to the slug
// instead of just vanishing under the non-alphanumeric strip below.
func slugifyAppName(appDirName string) string {
	name := strings.TrimSuffix(appDirName, ".app")
	name = stripAccents(name)
	name = strings.ToLower(name)
	name = slugNonAlnum.ReplaceAllString(name, "-")
	return strings.Trim(name, "-")
}

// batchSlugs partitions slugs into consecutive chunks of at most size,
// preserving order. size <= 0 is treated as "everything in one batch".
func batchSlugs(slugs []string, size int) [][]string {
	if len(slugs) == 0 {
		return nil
	}
	if size <= 0 {
		size = len(slugs)
	}
	batches := make([][]string, 0, (len(slugs)+size-1)/size)
	for len(slugs) > 0 {
		n := size
		if n > len(slugs) {
			n = len(slugs)
		}
		batches = append(batches, slugs[:n])
		slugs = slugs[n:]
	}
	return batches
}

// ScanAdoptableApps looks at everything in /Applications, guesses which
// ones correspond to a Homebrew cask by slugifying the app name, and
// reports the ones that aren't already tracked as installed via brew. This
// is a heuristic (same approach a human would use) rather than an exact
// reverse index, since Homebrew doesn't publish one.
func ScanAdoptableApps(ctx context.Context) ([]AdoptCandidate, error) {
	entries, err := os.ReadDir("/Applications")
	if err != nil {
		return nil, err
	}

	installed, err := ListInstalled(ctx)
	if err != nil {
		return nil, err
	}
	trackedCaskApps := map[string]bool{}
	for _, p := range installed {
		if !p.IsCask {
			continue
		}
		trackedCaskApps[strings.ToLower(p.FullName)] = true
		trackedCaskApps[strings.ToLower(p.Name)] = true
	}

	type candidate struct {
		appName string
		appPath string
		slug    string
	}
	var candidates []candidate
	for _, e := range entries {
		if !e.IsDir() || !strings.HasSuffix(e.Name(), ".app") {
			continue
		}
		appName := strings.TrimSuffix(e.Name(), ".app")
		if trackedCaskApps[strings.ToLower(appName)] {
			continue
		}
		slug := slugifyAppName(e.Name())
		if slug == "" {
			continue
		}
		candidates = append(candidates, candidate{
			appName: appName,
			appPath: filepath.Join("/Applications", e.Name()),
			slug:    slug,
		})
	}

	if len(candidates) == 0 {
		return []AdoptCandidate{}, nil
	}

	// `brew info` aborts its entire invocation -- with no JSON on stdout at
	// all -- the moment any one requested token doesn't exist as a real
	// cask (it doesn't just omit the bad token from the response). Since
	// most slugified app names in a typical /Applications won't correspond
	// to a real cask, batching info calls directly over every candidate
	// slug would make nearly every batch fail outright. So the token list
	// is checked against Homebrew's actual set of known cask tokens first
	// (a single fast, local `brew casks` call) and only real tokens are
	// ever passed to `brew info`, keeping every batched info call valid.
	knownTokens, err := runBrewLines(ctx, "casks")
	if err != nil {
		return nil, err
	}
	knownTokenSet := make(map[string]bool, len(knownTokens))
	for _, t := range knownTokens {
		knownTokenSet[strings.ToLower(strings.TrimSpace(t))] = true
	}

	var matched []candidate
	seenSlug := map[string]bool{}
	var uniqueSlugs []string
	for _, c := range candidates {
		if !knownTokenSet[c.slug] {
			continue
		}
		matched = append(matched, c)
		if !seenSlug[c.slug] {
			seenSlug[c.slug] = true
			uniqueSlugs = append(uniqueSlugs, c.slug)
		}
	}
	if len(matched) == 0 {
		return []AdoptCandidate{}, nil
	}

	infoByToken := make(map[string]BrewPackage, len(uniqueSlugs))
	for _, batch := range batchSlugs(uniqueSlugs, adoptInfoBatchSize) {
		args := append([]string{"info", "--json=v2", "--cask"}, batch...)
		out, err := RunBrew(ctx, args...)
		if err != nil {
			// A cask that existed in the `brew casks` listing a moment ago
			// but fails here (e.g. removed from a tap in between) shouldn't
			// take the whole scan down -- skip this batch's results the
			// same way a single failed lookup was silently skipped before.
			continue
		}
		pkgs, err := decodeInfoV2([]byte(out))
		if err != nil {
			continue
		}
		for _, p := range pkgs {
			if p.IsCask {
				infoByToken[strings.ToLower(p.Name)] = p
			}
		}
	}

	results := make([]AdoptCandidate, 0, len(matched))
	for _, c := range matched {
		info, ok := infoByToken[c.slug]
		if !ok {
			continue
		}
		results = append(results, AdoptCandidate{
			AppName:     c.appName,
			AppPath:     c.appPath,
			CaskToken:   info.Name,
			CaskDesc:    info.Desc,
			CaskVersion: info.Version,
		})
	}

	return results, nil
}

// FindDuplicateApps flags names that appear as both an installed formula
// and an installed cask -- usually a sign the same tool got installed
// twice through different Homebrew paths.
func FindDuplicateApps(ctx context.Context) ([]DuplicateApp, error) {
	installed, err := ListInstalled(ctx)
	if err != nil {
		return nil, err
	}
	formulaVersions := map[string]string{}
	caskVersions := map[string]string{}
	for _, p := range installed {
		if p.IsCask {
			caskVersions[strings.ToLower(p.Name)] = p.InstalledVersion
		} else {
			formulaVersions[strings.ToLower(p.Name)] = p.InstalledVersion
		}
	}

	dupes := []DuplicateApp{}
	for name, fv := range formulaVersions {
		if cv, ok := caskVersions[name]; ok {
			dupes = append(dupes, DuplicateApp{Name: name, FormulaVer: fv, CaskVer: cv})
		}
	}
	return dupes, nil
}
