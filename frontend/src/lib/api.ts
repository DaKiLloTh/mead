import * as App from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

export type BrewPackage = main.BrewPackage
export type CacheInfo = main.CacheInfo
export type OutdatedPackage = main.OutdatedPackage
export type SearchResult = main.SearchResult
export type Service = main.Service
export type SystemInfo = main.SystemInfo

export const api = {
  getSystemInfo: () => App.GetSystemInfo(),
  listInstalled: () => App.ListInstalled(),
  getInfo: (name: string, isCask: boolean) => App.GetInfo(name, isCask),
  search: (query: string) => App.Search(query),
  outdated: () => App.Outdated(),
  taps: () => App.Taps(),
  services: () => App.Services(),
  leaves: () => App.Leaves(),
  uses: (name: string) => App.Uses(name),
  deps: (name: string, isCask: boolean) => App.Deps(name, isCask),
  cacheInfo: () => App.GetCacheInfo(),
  config: () => App.Config(),

  install: (name: string, isCask: boolean) => App.Install(name, isCask),
  uninstall: (name: string, isCask: boolean) => App.Uninstall(name, isCask),
  upgrade: (name: string, isCask: boolean) => App.Upgrade(name, isCask),
  upgradeAll: () => App.UpgradeAll(),
  update: () => App.Update(),
  cleanup: (dryRun: boolean) => App.Cleanup(dryRun),
  doctor: () => App.Doctor(),
  pin: (name: string) => App.Pin(name),
  unpin: (name: string) => App.Unpin(name),
  tapAdd: (name: string) => App.TapAdd(name),
  tapRemove: (name: string) => App.TapRemove(name),
  serviceStart: (name: string) => App.ServiceStart(name),
  serviceStop: (name: string) => App.ServiceStop(name),
  serviceRestart: (name: string) => App.ServiceRestart(name),
  cancelJob: (id: string) => App.CancelJob(id),
}
