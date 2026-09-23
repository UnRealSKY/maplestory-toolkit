import { describe, it, expect } from 'vitest'
import { slotsOf, SLOT_COUNT } from '#src/hotkey/slots'
import { bossById } from '#src/boss/bosses'

describe('slot 對應', () => {
  it('永遠是六格', () => {
    expect(SLOT_COUNT).toBe(6)
    for (const id of ['pink-bean', 'dunas', 'cygnus', 'arkarium', 'dps']) {
      expect(slotsOf(bossById(id))).toHaveLength(6)
    }
  })

  it('反盾模板：四個動作，重置不進格子——誤按會把整場計時清掉', () => {
    expect(slotsOf(bossById('pink-bean')).map((s) => s?.label ?? null)).toEqual([
      '反盾開始', '反盾結束', '反盾阻止成功', '魔消成功', null, null,
    ])
  })

  it('反盾模板兩隻王的六格一模一樣', () => {
    expect(slotsOf(bossById('dunas'))).toEqual(slotsOf(bossById('pink-bean')))
  })

  it('循環模板：跟著 cycles 順序，重置不進格子', () => {
    expect(slotsOf(bossById('cygnus')).map((s) => s?.label ?? null)).toEqual([
      '反盾', '變豬', '小黑屋', '鎖潛能', '活屍', null,
    ])
  })

  it('循環模板每格帶著該機制的 id，順序改了格號自動跟著動', () => {
    const slots = slotsOf(bossById('cygnus'))
    expect(slots.slice(0, 5).map((s) => (s as { cycleId: string }).cycleId)).toEqual([
      'damage-reflect', 'pig', 'jail', 'seal', 'zombie',
    ])
  })

  it('血量與 DPS 模板六格全空——打王時沒有要按的按鈕', () => {
    expect(slotsOf(bossById('arkarium'))).toEqual([null, null, null, null, null, null])
    expect(slotsOf(bossById('dps'))).toEqual([null, null, null, null, null, null])
  })
})
