// 「反盾」機制模板的核心狀態機（純函式，UI 只負責渲染與計時觸發）
//
// 循環：reflect(反盾持續) → interval(反盾間隔) → 有效魔消 ? blocked(反盾持續) → interval
//                                              : reflect
// 魔消有效窗：buff 須撐到反盾重施當下；重施最晚可能拖到「間隔＋浮動」，
// 所以有效窗是間隔的第 (間隔+浮動-魔消持續) 秒之後。
// 魔消對王有 80 秒耐性、技能本身 60 秒冷卻，兩者都只提醒不阻擋操作。

export interface ReflectParams {
  reflectDuration: number  // 反盾持續（秒）
  interval: number        // 反盾間隔（秒）
  dispelDuration: number  // 魔消持續（秒）
  intervalFloat?: number  // 反盾間隔浮動（秒）：實際重施落在 interval ~ interval+float
}

// 王對魔消的耐性與玩家技能冷卻都是固定值，不隨王或設定變動。
// 兩者都從「施放當下」起算；60 < 80 表示真正的節流一直是耐性。
export const DISPEL_RESIST = 80
export const DISPEL_COOLDOWN = 60

export type ReflectPhase = 'idle' | 'reflect' | 'interval' | 'blocked'

export interface ReflectState {
  phase: ReflectPhase
  phaseStart: number    // ms（epoch）
  dispelValid: boolean  // 本次間隔是否已有有效魔消
  lastDispelAt?: number // 上次標記魔消的時刻（ms），耐性與冷卻都由它推算
}

export const IDLE: ReflectState = { phase: 'idle', phaseStart: 0, dispelValid: false }

// 各階段長度（秒）；反盾被阻止期＝反盾持續
export function phaseDuration(phase: ReflectPhase, p: ReflectParams): number {
  if (phase === 'reflect' || phase === 'blocked') return p.reflectDuration
  if (phase === 'interval') return p.interval
  return Infinity
}

export function phaseEnd(state: ReflectState, p: ReflectParams): number {
  return state.phaseStart + phaseDuration(state.phase, p) * 1000
}

// 魔消提醒點：buff 必須撐到反盾重施當下，而重施最晚可能拖到「間隔＋浮動」，
// 所以往回推要用最晚那一刻算——提早放會在反盾來之前就掉了。
// 注意這只影響魔消時機；可輸出的判斷仍以 interval 本身為準（反盾最早就是那時候來）。
export function dispelWindowStart(p: ReflectParams): number {
  return Math.max(0, p.interval + (p.intervalFloat ?? 0) - p.dispelDuration)
}

// 剩餘秒數（無條件進位到整數秒；沒有魔消紀錄時為 0）
function remainingSince(lastAt: number | undefined, total: number, now: number): number {
  if (lastAt == null) return 0
  return Math.max(0, Math.ceil(total - (now - lastAt) / 1000))
}

// 王的耐性剩餘：這段期間再魔消也擋不掉反盾
export function resistRemaining(state: ReflectState, now: number): number {
  return remainingSince(state.lastDispelAt, DISPEL_RESIST, now)
}

// 玩家技能冷卻剩餘
export function cooldownRemaining(state: ReflectState, now: number): number {
  return remainingSince(state.lastDispelAt, DISPEL_COOLDOWN, now)
}

// [反盾開始]：隨時可點，立即進入反盾（校準用）
export function startReflect(now: number): ReflectState {
  return { phase: 'reflect', phaseStart: now, dispelValid: false }
}

// [反盾結束]：隨時可點，立即進入間隔（校準用；也可修正反盾開始按錯的時機）
export function startInterval(now: number): ReflectState {
  return { phase: 'interval', phaseStart: now, dispelValid: false }
}

// [反盾阻止成功]：隨時可點，立即進入反盾被阻止期（間隔實際為「最少」20 秒，
// 可能因王的出招動畫推遲；或忘了按魔消成功但實況確實擋掉了時人工校正）
export function startBlocked(now: number): ReflectState {
  return { phase: 'blocked', phaseStart: now, dispelValid: false }
}

// 到下次反盾為止還能輸出幾秒。阻止成功後接的那段間隔也是能打的，算進來才有意義；
// 已標記魔消的間隔同理——後面接的「阻止成功 + 下一段間隔」都還能打。
// 下一輪魔消成不成功是未知數，不預測。
// 可以打到「什麼時候」（絕對時刻 ms）。反盾中與待機沒有這個時刻，回 null。
// 這是固定的一刻，不隨 now 變動——顯示時刻時必須用它，
// 用「現在 + 剩餘秒數」回推會因為秒數進位而每秒抖一下。
export function attackEndAt(state: ReflectState, p: ReflectParams): number | null {
  if (state.phase === 'idle' || state.phase === 'reflect') return null
  const end = phaseEnd(state, p)
  if (state.phase === 'blocked') return end + p.interval * 1000
  return state.dispelValid ? end + (p.reflectDuration + p.interval) * 1000 : end
}

export function attackRemaining(state: ReflectState, p: ReflectParams, now: number): number {
  const at = attackEndAt(state, p)
  if (at == null) return 0
  return Math.max(0, (at - now) / 1000)
}

// [±1 秒]：微調當前階段。倒數、進度條、引信、事件表都是從 phaseStart 算出來的，
// 移動起點等於整條時間軸一起平移，不會只有倒數變而其他沒跟上。
export function nudge(state: ReflectState, deltaSec: number): ReflectState {
  if (state.phase === 'idle') return state
  return { ...state, phaseStart: state.phaseStart + deltaSec * 1000 }
}

export type DispelResult = 'valid' | 'tooEarly' | 'wrongPhase'

// [魔消成功]：僅間隔中有效，且必須落在有效窗（間隔最後「魔消持續」秒）
export function markDispel(
  state: ReflectState,
  now: number,
  p: ReflectParams,
): { state: ReflectState; result: DispelResult } {
  if (state.phase !== 'interval') return { state, result: 'wrongPhase' }
  const elapsedSec = (now - state.phaseStart) / 1000
  if (elapsedSec < dispelWindowStart(p)) return { state, result: 'tooEarly' }
  // 耐性中照樣讓標記成立：上一次可能是按錯的，擋住就沒辦法改回來了
  return { state: { ...state, dispelValid: true, lastDispelAt: now }, result: 'valid' }
}

// 自動推進：倒數到 0 依規則轉入下一階段（可能連續跨多段）
export function advance(state: ReflectState, now: number, p: ReflectParams): ReflectState {
  let s = state
  while (s.phase !== 'idle' && now >= phaseEnd(s, p)) {
    const end = phaseEnd(s, p)
    if (s.phase === 'reflect') {
      s = { phase: 'interval', phaseStart: end, dispelValid: false, lastDispelAt: s.lastDispelAt }
    } else if (s.phase === 'interval') {
      s = s.dispelValid
        ? { phase: 'blocked', phaseStart: end, dispelValid: false, lastDispelAt: s.lastDispelAt }
        : { phase: 'reflect', phaseStart: end, dispelValid: false, lastDispelAt: s.lastDispelAt }
    } else {
      // blocked → 下一個間隔
      s = { phase: 'interval', phaseStart: end, dispelValid: false, lastDispelAt: s.lastDispelAt }
    }
  }
  return s
}

export interface ReflectEvent {
  at: number // ms
  label: string
  canAttack: boolean // 事件之後是否可輸出
}

// 未來事件表（僅列 now 之後）：目前間隔依實際魔消標記推演；
// 之後的間隔預設「未魔消 → 反盾開始」
export function upcomingEvents(
  state: ReflectState,
  p: ReflectParams,
  now: number,
  count = 6,
): ReflectEvent[] {
  const out: ReflectEvent[] = []
  const push = (e: ReflectEvent) => {
    if (e.at > now) out.push(e)
  }
  let s = state
  while (out.length < count && s.phase !== 'idle') {
    const end = phaseEnd(s, p)
    if (s.phase === 'reflect') {
      push({ at: end, label: '反盾結束（可輸出）', canAttack: true })
      s = { phase: 'interval', phaseStart: end, dispelValid: false, lastDispelAt: s.lastDispelAt }
    } else if (s.phase === 'interval') {
      const windowStart = dispelWindowStart(p)
      const windowAt = s.phaseStart + windowStart * 1000
      // 那一刻還在耐性內就擋不掉，不必提醒去放
      if (windowStart > 0 && resistRemaining(s, windowAt) === 0) {
        push({ at: windowAt, label: '使用魔消！', canAttack: true })
      }
      if (s.dispelValid) {
        push({ at: end, label: '反盾阻止成功（可輸出）', canAttack: true })
        s = { phase: 'blocked', phaseStart: end, dispelValid: false, lastDispelAt: s.lastDispelAt }
      } else {
        push({ at: end, label: '反盾期間（禁止輸出）', canAttack: false })
        s = { phase: 'reflect', phaseStart: end, dispelValid: false, lastDispelAt: s.lastDispelAt }
      }
    } else {
      push({ at: end, label: '反盾預定結束（間隔開始）', canAttack: true })
      s = { phase: 'interval', phaseStart: end, dispelValid: false, lastDispelAt: s.lastDispelAt }
    }
  }
  return out.slice(0, count)
}
