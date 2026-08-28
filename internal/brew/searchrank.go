package brew

import (
	"context"
	"sort"
	"strings"
)

// matchTier scores a name against a search query into cheap, unambiguous
// relevance buckets, most relevant first. This exists because Search used
// to have no relevance signal at all across its two source lists (formula
// results always preceded cask results, full stop) -- searching "blender"
// put two unrelated formula fuzzy-matches ("bender", "render", neither of
// which even contains "blender") ahead of the cask that's an exact name
// match, simply because formula results were added to the list first. See
// issue #136.
func matchTier(name, query string) int {
	n := strings.ToLower(name)
	q := strings.ToLower(query)
	switch {
	case n == q:
		return 0
	case strings.HasPrefix(n, q):
		return 1
	case strings.Contains(n, q):
		return 2
	default:
		return 3
	}
}

// rankResults sorts results by relevance to query: matchTier first (exact,
// then prefix, then substring, then everything else), and within a tier by
// string similarity, so Homebrew's own fuzzy ordering isn't the last word
// either. Formula vs. cask is deliberately not a sort key at all -- it's
// the thing the old formula-then-cask concatenation got wrong.
func rankResults(results []SearchResult, query string) {
	sort.SliceStable(results, func(i, j int) bool {
		ti, tj := matchTier(results[i].Name, query), matchTier(results[j].Name, query)
		if ti != tj {
			return ti < tj
		}
		return stringSimilarity(results[i].Name, query) > stringSimilarity(results[j].Name, query)
	})
}

// enrichSearchResults fills in Desc/Version/Homepage/Tap/Deprecated/Disabled/AutoUpdates
// for every result via batched `brew info` calls -- one batch per type
// (formula tokens and cask tokens need separate invocations, since --cask
// is a hard mode switch on `brew info`, not a per-token flag), reusing
// adopt.go's batchSlugs/adoptInfoBatchSize so a page of results never
// turns into one `brew info` shell-out per row. Every name here came
// straight out of `brew search`, so unlike adopt.go's slug-guessing case
// there's no risk of a batch containing an invalid token that aborts the
// whole call.
//
// Best-effort: a failed batch just leaves those results with their zero
// values (empty Desc/Version, false flags) rather than failing the whole
// search over what's meant to be supplementary detail.
func enrichSearchResults(ctx context.Context, results []SearchResult) {
	var formulaTokens, caskTokens []string
	for _, r := range results {
		if r.IsCask {
			caskTokens = append(caskTokens, r.Name)
		} else {
			formulaTokens = append(formulaTokens, r.Name)
		}
	}

	infoByKey := map[string]BrewPackage{}
	fetch := func(tokens []string, isCask bool) {
		for _, batch := range batchSlugs(tokens, adoptInfoBatchSize) {
			args := []string{"info", "--json=v2"}
			if isCask {
				args = append(args, "--cask")
			}
			args = append(args, batch...)
			out, err := RunBrew(ctx, args...)
			if err != nil {
				continue
			}
			pkgs, err := decodeInfoV2([]byte(out))
			if err != nil {
				continue
			}
			addToInfoIndex(infoByKey, pkgs)
		}
	}
	fetch(formulaTokens, false)
	fetch(caskTokens, true)

	for i := range results {
		p, ok := infoByKey[searchKey(results[i].Name, results[i].IsCask)]
		if !ok {
			continue
		}
		results[i].Desc = p.Desc
		results[i].Version = p.Version
		results[i].Homepage = p.Homepage
		results[i].Tap = p.Tap
		results[i].Deprecated = p.Deprecated
		results[i].Disabled = p.Disabled
		results[i].AutoUpdates = p.AutoUpdates
	}
}

// addToInfoIndex indexes each package under both its short token (p.Name)
// and, when it has a tap, the tap-qualified form ("tap/name") -- `brew
// search` prints the qualified form for anything outside the default tap
// (e.g. "dakilloth/mead/mead"), the exact case this enrichment most needs
// to work for, since that's also when the tap badge on the card actually
// has something to show.
//
// p.FullName is deliberately not used for this, even though the name
// suggests it should be: caskToPackage overwrites it with the cask's
// pretty display name (e.g. "Meld for macOS", see TestCaskToPackage_FullName),
// an already-established meaning elsewhere in this codebase, not
// Homebrew's own tap-qualified full_token. Reaching for it here silently
// broke enrichment for every third-party-tap result -- caught live against
// this repo's own tap-installed mead cask, not by a test, which is why this
// is now split out into something a test can hit directly.
func addToInfoIndex(index map[string]BrewPackage, pkgs []BrewPackage) {
	for _, p := range pkgs {
		index[searchKey(p.Name, p.IsCask)] = p
		if p.Tap != "" {
			index[searchKey(p.Tap+"/"+p.Name, p.IsCask)] = p
		}
	}
}
