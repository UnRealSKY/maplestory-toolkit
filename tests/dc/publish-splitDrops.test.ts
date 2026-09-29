import { describe, it, expect, vi, afterEach } from 'vitest'
import { publishOrSync } from '#src/dc/publish'
import type { LootRecord } from '#src/types'

const URL = 'https://discord.com/api/webhooks/1/token'

function makeRecord(over: Partial<LootRecord>): LootRecord {
  return {
    id: 'r1', date: '2026-09-29', boss: '女皇',
    members: [
      { handle: '@a', settle: 'pending' },
      { handle: '@b', settle: 'pending' },
      { handle: '@c', settle: 'pending' },
      { handle: '@d', settle: 'pending' },
    ],
    lootItems: [{ status: 'ok', name: '道具', qty: 1, unitPrice: 100 }],
    purchases: [],
    createdAt: '', updatedAt: '',
    ...over,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('publishOrSync 擋住除不盡的均分', () => {
  it('有除不盡的項目就不送出請求，錯誤訊息寫出是哪一筆、幾個、幾人', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = makeRecord({ splitDrops: [{ name: '星星碎片', qty: 8 }, { name: '魔法石', qty: 6 }] })
    await expect(publishOrSync(URL, r)).rejects.toThrow('魔法石 6 個無法均分 4 人')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
