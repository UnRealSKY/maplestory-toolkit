import { describe, it, expect } from 'vitest'
import { perMember, undividable } from '#src/calc/splitDrops'
import type { LootRecord } from '#src/types'

const base: LootRecord = {
  id: '1', date: '2026-09-29', boss: '女皇',
  members: [
    { handle: '@a', settle: 'pending' },
    { handle: '@b', settle: 'pending' },
    { handle: '@c', settle: 'pending' },
    { handle: '@d', settle: 'pending' },
  ],
  lootItems: [], purchases: [], createdAt: '', updatedAt: '',
}

describe('掉落物均分', () => {
  it('8 個 4 人＝每人 2', () => {
    expect(perMember(8, 4)).toBe(2)
  })
  it('6 個 4 人除不盡 → null', () => {
    expect(perMember(6, 4)).toBeNull()
  })
  it('沒有人或總數不是正整數 → null', () => {
    expect(perMember(8, 0)).toBeNull()
    expect(perMember(0, 4)).toBeNull()
    expect(perMember(-4, 4)).toBeNull()
    expect(perMember(2.5, 1)).toBeNull()
  })
  it('undividable 只列除不盡的那幾筆', () => {
    const r = { ...base, splitDrops: [
      { name: '星星碎片', qty: 8 },
      { name: '魔法石', qty: 6 },
      { name: '符文', qty: 4 },
    ] }
    expect(undividable(r).map((d) => d.name)).toEqual(['魔法石'])
  })
  it('沒有均分項目 → 空陣列', () => {
    expect(undividable(base)).toEqual([])
    expect(undividable({ ...base, splitDrops: [] })).toEqual([])
  })
  it('沒有團員時每一筆都算除不盡——沒人可以分', () => {
    const r = { ...base, members: [], splitDrops: [{ name: '星星碎片', qty: 8 }] }
    expect(undividable(r)).toHaveLength(1)
  })
})
