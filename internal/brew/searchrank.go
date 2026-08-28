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

// searchMatchConfidence maps a name's match tier down to the same
// "exact"/"possible" vocabulary AdoptCandidate.MatchConfidence already uses
// elsewhere in this codebase (see adopt.go's buildMatchConfidence), so the
// frontend doesn't need a second vocabulary to interpret: tiers 0-2 (exact,
// prefix, substring) are all confident enough to call "exact" -- only tier
// 3, Homebrew's own fuzzy leftovers, gets flagged as a "possible" match.
func searchMatchConfidence(name, query string) string {
	if matchTier(name, query) <= 2 {
		return "exact"
	}
	return "possible"
}

// enrichSearchResults fills in Desc/Version/Deprecated/Disabled/AutoUpdates
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
			for _, p := range pkgs {
				infoByKey[searchKey(p.Name, p.IsCask)] = p
			}
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
		results[i].Deprecated = p.Deprecated
		results[i].Disabled = p.Disabled
		results[i].AutoUpdates = p.AutoUpdates
	}
}
