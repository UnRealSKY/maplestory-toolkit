// 血量讀數的去抖動（純函式，狀態由呼叫端持有）。
//
// 每秒掃一次畫面，單一幀讀不到或讀錯就直接反映到畫面上，會讓讀數在
// 「找到／找不到」之間閃爍、DPS 序列被單幀誤讀的顏色切斷。這裡做兩件事：
//   1. 找不到時先撐著：維持上一次讀數，超過 NOT_FOUND_HOLD_MS 才真的歸零。
//      0% 是「找到了、整條空的」，是正常讀數，跟找不到是兩回事。
//   2. 換色要確認：新顏色連續 COLOR_CONFIRM_MS 才採信。確認前照常發布新讀數
//      讓畫面跟得上，但不推進歷史；舊的那條凍在換色前最後一次讀數，換色前
//      還高於 PREVIOUS_BAR_MIN_RATIO 的話（不是正常打完，是換階段或換王），
//      確認後再多留一會兒，讓人看得出「舊的停在哪、新的從哪開始」。

import { sameBar } from './history'

/** 這裡只看比例與顏色；即時讀數還會多帶頭像等欄位，原封不動跟著走 */
export interface Reading {
  ratio: number
  color: string | null
}

export const NOT_FOUND_HOLD_MS = 10_000
export const COLOR_CONFIRM_MS = 3_000
export const PREVIOUS_BAR_MS = 10_000
export const PREVIOUS_BAR_MIN_RATIO = 0.05

export interface PreviousBar<T extends Reading = Reading> {
  /** 凍在換色前最後一次的讀數 */
  reading: T
  /** 凍住的舊條顯示到什麼時候 */
  until: number
}

export interface DebounceState<T extends Reading = Reading> {
  /** 最後一次真的讀到的讀數與時間 */
  last: { reading: T; at: number } | null
  /** 目前採信的顏色 */
  color: string | null
  /** 待確認的新顏色，從什麼時候開始 */
  pending: { color: string | null; since: number } | null
  previous: PreviousBar<T> | null
}

export interface Settled<T extends Reading = Reading> {
  state: DebounceState<T>
  /** 要發布的讀數；null 才是真的沒有 */
  reading: T | null
  /** 這一筆要不要推進歷史 */
  record: boolean
  previous: PreviousBar<T> | null
}

export function createDebounce<T extends Reading = Reading>(): DebounceState<T> {
  return { last: null, color: null, pending: null, previous: null }
}

export function settle<T extends Reading>(state: DebounceState<T>, raw: T | null, now: number): Settled<T> {
  const previous = state.previous && now <= state.previous.until ? state.previous : null

  if (!raw) {
    if (state.last && now - state.last.at <= NOT_FOUND_HOLD_MS) {
      const next = { ...state, previous }
      return { state: next, reading: state.last.reading, record: false, previous }
    }
    return { state: createDebounce<T>(), reading: null, record: false, previous: null }
  }

  const last = { reading: raw, at: now }

  // 第一次讀到，或顏色沒變。確認期內跳回舊色就是單幀誤讀，凍住的舊條跟著撤掉
  if (!state.last || sameBar(raw.color, state.color)) {
    const kept = state.pending ? null : previous
    const next: DebounceState<T> = { last, color: raw.color, pending: null, previous: kept }
    return { state: next, reading: raw, record: true, previous: kept }
  }

  // 顏色跟採信的不同：開始或延續確認期
  const pending =
    state.pending && sameBar(state.pending.color, raw.color)
      ? state.pending
      : { color: raw.color, since: now }
  const frozen: PreviousBar<T> =
    state.pending && state.previous
      ? state.previous
      : { reading: state.last.reading, until: now + PREVIOUS_BAR_MS }

  if (now - pending.since < COLOR_CONFIRM_MS) {
    const next: DebounceState<T> = { last, color: state.color, pending, previous: frozen }
    return { state: next, reading: raw, record: false, previous: frozen }
  }

  // 確認：舊的還高於門檻才留著給人看
  const keep = frozen.reading.ratio > PREVIOUS_BAR_MIN_RATIO && now <= frozen.until ? frozen : null
  const next: DebounceState<T> = { last, color: raw.color, pending: null, previous: keep }
  return { state: next, reading: raw, record: true, previous: keep }
}
