// 一場戰鬥的共用狀態與推進。
//
// 面板會同時出現在主視窗與抬頭顯示（兩份各自渲染），所以狀態不能放在元件裡：
// 放元件裡就會變成兩份各走各的，音效也會響兩次。這裡是唯一的一份，
// 計時推進與音效都在這裡做，元件只負責畫出來。

import { computed, ref, watch } from 'vue'
import {
  IDLE,
  advance,
  dispelWindowStart,
  markDispel,
  nudge,
  resistRemaining,
  startBlocked,
  startInterval,
  startReflect,
  type ReflectState,
} from './damageReflect'
import {
  DEFAULT_DISPEL_DURATION,
  bossById,
  reflectBossById,
  normalizeOverrides,
  paramsOf,
  type BossOverrides,
} from './bosses'
import { beep as playBeep } from './sound'
import { soundOn } from './prefs'
import { bossId } from './bossId'
import { now, touchNow } from './clock'
export { soundOn, bossId, now }
import { anyCycleRunning, dueCycles, resetCycles } from './cycleClocks'
import { tickFinalCycle, resetThresholds } from '../hp/thresholdState'
import { clearHistory, previousBar } from '../hp/capture'
import type { CycleBoss, HpBoss } from './bosses'
import { OVERRIDES_KEY, DISPEL_KEY } from '../storageKeys'


function loadOverrides(): BossOverrides {
  try {
    return normalizeOverrides(JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? 'null'))
  } catch {
    return {} // 壞資料當作沒覆寫
  }
}

export const overrides = ref<BossOverrides>(loadOverrides())
export const dispelDuration = ref(Number(localStorage.getItem(DISPEL_KEY)) || DEFAULT_DISPEL_DURATION)
export const reflectState = ref<ReflectState>(IDLE)
export const dispelFeedback = ref<'valid' | 'tooEarly' | ''>('')
/** 有循環在跑時要鎖住換王——換走會把計時丟掉 */
export const cycleRunning = computed(() => {
  const b = currentBoss()
  return b.mechanic === 'cycle' && anyCycleRunning((b as CycleBoss).cycles)
})


watch(overrides, (v) => localStorage.setItem(OVERRIDES_KEY, JSON.stringify(v)), { deep: true })
watch(dispelDuration, (v) => localStorage.setItem(DISPEL_KEY, String(v)))

export function currentBoss() {
  return bossById(bossId.value)
}

export function reflectParams() {
  return paramsOf(reflectBossById(bossId.value), overrides.value, dispelDuration.value)
}

export function beep(freq: number, ms: number, delayMs = 0): void {
  if (!soundOn.value) return
  playBeep(freq, ms, delayMs)
}

// ---- 反盾狀態機的推進（只有這裡做，不然兩份面板會各推一次、音效響兩次）----
let remindedForPhase = 0

function tick() {
  touchNow()
  const boss = currentBoss()
  if (boss.mechanic === 'cycle') {
    // 跨到新的一輪就響一聲
    if (dueCycles((boss as CycleBoss).cycles, now.value).length) beep(880, 200)
    return
  }
  if (boss.mechanic === 'hp') {
    // 跨門檻是血量驅動的（thresholdState 自己 watch），這裡只推最後那段固定循環
    if (tickFinalCycle(boss as HpBoss, now.value)) {
      beep(1250, 140)
      beep(1250, 220, 200)
    }
    return
  }
  if (boss.mechanic !== 'damage-reflect') return // 只看血條的類型沒有東西要推進
  const params = reflectParams()
  const prev = reflectState.value
  const next = advance(prev, now.value, params)
  if (next !== prev && (next.phase !== prev.phase || next.phaseStart !== prev.phaseStart)) {
    reflectState.value = next
    if (next.phase === 'reflect') {
      beep(440, 220)
      beep(330, 300, 260)
    } else {
      beep(880, 180)
    }
  }
  // 魔消提醒：間隔進入有效窗那一刻。王的耐性還在就不響——放了也擋不掉
  const s = reflectState.value
  if (s.phase === 'interval' && remindedForPhase !== s.phaseStart) {
    const elapsed = (now.value - s.phaseStart) / 1000
    if (elapsed >= dispelWindowStart(params) && resistRemaining(s, now.value) === 0) {
      remindedForPhase = s.phaseStart
      beep(1250, 120)
      beep(1250, 120, 180)
    }
  }
}

// 兩條腿走路：rAF 讓倒數與引信連續移動，interval 是保底——
// 開著抬頭顯示打王時主視窗多半在背景，那時瀏覽器會把 rAF 停掉，
// 計時不能跟著停。迴圈在頁面掛載時才啟動。
let raf: number | undefined
let keepAlive: ReturnType<typeof setInterval> | undefined

function loop() {
  tick()
  raf = requestAnimationFrame(loop)
}

export function startSessionLoop(): void {
  stopSessionLoop() // 重新掛載時要換成當下的計時器，不能沿用舊的
  raf = requestAnimationFrame(loop)
  keepAlive = setInterval(tick, 250)
}

export function stopSessionLoop(): void {
  if (raf != null) cancelAnimationFrame(raf)
  raf = undefined
  clearInterval(keepAlive)
  keepAlive = undefined
}

// ---- 操作 ----
export function onStartReflect() {
  reflectState.value = startReflect(Date.now())
}
export function onStartInterval() {
  reflectState.value = startInterval(Date.now())
}
export function onStartBlocked() {
  reflectState.value = startBlocked(Date.now())
}
export function onDispel(): 'valid' | 'tooEarly' | 'wrongPhase' {
  const { state, result } = markDispel(reflectState.value, Date.now(), reflectParams())
  reflectState.value = state
  if (result !== 'wrongPhase') dispelFeedback.value = result
  return result
}
export function onResetReflect() {
  reflectState.value = IDLE
  dispelFeedback.value = ''
  remindedForPhase = 0 // 清掉上一場殘留，換王後第一個間隔才會提醒魔消
}
export function onNudgeReflect(deltaSec: number) {
  reflectState.value = nudge(reflectState.value, deltaSec)
}

/** 血量模板與效率推估的「重置」：打完一場，門檻進度、DPS 紀錄、上一條血都清掉；擷取照跑，不必重整頁面 */
export function resetHpFight(): void {
  resetThresholds()
  clearHistory()
  previousBar.value = null
}

/** 換王＝換一場，把上一隻王的計時與紀錄都清掉 */
export function resetSession(): void {
  onResetReflect()
  const boss = currentBoss()
  if (boss.mechanic === 'cycle') resetCycles((boss as CycleBoss).cycles)
  resetThresholds()
}
// 同步執行：預設會排到下一個 tick，換王後馬上按觸發的話那次重置會反過來把它清掉
watch(bossId, resetSession, { flush: 'sync' })
