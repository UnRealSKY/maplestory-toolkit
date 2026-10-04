import { describe, it, expect } from 'vitest'
import {
  migrateGroups,
  addGroup,
  removeGroup,
  updateGroup,
  groupById,
  nameIn,
  countRecordsIn,
  applyMagicRoster,
  leaderFeeEnabled,
  DEFAULT_ROSTER_URL,
  type DcGroup,
} from '#src/store/groups'
import type { RosterEntry } from '#src/store/roster'

const roster = (entries: Partial<RosterEntry>[]): RosterEntry[] =>
  entries.map((e) => ({ discordHandle: '', discordNickName: '', ...e }))

const group = (over: Partial<DcGroup>): DcGroup => ({
  id: 'g1', name: '我的公會', rosterMode: 'local', roster: [],
  channels: [{ id: `${over.id ?? 'g1'}-ch`, name: '分寶', webhookUrl: '' }], ...over,
})

describe('migrateGroups', () => {
  it('沒有群組資料時，用舊的 webhook／名冊／來源合成第一個群組', () => {
    const groups = migrateGroups({
      stored: null,
      hasLegacy: true,
      legacyWebhook: 'https://discord.com/api/webhooks/1/abc',
      legacyRoster: roster([{ discordHandle: '@a', discordNickName: '甲' }]),
      legacySource: { mode: 'default' },
    })
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      name: '我的公會',
      rosterMode: 'url', // 舊的「預設來源」＝跟隨官方 repo，轉成 url 模式
    })
    expect(groups[0].channels).toHaveLength(1)
    expect(groups[0].channels[0].webhookUrl).toBe('https://discord.com/api/webhooks/1/abc')
    expect(groups[0].rosterUrl).toContain('members.json')
    expect(groups[0].roster).toHaveLength(1)
  })

  it('舊的自訂 URL 模式帶著網址轉過來', () => {
    const [g] = migrateGroups({
      stored: null,
      hasLegacy: true,
      legacyWebhook: '',
      legacyRoster: [],
      legacySource: { mode: 'url', url: 'https://x/m.json' },
    })
    expect(g).toMatchObject({ rosterMode: 'url', rosterUrl: 'https://x/m.json' })
  })

  it('舊的自行輸入模式轉成 local', () => {
    const [g] = migrateGroups({
      stored: null, hasLegacy: true, legacyWebhook: '', legacyRoster: [], legacySource: { mode: 'local' },
    })
    expect(g.rosterMode).toBe('local')
    expect(g.rosterUrl).toBeUndefined()
  })

  it('全新使用者（localStorage 一片空白）拿到空群組，不自動帶入任何名冊', () => {
    const groups = migrateGroups({
      stored: null, hasLegacy: false, legacyWebhook: '', legacyRoster: [], legacySource: { mode: 'default' },
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBeTruthy()
    // 沒設過任何東西就不該跟隨官方 repo——那是「贖罪券」捷徑才做的事
    expect(groups[0].rosterMode).toBe('local')
    expect(groups[0].rosterUrl).toBeUndefined()
    expect(groups[0].roster).toEqual([])
    expect(groups[0].channels).toHaveLength(1)
    expect(groups[0].channels[0].webhookUrl).toBe('')
  })

  it('有舊資料時才沿用「預設來源」＝跟隨官方 repo', () => {
    const [g] = migrateGroups({
      stored: null, hasLegacy: true, legacyWebhook: '', legacyRoster: [], legacySource: { mode: 'default' },
    })
    expect(g.rosterMode).toBe('url')
    expect(g.rosterUrl).toBe(DEFAULT_ROSTER_URL)
  })

  it('已有群組資料時原樣沿用，不再做遷移', () => {
    const stored = [group({ id: 'x', name: '第二公會' })]
    expect(migrateGroups({
      stored, hasLegacy: true, legacyWebhook: 'https://should.not/matter', legacyRoster: [], legacySource: { mode: 'default' },
    })).toEqual(stored)
  })

  it('壞掉的群組資料退回遷移路徑', () => {
    const groups = migrateGroups({
      stored: 'not an array', hasLegacy: true, legacyWebhook: '', legacyRoster: [], legacySource: { mode: 'default' },
    })
    expect(groups).toHaveLength(1)
  })

  it('過濾掉缺 id 或名稱的項目', () => {
    const stored = [group({ id: 'ok' }), { id: '', name: 'x' }, { name: '沒有 id' }]
    expect(migrateGroups({
      stored, hasLegacy: true, legacyWebhook: '', legacyRoster: [], legacySource: { mode: 'default' },
    }).map((g) => g.id)).toEqual(['ok'])
  })
})

describe('群組增刪改', () => {
  const base = [group({ id: 'g1', name: 'A' }), group({ id: 'g2', name: 'B' })]

  it('新增群組接在最後，id 不重複', () => {
    const next = addGroup(base, '新公會')
    expect(next).toHaveLength(3)
    expect(next[2].name).toBe('新公會')
    expect(new Set(next.map((g) => g.id)).size).toBe(3)
  })

  it('更新只影響指定群組', () => {
    const next = updateGroup(base, 'g2', { name: 'B2', enableLeaderFee: true })
    expect(next[0]).toEqual(base[0])
    expect(next[1]).toMatchObject({ id: 'g2', name: 'B2', enableLeaderFee: true })
  })

  it('更新不存在的 id 不改變任何東西', () => {
    expect(updateGroup(base, 'nope', { name: 'x' })).toEqual(base)
  })

  it('移除指定群組', () => {
    expect(removeGroup(base, 'g1').map((g) => g.id)).toEqual(['g2'])
  })

  it('不允許移除最後一個群組（設定頁不能變成空白）', () => {
    const one = [group({ id: 'only' })]
    expect(removeGroup(one, 'only')).toEqual(one)
  })

  it('不改動傳入的陣列', () => {
    addGroup(base, 'x')
    updateGroup(base, 'g1', { name: 'changed' })
    removeGroup(base, 'g1')
    expect(base.map((g) => g.name)).toEqual(['A', 'B'])
  })
})

describe('groupById', () => {
  const groups = [group({ id: 'g1', name: 'A' }), group({ id: 'g2', name: 'B' })]

  it('找得到就回該群組', () => {
    expect(groupById(groups, 'g2')?.name).toBe('B')
  })

  it('id 是 undefined 或找不到時退回第一個群組（舊紀錄相容）', () => {
    expect(groupById(groups, undefined)?.name).toBe('A')
    expect(groupById(groups, 'gone')?.name).toBe('A')
  })

  it('沒有任何群組時回 undefined', () => {
    expect(groupById([], 'g1')).toBeUndefined()
  })
})

describe('nameIn', () => {
  const groups = [
    group({ id: 'g1', roster: roster([{ discordHandle: '@a', discordNickName: '甲群的暱稱' }]) }),
    group({
      id: 'g2',
      roster: roster([{ discordHandle: '@a', discordNickName: '乙群的暱稱', alias: '自訂' }]),
    }),
  ]

  it('同一個 handle 在不同群組顯示各自的名字', () => {
    expect(nameIn(groups, 'g1', '@a')).toBe('甲群的暱稱')
    expect(nameIn(groups, 'g2', '@a')).toBe('自訂')
  })

  it('名冊裡沒有的人顯示原 handle', () => {
    expect(nameIn(groups, 'g1', '@nobody')).toBe('@nobody')
  })

  it('groupId 是 undefined 時用第一個群組', () => {
    expect(nameIn(groups, undefined, '@a')).toBe('甲群的暱稱')
  })
})

describe('countRecordsIn', () => {
  const groups = [group({ id: 'g1' }), group({ id: 'g2' })]

  it('依 groupId 計數', () => {
    const records = [{ groupId: 'g1' }, { groupId: 'g2' }, { groupId: 'g2' }]
    expect(countRecordsIn(records, groups, 'g1')).toBe(1)
    expect(countRecordsIn(records, groups, 'g2')).toBe(2)
  })

  it('沒有 groupId 的舊紀錄算在第一個群組頭上', () => {
    const records = [{}, { groupId: 'g2' }]
    expect(countRecordsIn(records, groups, 'g1')).toBe(1)
    expect(countRecordsIn(records, groups, 'g2')).toBe(1)
  })

  it('沒有紀錄時回 0', () => {
    expect(countRecordsIn([], groups, 'g1')).toBe(0)
  })
})

describe('applyMagicRoster（隱藏設定：群組取名「贖罪券」）', () => {
  it('名稱為贖罪券時自動指向本 repo 的 members.json', () => {
    const g = applyMagicRoster(group({ name: '贖罪券', rosterMode: 'local', roster: [] }))
    expect(g.rosterMode).toBe('url')
    expect(g.rosterUrl).toBe(DEFAULT_ROSTER_URL)
  })

  it('前後空白不影響判定', () => {
    expect(applyMagicRoster(group({ name: '  贖罪券  ' })).rosterUrl).toBe(DEFAULT_ROSTER_URL)
  })

  it('其他名稱原樣不動', () => {
    const g = group({ name: '別的公會', rosterMode: 'local' })
    expect(applyMagicRoster(g)).toBe(g)
  })

  it('已經指向該網址時回傳同一個物件（避免無限重抓）', () => {
    const g = group({ name: '贖罪券', rosterMode: 'url', rosterUrl: DEFAULT_ROSTER_URL })
    expect(applyMagicRoster(g)).toBe(g)
  })

  it('不改動傳入的群組', () => {
    const g = group({ name: '贖罪券', rosterMode: 'local' })
    applyMagicRoster(g)
    expect(g.rosterMode).toBe('local')
  })

  it('保留名冊以外的設定（頻道與 webhook 不受影響）', () => {
    const channels = [{ id: 'c', name: '分寶', webhookUrl: 'https://x/y' }]
    const g = applyMagicRoster(group({ name: '贖罪券', channels }))
    expect(g.channels).toBe(channels)
  })
})

describe('辛苦費開關', () => {
  it('未設定時關閉——多數團只收手續費', () => {
    expect(leaderFeeEnabled(group({}))).toBe(false)
    expect(leaderFeeEnabled(undefined)).toBe(false)
  })

  it('明確關閉才是關閉', () => {
    expect(leaderFeeEnabled(group({ enableLeaderFee: false }))).toBe(false)
    expect(leaderFeeEnabled(group({ enableLeaderFee: true }))).toBe(true)
  })
})
