// 「循環」機制模板的核心（純函式，UI 只負責渲染與計時觸發）
//
// 反盾模板要管階段轉換，循環模板不用：每個機制只有一個固定間隔，
// 按下「觸發」記住那一刻，之後就是每 interval 秒一次，自己接下去數。
// 因此狀態只有一個數字——最近一次觸發的時刻。

// 最近一次觸發時刻（ms）；undefined＝這輪還沒按過觸發，不計時
export type CycleClock = number | undefined

export function triggerAt(now: number): CycleClock {
  return now
}

// 距離下次觸發還有幾秒（無條件進位；未開始回 null）。
// 顯示 0 卻還沒到會誤導，所以剩餘落在 1 ~ interval，不會出現 0
export function secondsLeft(clock: CycleClock, interval: number, now: number): number | null {
  if (clock == null || interval <= 0) return null
  const elapsed = (now - clock) / 1000
  return Math.ceil(interval - (elapsed % interval)) || interval
}

// 從按下觸發到現在已經跑完幾輪；響鈴用（數字變大就是剛觸發過）
export function cyclesElapsed(clock: CycleClock, interval: number, now: number): number {
  if (clock == null || interval <= 0) return 0
  return Math.max(0, Math.floor((now - clock) / 1000 / interval))
}

// 微調：整條時間軸平移，倒數與下一輪一起跟著移
export function nudgeClock(clock: CycleClock, deltaSec: number): CycleClock {
  if (clock == null) return clock
  return clock + deltaSec * 1000
}

export interface CycleDef {
  id: string
  name: string
  interval: number
}

export interface CycleEvent {
  at: number
  name: string
}

// 接下來會觸發的機制（時間排序）。只列已經按過觸發的，沒開始的無從推算。
// 反盾面板有「接下來」事件表，這邊是同一件事的循環版。
export function upcomingCycleEvents(
  cycles: CycleDef[],
  clocks: Record<string, CycleClock>,
  now: number,
  count = 6,
): CycleEvent[] {
  const out: CycleEvent[] = []
  for (const c of cycles) {
    const clock = clocks[c.id]
    if (clock == null || c.interval <= 0) continue
    // 從下一次觸發開始往後排，排到夠填滿清單為止
    const done = cyclesElapsed(clock, c.interval, now)
    for (let k = done + 1; k <= done + count; k++) {
      const at = clock + k * c.interval * 1000
      if (at > now) out.push({ at, name: c.name })
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, count)
}

// 「一波」的判斷資料：王血量掉到 hpPercent 以下會回血，隊伍用魔消擋 seconds 秒
// 全力打完。魔消期間王照常放的機制裡，blockedBy 列的那幾個會斷輸出；slack 是從
// 畫面亮「可以一波」到魔消真的生效之間的反應餘裕（喊、反應、施放）。
export interface Finisher {
  hpPercent: number
  blockedBy: string[]
  seconds: number
  slack: number
}

export interface FinisherWindow {
  /** 還要等幾秒才能一波；0＝現在就可以 */
  wait: number
  /**
   * 從窗口開始算，還有幾秒可以下手打一波。
   * 不是窗口總長——最後那 seconds + slack 秒是魔消要用的，那時候才開始就來不及了。
   */
  startWithin: number
  /** 等待期間會先觸發的機制名稱，依時間排序、同一個只列一次 */
  waitingFor: string[]
}

// 現在一波下去，魔消段會不會撞到斷輸出的機制。blockedBy 裡有任何一個時鐘沒按過
// 觸發就回 null——沒依據不能亂說可以。
// 要乾淨的長度是 seconds + slack：不管魔消在餘裕內哪一刻生效，之後 seconds 秒都得乾淨。
// 找法：從現在起算，窗口內撞到機制就把起點移到那個機制的觸發時刻再看一次。
// 機制剛好在起點觸發不算撞到（放完就乾淨了），剛好在終點觸發算撞到。
export function finisherWindow(
  cycles: CycleDef[],
  clocks: Record<string, CycleClock>,
  now: number,
  finisher: Finisher,
): FinisherWindow | null {
  const blockers = cycles.filter((c) => finisher.blockedBy.includes(c.id))
  // 資料寫錯（列了不存在的機制）也回 null，不能因為少看一個就說可以
  if (blockers.length !== finisher.blockedBy.length) return null
  if (blockers.some((c) => clocks[c.id] == null || c.interval <= 0)) return null
  const need = (finisher.seconds + finisher.slack) * 1000

  const nextAt = (c: CycleDef, from: number) => {
    const clock = clocks[c.id]!
    const step = c.interval * 1000
    return clock + (Math.floor((from - clock) / step) + 1) * step
  }

  // 窗口的起點：撞到就把起點移到那個機制的觸發時刻，直到往後 need 都乾淨
  let start = now
  let clean = false
  for (let guard = 0; guard < 100 && !clean; guard++) {
    let hit: number | null = null
    for (const c of blockers) {
      const at = nextAt(c, start)
      if (at <= start + need && (hit == null || at < hit)) hit = at
    }
    if (hit == null) clean = true
    else start = hit
  }
  if (!clean) return null

  let soonest = Infinity
  for (const c of blockers) soonest = Math.min(soonest, nextAt(c, start))

  // 等待期間會觸發的機制：兩個同時觸發也都要列，不能只列決定起點的那一個
  const firing: Array<{ at: number; name: string }> = []
  for (const c of blockers) {
    for (let at = nextAt(c, now); at <= start; at += c.interval * 1000) {
      firing.push({ at, name: c.name })
    }
  }
  firing.sort((a, b) => a.at - b.at)
  const waitingFor: string[] = []
  for (const f of firing) if (!waitingFor.includes(f.name)) waitingFor.push(f.name)

  return {
    wait: Math.ceil((start - now) / 1000),
    // 最晚能下手的一刻是 soonest - need；進位讓它落在 1 以上，掉到 0 的同時就翻成等待
    startWithin: Math.ceil((soonest - need - start) / 1000),
    waitingFor,
  }
}
