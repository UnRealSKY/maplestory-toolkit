// DC 伺服器與頻道：一個伺服器＝名稱、名單、辛苦費開關；底下好幾個頻道，各自一條 webhook。
//
// 分寶紀錄綁伺服器（LootRecord.groupId）與頻道（LootRecord.channelId）：
// 發佈／同步用那個頻道的 webhook，顯示名字用伺服器的名冊——discordNickName 是伺服器
// 暱稱，同一個人在不同伺服器本來就可能不同名。
//
// 型別仍叫 DcGroup：改版前「群組」＝一個伺服器配一條 webhook，現在那條 webhook 變成
// 頻道清單，其餘欄位原封不動。介面上叫「伺服器」。

import { ref } from 'vue'
import {
  buildAliasMap,
  fetchRoster,
  loadListSource,
  migrateEntries,
  type ListSource,
  type RosterEntry,
} from './roster'
import { GROUPS_KEY, ACTIVE_GROUP_KEY } from '../storageKeys'

// 遷移來源（舊的單一設定）
const LEGACY_WEBHOOK_KEY = 'dc-webhook-url'
const LEGACY_ROSTER_KEY = 'dc-loot-roster'
const LEGACY_SOURCE_KEY = 'dc-roster-source'

// 舊的「預設來源」＝跟隨官方 repo，遷移後等價於指向這個網址的 url 模式
export const DEFAULT_ROSTER_URL =
  'https://raw.githubusercontent.com/UnRealSKY/maplestory-toolkit/main/members.json'

export type RosterMode = 'url' | 'local'

export interface DcChannel {
  id: string
  name: string
  webhookUrl: string
}

export interface DcGroup {
  id: string
  name: string
  rosterMode: RosterMode
  rosterUrl?: string // url 模式的來源
  enableLeaderFee?: boolean // 是否啟用團長辛苦費（未設＝關閉）
  roster: RosterEntry[] // url 模式時是快取
  channels: DcChannel[] // 至少一個
}

export const DEFAULT_CHANNEL_NAME = '分寶'

function newId(): string {
  return crypto.randomUUID()
}

// ---- 純函式（可單元測試）----

export interface MigrateInput {
  stored: unknown
  // 舊版的三個 key 是否真的存在。loadListSource 找不到時會回 { mode: 'default' }，
  // 光看 legacySource 分不出「使用者選過預設來源」與「全新使用者什麼都沒有」
  hasLegacy: boolean
  legacyWebhook: string
  legacyRoster: RosterEntry[]
  legacySource: ListSource
}

// 改版前的形狀：一個群組一條 webhook
interface LegacyGroup {
  id: string
  name: string
  webhookUrl: string
  rosterMode: RosterMode
  rosterUrl?: string
  enableLeaderFee?: boolean
  roster: RosterEntry[]
}

function hasIdAndName(raw: unknown): raw is { id: string; name: string } {
  if (!raw || typeof raw !== 'object') return false
  const g = raw as Record<string, unknown>
  return typeof g.id === 'string' && !!g.id && typeof g.name === 'string' && !!g.name
}

function isChannel(raw: unknown): raw is DcChannel {
  return hasIdAndName(raw)
}

function normalizeChannel(c: DcChannel): DcChannel {
  return { id: c.id, name: c.name, webhookUrl: typeof c.webhookUrl === 'string' ? c.webhookUrl : '' }
}

// 「伺服器-頻道」：最後一個「-」前面是伺服器、後面是頻道。沒有「-」就整個是伺服器名，頻道用預設名
export function splitGroupName(name: string): { server: string; channel: string } {
  const i = name.lastIndexOf('-')
  const server = i > 0 ? name.slice(0, i).trim() : name.trim()
  const channel = i > 0 ? name.slice(i + 1).trim() : ''
  return { server: server || name.trim(), channel: channel || DEFAULT_CHANNEL_NAME }
}

// 舊群組 → 伺服器＋頻道。名稱前半相同的合併成一個伺服器，各自的 webhook 變成底下的頻道，
// 頻道的 id 沿用舊群組的 id——舊紀錄的 groupId 就是靠這個找回它屬於哪個伺服器。
// 名單取那一組裡第一個非空的（同一個伺服器的名單本來就該一樣），辛苦費有一個開就開。
export function legacyToServers(legacy: LegacyGroup[]): DcGroup[] {
  const servers: DcGroup[] = []
  const byName = new Map<string, DcGroup>()
  for (const g of legacy) {
    const { server, channel } = splitGroupName(g.name)
    const ch: DcChannel = { id: g.id, name: channel, webhookUrl: g.webhookUrl }
    const existing = byName.get(server)
    if (!existing) {
      const created: DcGroup = {
        id: newId(),
        name: server,
        rosterMode: g.rosterMode,
        ...(g.rosterUrl ? { rosterUrl: g.rosterUrl } : {}),
        ...(g.enableLeaderFee ? { enableLeaderFee: true } : {}),
        roster: g.roster,
        channels: [ch],
      }
      byName.set(server, created)
      servers.push(created)
      continue
    }
    existing.channels.push(ch)
    if (g.enableLeaderFee) existing.enableLeaderFee = true
    if (!existing.roster.length && g.roster.length) {
      existing.roster = g.roster
      existing.rosterMode = g.rosterMode
      if (g.rosterUrl) existing.rosterUrl = g.rosterUrl
      else delete existing.rosterUrl
    }
  }
  return servers
}

// 已有資料就整理成現在的形狀（舊的單 webhook 形狀會合併成伺服器）；
// 否則把更舊的單一 webhook／名冊／來源合成第一個伺服器
export function migrateGroups(input: MigrateInput): DcGroup[] {
  if (Array.isArray(input.stored)) {
    const valid = input.stored.filter(hasIdAndName) as Array<Record<string, unknown>>
    const current: DcGroup[] = []
    const legacy: LegacyGroup[] = []
    for (const g of valid) {
      const rosterMode: RosterMode = g.rosterMode === 'local' ? 'local' : 'url'
      const roster = Array.isArray(g.roster) ? migrateEntries(g.roster) : []
      if (Array.isArray(g.channels)) {
        const channels = g.channels.filter(isChannel).map(normalizeChannel)
        current.push({
          ...(g as unknown as DcGroup),
          rosterMode,
          roster,
          channels: channels.length ? channels : [{ id: newId(), name: DEFAULT_CHANNEL_NAME, webhookUrl: '' }],
        })
        continue
      }
      legacy.push({
        id: g.id as string,
        name: g.name as string,
        webhookUrl: typeof g.webhookUrl === 'string' ? g.webhookUrl : '',
        rosterMode,
        ...(typeof g.rosterUrl === 'string' ? { rosterUrl: g.rosterUrl } : {}),
        ...(g.enableLeaderFee === true ? { enableLeaderFee: true } : {}),
        roster,
      })
    }
    const all = [...current, ...legacyToServers(legacy)]
    if (all.length) return all
  }

  // 全新使用者：給一個空伺服器。沒設過任何東西就不該自動跟隨官方 repo，
  // 那是取名「贖罪券」才做的事
  if (!input.hasLegacy) {
    return [emptyGroup('我的公會')]
  }

  const { legacySource } = input
  const local = legacySource.mode === 'local'
  return legacyToServers([
    {
      id: newId(),
      name: '我的公會',
      webhookUrl: input.legacyWebhook,
      rosterMode: local ? 'local' : 'url',
      // 舊的 default 模式沒存網址，補上官方 repo 的位址，行為與先前一致
      ...(local ? {} : { rosterUrl: legacySource.url || DEFAULT_ROSTER_URL }),
      roster: input.legacyRoster,
    },
  ])
}

function emptyGroup(name: string): DcGroup {
  return {
    id: newId(),
    name,
    rosterMode: 'local',
    roster: [],
    channels: [{ id: newId(), name: DEFAULT_CHANNEL_NAME, webhookUrl: '' }],
  }
}

export function addGroup(groups: DcGroup[], name: string): DcGroup[] {
  return [...groups, emptyGroup(name)]
}

export function updateGroup(groups: DcGroup[], id: string, part: Partial<DcGroup>): DcGroup[] {
  return groups.map((g) => (g.id === id ? { ...g, ...part, id: g.id } : g))
}

// 不允許刪到一個都不剩，否則設定頁會變成空白、紀錄也無處可綁
export function removeGroup(groups: DcGroup[], id: string): DcGroup[] {
  if (groups.length <= 1) return groups
  return groups.filter((g) => g.id !== id)
}

// ---- 頻道 ----

export function addChannel(groups: DcGroup[], groupId: string, name: string): DcGroup[] {
  return groups.map((g) =>
    g.id === groupId ? { ...g, channels: [...g.channels, { id: newId(), name, webhookUrl: '' }] } : g,
  )
}

export function updateChannel(
  groups: DcGroup[],
  groupId: string,
  channelId: string,
  part: Partial<DcChannel>,
): DcGroup[] {
  return groups.map((g) =>
    g.id === groupId
      ? { ...g, channels: g.channels.map((c) => (c.id === channelId ? { ...c, ...part, id: c.id } : c)) }
      : g,
  )
}

// 伺服器至少留一個頻道，紀錄才有地方綁。沒動到就回同一個陣列，呼叫端據此判斷要不要寫回
export function removeChannel(groups: DcGroup[], groupId: string, channelId: string): DcGroup[] {
  const g = groups.find((x) => x.id === groupId)
  if (!g || g.channels.length <= 1 || !g.channels.some((c) => c.id === channelId)) return groups
  return groups.map((x) => (x.id === groupId ? { ...x, channels: x.channels.filter((c) => c.id !== channelId) } : x))
}

// 把第 from 個搬到第 to 個的位置（拖拉排序用）；超出範圍回同一個陣列
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function reorderGroups(groups: DcGroup[], from: number, to: number): DcGroup[] {
  return moveItem(groups, from, to)
}

export function reorderChannels(groups: DcGroup[], groupId: string, from: number, to: number): DcGroup[] {
  return groups.map((g) => (g.id === groupId ? { ...g, channels: moveItem(g.channels, from, to) } : g))
}

// 頻道搬到另一個伺服器的第 toIndex 個位置。來源只剩它一個時不搬——伺服器不能沒有頻道
export function moveChannel(groups: DcGroup[], channelId: string, toGroupId: string, toIndex: number): DcGroup[] {
  const from = groups.find((g) => g.channels.some((c) => c.id === channelId))
  const to = groups.find((g) => g.id === toGroupId)
  if (!from || !to || from.channels.length <= 1) return groups
  if (from.id === to.id) return reorderChannels(groups, from.id, from.channels.findIndex((c) => c.id === channelId), toIndex)
  const channel = from.channels.find((c) => c.id === channelId)!
  return groups.map((g) => {
    if (g.id === from.id) return { ...g, channels: g.channels.filter((c) => c.id !== channelId) }
    if (g.id === to.id) {
      const channels = [...g.channels]
      channels.splice(Math.max(0, Math.min(toIndex, channels.length)), 0, channel)
      return { ...g, channels }
    }
    return g
  })
}

// ---- 查詢 ----

// 隱藏捷徑：伺服器取這個名字，名單自動接上本 repo 的 members.json，
// 不必自己去貼網址。回傳同一個物件代表沒有變動（呼叫端據此判斷要不要重抓）。
export const MAGIC_GROUP_NAME = '贖罪券'

export function applyMagicRoster(group: DcGroup): DcGroup {
  if (group.name.trim() !== MAGIC_GROUP_NAME) return group
  if (group.rosterMode === 'url' && group.rosterUrl === DEFAULT_ROSTER_URL) return group
  return { ...group, rosterMode: 'url', rosterUrl: DEFAULT_ROSTER_URL }
}

// 辛苦費開關。未設定＝關閉——多數團只收手續費不收辛苦費，要用的伺服器自己去設定頁打開。
export function leaderFeeEnabled(group: DcGroup | undefined): boolean {
  return group?.enableLeaderFee === true
}

// 找伺服器：id 直接對到伺服器；對不到就看是不是某個頻道的 id（改版前的群組 id 變成了頻道 id，
// 舊紀錄與舊的「目前群組」存的都是它）；都不是或沒指定時退回第一個伺服器
export function groupById(groups: DcGroup[], id: string | undefined): DcGroup | undefined {
  if (id) {
    const direct = groups.find((g) => g.id === id)
    if (direct) return direct
    const viaChannel = groups.find((g) => (g.channels ?? []).some((c) => c.id === id))
    if (viaChannel) return viaChannel
  }
  return groups[0]
}

// 找頻道：先定伺服器，再找 channelId；沒有 channelId 的舊紀錄若 groupId 本身是頻道 id 就用它，
// 否則第一個頻道
export function channelById(
  groups: DcGroup[],
  groupId: string | undefined,
  channelId: string | undefined,
): DcChannel | undefined {
  const g = groupById(groups, groupId)
  if (!g) return undefined
  return (
    (channelId ? g.channels.find((c) => c.id === channelId) : undefined) ??
    (groupId ? g.channels.find((c) => c.id === groupId) : undefined) ??
    g.channels[0]
  )
}

// 綁在某伺服器的紀錄數（含舊紀錄：它們的 groupId 是頻道 id，一樣會找回這個伺服器）
export function countRecordsIn(
  records: Array<{ groupId?: string; channelId?: string }>,
  groups: DcGroup[],
  id: string,
): number {
  return records.filter((r) => groupById(groups, r.groupId)?.id === id).length
}

export function countRecordsInChannel(
  records: Array<{ groupId?: string; channelId?: string }>,
  groups: DcGroup[],
  channelId: string,
): number {
  return records.filter((r) => channelById(groups, r.groupId, r.channelId)?.id === channelId).length
}

// 在指定伺服器的名冊裡查顯示名；查不到就顯示原 handle
export function nameIn(groups: DcGroup[], groupId: string | undefined, handle: string): string {
  return aliasIn(groups, groupId, handle) ?? handle
}

export function aliasIn(
  groups: DcGroup[],
  groupId: string | undefined,
  handle: string,
): string | undefined {
  const g = groupById(groups, groupId)
  if (!g) return undefined
  return buildAliasMap(g.roster).get(handle)
}

// ---- 響應式單例 ----

function loadGroups(): DcGroup[] {
  let stored: unknown = null
  try {
    stored = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? 'null')
  } catch {
    // 壞資料走遷移路徑
  }
  let legacyRoster: RosterEntry[] = []
  try {
    legacyRoster = migrateEntries(JSON.parse(localStorage.getItem(LEGACY_ROSTER_KEY) ?? '[]'))
  } catch {
    // 沒有舊名冊就空的
  }
  const groups = migrateGroups({
    stored,
    hasLegacy: [LEGACY_WEBHOOK_KEY, LEGACY_ROSTER_KEY, LEGACY_SOURCE_KEY].some(
      (k) => localStorage.getItem(k) !== null,
    ),
    legacyWebhook: localStorage.getItem(LEGACY_WEBHOOK_KEY) ?? '',
    legacyRoster,
    legacySource: loadListSource(LEGACY_SOURCE_KEY),
  })
  // 遷移過（含舊形狀合併成伺服器）就立即寫回，不然每次開站都要重來一次
  const migrated =
    !Array.isArray(stored) || (stored as unknown[]).some((g) => !g || typeof g !== 'object' || !('channels' in g))
  if (migrated) localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
  return groups
}

const groups = ref<DcGroup[]>(loadGroups())
const activeId = ref<string>(
  groupById(groups.value, localStorage.getItem(ACTIVE_GROUP_KEY) || undefined)?.id || '',
)

function persist(): void {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups.value))
}

export function useGroups() {
  return { groups, activeId }
}

export function activeGroup(): DcGroup | undefined {
  return groupById(groups.value, activeId.value)
}

export function setActiveGroup(id: string): void {
  activeId.value = id
  localStorage.setItem(ACTIVE_GROUP_KEY, id)
}

export function createGroup(name: string): DcGroup {
  groups.value = addGroup(groups.value, name)
  const created = groups.value[groups.value.length - 1]
  persist()
  setActiveGroup(created.id)
  // 空更新只為了走 patchGroup 裡的 applyMagicRoster——直接用魔法名字建立時也要接上名冊
  patchGroup(created.id, {})
  return groups.value.find((g) => g.id === created.id) ?? created
}

export function patchGroup(id: string, part: Partial<DcGroup>): void {
  groups.value = updateGroup(groups.value, id, part)
  const g = groups.value.find((x) => x.id === id)
  const magic = g ? applyMagicRoster(g) : undefined
  // 取名「贖罪券」時自動接上本 repo 的名冊並立即抓一次；
  // 已經接好的情況 applyMagicRoster 回傳同一個物件，不會重複觸發
  if (g && magic && magic !== g) {
    groups.value = updateGroup(groups.value, id, magic)
    persist()
    void refreshRoster(id)
    return
  }
  persist()
}

export function createChannel(groupId: string, name: string): DcChannel {
  groups.value = addChannel(groups.value, groupId, name)
  persist()
  const g = groups.value.find((x) => x.id === groupId)!
  return g.channels[g.channels.length - 1]
}

export function patchChannel(groupId: string, channelId: string, part: Partial<DcChannel>): void {
  groups.value = updateChannel(groups.value, groupId, channelId, part)
  persist()
}

export function deleteChannel(groupId: string, channelId: string): void {
  const next = removeChannel(groups.value, groupId, channelId)
  if (next === groups.value) return
  groups.value = next
  persist()
}

export function moveGroup(from: number, to: number): void {
  groups.value = reorderGroups(groups.value, from, to)
  persist()
}

export function moveChannelTo(channelId: string, toGroupId: string, toIndex: number): void {
  groups.value = moveChannel(groups.value, channelId, toGroupId, toIndex)
  persist()
}

// 重抓單一伺服器的名冊（url 模式才有作用）；失敗沿用既有快取
export async function refreshRoster(id: string): Promise<void> {
  const g = groups.value.find((x) => x.id === id)
  if (!g || g.rosterMode !== 'url' || !g.rosterUrl) return
  loading.value = true
  try {
    patchGroup(id, { roster: await fetchRoster(g.rosterUrl) })
  } catch {
    // 離線或抓取失敗：沿用快取
  } finally {
    loading.value = false
  }
}

export function deleteGroup(id: string): void {
  const next = removeGroup(groups.value, id)
  if (next === groups.value) return
  groups.value = next
  persist()
  if (activeId.value === id) setActiveGroup(next[0].id)
}

export function groupOf(groupId: string | undefined): DcGroup | undefined {
  return groupById(groups.value, groupId)
}

export function channelOf(groupId: string | undefined, channelId: string | undefined): DcChannel | undefined {
  return channelById(groups.value, groupId, channelId)
}

// 發佈用的 webhook：看紀錄綁的頻道
export function webhookFor(groupId: string | undefined, channelId: string | undefined): string {
  return channelOf(groupId, channelId)?.webhookUrl ?? ''
}

// 給 calc/format 用的選項：那兩層是純函式，開關由這裡查好再傳進去
export function distOptionsFor(groupId: string | undefined) {
  return { leaderFeeEnabled: leaderFeeEnabled(groupOf(groupId)) }
}

// 顯示用名稱：依紀錄所屬伺服器的名冊查，查不到就用原 handle
export function displayNameIn(groupId: string | undefined, handle: string): string {
  return nameIn(groups.value, groupId, handle)
}

export function aliasOfIn(groupId: string | undefined, handle: string): string | undefined {
  return aliasIn(groups.value, groupId, handle)
}

export function rosterHandlesIn(groupId: string | undefined): string[] {
  return (groupOf(groupId)?.roster ?? []).map((e) => e.discordHandle).filter(Boolean)
}

// 有填 Discord 使用者 ID 的名冊項（handle → <@ID> 轉換用）
export function mentionsIn(groupId: string | undefined): Array<{ handle: string; id: string }> {
  return (groupOf(groupId)?.roster ?? [])
    .filter((e) => e.discordHandle && e.discordId)
    .map((e) => ({ handle: e.discordHandle, id: String(e.discordId) }))
}

// 名冊背景載入中（autocomplete 顯示「載入中」提示用）
const loading = ref(false)
export function rosterLoading() {
  return loading
}

// 開站呼叫一次：url 模式的伺服器在背景重抓名冊並回寫快取
export async function initGroups(): Promise<void> {
  const targets = groups.value.filter((g) => g.rosterMode === 'url' && g.rosterUrl)
  if (!targets.length) return
  loading.value = true
  try {
    await Promise.all(
      targets.map(async (g) => {
        try {
          patchGroup(g.id, { roster: await fetchRoster(g.rosterUrl!) })
        } catch {
          // 離線或抓取失敗：沿用快取
        }
      }),
    )
  } finally {
    loading.value = false
  }
}
