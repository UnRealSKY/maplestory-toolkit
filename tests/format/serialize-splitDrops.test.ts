import { describe, it, expect } from 'vitest'
import { serialize } from '#src/format/serialize'
import type { LootRecord } from '#src/types'

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

describe('serialize 掉落物均分區', () => {
  it('沒有均分項目：區塊與字尾都不出現，輸出跟以前一字不變', () => {
    const out = serialize(base)
    expect(out).not.toContain('掉落物均分')
    expect(out).not.toMatch(/^\* :\w+: @.*｜/m)
    expect(serialize({ ...base, splitDrops: [] })).toBe(out)
  })

  it('區塊在代售之後、分配之前，列品名與總數', () => {
    const r = {
      ...base,
      consignments: [{ seller: '@a', name: '代賣', qty: 1, unitPrice: 100 }],
      splitDrops: [{ name: '星星碎片', qty: 8 }, { name: '魔法石', qty: 4 }],
    }
    const out = serialize(r)
    const i = (s: string) => out.indexOf(s)
    expect(i('## 代售')).toBeLessThan(i('## 掉落物均分區'))
    expect(i('## 掉落物均分區')).toBeLessThan(i('## 分配'))
    expect(out).toContain('## 掉落物均分區\n* 星星碎片x8\n* 魔法石x4')
  })

  it('每人那行金額後面用｜接「物的狀態＋每人份數」，多項用頓號；錢與物各自標', () => {
    const r = {
      ...base,
      members: [
        { handle: '@a', settle: 'settled' as const, dropsSettle: 'settled' as const },
        { handle: '@b', settle: 'settled' as const }, // 錢領了、物沒領
        { handle: '@c', settle: 'pending' as const, dropsSettle: 'settled' as const }, // 物領了、錢沒領
        { handle: '@d', settle: 'pending' as const },
      ],
      splitDrops: [{ name: '星星碎片', qty: 8 }, { name: '魔法石', qty: 4 }],
    }
    const out = serialize(r)
    expect(out).toContain('* :ok: @a: 1000 ｜ :ok: 星星碎片x2、魔法石x1')
    expect(out).toContain('* :ok: @b: 1000 ｜ :orange_square: 星星碎片x2、魔法石x1')
    expect(out).toContain('* :orange_square: @c: 1000 ｜ :ok: 星星碎片x2、魔法石x1')
    expect(out).toContain('* :orange_square: @d: 1000 ｜ :orange_square: 星星碎片x2、魔法石x1')
  })

  it('除不盡的那一筆：區塊標「無法均分 N 人」，每人字尾略過它', () => {
    const r = { ...base, splitDrops: [{ name: '星星碎片', qty: 8 }, { name: '魔法石', qty: 6 }] }
    const out = serialize(r)
    expect(out).toContain('* 魔法石x6（無法均分 4 人）')
    expect(out).toContain('* :ok: @a: 1000 ｜ :orange_square: 星星碎片x2\n')
  })

  it('全部除不盡：每人那行不加字尾', () => {
    const r = { ...base, splitDrops: [{ name: '魔法石', qty: 6 }] }
    const out = serialize(r)
    expect(out).toContain('* :ok: @a: 1000\n')
    expect(out).not.toMatch(/^\* :\w+: @.*｜/m)
  })
})
