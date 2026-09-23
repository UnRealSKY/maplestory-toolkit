import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '#src/router'
import BossToolkit from '#src/components/BossToolkit.vue'
import SlotBadge from '#src/components/SlotBadge.vue'
import { bossId } from '#src/boss/bossId'
import { resetSession } from '#src/boss/session'
import { bindings, extensionReady } from '#src/hotkey/bridge'

async function mountToolkit(boss: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(`/boss-toolkit/${boss}`)
  await router.isReady()
  const w = mount(BossToolkit, { global: { plugins: [router] } })
  await flushPromises()
  return w
}

describe('按鈕上的快捷鍵徽章', () => {
  beforeEach(() => {
    localStorage.clear()
    bossId.value = 'pink-bean'
    resetSession()
    bindings.value = {}
    extensionReady.value = false
  })
  afterEach(() => {
    bindings.value = {}
    extensionReady.value = false
  })

  it('沒裝擴充套件時一個徽章都不出現，標題列只有下載入口', async () => {
    const w = await mountToolkit('pink-bean')
    expect(w.findAll('.slot-badge')).toHaveLength(0)
    expect(w.find('.hotkey-setup').exists()).toBe(false)
    expect(w.find('.hotkey-install').attributes('href')).toBe(
      'https://github.com/UnRealSKY/maplestory-toolkit/releases/latest/download/maplestory-toolkit-hotkeys.zip',
    )
  })

  it('有裝、有綁：徽章顯示綁的鍵，下載入口消失', async () => {
    extensionReady.value = true
    bindings.value = { slot1: 'Alt+1', slot2: 'Alt+2', slot3: '', slot4: '', slot5: '', slot6: '' }
    const w = await mountToolkit('pink-bean')
    const badges = w.findAll('.slot-badge')
    expect(badges[0].text()).toBe('Alt+1')
    expect(badges[1].text()).toBe('Alt+2')
    expect(w.find('.hotkey-install').exists()).toBe(false)
  })

  it('有裝、沒綁：徽章顯示未綁與格號，並出現設定入口', async () => {
    extensionReady.value = true
    bindings.value = { slot1: '', slot2: '', slot3: '', slot4: '', slot5: '', slot6: '' }
    const w = await mountToolkit('pink-bean')
    expect(w.findAll('.slot-badge')[2].text()).toBe('未綁 3')
    expect(w.find('.hotkey-setup').text()).toContain('設定快捷鍵')
  })

  it('設定入口只看這隻王用到的格子——反盾王只用四格，第 5、6 格沒綁不算', async () => {
    extensionReady.value = true
    bindings.value = { slot1: 'Alt+1', slot2: 'Alt+2', slot3: 'Alt+3', slot4: 'Alt+4', slot5: '', slot6: '' }
    const w = await mountToolkit('pink-bean')
    expect(w.findAll('.slot-badge')).toHaveLength(4) // 重置沒有徽章
    expect(w.find('.hotkey-setup').exists()).toBe(false)
  })

  it('女皇：五格觸發依序 1～5，重置沒有徽章', async () => {
    extensionReady.value = true
    bindings.value = { slot1: 'Alt+1', slot2: 'Alt+2', slot3: 'Alt+3', slot4: 'Alt+4', slot5: 'Alt+5', slot6: '' }
    const w = await mountToolkit('cygnus')
    expect(w.findAll('.trigger .slot-badge').map((b) => b.text())).toEqual([
      'Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5',
    ])
    expect(w.find('.cycle-head .slot-badge').exists()).toBe(false)
    expect(w.find('.hotkey-setup').exists()).toBe(false) // 第 6 格沒人用，不催人綁
  })

  it('血量模板沒有可按的動作，不畫徽章', async () => {
    extensionReady.value = true
    bindings.value = { slot1: 'Alt+1' }
    const w = await mountToolkit('arkarium')
    expect(w.findAll('.slot-badge')).toHaveLength(0)
  })

  it('子母畫面那份不畫徽章——小視窗寸土寸金', () => {
    extensionReady.value = true
    bindings.value = { slot1: 'Alt+1' }
    const main = mount(SlotBadge, { props: { slot: 1 }, global: { provide: { pipCompact: false } } })
    const pip = mount(SlotBadge, { props: { slot: 1 }, global: { provide: { pipCompact: true } } })
    expect(main.find('.slot-badge').text()).toBe('Alt+1')
    expect(pip.find('.slot-badge').exists()).toBe(false)
  })
})
