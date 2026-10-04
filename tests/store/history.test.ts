import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRecordsStore } from '#src/store/records'
import { useHistory } from '#src/store/history'
import { useGroups } from '#src/store/groups'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

function seed() {
  const store = useRecordsStore()
  store.create({
    date: '2026-07-19', boss: '混龍',
    members: [{ handle: '@a', settle: 'settled' }],
    lootItems: [{ status: 'ok', name: '楓祝30', qty: 1, unitPrice: 6400 }],
    purchases: [],
  })
  store.create({
    date: '2026-07-20', boss: '闇黑龍王',
    members: [{ handle: '@b', settle: 'pending' }],
    lootItems: [{ status: 'ok', name: '楓祝30', qty: 1, unitPrice: 6800 }],
    purchases: [],
  })
}

describe('history', () => {
  it('聚合品名', () => {
    seed()
    const h = useHistory()
    expect(h.itemNames.value).toContain('楓祝30')
  })
  it('聚合 handle', () => {
    seed()
    const h = useHistory()
    expect(h.handles.value).toEqual(expect.arrayContaining(['@a', '@b']))
  })
  it('聚合王名', () => {
    seed()
    const h = useHistory()
    expect(h.bosses.value).toEqual(expect.arrayContaining(['混龍', '闇黑龍王']))
  })
  it('單價建議依日期新到舊並帶日期', () => {
    seed()
    const h = useHistory()
    expect(h.priceSuggestions('楓祝30')).toEqual([
      { price: 6800, date: '2026-07-20' },
      { price: 6400, date: '2026-07-19' },
    ])
  })
  it('品名依頻率排序且嚴格去重', () => {
    const store = useRecordsStore()
    // 高頻品出現 3 次，低頻品出現 1 次
    store.create({
      date: '2026-07-19', boss: '高頻龍',
      members: [{ handle: '@freq', settle: 'settled' }],
      lootItems: [
        { status: 'ok', name: '高頻品', qty: 1, unitPrice: 1000 },
        { status: 'ok', name: '高頻品', qty: 1, unitPrice: 1100 },
      ],
      purchases: [],
    })
    store.create({
      date: '2026-07-20', boss: '高頻龍2',
      members: [{ handle: '@freq2', settle: 'settled' }],
      lootItems: [
        { status: 'ok', name: '高頻品', qty: 1, unitPrice: 1200 },
      ],
      purchases: [],
    })
    store.create({
      date: '2026-07-20', boss: '低頻龍',
      members: [{ handle: '@low', settle: 'settled' }],
      lootItems: [
        { status: 'ok', name: '低頻品', qty: 1, unitPrice: 2000 },
      ],
      purchases: [],
    })
    const h = useHistory()
    const itemNames = h.itemNames.value
    // 驗證順序：高頻品應在低頻品之前
    expect(itemNames).toEqual(['高頻品', '低頻品'])
    // 驗證嚴格去重：高頻品只出現一次
    expect(itemNames.filter(n => n === '高頻品')).toHaveLength(1)
    expect(itemNames.filter(n => n === '低頻品')).toHaveLength(1)
  })
})

describe('handle 建議依群組分開', () => {
  const { groups } = useGroups()

  function seedGroups() {
    groups.value = [
      {
        id: 'g1', name: '甲團', rosterMode: 'local', channels: [{ id: 'g1-ch', name: '分寶', webhookUrl: '' }],
        roster: [{ discordHandle: '@roster1', discordNickName: '甲名冊' }],
      },
      {
        id: 'g2', name: '乙團', rosterMode: 'local', channels: [{ id: 'g2-ch', name: '分寶', webhookUrl: '' }],
        roster: [{ discordHandle: '@roster2', discordNickName: '乙名冊' }],
      },
    ]
    const store = useRecordsStore()
    store.create({
      date: '2026-08-01', boss: '甲王', groupId: 'g1',
      members: [{ handle: '@onlyG1', settle: 'settled' }], lootItems: [], purchases: [],
    })
    store.create({
      date: '2026-08-02', boss: '乙王', groupId: 'g2',
      members: [{ handle: '@onlyG2', settle: 'settled' }], lootItems: [], purchases: [],
    })
  }

  it('只看得到同群紀錄裡出現過的人', () => {
    seedGroups()
    const h1 = useHistory(() => 'g1')
    expect(h1.handles.value).toContain('@onlyG1')
    expect(h1.handles.value).not.toContain('@onlyG2')
    const h2 = useHistory(() => 'g2')
    expect(h2.handles.value).toContain('@onlyG2')
    expect(h2.handles.value).not.toContain('@onlyG1')
  })

  it('名冊也只帶自己那群的', () => {
    seedGroups()
    expect(useHistory(() => 'g1').handles.value).toEqual(
      expect.arrayContaining(['@roster1']),
    )
    expect(useHistory(() => 'g1').handles.value).not.toContain('@roster2')
  })

  it('沒有 groupId 的舊紀錄算在第一個群組', () => {
    seedGroups()
    useRecordsStore().create({
      date: '2026-08-03', boss: '舊王',
      members: [{ handle: '@legacy', settle: 'settled' }], lootItems: [], purchases: [],
    })
    expect(useHistory(() => 'g1').handles.value).toContain('@legacy')
    expect(useHistory(() => 'g2').handles.value).not.toContain('@legacy')
  })
})
