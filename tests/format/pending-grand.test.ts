import { describe, it, expect } from 'vitest'
import { pendingBlocks, pendingGrandTotal } from '#src/format/pending'
import type { LootRecord } from '#src/types'

const display = (h: string) => h

function record(id: string, over: Partial<LootRecord>): LootRecord {
  return {
    id, date: '2026-09-29', boss: id,
    members: [], lootItems: [], purchases: [],
    createdAt: '', updatedAt: '',
    ...over,
  }
}

// 阿歪 2338 ｜ 大師附加x4、可疑附加x4；小楓 1538 ｜ 大師附加x1、可疑附加x3
const r1 = record('雙混', {
  members: [
    { handle: '@awai', settle: 'pending' },
    { handle: '@jo', settle: 'pending' },
    { handle: '@x', settle: 'settled', dropsSettle: 'settled' },
    { handle: '@y', settle: 'settled', dropsSettle: 'settled' },
  ],
  lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 6151 }],
  splitDrops: [{ name: '大師附加', qty: 4 }, { name: '可疑附加', qty: 12 }],
})
const r2 = record('雙卡', {
  members: [
    { handle: '@awai', settle: 'pending' },
    { handle: '@x', settle: 'settled', dropsSettle: 'settled' },
    { handle: '@y', settle: 'settled', dropsSettle: 'settled' },
    { handle: '@z', settle: 'settled', dropsSettle: 'settled' },
    { handle: '@w', settle: 'settled', dropsSettle: 'settled' },
  ],
  lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 4000 }],
  splitDrops: [{ name: '大師附加', qty: 15 }, { name: '可疑附加', qty: 5 }],
})

describe('未領總覽最上方的總共未領未付', () => {
  it('所有人還沒領的錢加總、實物同名相加', () => {
    expect(pendingGrandTotal(pendingBlocks([r1, r2], display))).toEqual({
      total: 1538 + 800 + 1538,
      drops: [{ name: '大師附加', each: 5 }, { name: '可疑附加', each: 7 }],
    })
  })

  it('錢全領完只剩實物：金額 0，實物照列', () => {
    const paid = {
      ...r1,
      members: r1.members.map((m) => (m.settle === 'pending' ? { ...m, settle: 'settled' as const } : m)),
    }
    expect(pendingGrandTotal(pendingBlocks([paid], display))).toEqual({
      total: 0,
      drops: [{ name: '大師附加', each: 2 }, { name: '可疑附加', each: 6 }],
    })
  })

  it('沒有實物就只有金額', () => {
    expect(pendingGrandTotal(pendingBlocks([{ ...r1, splitDrops: undefined }], display))).toEqual({ total: 3076, drops: [] })
  })

  it('沒有任何未領', () => {
    expect(pendingGrandTotal([])).toEqual({ total: 0, drops: [] })
  })
})
