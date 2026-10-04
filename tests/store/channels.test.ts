import { describe, it, expect } from 'vitest'
import {
  migrateGroups,
  splitGroupName,
  legacyToServers,
  addGroup,
  addChannel,
  updateChannel,
  removeChannel,
  moveItem,
  reorderGroups,
  reorderChannels,
  moveChannel,
  groupById,
  channelById,
  countRecordsIn,
  countRecordsInChannel,
  DEFAULT_CHANNEL_NAME,
  type DcGroup,
} from '#src/store/groups'

const migrate = (stored: unknown) =>
  migrateGroups({ stored, hasLegacy: false, legacyWebhook: '', legacyRoster: [], legacySource: { mode: 'default' } })

const entry = (h: string, n: string) => ({ discordHandle: h, discordNickName: n })

// 使用者的實際資料（去掉 webhook 內容）：四個舊群組其實是兩個伺服器各兩個頻道
const LEGACY = [
  { id: 'tt', name: '贖罪券-天團', webhookUrl: 'hook-tt', rosterMode: 'url', rosterUrl: 'https://x/m.json', roster: [entry('@a', '甲')] },
  { id: 'w2', name: '周末要打王-二團', webhookUrl: 'hook-w2', rosterMode: 'local', roster: [entry('@b', '乙')], enableLeaderFee: false },
  { id: 'wt', name: '贖罪券-歪團', webhookUrl: 'hook-wt', rosterMode: 'url', rosterUrl: 'https://x/m.json', roster: [entry('@a', '甲')], enableLeaderFee: false },
  { id: 'w1', name: '周末要打王-一團', webhookUrl: 'hook-w1', rosterMode: 'local', roster: [], enableLeaderFee: true },
]

describe('splitGroupName', () => {
  it('最後一個「-」前面是伺服器、後面是頻道', () => {
    expect(splitGroupName('贖罪券-天團')).toEqual({ server: '贖罪券', channel: '天團' })
    expect(splitGroupName('a-b-c')).toEqual({ server: 'a-b', channel: 'c' })
  })
  it('沒有「-」就整個是伺服器名，頻道用預設名', () => {
    expect(splitGroupName('我的公會')).toEqual({ server: '我的公會', channel: DEFAULT_CHANNEL_NAME })
  })
  it('「-」在頭尾不算切點', () => {
    expect(splitGroupName('-天團')).toEqual({ server: '-天團', channel: DEFAULT_CHANNEL_NAME })
    expect(splitGroupName('贖罪券-')).toEqual({ server: '贖罪券', channel: DEFAULT_CHANNEL_NAME })
  })
})

describe('舊群組合併成伺服器與頻道', () => {
  const servers = migrate(LEGACY)

  it('兩個伺服器，各兩個頻道，頻道順序照原本', () => {
    expect(servers.map((s) => s.name)).toEqual(['贖罪券', '周末要打王'])
    expect(servers[0].channels.map((c) => c.name)).toEqual(['天團', '歪團'])
    expect(servers[1].channels.map((c) => c.name)).toEqual(['二團', '一團'])
  })

  it('頻道的 id 沿用舊群組的 id、webhook 跟著走；伺服器拿新的 id', () => {
    expect(servers[0].channels.map((c) => c.id)).toEqual(['tt', 'wt'])
    expect(servers[0].channels.map((c) => c.webhookUrl)).toEqual(['hook-tt', 'hook-wt'])
    expect(['tt', 'wt', 'w1', 'w2']).not.toContain(servers[0].id)
  })

  it('名單取那一組第一個非空的，連來源模式一起', () => {
    expect(servers[0]).toMatchObject({ rosterMode: 'url', rosterUrl: 'https://x/m.json' })
    expect(servers[0].roster).toHaveLength(1)
    // 周末：二團有名單、一團是空的 → 用二團的
    expect(servers[1]).toMatchObject({ rosterMode: 'local' })
    expect(servers[1].roster).toEqual([entry('@b', '乙')])
    expect(servers[1].rosterUrl).toBeUndefined()
  })

  it('辛苦費有一個開就開', () => {
    expect(servers[0].enableLeaderFee).toBeUndefined()
    expect(servers[1].enableLeaderFee).toBe(true)
  })

  it('沒有「-」的舊群組自己一個伺服器，頻道用預設名', () => {
    const [s] = migrate([{ id: 'g', name: '我的公會', webhookUrl: 'h', rosterMode: 'local', roster: [] }])
    expect(s.name).toBe('我的公會')
    expect(s.channels).toEqual([{ id: 'g', name: DEFAULT_CHANNEL_NAME, webhookUrl: 'h' }])
  })

  it('已經是新形狀的原樣沿用，不會再被合併', () => {
    const stored: DcGroup[] = [
      { id: 's1', name: 'A-x', rosterMode: 'local', roster: [], channels: [{ id: 'c1', name: '甲', webhookUrl: '' }] },
      { id: 's2', name: 'A-y', rosterMode: 'local', roster: [], channels: [{ id: 'c2', name: '乙', webhookUrl: '' }] },
    ]
    expect(migrate(stored)).toEqual(stored)
  })

  it('新舊形狀混在一起：舊的合併、新的照舊', () => {
    const out = migrate([
      { id: 's1', name: '新', rosterMode: 'local', roster: [], channels: [{ id: 'c1', name: '甲', webhookUrl: '' }] },
      ...LEGACY,
    ])
    expect(out.map((s) => s.name)).toEqual(['新', '贖罪券', '周末要打王'])
  })

  it('新形狀但頻道壞掉或空的：補一個預設頻道，伺服器不能沒有頻道', () => {
    const [s] = migrate([{ id: 's1', name: '新', rosterMode: 'local', roster: [], channels: [] }])
    expect(s.channels).toHaveLength(1)
    expect(s.channels[0].name).toBe(DEFAULT_CHANNEL_NAME)
  })

  it('legacyToServers 直接呼叫也是同一套', () => {
    expect(legacyToServers(LEGACY as never).map((s) => s.channels.length)).toEqual([2, 2])
  })
})

describe('頻道增刪改與排序', () => {
  const base: DcGroup[] = [
    { id: 's1', name: 'A', rosterMode: 'local', roster: [], channels: [{ id: 'a1', name: '一', webhookUrl: '' }, { id: 'a2', name: '二', webhookUrl: '' }] },
    { id: 's2', name: 'B', rosterMode: 'local', roster: [], channels: [{ id: 'b1', name: '壹', webhookUrl: '' }] },
  ]

  it('新伺服器自帶一個預設頻道', () => {
    const out = addGroup(base, 'C')
    expect(out[2].channels).toHaveLength(1)
    expect(out[2].channels[0].name).toBe(DEFAULT_CHANNEL_NAME)
  })

  it('新增頻道接在該伺服器最後', () => {
    const out = addChannel(base, 's1', '三')
    expect(out[0].channels.map((c) => c.name)).toEqual(['一', '二', '三'])
    expect(out[1]).toBe(base[1])
  })

  it('更新只動那一個頻道，id 改不掉', () => {
    const out = updateChannel(base, 's1', 'a2', { name: '貳', id: 'hack' } as never)
    expect(out[0].channels[1]).toEqual({ id: 'a2', name: '貳', webhookUrl: '' })
    expect(out[0].channels[0]).toEqual(base[0].channels[0])
  })

  it('刪頻道；最後一個刪不掉', () => {
    expect(removeChannel(base, 's1', 'a1')[0].channels.map((c) => c.id)).toEqual(['a2'])
    expect(removeChannel(base, 's2', 'b1')).toBe(base)
  })

  it('moveItem：往後搬、往前搬、超出範圍不動', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(moveItem([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3])
    const same = [1, 2]
    expect(moveItem(same, 0, 5)).toBe(same)
    expect(moveItem(same, 1, 1)).toBe(same)
  })

  it('伺服器排序與同伺服器內頻道排序', () => {
    expect(reorderGroups(base, 1, 0).map((g) => g.id)).toEqual(['s2', 's1'])
    expect(reorderChannels(base, 's1', 1, 0)[0].channels.map((c) => c.id)).toEqual(['a2', 'a1'])
  })

  it('頻道搬到另一個伺服器的指定位置', () => {
    const out = moveChannel(base, 'a2', 's2', 0)
    expect(out[0].channels.map((c) => c.id)).toEqual(['a1'])
    expect(out[1].channels.map((c) => c.id)).toEqual(['a2', 'b1'])
  })

  it('來源只剩一個頻道時不搬——伺服器不能沒有頻道', () => {
    expect(moveChannel(base, 'b1', 's1', 0)).toBe(base)
  })

  it('搬到同一個伺服器等於排序', () => {
    expect(moveChannel(base, 'a2', 's1', 0)[0].channels.map((c) => c.id)).toEqual(['a2', 'a1'])
  })
})

describe('用舊 id 找回伺服器與頻道', () => {
  const servers = migrate(LEGACY)
  const records = [
    { groupId: 'wt' }, // 舊紀錄：groupId 是改版前的群組 id（現在是頻道 id）
    { groupId: servers[0].id, channelId: 'tt' },
    { groupId: servers[1].id }, // 沒指定頻道 → 第一個
    {},
  ]

  it('groupById：伺服器 id、頻道 id 都找得到；沒指定退回第一個', () => {
    expect(groupById(servers, servers[1].id)?.name).toBe('周末要打王')
    expect(groupById(servers, 'wt')?.name).toBe('贖罪券')
    expect(groupById(servers, undefined)?.name).toBe('贖罪券')
    expect(groupById(servers, 'nope')?.name).toBe('贖罪券')
  })

  it('channelById：舊紀錄的 groupId 就是它的頻道；新紀錄照 channelId；沒指定用第一個', () => {
    expect(channelById(servers, 'wt', undefined)?.name).toBe('歪團')
    expect(channelById(servers, servers[0].id, 'tt')?.name).toBe('天團')
    expect(channelById(servers, servers[1].id, undefined)?.name).toBe('二團')
    expect(channelById(servers, undefined, undefined)?.name).toBe('天團')
  })

  it('計數：伺服器含舊紀錄；頻道各算各的', () => {
    expect(countRecordsIn(records, servers, servers[0].id)).toBe(3)
    expect(countRecordsIn(records, servers, servers[1].id)).toBe(1)
    expect(countRecordsInChannel(records, servers, 'wt')).toBe(1)
    expect(countRecordsInChannel(records, servers, 'tt')).toBe(2) // 指定的＋沒指定落到第一個的
    expect(countRecordsInChannel(records, servers, 'w2')).toBe(1)
  })
})
