import { describe, it, expect } from 'vitest'
import { pendingBlocks } from '#src/format/pending'
import type { LootRecord } from '#src/types'

const display = (h: string) => h

function makeRecord(over: Partial<LootRecord>): LootRecord {
  return {
    id: 'r', date: '2026-09-29', boss: '測',
    members: [], lootItems: [], purchases: [],
    createdAt: '', updatedAt: '',
    ...over,
  }
}

// 對照使用者範例：雙混 6151/4=1538、雙卡 4000/5=800，總計 2338、實物同名相加
const twinMix = makeRecord({
  id: 'r1', boss: '雙混',
  members: ['@a', '@b', '@c', '@d'].map((h) => ({ handle: h, settle: h === '@a' ? 'pending' as const : 'settled' as const })),
  lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 6151 }],
  splitDrops: [
    { name: '大師附加', qty: 4 },
    { name: '附加奇幻', qty: 4 },
    { name: '可疑附加', qty: 12 },
  ],
})
const twinCard = makeRecord({
  id: 'r2', boss: '雙卡',
  members: ['@a', '@b', '@c', '@d', '@e'].map((h) => ({ handle: h, settle: h === '@a' ? 'pending' as const : 'settled' as const })),
  lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 4000 }],
  splitDrops: [
    { name: '大師附加', qty: 15 },
    { name: '附加奇幻', qty: 10 },
    { name: '可疑附加', qty: 5 },
  ],
})

describe('未領總覽的均分實物', () => {
  const [b] = pendingBlocks([twinMix, twinCard], display)

  // 同日期依團名排序，所以用 recordId 找，不假設先後
  const rec = (id: string) => b.records.find((x) => x.recordId === id)!

  it('每場兩行：標題、「總額 / 人數 = 每人 ｜ 實物」', () => {
    expect(rec('r1').lines).toEqual(['2026-09-29 雙混', '6151 / 4 = 1538 ｜ 大師附加x1、附加奇幻x1、可疑附加x3'])
    expect(rec('r2').lines).toEqual(['2026-09-29 雙卡', '4000 / 5 = 800 ｜ 大師附加x3、附加奇幻x2、可疑附加x1'])
  })

  it('總計：金額加總、實物同名相加', () => {
    expect(b.totalLine).toBe('總計: 2338 ｜ 大師附加x4、附加奇幻x3、可疑附加x4')
    expect(b.total).toBe(2338)
  })

  it('除不盡的項目不進金額行、也不進總計', () => {
    const r = { ...twinMix, splitDrops: [...twinMix.splitDrops!, { name: '除不盡', qty: 6 }] }
    const [x] = pendingBlocks([r], display)
    expect(x.records[0].lines[1]).toBe('6151 / 4 = 1538 ｜ 大師附加x1、附加奇幻x1、可疑附加x3')
    expect(x.totalLine).toBe('總計: 1538 ｜ 大師附加x1、附加奇幻x1、可疑附加x3')
  })

  it('有內購時多一行本人算式，總計用實拿金額', () => {
    const r = { ...twinMix, purchases: [{ buyer: '@b', name: '龍鍊', qty: 1, unitPrice: 300 }] }
    const [x] = pendingBlocks([r], display)
    expect(x.records[0].lines).toEqual([
      '2026-09-29 雙混',
      '6151 / 4 = 1538 ｜ 大師附加x1、附加奇幻x1、可疑附加x3',
      '@a: 1538 + 300/3 = 1638',
    ])
    expect(x.totalLine).toBe('總計: 1638 ｜ 大師附加x1、附加奇幻x1、可疑附加x3')
  })

  it('沒有均分實物：金額行沒有字尾，總計只有金額', () => {
    const [x] = pendingBlocks([{ ...twinMix, splitDrops: undefined }], display)
    expect(x.records[0].lines).toEqual(['2026-09-29 雙混', '6151 / 4 = 1538'])
    expect(x.totalLine).toBe('總計: 1538')
  })
})
