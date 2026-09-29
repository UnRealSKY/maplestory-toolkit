import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DistributionPanel from '#src/components/DistributionPanel.vue'
import type { LootRecord } from '#src/types'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

function makeRecord(over: Partial<LootRecord> = {}): LootRecord {
  return {
    id: 'r1', date: '2026-09-29', boss: '雙混',
    members: [
      { handle: '@a', settle: 'pending' },
      { handle: '@b', settle: 'settled', dropsSettle: 'settled' },
    ],
    lootItems: [{ status: 'ok', name: 'x', qty: 1, unitPrice: 2000 }],
    purchases: [],
    createdAt: '', updatedAt: '',
    ...over,
  }
}

describe('分配名單的領取標記', () => {
  it('沒有可分實物：每人只有「錢」一顆 chip', () => {
    const w = mount(DistributionPanel, { props: { record: makeRecord() } })
    const chips = w.findAll('tbody tr').map((tr) => tr.findAll('.chip').map((c) => c.text()))
    expect(chips).toEqual([['● 待領錢'], ['✓ 錢已領']])
  })

  it('有可分實物：多一顆「物」的 chip，各自顯示狀態', () => {
    const w = mount(DistributionPanel, { props: { record: makeRecord({ splitDrops: [{ name: '星星碎片', qty: 4 }] }) } })
    const chips = w.findAll('tbody tr').map((tr) => tr.findAll('.chip').map((c) => c.text()))
    expect(chips).toEqual([['● 待領錢', '● 待領物'], ['✓ 錢已領', '✓ 物已領']])
  })

  it('全部除不盡等於沒有可分實物，不出現「物」的 chip', () => {
    const w = mount(DistributionPanel, { props: { record: makeRecord({ splitDrops: [{ name: '星星碎片', qty: 3 }] }) } })
    expect(w.findAll('tbody tr')[0].findAll('.chip')).toHaveLength(1)
  })

  it('兩顆 chip 各自送出自己的切換事件，帶列的索引', async () => {
    const w = mount(DistributionPanel, { props: { record: makeRecord({ splitDrops: [{ name: '星星碎片', qty: 4 }] }) } })
    const [money, drops] = w.findAll('tbody tr')[0].findAll('.chip')
    await money.trigger('click')
    await drops.trigger('click')
    expect(w.emitted('toggle-settle')).toEqual([[0]])
    expect(w.emitted('toggle-drops-settle')).toEqual([[0]])
  })
})
