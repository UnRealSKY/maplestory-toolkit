import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GROUPS_KEY, ITEMS_SOURCE_KEY } from '#src/storageKeys'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('群組名冊載入', () => {
  it('全新使用者不抓任何名冊（沒設過就不該自動跟隨官方 repo）', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const groups = await import('#src/store/groups')
    await groups.initGroups()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(groups.rosterHandlesIn(undefined)).toEqual([])
  })

  it('有舊的來源設定時，遷移出的群組跟隨官方 members.json 並回寫快取', async () => {
    localStorage.setItem('dc-roster-source', JSON.stringify({ mode: 'default' }))
    const fetchMock = vi.fn(async () => jsonResponse(200, [{ handle: '@a', alias: 'A' }]))
    vi.stubGlobal('fetch', fetchMock)
    const groups = await import('#src/store/groups')
    await groups.initGroups()
    const [calledUrl] = fetchMock.mock.calls[0] as unknown as [string]
    expect(calledUrl).toContain('members.json')
    expect(groups.rosterHandlesIn(undefined)).toEqual(['@a'])
    expect(JSON.parse(localStorage.getItem(GROUPS_KEY)!)[0].roster).toHaveLength(1)
  })

  it('local 模式的群組不抓網路', async () => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([
      { id: 'g1', name: 'A', webhookUrl: '', rosterMode: 'local', roster: [] },
    ]))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const groups = await import('#src/store/groups')
    await groups.initGroups()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('多個 url 群組各抓各的網址', async () => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([
      { id: 'g1', name: 'A', webhookUrl: '', rosterMode: 'url', rosterUrl: 'https://x/a.json', roster: [] },
      { id: 'g2', name: 'B', webhookUrl: '', rosterMode: 'url', rosterUrl: 'https://x/b.json', roster: [] },
    ]))
    const fetchMock = vi.fn(async (url: string) =>
      jsonResponse(200, [{ discordHandle: url.includes('a.json') ? '@a' : '@b', discordNickName: 'N' }]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const groups = await import('#src/store/groups')
    await groups.initGroups()
    expect(groups.rosterHandlesIn('g1')).toEqual(['@a'])
    expect(groups.rosterHandlesIn('g2')).toEqual(['@b'])
  })

  it('抓取失敗時沿用既有快取，不清空', async () => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([
      {
        id: 'g1', name: 'A', webhookUrl: '', rosterMode: 'url', rosterUrl: 'https://x/a.json',
        roster: [{ discordHandle: '@cached', discordNickName: '快取' }],
      },
    ]))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, {})))
    const groups = await import('#src/store/groups')
    await groups.initGroups()
    expect(groups.rosterHandlesIn('g1')).toEqual(['@cached'])
  })

  it('fetchRoster 拒絕非陣列與缺欄位格式', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { not: 'array' })))
    const roster = await import('#src/store/roster')
    await expect(roster.fetchRoster('https://x')).rejects.toThrow('JSON 陣列')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, [{ nope: 1 }])))
    await expect(roster.fetchRoster('https://x')).rejects.toThrow('discordHandle')
  })
})

describe('舊的單一設定遷移成群組', () => {
  it('webhook、名冊與來源模式一起搬進第一個群組', async () => {
    localStorage.setItem('dc-webhook-url', 'https://discord.com/api/webhooks/1/abc')
    localStorage.setItem('dc-roster-source', JSON.stringify({ mode: 'local' }))
    localStorage.setItem(
      'dc-loot-roster',
      JSON.stringify([{ handle: '@a', alias: '天天', id: '123' }]),
    )
    const groups = await import('#src/store/groups')
    const [g] = groups.useGroups().groups.value
    expect(g).toMatchObject({ rosterMode: 'local' })
    expect(g.channels[0].webhookUrl).toBe('https://discord.com/api/webhooks/1/abc')
    // 舊名冊格式也一併轉成新結構
    expect(g.roster).toEqual([
      { discordHandle: '@a', discordNickName: '天天', discordId: '123' },
    ])
  })

  it('遷移結果立即寫回 localStorage，不必等下次編輯', async () => {
    localStorage.setItem('dc-webhook-url', 'https://x')
    localStorage.setItem('dc-roster-source', JSON.stringify({ mode: 'local' }))
    await import('#src/store/groups')
    const stored = JSON.parse(localStorage.getItem(GROUPS_KEY)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].channels[0].webhookUrl).toBe('https://x')
  })

  it('已有群組資料時不再遷移，舊的 webhook 不會蓋掉現有設定', async () => {
    localStorage.setItem('dc-webhook-url', 'https://old')
    localStorage.setItem(GROUPS_KEY, JSON.stringify([
      { id: 'g1', name: 'A', webhookUrl: 'https://new', rosterMode: 'local', roster: [] },
    ]))
    const groups = await import('#src/store/groups')
    // 舊形狀會被整理成伺服器＋頻道，但 webhook 是原本存的那條，不是更舊的 legacy key
    expect(groups.useGroups().groups.value[0].channels[0].webhookUrl).toBe('https://new')
  })
})

describe('品名來源模式', () => {
  it('自訂 URL 模式抓指定網址並套用', async () => {
    localStorage.setItem(ITEMS_SOURCE_KEY, JSON.stringify({ mode: 'url', url: 'https://x/i.json' }))
    const fetchMock = vi.fn(async () => jsonResponse(200, ['大師附加', '附加奇幻']))
    vi.stubGlobal('fetch', fetchMock)
    const items = await import('#src/store/sharedItems')
    await items.initSharedItems()
    const [calledUrl] = fetchMock.mock.calls[0] as unknown as [string]
    expect(calledUrl).toBe('https://x/i.json')
    expect(items.sharedItemNames()).toEqual(['大師附加', '附加奇幻'])
  })

  it('本機自訂模式不抓網路，saveItemsLocal 生效', async () => {
    localStorage.setItem(ITEMS_SOURCE_KEY, JSON.stringify({ mode: 'local' }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const items = await import('#src/store/sharedItems')
    await items.initSharedItems()
    expect(fetchMock).not.toHaveBeenCalled()
    items.saveItemsLocal(['楓祝30'])
    expect(items.sharedItemNames()).toEqual(['楓祝30'])
    expect(JSON.parse(localStorage.getItem('dc-loot-items')!)).toEqual(['楓祝30'])
  })

  it('fetchItems 拒絕非字串陣列', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, [1, 2])))
    const items = await import('#src/store/sharedItems')
    await expect(items.fetchItems('https://x')).rejects.toThrow('字串品名')
  })
})
