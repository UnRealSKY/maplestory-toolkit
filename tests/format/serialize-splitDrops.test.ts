import { describe, it, expect } from 'vitest'
import { serialize } from '#src/format/serialize'
import type { LootItem, LootRecord } from '#src/types'

const base: LootRecord = {
  id: '1', date: '2026-09-29', boss: '女皇',
  members: [
    { handle: '@a', settle: 'settled' },
    { handle: '@b', settle: 'pending' },
    { handle: '@c', settle: 'pending' },
    { handle: '@d', settle: 'pending' },
  ],
  lootItems: [{ status: 'ok', name: '道具', qty: 1, unitPrice: 4000 }],
  purchases: [],
  createdAt: '', updatedAt: '',
}

// 總表勾了均分的項目（不賣，單價空白）
const split = (list: Array<{ name: string; qty: number }>): LootItem[] =>
  list.map((d) => ({ status: 'ok', name: d.name, qty: d.qty, unitPrice: null, split: true }))
const withSplit = (list: Array<{ name: string; qty: number }>): LootRecord =>
  ({ ...base, lootItems: [...base.lootItems, ...split(list)] })

describe('serialize 總表均分', () => {
  it('沒有勾均分：每人那行沒有字尾', () => {
    const out = serialize(base)
    expect(out).not.toContain('每人x')
    expect(out).not.toMatch(/^\* :\w+: @.*｜/m)
  })

  it('不再另外印「掉落物均分區」', () => {
    expect(serialize(withSplit([{ name: '星星碎片', qty: 8 }]))).not.toContain('掉落物均分')
  })

  it('每人那行金額後面用｜接「物的狀態＋每人份數」，多項用頓號；錢與物各自標', () => {
    const r = {
      ...withSplit([{ name: '星星碎片', qty: 8 }, { name: '魔法石', qty: 4 }]),
      members: [
        { handle: '@a', settle: 'settled' as const, dropsSettle: 'settled' as const },
        { handle: '@b', settle: 'settled' as const }, // 錢領了、物沒領
        { handle: '@c', settle: 'pending' as const, dropsSettle: 'settled' as const }, // 物領了、錢沒領
        { handle: '@d', settle: 'pending' as const },
      ],
    }
    const out = serialize(r)
    expect(out).toContain('* :ok: @a: 1000 ｜ :ok: 星星碎片x2、魔法石x1')
    expect(out).toContain('* :ok: @b: 1000 ｜ :orange_square: 星星碎片x2、魔法石x1')
    expect(out).toContain('* :orange_square: @c: 1000 ｜ :ok: 星星碎片x2、魔法石x1')
    expect(out).toContain('* :orange_square: @d: 1000 ｜ :orange_square: 星星碎片x2、魔法石x1')
  })

  it('分不完的餘數照單價賣，金額進總額', () => {
    const r = { ...base, lootItems: [...base.lootItems, { status: 'ok' as const, name: '魔法石', qty: 6, unitPrice: 1000, split: true }] }
    const out = serialize(r)
    // 6 個 4 人：每人 1、賣 2 → 4000 + 2000 = 6000，每人 1500
    expect(out).toContain('* :ok: 魔法石x6（每人x1、賣x2）: 1000x2')
    expect(out).toContain('* :ok: @a: 1500 ｜ :orange_square: 魔法石x1')
  })

  it('不夠每人一個：全部拿去賣，每人那行不加字尾', () => {
    const r = { ...base, lootItems: [...base.lootItems, { status: 'cart' as const, name: '魔法石', qty: 3, unitPrice: 1000, split: true }] }
    const out = serialize(r)
    expect(out).toContain('* :shopping_cart: 魔法石x3（每人x0、賣x3）: 1000x3')
    expect(out).toContain('* :ok: @a: 1750\n')
  })

  it('標題的待售數只算均分後還有剩的項目', () => {
    const r = { ...base, lootItems: [{ status: 'cart' as const, name: '星星碎片', qty: 8, unitPrice: 5000, split: true }] }
    expect(serialize(r).split('\n')[0]).not.toContain(':shopping_cart:')
  })
})
