package brew

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

// GetCollections returns the curated list of package collections.
func GetCollections() []Collection {
	return curatedCollections
}

// FindCollection looks up a curated collection by name.
func FindCollection(name string) *Collection {
	for i := range curatedCollections {
		if curatedCollections[i].Name == name {
			return &curatedCollections[i]
		}
	}
	return nil
}
