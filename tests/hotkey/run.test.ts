import { describe, it, expect, beforeEach } from 'vitest'
import { runSlot } from '#src/hotkey/run'
import { bossId } from '#src/boss/bossId'
import { reflectState, resetSession } from '#src/boss/session'
import { cycleClocks } from '#src/boss/cycleClocks'

describe('執行 slot', () => {
  beforeEach(() => {
    bossId.value = 'pink-bean'
    resetSession()
  })

  it('反盾王第 1 格＝反盾開始', () => {
    expect(runSlot(1)).toBe(true)
    expect(reflectState.value.phase).toBe('reflect')
  })

  it('反盾王第 2 格＝反盾結束，轉成間隔', () => {
    runSlot(1)
    expect(runSlot(2)).toBe(true)
    expect(reflectState.value.phase).toBe('interval')
  })

  it('反盾王第 5 格＝重置', () => {
    runSlot(1)
    expect(runSlot(5)).toBe(true)
    expect(reflectState.value.phase).toBe('idle')
  })

  it('反盾王第 6 格是空的，什麼都不做', () => {
    expect(runSlot(6)).toBe(false)
    expect(reflectState.value.phase).toBe('idle')
  })

  it('魔消不在間隔階段時呼叫也不會壞，狀態原樣', () => {
    expect(runSlot(4)).toBe(true) // 呼叫成功，內部自己判定 wrongPhase
    expect(reflectState.value.phase).toBe('idle')
  })

  it('女皇第 2 格＝變豬觸發，只動那一個時鐘', () => {
    bossId.value = 'cygnus'
    resetSession()
    expect(runSlot(2)).toBe(true)
    expect(cycleClocks()['pig']).toBeTypeOf('number')
    expect(cycleClocks()['jail']).toBeUndefined()
  })

  it('女皇第 6 格＝重置，所有時鐘清空', () => {
    bossId.value = 'cygnus'
    resetSession()
    runSlot(1)
    runSlot(2)
    expect(runSlot(6)).toBe(true)
    expect(cycleClocks()['damage-reflect']).toBeUndefined()
    expect(cycleClocks()['pig']).toBeUndefined()
  })

  it('編號超出範圍不炸', () => {
    expect(runSlot(0)).toBe(false)
    expect(runSlot(7)).toBe(false)
    expect(runSlot(-1)).toBe(false)
  })
})
