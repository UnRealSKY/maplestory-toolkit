import { describe, it, expect } from 'vitest'
import { pendingBlocks } from '#src/format/pending'
import type { LootRecord, Member } from '#src/types'

const display = (h: string) => h

function record(a: Partial<Member>, over: Partial<LootRecord> = {}): LootRecord {
  return {
    id: 'r1', date: '2026-09-29', boss: '雙混',
    members: [
      { handle: '@a', settle: 'pending', ...a },
      { handle: '@b', settle: 'settled', dropsSettle: 'settled' },
      { handle: '@c', settle: 'settled', dropsSettle: 'settled' },
      { handle: '@d', settle: 'settled', dropsSettle: 'settled' },
    ],
    lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 6151 }],
    purchases: [],
    splitDrops: [{ name: '大師附加', qty: 4 }, { name: '可疑附加', qty: 12 }],
    createdAt: '', updatedAt: '',
    ...over,
  }
}

describe('未領總覽：錢與實物各自領', () => {
  it('都沒領：金額行帶實物，兩個都待領', () => {
    const [b] = pendingBlocks([record({})], display)
    expect(b.records[0].lines).toEqual(['2026-09-29 雙混', '6151 / 4 = 1538 ｜ 大師附加x1、可疑附加x3'])
    expect(b.records[0]).toMatchObject({ moneyPending: true, dropsPending: true })
    expect(b.totalLine).toBe('總計: 1538 ｜ 大師附加x1、可疑附加x3')
  })

  it('錢已領、實物沒領：只剩實物那行，總計只有實物', () => {
    const [b] = pendingBlocks([record({ settle: 'settled' })], display)
    expect(b.records[0].lines).toEqual(['2026-09-29 雙混', '大師附加x1、可疑附加x3'])
    expect(b.records[0]).toMatchObject({ moneyPending: false, dropsPending: true })
    expect(b.total).toBe(0)
    expect(b.totalLine).toBe('總計: 大師附加x1、可疑附加x3')
  })

  it('實物已領、錢沒領：金額行沒有字尾，總計只有金額', () => {
    const [b] = pendingBlocks([record({ dropsSettle: 'settled' })], display)
    expect(b.records[0].lines).toEqual(['2026-09-29 雙混', '6151 / 4 = 1538'])
    expect(b.records[0]).toMatchObject({ moneyPending: true, dropsPending: false })
    expect(b.totalLine).toBe('總計: 1538')
  })

  it('兩個都領完：這個人不再出現', () => {
    expect(pendingBlocks([record({ settle: 'settled', dropsSettle: 'settled' })], display)).toEqual([])
  })

  it('錢已領但有調整項：本人算式行也不出現——那是錢的事', () => {
    const r = record({ settle: 'settled' }, { purchases: [{ buyer: '@b', name: '龍鍊', qty: 1, unitPrice: 300 }] })
    const [b] = pendingBlocks([r], display)
    expect(b.records[0].lines).toEqual(['2026-09-29 雙混', '大師附加x1、可疑附加x3'])
  })

  it('沒有可分實物的場次只看錢：錢領了就消失，dropsSettle 不影響', () => {
    const noDrops = record({}, { splitDrops: undefined })
    expect(pendingBlocks([noDrops], display)[0].records[0]).toMatchObject({ moneyPending: true, dropsPending: false })
    expect(pendingBlocks([record({ settle: 'settled' }, { splitDrops: undefined })], display)).toEqual([])
  })

  it('跨場次：總計只加還沒領的錢與實物', () => {
    const r1 = record({}) // 錢 1538、實物都沒領
    const r2 = record({ settle: 'settled' }, { id: 'r2', boss: '雙卡' }) // 錢領了，實物沒領
    const [b] = pendingBlocks([r1, r2], display)
    expect(b.total).toBe(1538)
    expect(b.totalLine).toBe('總計: 1538 ｜ 大師附加x2、可疑附加x6')
  })
})
