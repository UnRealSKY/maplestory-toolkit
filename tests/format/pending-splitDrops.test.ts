import { describe, it, expect } from 'vitest'
import { pendingBlocks } from '#src/format/pending'
import type { LootRecord } from '#src/types'

const display = (h: string) => h

describe('未領總覽的均分物品', () => {
  const r: LootRecord = {
    id: 'r1', date: '2026-09-29', boss: '雙混',
    members: [
      { handle: '@a', settle: 'pending' },
      { handle: '@b', settle: 'settled' },
      { handle: '@c', settle: 'settled' },
    ],
    lootItems: [{ status: 'ok', name: '道具', qty: 1, unitPrice: 4614 }],
    purchases: [],
    splitDrops: [
      { name: '大師附加', qty: 3 },
      { name: '附加奇幻', qty: 3 },
      { name: '可疑附加', qty: 9 },
      { name: '除不盡', qty: 4 },
    ],
    createdAt: '', updatedAt: '',
  }

  it('物品放在總共那行、拿掉「/ 人數 = 每人」；那個人自己那行只剩金額', () => {
    const lines = pendingBlocks([r], display)[0].records[0].lines
    expect(lines).toEqual([
      '2026-09-29 雙混',
      '總共: 4614 ｜ 大師附加x1、附加奇幻x1、可疑附加x3',
      '@a: 1538',
    ])
  })

  it('有手續費時算式留著，只拿掉除法', () => {
    const lines = pendingBlocks([{ ...r, serviceFeePercent: 3 }], display)[0].records[0].lines
    expect(lines[1]).toBe('總共: 4614 * (1 - 3%[手續費]) ｜ 大師附加x1、附加奇幻x1、可疑附加x3')
  })

  it('沒有均分項目時整段跟以前一樣', () => {
    const lines = pendingBlocks([{ ...r, splitDrops: undefined }], display)[0].records[0].lines
    expect(lines).toEqual(['2026-09-29 雙混', '總共: 4614 / 3 = 1538', '@a: 1538'])
  })

  it('全部除不盡等於沒有可分的：格式維持原樣', () => {
    const lines = pendingBlocks([{ ...r, splitDrops: [{ name: '除不盡', qty: 4 }] }], display)[0].records[0].lines
    expect(lines[1]).toBe('總共: 4614 / 3 = 1538')
  })
})
