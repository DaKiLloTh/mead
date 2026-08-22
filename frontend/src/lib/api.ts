import * as App from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

export type BrewPackage = main.BrewPackage
export type CacheInfo = main.CacheInfo
export type OutdatedPackage = main.OutdatedPackage
export type SearchResult = main.SearchResult
export type Service = main.Service
export type SystemInfo = main.SystemInfo
export type UserData = main.UserData
export type HistoryEntry = main.HistoryEntry
export type VulnResult = main.VulnResult
export type SecurityInfo = main.SecurityInfo
export type AdoptCandidate = main.AdoptCandidate
export type DuplicateApp = main.DuplicateApp
export type MasApp = main.MasApp
export type Collection = main.Collection
export type CollectionPackage = main.CollectionPackage

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

  autoremove: (dryRun: boolean) => App.Autoremove(dryRun),

  // user data
  getUserData: () => App.GetUserData(),
  toggleFavorite: (name: string, isCask: boolean) => App.ToggleFavorite(name, isCask),
  setTags: (name: string, isCask: boolean, tags: string[]) => App.SetTags(name, isCask, tags),
  setNote: (name: string, isCask: boolean, note: string) => App.SetNote(name, isCask, note),
  snoozePackage: (name: string, isCask: boolean, days: number) => App.SnoozePackage(name, isCask, days),
  unsnoozePackage: (name: string, isCask: boolean) => App.UnsnoozePackage(name, isCask),
  clearHistory: () => App.ClearHistory(),

  // security
  scanVulnerabilities: () => App.ScanVulnerabilities(),
  inspectCaskSecurity: (name: string) => App.InspectCaskSecurity(name),
  removeQuarantine: (appPath: string) => App.RemoveQuarantine(appPath),

  // adopt & duplicates
  scanAdoptableApps: () => App.ScanAdoptableApps(),
  adoptCask: (name: string) => App.AdoptCask(name),
  findDuplicateApps: () => App.FindDuplicateApps(),

  // Mac App Store
  masAvailable: () => App.MasAvailable(),
  masList: () => App.MasList(),
  masOutdated: () => App.MasOutdated(),
  masUpgrade: (id: string) => App.MasUpgrade(id),
  masUpgradeAll: () => App.MasUpgradeAll(),

  // collections
  getCollections: () => App.GetCollections(),
  installCollection: (name: string) => App.InstallCollection(name),

  // brewfile
  exportBrewfileToFile: () => App.ExportBrewfileToFile(),
  importBrewfile: () => App.ImportBrewfile(),
}

export function pkgKey(name: string, isCask: boolean): string {
  return (isCask ? 'cask:' : 'formula:') + name
}
