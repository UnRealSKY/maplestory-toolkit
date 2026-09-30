import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DamageReflectPanel from '#src/components/DamageReflectPanel.vue'
import { bossId } from '#src/boss/bossId'
import { reflectState, resetSession, onDispel } from '#src/boss/session'
import { startInterval } from '#src/boss/damageReflect'
import { now } from '#src/boss/clock'

// 皮卡啾：間隔 20、浮動 3、魔消 20 → 魔消窗口從間隔第 3 秒開始
const T0 = 1_000_000

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  bossId.value = 'pink-bean'
  resetSession()
  now.value = T0
})

const dispelBtn = (w: ReturnType<typeof mount>) => w.find('.ctrl.btn-primary')

describe('魔消時機提醒', () => {
  it('待機時按鈕不閃', () => {
    const w = mount(DamageReflectPanel)
    expect(dispelBtn(w).classes()).not.toContain('dispel-now')
    expect(w.find('.phase-panel').classes()).not.toContain('dispel-active')
  })

  it('間隔進入魔消窗口後按鈕開始閃，面板同步標記', async () => {
    const w = mount(DamageReflectPanel)
    reflectState.value = startInterval(T0)
    now.value = T0 + 2_000 // 還沒到第 3 秒
    await w.vm.$nextTick()
    expect(dispelBtn(w).classes()).not.toContain('dispel-now')
    now.value = T0 + 4_000
    await w.vm.$nextTick()
    expect(dispelBtn(w).classes()).toContain('dispel-now')
    expect(w.find('.phase-panel').classes()).toContain('dispel-active')
  })

  it('按下魔消成功就停止閃', async () => {
    const w = mount(DamageReflectPanel)
    reflectState.value = startInterval(T0)
    now.value = T0 + 4_000
    await w.vm.$nextTick()
    expect(dispelBtn(w).classes()).toContain('dispel-now')
    expect(onDispel()).toBe('valid')
    await w.vm.$nextTick()
    expect(dispelBtn(w).classes()).not.toContain('dispel-now')
  })

  it('離開間隔階段也停止閃', async () => {
    const w = mount(DamageReflectPanel)
    reflectState.value = startInterval(T0)
    now.value = T0 + 4_000
    await w.vm.$nextTick()
    expect(dispelBtn(w).classes()).toContain('dispel-now')
    await w.find('.ctrl-reflect').trigger('click') // 反盾開始
    expect(dispelBtn(w).classes()).not.toContain('dispel-now')
  })
})
