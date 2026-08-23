package brew

import (
	"regexp"
	"strconv"
	"strings"
)

// versionSegmentRe pulls out alphanumeric runs from a version string,
// treating everything else ("." "-" "," "_" etc, all seen in real cask
// versions) as a separator. Real cask versions aren't strictly semver --
// e.g. "154.0", "4.3.9,147,1742287964", "02.08.02.61,20260820225108" are
// all real `brew info --cask --json=v2` version values -- so this is a
// best-effort segment split rather than a semver parse.
var versionSegmentRe = regexp.MustCompile(`[0-9A-Za-z]+`)

func versionSegments(v string) []string {
	return versionSegmentRe.FindAllString(strings.TrimSpace(v), -1)
}

// CompareVersions does a best-effort comparison of two version strings,
// returning -1 if a < b, 0 if they're equal (or equal enough that this
// function can't tell them apart), and 1 if a > b.
//
// Versions are split into alphanumeric segments and compared segment by
// segment: two purely-numeric segments compare numerically (so "02"
// equals "2"), anything else compares as a case-insensitive string. This
// isn't a real semver parser -- a full semver library is disproportionate
// for what's ultimately a best-effort heuristic used to decide whether to
// show a warning, not to make an install/skip decision -- but it handles
// the real version shapes Homebrew casks actually use far better than a
// plain string comparison would (which would e.g. call "1.10.0" less than
// "1.9.0").
//
// When segments can't be compared meaningfully (e.g. neither string
// produces any alphanumeric segments), this falls back to a plain
// case-insensitive string comparison.
func CompareVersions(a, b string) int {
	a, b = strings.TrimSpace(a), strings.TrimSpace(b)
	if strings.EqualFold(a, b) {
		return 0
	}

	segA, segB := versionSegments(a), versionSegments(b)
	if len(segA) == 0 && len(segB) == 0 {
		return strings.Compare(strings.ToLower(a), strings.ToLower(b))
	}

	n := len(segA)
	if len(segB) < n {
		n = len(segB)
	}
	for i := 0; i < n; i++ {
		if c := compareVersionSegment(segA[i], segB[i]); c != 0 {
			return c
		}
	}
	if len(segA) == len(segB) {
		return 0
	}

	// Segment counts differ but every common segment matched (e.g. "1.2" vs
	// "1.2.0"). The longer one only "wins" if its extra segments aren't all
	// zero -- "1.2" vs "1.2.0" should compare equal, but "1.2" vs "1.2.1"
	// shouldn't.
	longer, shorter, sign := segA, segB, 1
	if len(segB) > len(segA) {
		longer, shorter, sign = segB, segA, -1
	}
	for _, seg := range longer[len(shorter):] {
		if n, err := strconv.Atoi(seg); err != nil || n != 0 {
			return sign
		}
	}
	return 0
}

func compareVersionSegment(a, b string) int {
	na, errA := strconv.Atoi(a)
	nb, errB := strconv.Atoi(b)
	if errA == nil && errB == nil {
		switch {
		case na < nb:
			return -1
		case na > nb:
			return 1
		default:
			return 0
		}
	}
	return strings.Compare(strings.ToLower(a), strings.ToLower(b))
}

// PossibleDowngrade reports whether adopting a cask would likely downgrade
// the app that's already installed: the app's own installed version
// compares strictly greater than the cask's version. Returns false (no
// warning) whenever either version is blank or the comparison can't
// establish that the installed one is actually newer -- a missed warning
// is a much smaller problem than a false one on what's a best-effort
// heuristic comparison, so this only fires when it's reasonably confident.
func PossibleDowngrade(installedVersion, caskVersion string) bool {
	if strings.TrimSpace(installedVersion) == "" || strings.TrimSpace(caskVersion) == "" {
		return false
	}
	return CompareVersions(installedVersion, caskVersion) > 0
}
