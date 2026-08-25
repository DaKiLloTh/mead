# Changelog

## [0.8.0](https://github.com/DaKiLloTh/mead/compare/v0.7.0...v0.8.0) (2026-08-24)


### Features

* redesign Adopt cards with deterministic actions and App Store detection ([40208e9](https://github.com/DaKiLloTh/mead/commit/40208e9072dacc0b1e06fb2c474c3ea6c4e16e15))


### Bug Fixes

* refresh SystemInfo from bump(), clarify Adopt's version columns ([b624b41](https://github.com/DaKiLloTh/mead/commit/b624b41f252e7bc3d991a43a414892505256e3e8))
* use --force instead of --adopt when adopting a version-mismatched app ([993bd75](https://github.com/DaKiLloTh/mead/commit/993bd75fe4da04f8b458aa262e6047e278095a93))

## [0.7.0](https://github.com/DaKiLloTh/mead/compare/v0.6.0...v0.7.0) (2026-08-23)


### Features

* build and release an Intel (x86_64) DMG alongside Apple Silicon ([8f8a1df](https://github.com/DaKiLloTh/mead/commit/8f8a1df8327d4096d0399b67776bb5f70a2cdb24))
* improve Adopt matching, add version comparison and downgrade warning ([1e4177f](https://github.com/DaKiLloTh/mead/commit/1e4177f49c29d35780cbb0afb864ba285534e142))
* prefetch cask icons, make Deprecated/Disabled/Pinned permanent tabs ([8566de5](https://github.com/DaKiLloTh/mead/commit/8566de5e2ebd2916d979d579b918ebb0eb208b59))

## [0.6.0](https://github.com/DaKiLloTh/mead/compare/v0.5.0...v0.6.0) (2026-08-23)


### Features

* add globally-accessible Homebrew refresh icon to the top bar ([e46ad2d](https://github.com/DaKiLloTh/mead/commit/e46ad2df6068e54466c68b2b1f926fef293839df))
* add real mead app icon, replacing the Wails placeholder ([5495446](https://github.com/DaKiLloTh/mead/commit/5495446a7e384bd35febf603062a114eb27759bf))
* adopt honey/mead visual identity (theme, fonts, icon set) ([29548f6](https://github.com/DaKiLloTh/mead/commit/29548f6ca1491873dcc7471b66c1c10121ea00df))
* offer administrator-privileged retry when cask uninstall needs sudo ([c6783a8](https://github.com/DaKiLloTh/mead/commit/c6783a81971ef8fba78f53309a390a44786cd13e))
* periodically refresh Homebrew's update index in the background ([4b25857](https://github.com/DaKiLloTh/mead/commit/4b25857805bfcf4e4750eefca3b83fa136e0ce08))

## [0.5.0](https://github.com/DaKiLloTh/mead/compare/v0.4.0...v0.5.0) (2026-08-23)


### Features

* add mead-mon standalone menu bar update notifier ([4938f05](https://github.com/DaKiLloTh/mead/commit/4938f0591c1db08a1898fa78c0153adc6fd61065))
* auto-mirror releases and bump cask on the homebrew-mead tap ([ee3fef0](https://github.com/DaKiLloTh/mead/commit/ee3fef0d5a367567241e4fbdb67bfe11df3c1a83))
* open package detail from Updates, link out to changelog ([9f0e81a](https://github.com/DaKiLloTh/mead/commit/9f0e81a0ac54ecfac977ebbbe3911fe08ee73751))
* show Homebrew staleness next to the update button ([48ab1ce](https://github.com/DaKiLloTh/mead/commit/48ab1ce511fc310ec429fc8b650a52fe3c095e1a))


### Bug Fixes

* cache Dashboard system info across navigation ([6ed886f](https://github.com/DaKiLloTh/mead/commit/6ed886f2d7019586d69cc20f52029e4c9f821562))

## [0.4.0](https://github.com/DaKiLloTh/mead/compare/v0.3.0...v0.4.0) (2026-08-23)


### Features

* Interactive dependency graph visualization in package detail (closes [#56](https://github.com/DaKiLloTh/mead/issues/56)) ([#67](https://github.com/DaKiLloTh/mead/pull/67))


### Bug Fixes

* Health tile: compact redesign, and its stats now link to real filters instead of an unfiltered list (closes [#64](https://github.com/DaKiLloTh/mead/issues/64), [#65](https://github.com/DaKiLloTh/mead/issues/65)) ([#70](https://github.com/DaKiLloTh/mead/pull/70))
* Clear Cache and Cleanup actions now sit together instead of requiring a scroll between them (closes [#61](https://github.com/DaKiLloTh/mead/issues/61)) ([#69](https://github.com/DaKiLloTh/mead/pull/69))
* Stop native rubber-band bounce when scrolling over non-scrollable areas (closes [#62](https://github.com/DaKiLloTh/mead/issues/62)) ([#71](https://github.com/DaKiLloTh/mead/pull/71))


### Miscellaneous Chores

* gitignore .DS_Store, force release trigger ([#73](https://github.com/DaKiLloTh/mead/issues/73)) ([2678c5a](https://github.com/DaKiLloTh/mead/commit/2678c5a33afc39607ea979214028eb29ad246508))

## [0.3.0](https://github.com/DaKiLloTh/mead/compare/v0.2.1...v0.3.0) (2026-08-23)


### Features

* add global Cmd+K command palette ([#31](https://github.com/DaKiLloTh/mead/issues/31)) ([b391282](https://github.com/DaKiLloTh/mead/commit/b391282db1f9d2f1ec355201222d16878e9b52b4))
* add largest installed packages report to Maintenance ([#33](https://github.com/DaKiLloTh/mead/issues/33)) ([62c8060](https://github.com/DaKiLloTh/mead/commit/62c8060cc6e8d422123aa4b18b8bc25dc31bbffe))
* real app icons, monogram fallback, and Applications grid ([#55](https://github.com/DaKiLloTh/mead/issues/55)) ([#60](https://github.com/DaKiLloTh/mead/issues/60)) ([3e5b89a](https://github.com/DaKiLloTh/mead/commit/3e5b89a221c56c39df0c49af1f913839e3619dc3))


### Bug Fixes

* **brew:** stop swallowing cache-size errors and blank cask names ([#38](https://github.com/DaKiLloTh/mead/issues/38)) ([aad3f08](https://github.com/DaKiLloTh/mead/commit/aad3f08e469db584830a290f7404adf0c561ec47))
* open external links in system browser instead of target=_blank ([#41](https://github.com/DaKiLloTh/mead/issues/41)) ([1dacdaf](https://github.com/DaKiLloTh/mead/commit/1dacdaffd72094c4dc7efcb8df8a34c154ef1671))
* pin sidebar drag-region and logo, scroll nav content independently ([#43](https://github.com/DaKiLloTh/mead/issues/43)) ([3c660bc](https://github.com/DaKiLloTh/mead/commit/3c660bccfde234c428ba0c10773dc55f0ae93bc0)), closes [#35](https://github.com/DaKiLloTh/mead/issues/35)
* tighten ValidName against path traversal, move RunCmd out of brew ([#39](https://github.com/DaKiLloTh/mead/issues/39)) ([87ebf55](https://github.com/DaKiLloTh/mead/commit/87ebf55e74fcc9c719452d4ee4a08133d706493b))
* transliterate accents in slugifyAppName, batch adopt scan's brew info calls ([#40](https://github.com/DaKiLloTh/mead/issues/40)) ([525b467](https://github.com/DaKiLloTh/mead/commit/525b4679df60c77bc796adb104b3bdfb0b919674))

## [0.2.1](https://github.com/DaKiLloTh/mead/compare/v0.2.0...v0.2.1) (2026-08-22)


### Bug Fixes

* close job:done race in JobsContext.runAction ([#11](https://github.com/DaKiLloTh/mead/issues/11)) ([e6d172d](https://github.com/DaKiLloTh/mead/commit/e6d172d250e3206e64cc4caccd6ea4f8facabecb))
* don't fabricate a healthy zero-value SystemInfo on brew failure ([#13](https://github.com/DaKiLloTh/mead/issues/13)) ([eca76e1](https://github.com/DaKiLloTh/mead/commit/eca76e14172a9fe6768dbdf35f599ae3e21a9295))
* explicitly ignore resp.Body.Close() error in ScanVulnerabilities ([#20](https://github.com/DaKiLloTh/mead/issues/20)) ([6af9b44](https://github.com/DaKiLloTh/mead/commit/6af9b447c2b97833563c7874aae0804bac2e3f88))
* harden fallback store persistence, quarantine-removal scoping, and gist URL parsing ([#12](https://github.com/DaKiLloTh/mead/issues/12)) ([5639aa5](https://github.com/DaKiLloTh/mead/commit/5639aa5e8fb15030151fa2c2b732c828249bbe81))
* honor custom cask appdir in collection installs and cask adoption ([#14](https://github.com/DaKiLloTh/mead/issues/14)) ([695629f](https://github.com/DaKiLloTh/mead/commit/695629f1173cbd054cc7ddd4a2bbb78fdfcf792d))
* MasUpgrade/MasUpgradeAll ran brew, not mas ([#26](https://github.com/DaKiLloTh/mead/issues/26)) ([399e13c](https://github.com/DaKiLloTh/mead/commit/399e13c8968aa5f944d61e533833d9799392e3f8))
* run go test and vitest in CI ([#17](https://github.com/DaKiLloTh/mead/issues/17)) ([bcb6872](https://github.com/DaKiLloTh/mead/commit/bcb6872a236f9078dc671c5359fc26e2ea9c8d9f))
* stabilize table column widths across all views ([#15](https://github.com/DaKiLloTh/mead/issues/15)) ([e108de7](https://github.com/DaKiLloTh/mead/commit/e108de73ca8d2d6ab59dc2c416e0698502e7f702))
* switch PR title check from pull_request_target to pull_request ([#8](https://github.com/DaKiLloTh/mead/issues/8)) ([91080d5](https://github.com/DaKiLloTh/mead/commit/91080d53a9f2adc054e7420911ede3ed5efcbf76))
* window dragging, sidebar logo clearance, dismissible Activity panel ([#16](https://github.com/DaKiLloTh/mead/issues/16)) ([dabb4d4](https://github.com/DaKiLloTh/mead/commit/dabb4d4c6b2727e9c96602cb2b738b06f4c4ffd8))

## [0.2.0](https://github.com/DaKiLloTh/mead/compare/v0.1.0...v0.2.0) (2026-08-22)


### Features

* automate versioning with release-please, enforce conventional commit PR titles ([#2](https://github.com/DaKiLloTh/mead/issues/2)) ([78aadfc](https://github.com/DaKiLloTh/mead/commit/78aadfcd65660cf3452f7ed9409f86776e815edf))


### Bug Fixes

* correct release-please baseline to 0.1.0 ([#5](https://github.com/DaKiLloTh/mead/issues/5)) ([a1ff68e](https://github.com/DaKiLloTh/mead/commit/a1ff68ec020fe410733ac282676fd32badda1254))
* mark GitHub releases as pre-alpha via release edit, not version suffix ([#7](https://github.com/DaKiLloTh/mead/issues/7)) ([b07cf81](https://github.com/DaKiLloTh/mead/commit/b07cf81f826975506e9f9a79e41b6609b2cd46b6))
* pin CI workflow to read-only permissions explicitly ([#3](https://github.com/DaKiLloTh/mead/issues/3)) ([5c24d8e](https://github.com/DaKiLloTh/mead/commit/5c24d8ed7450b91cd54bd03f54034c0703b0ac7c))
