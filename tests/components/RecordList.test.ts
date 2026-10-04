import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useRecordsStore } from '#src/store/records'
import { useGroups } from '#src/store/groups'
import RecordList from '#src/components/RecordList.vue'

const stubs = { 'router-link': { template: '<a><slot /></a>' }, ImportDialog: true }

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

function seedGroups() {
  const { groups } = useGroups()
  groups.value = [
    { id: 'g1', name: '甲團', rosterMode: 'local', roster: [], channels: [{ id: 'g1-ch', name: '分寶', webhookUrl: '' }] },
    { id: 'g2', name: '乙團', rosterMode: 'local', roster: [], channels: [{ id: 'g2-ch', name: '分寶', webhookUrl: '' }] },
  ]
}

describe('分寶列表顯示群組', () => {
  it('每一列標出所屬群組', () => {
    seedGroups()
    const store = useRecordsStore()
    store.create({ date: '2026-08-02', boss: '乙王', groupId: 'g2', members: [], lootItems: [], purchases: [] })
    store.create({ date: '2026-08-01', boss: '甲王', groupId: 'g1', members: [], lootItems: [], purchases: [] })
    const w = mount(RecordList, { global: { stubs } })
    // 依日期新到舊：乙王在前
    expect(w.findAll('.record-group').map((e) => e.text())).toEqual(['乙團 › #分寶', '甲團 › #分寶'])
  })

  it('沒有 groupId 的舊紀錄算第一個群組', () => {
    seedGroups()
    useRecordsStore().create({ date: '2026-08-01', boss: '舊王', members: [], lootItems: [], purchases: [] })
    const w = mount(RecordList, { global: { stubs } })
    expect(w.find('.record-group').text()).toBe('甲團 › #分寶')
  })

  it('沒有任何群組時不顯示空標籤', () => {
    useGroups().groups.value = []
    useRecordsStore().create({ date: '2026-08-01', boss: '無群組', members: [], lootItems: [], purchases: [] })
    const w = mount(RecordList, { global: { stubs } })
    expect(w.find('.record-group').exists()).toBe(false)
  })
})
