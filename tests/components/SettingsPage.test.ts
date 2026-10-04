import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SettingsPage from '#src/components/SettingsPage.vue'
import { useGroups, setActiveGroup, type DcGroup } from '#src/store/groups'
import { useRecordsStore } from '#src/store/records'

function seed(): DcGroup[] {
  const servers: DcGroup[] = [
    {
      id: 's1', name: '贖罪券', rosterMode: 'local', roster: [],
      channels: [{ id: 'tt', name: '天團', webhookUrl: '' }, { id: 'wt', name: '歪團', webhookUrl: 'https://discord.com/api/webhooks/1/x' }],
    },
    {
      id: 's2', name: '周末要打王', rosterMode: 'local', roster: [],
      channels: [{ id: 'w1', name: '一團', webhookUrl: '' }],
    },
  ]
  useGroups().groups.value = servers
  setActiveGroup('s1')
  return servers
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  seed()
})
afterEach(() => vi.unstubAllGlobals())

const chips = (w: ReturnType<typeof mount>) => w.findAll('.group-chip')
const rows = (w: ReturnType<typeof mount>) => w.findAll('.channel-row')
const names = (w: ReturnType<typeof mount>) =>
  rows(w).map((r) => (r.find('.channel-name').element as HTMLInputElement).value)

describe('設定頁：伺服器與頻道', () => {
  it('上排是伺服器，底下列出目前伺服器的頻道', () => {
    const w = mount(SettingsPage)
    expect(chips(w).map((c) => c.text())).toEqual(['贖罪券', '周末要打王'])
    expect(names(w)).toEqual(['天團', '歪團'])
  })

  it('新增頻道接在最後', async () => {
    vi.stubGlobal('prompt', vi.fn(() => '三團'))
    const w = mount(SettingsPage)
    await w.find('.channels-head .btn').trigger('click')
    expect(names(w)).toEqual(['天團', '歪團', '三團'])
  })

  it('拖頻道到另一列：同伺服器內排序', async () => {
    const w = mount(SettingsPage)
    await rows(w)[1].trigger('dragstart')
    await rows(w)[0].trigger('drop')
    expect(names(w)).toEqual(['歪團', '天團'])
    expect(useGroups().groups.value[0].channels.map((c) => c.id)).toEqual(['wt', 'tt'])
  })

  it('拖伺服器 chip 到另一個 chip 上：伺服器排序', async () => {
    const w = mount(SettingsPage)
    await chips(w)[1].trigger('dragstart')
    await chips(w)[0].trigger('drop')
    expect(chips(w).map((c) => c.text())).toEqual(['周末要打王', '贖罪券'])
  })

  it('拖頻道到另一個伺服器的 chip 上：搬過去、綁著的紀錄跟著換伺服器', async () => {
    const store = useRecordsStore()
    store.create({ boss: '舊紀錄', groupId: 'wt', members: [], lootItems: [], purchases: [] }) // 改版前的綁法：groupId 是頻道 id
    store.create({ boss: '新紀錄', groupId: 's1', channelId: 'wt', members: [], lootItems: [], purchases: [] })
    vi.stubGlobal('confirm', vi.fn(() => true))
    const w = mount(SettingsPage)
    await rows(w)[1].trigger('dragstart') // 歪團
    await chips(w)[1].trigger('drop') // 丟到周末要打王
    const groups = useGroups().groups.value
    expect(groups[0].channels.map((c) => c.id)).toEqual(['tt'])
    expect(groups[1].channels.map((c) => c.id)).toEqual(['w1', 'wt'])
    expect(store.records.every((r) => r.groupId === 's2' && r.channelId === 'wt')).toBe(true)
  })

  it('最後一個頻道不能刪、也不能搬走', async () => {
    setActiveGroup('s2')
    vi.stubGlobal('alert', vi.fn())
    const w = mount(SettingsPage)
    expect(rows(w)).toHaveLength(1)
    expect(rows(w)[0].find('.channel-remove').attributes('disabled')).toBeDefined()
    await rows(w)[0].trigger('dragstart')
    await chips(w)[0].trigger('drop')
    expect(useGroups().groups.value[1].channels).toHaveLength(1)
    expect(window.alert).toHaveBeenCalled()
  })

  it('有紀錄發到的頻道不能刪，按鈕的提示寫原因', () => {
    useRecordsStore().create({ boss: 'x', groupId: 's1', channelId: 'tt', members: [], lootItems: [], purchases: [] })
    const w = mount(SettingsPage)
    const btn = rows(w)[0].find('.channel-remove')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.attributes('title')).toContain('1 筆紀錄')
    expect(rows(w)[1].find('.channel-remove').attributes('disabled')).toBeUndefined()
  })
})
