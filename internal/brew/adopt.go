package brew

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// slugifyAppName turns "Google Chrome.app" into a plausible cask token
// "google-chrome", the naming convention Homebrew casks follow.
func slugifyAppName(appDirName string) string {
	name := strings.TrimSuffix(appDirName, ".app")
	name = strings.ToLower(name)
	name = slugNonAlnum.ReplaceAllString(name, "-")
	return strings.Trim(name, "-")
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

	type job struct {
		appName string
		appPath string
		slug    string
	}
	var jobs []job
	for _, e := range entries {
		if !e.IsDir() || !strings.HasSuffix(e.Name(), ".app") {
			continue
		}
		appName := strings.TrimSuffix(e.Name(), ".app")
		if trackedCaskApps[strings.ToLower(appName)] {
			continue
		}
		jobs = append(jobs, job{
			appName: appName,
			appPath: filepath.Join("/Applications", e.Name()),
			slug:    slugifyAppName(e.Name()),
		})
	}

	results := make([]AdoptCandidate, 0, len(jobs))
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)

	for _, j := range jobs {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			info, err := GetInfo(ctx, j.slug, true)
			if err != nil || info == nil {
				return
			}
			mu.Lock()
			results = append(results, AdoptCandidate{
				AppName:     j.appName,
				AppPath:     j.appPath,
				CaskToken:   info.Name,
				CaskDesc:    info.Desc,
				CaskVersion: info.Version,
			})
			mu.Unlock()
		}()
	}
	wg.Wait()

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
