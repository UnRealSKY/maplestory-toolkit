import { describe, it, expect } from 'vitest'
import { parse } from '#src/format/parse'
import { serialize } from '#src/format/serialize'
import type { LootRecord } from '#src/types'

describe('parse 掉落物均分區', () => {
  it('讀回品名與總數，除不盡的註記不影響', () => {
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
    ].join('\n')
    const r = parse(md)
    expect(r.splitDrops).toEqual([{ name: '星星碎片', qty: 8 }, { name: '魔法石', qty: 6 }])
  })

  it('｜後面的狀態 token 讀成物領了沒；短碼與圖案都認', () => {
    const md = [
      '## 2026-09-29 女皇',
      '* :ok: 道具x1: 4000x1',
      '## 分配',
      '總共: 4000 / 2 = 2000',
      '* :ok: @a: 2000 ｜ :orange_square: 星星碎片x4',
      '* 🟧 @b: 2000 ｜ 🆗 星星碎片x4',
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

  it('serialize → parse 來回，均分項目原樣', () => {
    const r: LootRecord = {
      id: '1', date: '2026-09-29', boss: '女皇',
      members: [{ handle: '@a', settle: 'settled', dropsSettle: 'settled' }, { handle: '@b', settle: 'pending', dropsSettle: 'pending' }],
      lootItems: [{ status: 'ok', name: '道具', qty: 1, unitPrice: 4000 }],
      purchases: [],
      splitDrops: [{ name: '星星碎片', qty: 8 }, { name: '魔法石', qty: 2 }],
      createdAt: '', updatedAt: '',
    }
    const back = parse(serialize(r))
    expect(back.splitDrops).toEqual(r.splitDrops)
    expect(back.members).toEqual(r.members)
  })

  it('沒有這一區：splitDrops 是空陣列', () => {
    const r = parse('## 2026-09-29 女皇\n* :ok: 道具x1: 100x1')
    expect(r.splitDrops ?? []).toEqual([])
  })
})
