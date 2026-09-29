import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SplitDropTable from '#src/components/SplitDropTable.vue'
import type { SplitDrop } from '#src/types'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

function mountTable(rows: SplitDrop[], memberCount: number) {
  return mount(SplitDropTable, { props: { modelValue: rows, memberCount } })
}

describe('掉落物均分區', () => {
  it('每列顯示每人幾個：8 個 4 人＝2', () => {
    const w = mountTable([{ name: '星星碎片', qty: 8, id: 'a' }], 4)
    expect(w.find('.split-each').text()).toBe('2')
    expect(w.find('.split-warn').exists()).toBe(false)
  })

  it('除不盡就標出無法均分幾人', () => {
    const w = mountTable([{ name: '魔法石', qty: 6, id: 'a' }], 4)
    expect(w.find('.split-each').text()).toContain('無法均分 4 人')
    expect(w.find('.split-each').classes()).toContain('split-warn')
  })

  it('沒有團員時提示先加團員，不寫「無法均分 0 人」', () => {
    const w = mountTable([{ name: '魔法石', qty: 6, id: 'a' }], 0)
    expect(w.find('.split-each').text()).toContain('先加團員')
  })

  it('新增一列、移除一列都往外送整份清單', async () => {
    const w = mountTable([{ name: '魔法石', qty: 6, id: 'a' }], 4)
    await w.find('.section-head .btn').trigger('click')
    const added = w.emitted('update:modelValue')![0][0] as SplitDrop[]
    expect(added).toHaveLength(2)
    expect(added[1]).toMatchObject({ name: '', qty: 1 })
    expect(added[1].id).toBeTruthy()

    await w.find('tbody .btn-danger').trigger('click')
    const removed = w.emitted('update:modelValue')![1][0] as SplitDrop[]
    expect(removed).toEqual([])
  })

  it('空清單只有一句提示', () => {
    const w = mountTable([], 4)
    expect(w.find('table').exists()).toBe(false)
    expect(w.text()).toContain('尚無均分')
  })
})
