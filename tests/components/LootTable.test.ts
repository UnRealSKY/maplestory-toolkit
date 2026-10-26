import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LootTable from '#src/components/LootTable.vue'
import PurchaseTable from '#src/components/PurchaseTable.vue'
import AutocompleteInput from '#src/components/AutocompleteInput.vue'
import { useRecordsStore } from '#src/store/records'
import type { LootItem, Purchase } from '#src/types'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  // 歷史品名：選單的來源
  useRecordsStore().create({
    boss: '舊', members: [], purchases: [],
    lootItems: ['星星碎片', '魔法石', '混龍鍊'].map((name) => ({ status: 'ok', name, qty: 1, unitPrice: 1 })),
  })
})

const item = (name: string, id: string): LootItem => ({ status: 'cart', name, qty: 1, unitPrice: null, id })
const suggestionsOf = (w: ReturnType<typeof mount>) =>
  w.findAllComponents(AutocompleteInput).map((c) => c.props('suggestions') as string[])

describe('品名選單不重複', () => {
  it('總表：別列用過的品名不出現，自己這列的照常出現', () => {
    const w = mount(LootTable, { props: { memberCount: 4, modelValue: [item('星星碎片', 'a'), item('', 'b')] } })
    const [own, other] = suggestionsOf(w)
    expect(own).toContain('星星碎片')
    expect(other).not.toContain('星星碎片')
    expect(other).toEqual(expect.arrayContaining(['魔法石', '混龍鍊']))
  })

  it('內購不排除：同一件東西可以不同人各買一個', () => {
    const rows: Purchase[] = [
      { buyer: '@a', name: '混龍鍊', qty: 1, unitPrice: 500, id: 'a' },
      { buyer: '@b', name: '', qty: 1, unitPrice: 0, id: 'b' },
    ]
    const w = mount(PurchaseTable, { props: { modelValue: rows, members: [] } })
    expect(suggestionsOf(w)[1]).toContain('混龍鍊')
  })
})

describe('拖拉排序', () => {
  it('把手拖到別列上：搬到那一列的位置', async () => {
    const w = mount(LootTable, { props: { memberCount: 4, modelValue: [item('A', 'a'), item('B', 'b'), item('C', 'c')] } })
    const rows = w.findAll('tbody tr')
    await rows[2].find('.drag-handle').trigger('dragstart')
    await rows[0].trigger('dragover')
    expect(rows[0].classes()).toContain('drop-target')
    await rows[0].trigger('drop')
    const moved = w.emitted('update:modelValue')![0][0] as LootItem[]
    expect(moved.map((x) => x.name)).toEqual(['C', 'A', 'B'])
  })

  it('沒有從把手開始拖的東西（例如從別處拖進來的字）不會改順序', async () => {
    const w = mount(LootTable, { props: { memberCount: 4, modelValue: [item('A', 'a'), item('B', 'b')] } })
    await w.findAll('tbody tr')[0].trigger('drop')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('總表勾均分', () => {
  it('勾了之後旁邊寫每人幾個、賣幾個，淨額只算賣的', async () => {
    const it0: LootItem = { status: 'ok', name: '星星碎片', qty: 10, unitPrice: 5000, split: true, id: 'a' }
    const w = mount(LootTable, { props: { memberCount: 4, modelValue: [it0] } })
    expect(w.find('.split-text').text()).toBe('每人 2・賣 2')
    expect(w.find('.net').text()).toBe('10000')
  })

  it('取消勾選：split 拿掉', async () => {
    const it0: LootItem = { status: 'ok', name: '星星碎片', qty: 10, unitPrice: 5000, split: true, id: 'a' }
    const w = mount(LootTable, { props: { memberCount: 4, modelValue: [it0] } })
    await w.find('.split-toggle input').setValue(false)
    const next = w.emitted('update:modelValue')![0][0] as LootItem[]
    expect(next[0].split).toBeUndefined()
  })
})
