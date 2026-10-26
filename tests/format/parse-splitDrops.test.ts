import { describe, it, expect } from 'vitest'
import { parse } from '#src/format/parse'
import { serialize } from '#src/format/serialize'
import type { LootRecord } from '#src/types'

describe('總表均分：主文格式', () => {
  const base: LootRecord = {
    id: '1', date: '2026-09-29', boss: '女皇',
    members: ['@a', '@b', '@c', '@d'].map((handle) => ({ handle, settle: 'pending' as const, dropsSettle: 'pending' as const })),
    lootItems: [
      { status: 'ok', name: '道具', qty: 1, unitPrice: 4000 },
      { status: 'ok', name: '星星碎片', qty: 10, unitPrice: 5000, split: true },
      { status: 'ok', name: '魔法石', qty: 8, unitPrice: null, split: true },
    ],
    purchases: [],
    createdAt: '', updatedAt: '',
  }

  it('數量後面寫每人幾個、賣幾個，金額只算賣的；分得完就不寫賣', () => {
    const out = serialize(base)
    expect(out).toContain('* :ok: 星星碎片x10（每人x2、賣x2）: 5000x2')
    expect(out).toContain('* :ok: 魔法石x8（每人x2）: ?x0')
    expect(out).not.toContain('## 掉落物均分區')
    // 4000 + 5000x2 = 14000，每人 3500，每人那行接上分到的實物
    expect(out).toContain('* :orange_square: @a: 3500 ｜ :orange_square: 星星碎片x2、魔法石x2')
  })

  it('serialize → parse 來回：勾均分、數量、單價原樣', () => {
    const back = parse(serialize(base))
    expect(back.lootItems).toEqual(base.lootItems)
    expect(back.members).toEqual(base.members)
  })

  it('｜後面的狀態 token 讀成物領了沒；短碼與圖案都認', () => {
    const md = [
      '## 2026-09-29 女皇',
      '* :ok: 星星碎片x8（每人x4）: ?x0',
      '## 分配',
      '總共: 0 / 2 = 0',
      '* :ok: @a: 0 ｜ :orange_square: 星星碎片x4',
      '* 🟧 @b: 0 ｜ 🆗 星星碎片x4',
    ].join('\n')
    const r = parse(md)
    expect(r.members).toEqual([
      { handle: '@a', settle: 'settled', dropsSettle: 'pending' },
      { handle: '@b', settle: 'pending', dropsSettle: 'settled' },
    ])
  })

  it('更早的貼文｜後面沒有狀態 token：不設 dropsSettle，團員與錢的狀態照讀', () => {
    const md = [
      '## 2026-09-29 女皇',
      '* :ok: 道具x1: 4000x1',
      '## 分配',
      '總共: 4000 / 2 = 2000',
      '* :ok: @a: 2000 ｜ 星星碎片x4',
      '* :orange_square: @b: 2000 ｜ 星星碎片x4',
    ].join('\n')
    const r = parse(md)
    expect(r.members).toEqual([{ handle: '@a', settle: 'settled' }, { handle: '@b', settle: 'pending' }])
  })

  it('舊貼文的「## 掉落物均分區」讀成總表最後勾好均分的項目；分不完的餘數變待售', () => {
    const md = [
      '## 2026-09-29 女皇 ｜ :dollar:(1)',
      '* :ok: 道具x1: 4000x1',
      '',
      '## 掉落物均分區',
      '* 星星碎片x8',
      '* 魔法石x6（無法均分 4 人）',
      '',
      '## 分配',
      '總共: 4000 / 4 = 1000',
      '* :ok: @a: 1000 ｜ :ok: 星星碎片x2',
      '* :orange_square: @b: 1000 ｜ :orange_square: 星星碎片x2',
      '* :ok: @c: 1000 ｜ :ok: 星星碎片x2',
      '* :ok: @d: 1000 ｜ :ok: 星星碎片x2',
    ].join('\n')
    const r = parse(md)
    expect(r.lootItems).toEqual([
      { status: 'ok', name: '道具', qty: 1, unitPrice: 4000 },
      { status: 'ok', name: '星星碎片', qty: 8, unitPrice: null, split: true },
      { status: 'cart', name: '魔法石', qty: 6, unitPrice: null, split: true },
    ])
  })
})
