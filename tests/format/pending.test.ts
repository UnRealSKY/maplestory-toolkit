import { describe, it, expect } from 'vitest'
import { pendingBlocks } from '#src/format/pending'
import type { LootRecord } from '#src/types'

const ALIASES: Record<string, string> = {
  '@awai0774': '阿歪',
  '@kyle5278001': '蘇察哈爾燦',
  '@xiangjiaojiu': '咕嘎幻影',
  '@.unrealsky': '天天(UnRealSKY)',
}
const display = (h: string) => ALIASES[h] ?? h

function makeRecord(over: Partial<LootRecord>): LootRecord {
  return {
    id: 'r', date: '2026-08-02', boss: '測王',
    members: [], lootItems: [], purchases: [],
    createdAt: '', updatedAt: '',
    ...over,
  }
}

// 對照使用者範例：第一場 4566/6=761、他人內購 1000/5；第二場 1259/5=252、他人內購 200/4
const r1 = makeRecord({
  id: 'r1', boss: '混龍第一場',
  members: [
    { handle: '@awai0774', settle: 'pending' },
    { handle: '@kyle5278001', settle: 'settled' },
    { handle: '@xiangjiaojiu', settle: 'settled' },
    { handle: '@.unrealsky', settle: 'settled' },
    { handle: '@e', settle: 'settled' },
    { handle: '@f', settle: 'settled' },
  ],
  lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 4566 }],
  purchases: [
    { buyer: '@kyle5278001', name: '混龍鍊', qty: 1, unitPrice: 500 },
    { buyer: '@xiangjiaojiu', name: '混龍鍊', qty: 1, unitPrice: 500 },
  ],
})
const r2 = makeRecord({
  id: 'r2', boss: '混龍第二場',
  members: [
    { handle: '@awai0774', settle: 'pending' },
    { handle: '@.unrealsky', settle: 'settled' },
    { handle: '@c', settle: 'settled' },
    { handle: '@d', settle: 'settled' },
    { handle: '@e', settle: 'settled' },
  ],
  lootItems: [
    { status: 'ok', name: 'x', qty: 1, unitPrice: 1259 },
    { status: 'cart', name: '待售品', qty: 1, unitPrice: null },
  ],
  purchases: [{ buyer: '@.unrealsky', name: '白衣5%', qty: 1, unitPrice: 200 }],
})

describe('pendingBlocks', () => {
  const blocks = pendingBlocks([r2, r1], display) // 故意反序，驗證排序

  it('僅未結清團員成塊，已結清者不出現', () => {
    expect(blocks.map((b) => b.handle)).toEqual(['@awai0774'])
  })

  it('逐行內容：標題、「總額 / 人數 = 每人」，有他人內購時多一行本人算式', () => {
    const [b] = blocks
    expect(b.display).toBe('阿歪')
    expect(b.records[0].lines).toEqual([
      '2026-08-02 混龍第一場',
      '4566 / 6 = 761',
      '阿歪: 761 + 1000/5 = 961',
    ])
    expect(b.records[1].lines).toEqual([
      '2026-08-02 混龍第二場',
      '1259 / 5 = 252',
      '阿歪: 252 + 200/4 = 302',
    ])
  })

  it('同日期依團名排序（第一場在前）且總計加總', () => {
    const [b] = blocks
    expect(b.totalLine).toBe('總計: 1263')
    expect(b.total).toBe(1263)
  })

  it('hasCart 標記待售中的紀錄', () => {
    const [b] = blocks
    expect(b.records[0].hasCart).toBe(false)
    expect(b.records[1].hasCart).toBe(true)
  })

  it('單場時總計就是那一場的金額', () => {
    const [b] = pendingBlocks([r1], display)
    expect(b.totalLine).toBe('總計: 961')
  })

  it('本人的內購不列行、只入公式減項', () => {
    const r = makeRecord({
      id: 'r3', boss: '測',
      members: [
        { handle: '@awai0774', settle: 'pending' },
        { handle: '@e', settle: 'settled' },
      ],
      lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 1000 }],
      purchases: [{ buyer: '@awai0774', name: 'y', qty: 1, unitPrice: 300 }],
    })
    const [b] = pendingBlocks([r], display)
    expect(b.records[0].lines).toEqual([
      '2026-08-02 測',
      '1000 / 2 = 500',
      '阿歪: 500 - 300 = 200',
    ])
  })

  it('擱置中的紀錄不列入', () => {
    const shelved = { ...r1, id: 'r5', shelved: true }
    expect(pendingBlocks([shelved], display)).toEqual([])
    // 取消擱置後恢復列入
    expect(pendingBlocks([{ ...shelved, shelved: false }], display)).toHaveLength(1)
  })

  it('不同日期依日期舊到新排序', () => {
    const old = makeRecord({
      id: 'r4', date: '2026-07-19', boss: '舊場',
      members: [{ handle: '@awai0774', settle: 'pending' }, { handle: '@e', settle: 'settled' }],
      lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 100 }],
    })
    const [b] = pendingBlocks([r1, old], display)
    expect(b.records.map((x) => x.recordId)).toEqual(['r4', 'r1'])
  })
})

describe('pendingBlocks 團長辛苦費', () => {
  const r = makeRecord({
    members: ['@a', '@b', '@c', '@d', '@e'].map((h) => ({ handle: h, settle: 'pending' as const })),
    lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 10000 }],
    leader: { handle: '@a', feeMode: 'percent', feeValue: 5 },
  })

  it('金額行與 serialize 的總共行共用算式，百分比寫在算式裡', () => {
    const blocks = pendingBlocks([r], display)
    const lines = blocks.find((b) => b.handle === '@a')!.records[0].lines
    expect(lines).toContain('10000 * (1 - 5%[辛苦費]) / 5 = 1900')
  })

  it('團長的應領含辛苦費', () => {
    const blocks = pendingBlocks([r], display)
    expect(blocks.find((b) => b.handle === '@a')!.total).toBe(2400)
    expect(blocks.find((b) => b.handle === '@b')!.total).toBe(1900)
  })

  it('沒有調整項的人不多寫一行自己的算式', () => {
    const lines = pendingBlocks([r], display).find((b) => b.handle === '@b')!.records[0].lines
    expect(lines).toEqual(['2026-08-02 測王', '10000 * (1 - 5%[辛苦費]) / 5 = 1900'])
  })
})
