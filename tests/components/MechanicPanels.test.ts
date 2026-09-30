import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MechanicPanels from '#src/components/MechanicPanels.vue'
import { bossId } from '#src/boss/bossId'
import { resetSession } from '#src/boss/session'
import { passed, finalClock } from '#src/hp/thresholdState'
import { points, previousBar } from '#src/hp/capture'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  bossId.value = 'arkarium'
  resetSession()
  points.value = []
  previousBar.value = null
})

const resetBtn = (w: ReturnType<typeof mount>) => w.find('.reset-row button')

describe('血量模板與效率推估的重置', () => {
  it('阿卡伊農有重置；沒東西可清時反灰', () => {
    const w = mount(MechanicPanels)
    expect(resetBtn(w).exists()).toBe(true)
    expect(resetBtn(w).attributes('disabled')).toBeDefined()
  })

  it('過了門檻就能按，按了門檻進度、紀錄、上一條血都清掉', async () => {
    const w = mount(MechanicPanels)
    passed.value = [80, 60]
    finalClock.value = 123
    points.value = [{ t: 1, ratio: 0.5, color: 'x' }]
    previousBar.value = { reading: { ratio: 0.9, color: 'y', nextColor: null, portraitUrl: null }, frozenAt: 1, expiresAt: 2 } as never
    await w.vm.$nextTick()
    expect(resetBtn(w).attributes('disabled')).toBeUndefined()
    await resetBtn(w).trigger('click')
    expect(passed.value).toEqual([])
    expect(finalClock.value).toBeUndefined()
    expect(points.value).toEqual([])
    expect(previousBar.value).toBeNull()
  })

  it('效率推估也有重置，只看有沒有紀錄', async () => {
    bossId.value = 'dps'
    resetSession()
    const w = mount(MechanicPanels)
    expect(resetBtn(w).exists()).toBe(true)
    expect(resetBtn(w).attributes('disabled')).toBeDefined()
    points.value = [{ t: 1, ratio: 0.5, color: 'x' }]
    await w.vm.$nextTick()
    expect(resetBtn(w).attributes('disabled')).toBeUndefined()
  })

  it('反盾與循環模板沒有這一列——它們自己的面板有重置', () => {
    bossId.value = 'pink-bean'
    resetSession()
    expect(mount(MechanicPanels).find('.reset-row').exists()).toBe(false)
    bossId.value = 'cygnus'
    resetSession()
    expect(mount(MechanicPanels).find('.reset-row').exists()).toBe(false)
  })
})
