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

func (a *App) InstallCollection(name string) string {
	c := findCollection(name)
	if c == nil {
		return a.jobs.Fail(fmt.Sprintf("Install %s", name), "unknown collection")
	}
	args := []string{"install"}
	for _, p := range c.Packages {
		args = append(args, p.Name)
	}
	return a.jobs.Start(fmt.Sprintf("Install collection: %s", c.Name), args...)
}
