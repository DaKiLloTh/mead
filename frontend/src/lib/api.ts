import * as App from '../../wailsjs/go/app/App'
import { brew, security, store } from '../../wailsjs/go/models'

export type BrewPackage = brew.BrewPackage
export type CacheInfo = brew.CacheInfo
export type OutdatedPackage = brew.OutdatedPackage
export type SearchResult = brew.SearchResult
export type Service = brew.Service
export type SystemInfo = brew.SystemInfo
export type UserData = store.UserData
export type HistoryEntry = store.HistoryEntry
export type VulnResult = security.VulnResult
export type SecurityInfo = security.SecurityInfo
export type AdoptCandidate = brew.AdoptCandidate
export type DuplicateApp = brew.DuplicateApp
export type MasApp = brew.MasApp
export type Collection = brew.Collection
export type TapDetail = brew.TapDetail
export type BundleCleanupItem = brew.BundleCleanupItem
export type PackageSize = brew.PackageSize

export const api = {
  getSystemInfo: () => App.GetSystemInfo(),
  listInstalled: () => App.ListInstalled(),
  getInfo: (name: string, isCask: boolean) => App.GetInfo(name, isCask),
  search: (query: string, desc = false) => App.Search(query, desc),
  outdated: (greedy = false) => App.Outdated(greedy),
  missing: () => App.Missing(),
  taps: () => App.Taps(),
  tapInfo: (name: string) => App.TapInfo(name),
  services: () => App.Services(),
  leaves: () => App.Leaves(),
  uses: (name: string) => App.Uses(name),
  deps: (name: string, isCask: boolean) => App.Deps(name, isCask),
  cacheInfo: () => App.GetCacheInfo(),
  largestInstalledPackages: () => App.LargestInstalledPackages(),
  config: () => App.Config(),

  install: (name: string, isCask: boolean) => App.Install(name, isCask),
  uninstall: (name: string, isCask: boolean, zap = false, force = false) => App.Uninstall(name, isCask, zap, force),
  reinstall: (name: string, isCask: boolean) => App.Reinstall(name, isCask),
  upgrade: (name: string, isCask: boolean) => App.Upgrade(name, isCask),
  upgradeAll: (greedy = false) => App.UpgradeAll(greedy),
  update: () => App.Update(),
  cleanup: (dryRun: boolean) => App.Cleanup(dryRun),
  clearCache: () => App.ClearCache(),
  doctor: () => App.Doctor(),
  pin: (name: string) => App.Pin(name),
  unpin: (name: string) => App.Unpin(name),
  link: (name: string, overwrite = false) => App.Link(name, overwrite),
  unlink: (name: string) => App.Unlink(name),
  tapAdd: (name: string) => App.TapAdd(name),
  tapRemove: (name: string) => App.TapRemove(name),
  tapRemoveForce: (name: string) => App.TapRemoveForce(name),
  serviceStart: (name: string) => App.ServiceStart(name),
  serviceStop: (name: string) => App.ServiceStop(name),
  serviceRestart: (name: string) => App.ServiceRestart(name),
  servicesCleanup: () => App.ServicesCleanup(),
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
  removeQuarantine: (name: string) => App.RemoveQuarantine(name),

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
  pickBrewfile: () => App.PickBrewfile(),
  bundleCheck: (path: string) => App.BundleCheck(path),
  bundleList: (path: string) => App.BundleList(path),
  bundleCleanupPreview: (path: string) => App.BundleCleanupPreview(path),
  bundleCleanup: (path: string) => App.BundleCleanup(path),

  gistLogs: (name: string) => App.GistLogs(name),

  // reveal / snapshot
  revealPackage: (name: string, isCask: boolean) => App.RevealPackage(name, isCask),
  revealLocalDataFile: () => App.RevealLocalDataFile(),
  createSnapshot: () => App.CreateSnapshot(),

  // app icons / launching
  caskIcon: (name: string) => App.CaskIcon(name),
  openCaskApp: (name: string) => App.OpenCaskApp(name),

  // settings
  setCaskAppDir: (dir: string) => App.SetCaskAppDir(dir),
  clearAllData: () => App.ClearAllData(),

  // user data backup/restore
  exportUserDataToFile: () => App.ExportUserDataToFile(),
  pickUserDataFile: () => App.PickUserDataFile(),
  importUserDataFromFile: (path: string) => App.ImportUserDataFromFile(path),
  analyticsState: () => App.AnalyticsState(),
  analyticsSetEnabled: (enabled: boolean) => App.AnalyticsSetEnabled(enabled),
  analyticsRegenerateUUID: () => App.AnalyticsRegenerateUUID(),

  // locale
  systemLocale: () => App.SystemLocale(),
}

export function pkgKey(name: string, isCask: boolean): string {
  return (isCask ? 'cask:' : 'formula:') + name
}
