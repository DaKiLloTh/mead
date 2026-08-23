package brew

import "strings"

// levenshtein computes the Levenshtein edit distance between a and b: the
// minimum number of single-character insertions, deletions, or
// substitutions to turn one into the other. Small, hand-rolled,
// stdlib-only -- a full string-similarity dependency would be
// disproportionate for what's ultimately one heuristic signal in a
// best-effort scan.
func levenshtein(a, b string) int {
	ar, br := []rune(a), []rune(b)
	la, lb := len(ar), len(br)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	prev := make([]int, lb+1)
	curr := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		prev[j] = j
	}
	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			del := prev[j] + 1
			ins := curr[j-1] + 1
			sub := prev[j-1] + cost
			m := del
			if ins < m {
				m = ins
			}
			if sub < m {
				m = sub
			}
			curr[j] = m
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

// stringSimilarity returns a normalized similarity score in [0, 1] -- 1
// meaning identical, 0 meaning nothing in common -- based on Levenshtein
// distance relative to the longer string's length. Comparison is
// case-insensitive and whitespace-trimmed since the two sides being
// compared (a cask token and a slugified app name, or a cask's display
// name and an app's display name) vary in casing but shouldn't be treated
// as different for this purpose.
func stringSimilarity(a, b string) float64 {
	a = strings.ToLower(strings.TrimSpace(a))
	b = strings.ToLower(strings.TrimSpace(b))
	if a == b {
		return 1
	}
	maxLen := len(a)
	if len(b) > maxLen {
		maxLen = len(b)
	}
	if maxLen == 0 {
		return 1
	}
	dist := levenshtein(a, b)
	return 1 - float64(dist)/float64(maxLen)
}

// bestFuzzyToken returns the token in knownTokens most similar to slug (by
// stringSimilarity) and its score. It scans the full token set -- a few
// thousand short strings already held in memory from the `brew casks`
// call every scan makes anyway -- rather than shelling out to
// `brew search --cask` per unmatched app, which would mean one subprocess
// per /Applications entry with no exact slug match. A typical
// /Applications folder has plenty of those that aren't Homebrew casks at
// all (bundled system apps, Mac App Store apps, internal tools), so
// per-candidate search would mean dozens of slow subprocess spawns for a
// scan the user triggers interactively and expects to come back quickly.
// This gets the same "lean on Homebrew's real naming data instead of an
// ever-growing regex" benefit from data that's already local and free.
//
// Ties are broken by picking the lexicographically smaller token, so the
// result is deterministic regardless of map iteration order.
func bestFuzzyToken(slug string, knownTokens map[string]bool) (string, float64) {
	if slug == "" {
		return "", 0
	}
	bestToken := ""
	bestScore := -1.0
	for token := range knownTokens {
		score := stringSimilarity(slug, token)
		if score > bestScore || (score == bestScore && token < bestToken) {
			bestScore = score
			bestToken = token
		}
	}
	return bestToken, bestScore
}
