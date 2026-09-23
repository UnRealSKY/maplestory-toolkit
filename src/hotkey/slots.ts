// 面板上的動作在第幾格。slot N ＝ 目前這隻王面板上第 N 個動作——換王不必重綁，
// 鍵位跟畫面位置一致。循環模板直接跟著 cycles 的順序走，王的機制順序改了格號
// 自動跟著動，不必回來改這裡。

import type { Boss, CycleBoss } from '../boss/bosses'

export const SLOT_COUNT = 6

export interface SlotAction {
  label: string
  kind: 'reflect'
  action: 'start' | 'interval' | 'blocked' | 'dispel' | 'reset'
}
export interface SlotCycleAction {
  label: string
  kind: 'cycle'
  cycleId: string
}
export interface SlotResetAction {
  label: string
  kind: 'cycle-reset'
}
export type Slot = SlotAction | SlotCycleAction | SlotResetAction

// 反盾模板的五顆操作按鈕，順序就是畫面上由左到右
const REFLECT_SLOTS: SlotAction[] = [
  { label: '反盾開始', kind: 'reflect', action: 'start' },
  { label: '反盾結束', kind: 'reflect', action: 'interval' },
  { label: '反盾阻止成功', kind: 'reflect', action: 'blocked' },
  { label: '魔消成功', kind: 'reflect', action: 'dispel' },
  { label: '重置', kind: 'reflect', action: 'reset' },
]

/** 補到六格；沒有動作的格是 null，快捷鍵按了不做事 */
function pad(slots: Slot[]): Array<Slot | null> {
  const out: Array<Slot | null> = [...slots]
  while (out.length < SLOT_COUNT) out.push(null)
  return out.slice(0, SLOT_COUNT)
}

export function slotsOf(boss: Boss): Array<Slot | null> {
  if (boss.mechanic === 'damage-reflect') return pad(REFLECT_SLOTS)
  if (boss.mechanic === 'cycle') {
    const cycles = (boss as CycleBoss).cycles
    const slots: Slot[] = cycles.map((c) => ({ label: c.name, kind: 'cycle', cycleId: c.id }))
    slots.push({ label: '重置', kind: 'cycle-reset' })
    return pad(slots)
  }
  // 血量與 DPS 模板打王時沒有要按的按鈕
  return pad([])
}
