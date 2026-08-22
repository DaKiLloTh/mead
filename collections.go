package main

import "fmt"

// curatedCollections is a small, static set of package bundles for common
// workflows. Homebrew installs mixed formula/cask names fine in one
// `brew install` call, so a whole collection installs as a single job.
var curatedCollections = []Collection{
	{
		Name:        "Web Dev",
		Description: "Node, package managers, and the essentials for frontend/backend web work.",
		Packages: []CollectionPackage{
			{Name: "node"}, {Name: "yarn"}, {Name: "git"}, {Name: "gh"},
			{Name: "watchman"}, {Name: "visual-studio-code", IsCask: true},
		},
	},
	{
		Name:        "DevOps",
		Description: "Containers, orchestration, and cloud CLIs.",
		Packages: []CollectionPackage{
			{Name: "docker"}, {Name: "docker-compose"}, {Name: "kubectl"},
			{Name: "helm"}, {Name: "terraform"}, {Name: "awscli"},
		},
	},
	{
		Name:        "Data Science",
		Description: "Python, notebooks, and data tooling.",
		Packages: []CollectionPackage{
			{Name: "python"}, {Name: "jupyterlab"}, {Name: "r"}, {Name: "pipx"},
		},
	},
	{
		Name:        "Systems & Rust",
		Description: "Rust toolchain and modern CLI replacements.",
		Packages: []CollectionPackage{
			{Name: "rustup"}, {Name: "ripgrep"}, {Name: "fd"}, {Name: "bat"}, {Name: "eza"},
		},
	},
	{
		Name:        "Databases",
		Description: "Local database servers and clients.",
		Packages: []CollectionPackage{
			{Name: "postgresql@16"}, {Name: "redis"}, {Name: "sqlite"}, {Name: "tableplus", IsCask: true},
		},
	},
}

func GetCollections() []Collection {
	return curatedCollections
}

func findCollection(name string) *Collection {
	for i := range curatedCollections {
		if curatedCollections[i].Name == name {
			return &curatedCollections[i]
		}
	}
	return nil
}

func (a *App) GetCollections() []Collection {
	return GetCollections()
}

// buildCollectionInstallArgs builds the `brew install` argument list for a
// collection. Homebrew resolves each name as a formula or cask on its own
// (see the doc comment on curatedCollections), so unlike a single-cask
// install (see caskFlagsFor) this must NOT force --cask -- doing so would
// make brew try to resolve every name in the command as a cask, breaking
// any formula packages in the same collection. If the collection contains
// at least one cask and the user has configured a custom cask install
// directory, --appdir is still appended so those casks land there instead
// of brew's default. Pure so it's directly unit testable.
func buildCollectionInstallArgs(pkgs []CollectionPackage, caskAppDir string) []string {
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
	c := findCollection(name)
	if c == nil {
		return a.jobs.Fail(fmt.Sprintf("Install %s", name), "unknown collection")
	}
	args := buildCollectionInstallArgs(c.Packages, a.store.CaskAppDir())
	return a.jobs.Start(fmt.Sprintf("Install collection: %s", c.Name), args...)
}
