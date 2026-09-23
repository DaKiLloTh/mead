# Screenshot automation

Regenerates mead-site's `assets/screenshots/*.webp` from a real, running
build of the app and opens a review PR against mead-site with the result.
See issue [#109](https://github.com/DaKiLloTh/mead/issues/109) and the
workflow at `.github/workflows/screenshots.yml`.

## How it works

1. `wails dev` is started in the background. `wails.json`'s
   `frontend:dev:serverUrl: "auto"` makes it also serve the exact same
   frontend at a plain `http://` URL (`http://localhost:34115`), wired to the
   real running Go backend over the same runtime a packaged app uses --
   opening that URL in an ordinary browser is, for every purpose that
   matters here, the real app.
2. `capture.mjs` drives a headless Chromium (Playwright) through that URL:
   Dashboard on load, then Installed, Search (`wget`) and Security, each in
   both light and dark (`colorScheme`), 1600x1000 -- matching the existing
   assets exactly, and matching each view's own current layout, since that's
   the whole point of automating this (a hand-captured screenshot goes stale
   the next time a view's design changes; the Search screenshot live on the
   site right now still shows its pre-redesign card grid).
3. The PNGs are converted to `.webp` with `cwebp`.
4. If `MEAD_SITE_TOKEN` is configured (see below), they're pushed to a new
   branch in mead-site and a PR is opened. Always uploaded as a workflow
   artifact either way, so the images are recoverable even without the
   token.

## Setup: the `MEAD_SITE_TOKEN` secret

Same pattern as `HOMEBREW_TAP_TOKEN` in `release.yml`. Without it, the
workflow captures and uploads the screenshots as an artifact but skips
opening the mead-site PR (a warning, not a failure).

1. Create a fine-grained GitHub PAT scoped to `DaKiLloTh/mead-site` with
   `Contents: Read and write` and `Pull requests: Read and write`.
2. Add it as a repository secret on `DaKiLloTh/mead` named `MEAD_SITE_TOKEN`.

## Running it locally

```sh
cd scripts/screenshots
npm install
npx playwright install chromium

# In another terminal, from the repo root:
wails dev

node capture.mjs http://localhost:34115 /tmp/mead-screenshots
```

PNGs land in the given output directory; convert to webp with
`cwebp -q 90 in.png -o out.webp` (`brew install webp`).

## Maintenance

- If a view's layout changes such that the text/selector this script waits
  on no longer exists, the workflow run fails loudly at that step rather
  than silently capturing a broken screenshot -- update `capture.mjs`'s
  waits to match.
- The always-installed package list (`wget jq ripgrep fd bat htop`, in
  `screenshots.yml`) exists only so the Installed/Search/Dashboard views
  have real, non-sparse data to show regardless of what a given runner
  already has; it isn't meant to represent anyone's real machine.
