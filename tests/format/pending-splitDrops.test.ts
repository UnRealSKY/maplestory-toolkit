import { describe, it, expect } from 'vitest'
import { pendingBlocks } from '#src/format/pending'
import type { LootRecord } from '#src/types'

const display = (h: string) => h

describe('未領總覽的均分字尾', () => {
  const r: LootRecord = {
    id: 'r1', date: '2026-09-29', boss: '女皇',
    members: [
      { handle: '@a', settle: 'pending' },
      { handle: '@b', settle: 'settled' },
    ],
    lootItems: [{ status: 'ok', name: '道具', qty: 1, unitPrice: 2000 }],
    purchases: [],
    splitDrops: [{ name: '星星碎片', qty: 8 }, { name: '魔法石', qty: 3 }],
    createdAt: '', updatedAt: '',
  }

  it('每人那行帶｜字尾，除不盡的略過——跟主文同一個格式，複製進遊戲才對得上', () => {
    const blocks = pendingBlocks([r], display)
    const lines = blocks[0].records[0].lines
    expect(lines[lines.length - 1]).toBe('@a: 1000 ｜ 星星碎片x4')
  })

  it('沒有均分項目時那行跟以前一樣', () => {
    const blocks = pendingBlocks([{ ...r, splitDrops: undefined }], display)
    const lines = blocks[0].records[0].lines
    expect(lines[lines.length - 1]).toBe('@a: 1000')
  })
})
