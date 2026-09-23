// 收到某一格就執行對應的動作。
//
// 不模擬 DOM click：面板同時渲染在主視窗與子母畫面兩份，派 click 會有「點哪一份」
// 的歧義。動作本來就都在模組層，直接呼叫，兩份畫面自然同步。

import { currentBoss, onStartReflect, onStartInterval, onStartBlocked, onDispel } from '../boss/session'
import { triggerCycle } from '../boss/cycleClocks'
import { touchNow } from '../boss/clock'
import { slotsOf, SLOT_COUNT } from './slots'

const REFLECT_RUNNERS = {
  start: onStartReflect,
  interval: onStartInterval,
  blocked: onStartBlocked,
  // 非間隔階段 markDispel 自己會回 wrongPhase 並原樣退回狀態，這裡不必再擋一次
  dispel: onDispel,
} as const

/** n 是 1..6。該格空著或編號超出範圍回 false */
export function runSlot(n: number): boolean {
  if (!Number.isInteger(n) || n < 1 || n > SLOT_COUNT) return false
  const boss = currentBoss()
  const slot = slotsOf(boss)[n - 1]
  if (!slot) return false

  if (slot.kind === 'reflect') {
    REFLECT_RUNNERS[slot.action]()
    return true
  }
  // 用同一個時間戳，倒數才不會在下次更新之前先閃一個大 1 秒的數字
  triggerCycle(slot.cycleId, touchNow())
  return true
}
