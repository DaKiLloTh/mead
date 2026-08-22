# Changelog

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
