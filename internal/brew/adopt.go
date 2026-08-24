package brew

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// fuzzyMatchThreshold is the minimum name-similarity score (see
// stringSimilarity) a known cask token must clear before it's offered as a
// fallback match when no slug variant matches exactly.
//
// This is set high on purpose, from a real failure observed while testing
// this against a real /Applications directory: at a looser 0.75 threshold,
// short, generic app names matched short, *unrelated* real cask tokens
// just one character off -- "Docker.app" matched cask "dockey", "Keynote"
// matched "heynote", "Xcode" matched "zcode". A single-character edit on a
// 5-7 character word already clears 0.75 (1 - 1/6 = 0.83, 1 - 1/7 = 0.86)
// even though the two names are unrelated products; the token space is
// dense enough with short real words that this isn't a rare edge case. At
// 0.9, all three of those false positives are correctly rejected while
// genuinely close near-misses -- a missing/extra separator character in a
// longer name -- still clear the bar (a single inserted/deleted character
// in a 10+ character slug is already >= 0.9 similar). A loose match here
// doesn't silently pass as certain either way -- it always shows up tagged
// "possible match" with a reason in the UI (see buildMatchConfidence) --
// but a threshold that routinely offers unrelated apps as "possible
// matches" isn't a useful signal, so this is deliberately conservative.
const fuzzyMatchThreshold = 0.9

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
	return normalizeToSlug(name)
}

// normalizeToSlug does the lowercase/collapse-non-alnum/trim part of
// slugifying, shared by slugifyAppName and slugVariants below. The caller
// is responsible for anything that needs to happen before this (accent
// stripping, camelCase splitting, ampersand expansion, ...).
func normalizeToSlug(name string) string {
	name = strings.ToLower(name)
	name = slugNonAlnum.ReplaceAllString(name, "-")
	return strings.Trim(name, "-")
}

// splitCamelCase inserts a space at camelCase word boundaries: a lowercase
// letter immediately followed by an uppercase letter (e.g. "BambuStudio"
// -> "Bambu Studio"), or an uppercase acronym run followed by a new
// capitalized word (e.g. "HTTPServer" -> "HTTP Server"). Those inserted
// spaces become hyphens once run through normalizeToSlug.
//
// This deliberately doesn't split every letter-case transition. A digit
// immediately followed by an uppercase letter is not treated as a
// boundary -- "Löve2D" (a real app name) would wrongly become "Löve2 D" ->
// "love2-d" instead of the real cask token "love2d". And plain
// "iTerm2" would become "i Term2" -> "i-term2" this way too, which is also
// wrong (the real cask token is "iterm2"). That's why this is offered as
// one slug variant tried alongside the unsplit plain slug, not a
// replacement for it: slugVariants tries the plain slug first, and only
// falls through to this one if the plain slug isn't a known token.
func splitCamelCase(s string) string {
	runes := []rune(s)
	var b strings.Builder
	for i, r := range runes {
		if i > 0 {
			prev := runes[i-1]
			boundary := false
			switch {
			case unicode.IsLower(prev) && unicode.IsUpper(r):
				boundary = true
			case unicode.IsUpper(prev) && unicode.IsUpper(r) && i+1 < len(runes) && unicode.IsLower(runes[i+1]):
				boundary = true
			}
			if boundary && !unicode.IsSpace(prev) {
				b.WriteRune(' ')
			}
		}
		b.WriteRune(r)
	}
	return b.String()
}

// expandAmpersand replaces "&" with " and ", so "Bob & Bob.app" is also
// tried as "bob-and-bob" alongside the plain "bob-bob" slug (where "&"
// just collapses into the surrounding hyphen and the word is lost). Many
// real cask tokens spell out "and" rather than using "&".
func expandAmpersand(s string) string {
	return strings.ReplaceAll(s, "&", " and ")
}

// slugVariants returns the ordered, deduplicated set of plausible cask
// token slugs for an app directory name, most-plausible first: the plain
// slug (unchanged from before), then the plain slug with camelCase words
// split apart, then with "&" expanded to "and", then both combined. Each
// variant is checked against the real known-token set in this order by
// matchCaskToken -- the first one that's a real token wins -- rather than
// only ever trying one guess, so a single naming quirk (camelCase, "&" vs
// "and") doesn't sink the whole match the way it used to.
func slugVariants(appDirName string) []string {
	base := strings.TrimSuffix(appDirName, ".app")
	base = stripAccents(base)

	var variants []string
	seen := map[string]bool{}
	add := func(s string) {
		slug := normalizeToSlug(s)
		if slug != "" && !seen[slug] {
			seen[slug] = true
			variants = append(variants, slug)
		}
	}

	add(base)
	add(splitCamelCase(base))
	add(expandAmpersand(base))
	add(splitCamelCase(expandAmpersand(base)))
	return variants
}

// matchCaskToken finds the best known-cask token for an app directory name
// (e.g. "BambuStudio.app"). It tries slugVariants in preference order
// first -- an exact match there is a strong signal, since it means some
// plausible spelling of the app's own name really is that cask's token.
// If nothing matches exactly, it falls back to the known token most
// similar to the plain slug by string similarity (see bestFuzzyToken),
// which catches naming mismatches no slug variant anticipates
// (abbreviations, minor spelling/punctuation differences) by leaning on
// Homebrew's own real token list rather than one more hand-rolled pattern.
//
// ok is false if nothing cleared either bar. exact reports which path
// produced the match; callers (see buildMatchConfidence) treat an exact
// variant match as a strictly stronger signal than a fuzzy one.
func matchCaskToken(appDirName string, knownTokens map[string]bool) (token string, exact bool, ok bool) {
	for _, v := range slugVariants(appDirName) {
		if knownTokens[v] {
			return v, true, true
		}
	}
	best, score := bestFuzzyToken(slugifyAppName(appDirName), knownTokens)
	if best != "" && score >= fuzzyMatchThreshold {
		return best, false, true
	}
	return "", false, false
}

// buildMatchConfidence turns a token match into a user-facing confidence
// tier plus a plain-language reason for anything short of full confidence.
//
// "exact" requires both an exact slug/token match and the cask's own
// artifacts data (info.AppPaths, parsed from `brew info`'s "artifacts"
// array -- the cask's own stated ground truth about what .app it drops in
// /Applications) confirming the same app filename that's actually on
// disk. Anything short of that -- a fuzzy token match, a cask whose
// artifacts don't mention an app at all, or one whose app filename
// doesn't match byte for byte (different case, separator, name entirely)
// -- comes back "possible", with a reason, rather than either being
// upgraded to a false certainty or silently dropped. A cask installing a
// different filename than what's on disk (e.g. cask lists
// "My_Application.app" but /Applications has "MyApplication.app") is
// exactly the kind of mismatch this is meant to catch and flag, not hide.
func buildMatchConfidence(tokenExact bool, appDirName string, info BrewPackage) (confidence string, reason string) {
	filenameVerified := len(info.AppPaths) > 0
	filenameExact := false
	otherName := ""
	for _, p := range info.AppPaths {
		base := filepath.Base(p)
		if base == appDirName {
			filenameExact = true
			break
		}
		if otherName == "" {
			otherName = base
		}
	}

	if tokenExact && filenameExact {
		return "exact", ""
	}

	var reasons []string
	if !tokenExact {
		reasons = append(reasons, "matched by name similarity, not an exact cask identifier")
	}
	switch {
	case !filenameVerified:
		reasons = append(reasons, "cask doesn't list an app filename to verify against")
	case !filenameExact:
		reasons = append(reasons, fmt.Sprintf("cask installs %q, found %q here", otherName, appDirName))
	}
	return "possible", strings.Join(reasons, "; ")
}

// isAppStoreApp reports whether the app bundle at appPath was installed
// from the Mac App Store, detected via the receipt every MAS-distributed
// app carries at Contents/_MASReceipt/receipt. This is the same signal
// macOS itself uses to tell a Store install apart from a direct download,
// so it doesn't depend on the `mas` CLI being installed at all.
func isAppStoreApp(appPath string) bool {
	_, err := os.Stat(filepath.Join(appPath, "Contents", "_MASReceipt", "receipt"))
	return err == nil
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

	// `brew info` aborts its entire invocation -- with no JSON on stdout at
	// all -- the moment any one requested token doesn't exist as a real
	// cask (it doesn't just omit the bad token from the response). Since
	// most slug guesses for a typical /Applications entry won't correspond
	// to a real cask, batching info calls directly over every guess would
	// make nearly every batch fail outright. So the token list is checked
	// against Homebrew's actual set of known cask tokens first (a single
	// fast, local `brew casks` call), matchCaskToken only ever returns a
	// token from that real set, and only those are ever passed to
	// `brew info`, keeping every batched info call valid.
	knownTokens, err := runBrewLines(ctx, "casks")
	if err != nil {
		return nil, err
	}
	knownTokenSet := make(map[string]bool, len(knownTokens))
	for _, t := range knownTokens {
		knownTokenSet[strings.ToLower(strings.TrimSpace(t))] = true
	}

	type candidate struct {
		appName string
		appPath string
		appDir  string // e.g. "BambuStudio.app" -- the raw /Applications entry name
		token   string
		exact   bool
	}
	var matched []candidate
	seenToken := map[string]bool{}
	var uniqueTokens []string
	for _, e := range entries {
		if !e.IsDir() || !strings.HasSuffix(e.Name(), ".app") {
			continue
		}
		appName := strings.TrimSuffix(e.Name(), ".app")
		if trackedCaskApps[strings.ToLower(appName)] {
			continue
		}
		token, exact, ok := matchCaskToken(e.Name(), knownTokenSet)
		if !ok {
			continue
		}
		matched = append(matched, candidate{
			appName: appName,
			appPath: filepath.Join("/Applications", e.Name()),
			appDir:  e.Name(),
			token:   token,
			exact:   exact,
		})
		if !seenToken[token] {
			seenToken[token] = true
			uniqueTokens = append(uniqueTokens, token)
		}
	}
	if len(matched) == 0 {
		return []AdoptCandidate{}, nil
	}

	infoByToken := make(map[string]BrewPackage, len(uniqueTokens))
	for _, batch := range batchSlugs(uniqueTokens, adoptInfoBatchSize) {
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
		info, ok := infoByToken[c.token]
		if !ok {
			continue
		}
		confidence, reason := buildMatchConfidence(c.exact, c.appDir, info)
		installedVersion := readInstalledAppVersion(ctx, c.appPath)
		results = append(results, AdoptCandidate{
			AppName:           c.appName,
			AppPath:           c.appPath,
			CaskToken:         info.Name,
			CaskDesc:          info.Desc,
			CaskVersion:       info.Version,
			InstalledVersion:  installedVersion,
			MatchConfidence:   confidence,
			MatchReason:       reason,
			PossibleDowngrade: PossibleDowngrade(installedVersion, info.Version),
			IsAppStoreApp:     isAppStoreApp(c.appPath),
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
