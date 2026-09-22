import { describe, it, expect } from 'vitest'
import {
  secondsLeft,
  cyclesElapsed,
  nudgeClock,
  triggerAt,
  upcomingCycleEvents,
  finisherWindow,
} from '#src/boss/cycle'

const T0 = 1_000_000
const sec = (n: number) => T0 + n * 1000

describe('循環倒數', () => {
  it('還沒按過觸發就沒有倒數', () => {
    expect(secondsLeft(undefined, 60, sec(30))).toBeNull()
  })

  it('剛觸發時是整個間隔', () => {
    expect(secondsLeft(T0, 60, T0)).toBe(60)
  })

  it('過一秒少一秒', () => {
    expect(secondsLeft(T0, 60, sec(1))).toBe(59)
    expect(secondsLeft(T0, 60, sec(59))).toBe(1)
  })

  it('到點自動接下一輪，不必再按', () => {
    expect(secondsLeft(T0, 60, sec(60))).toBe(60)
    expect(secondsLeft(T0, 60, sec(61))).toBe(59)
    expect(secondsLeft(T0, 60, sec(121))).toBe(59)
  })

  it('不同間隔各自算自己的', () => {
    expect(secondsLeft(T0, 90, sec(100))).toBe(80)
    expect(secondsLeft(T0, 80, sec(100))).toBe(60)
  })

  it('無條件進位到整秒——顯示 0 卻還沒到會誤導', () => {
    expect(secondsLeft(T0, 60, T0 + 59_500)).toBe(1)
  })
})

describe('已觸發輪數（響鈴用）', () => {
  it('未開始是 0', () => {
    expect(cyclesElapsed(undefined, 60, sec(600))).toBe(0)
  })

  it('第一輪還沒到是 0，到了就 1', () => {
    expect(cyclesElapsed(T0, 60, sec(59))).toBe(0)
    expect(cyclesElapsed(T0, 60, sec(60))).toBe(1)
    expect(cyclesElapsed(T0, 60, sec(119))).toBe(1)
    expect(cyclesElapsed(T0, 60, sec(120))).toBe(2)
  })
})

describe('觸發與微調', () => {
  it('按觸發＝從現在重數', () => {
    const clock = triggerAt(sec(35))
    expect(secondsLeft(clock, 60, sec(35))).toBe(60)
  })

  it('＋1 秒讓倒數多一秒，−1 秒少一秒', () => {
    expect(secondsLeft(nudgeClock(T0, 1), 60, sec(10))).toBe(51)
    expect(secondsLeft(nudgeClock(T0, -1), 60, sec(10))).toBe(49)
  })

  it('還沒開始的循環微調不了', () => {
    expect(nudgeClock(undefined, 1)).toBeUndefined()
  })
})

describe('接下來會觸發什麼', () => {
  const CYCLES = [
    { id: 'a', name: '活屍', interval: 60 },
    { id: 'b', name: '鎖潛能', interval: 90 },
  ]

  it('沒開始的機制不列進去', () => {
    expect(upcomingCycleEvents(CYCLES, { a: T0 }, T0, 3).every((e) => e.name === '活屍')).toBe(true)
  })

  it('依時間排序，混合不同間隔', () => {
    const list = upcomingCycleEvents(CYCLES, { a: T0, b: T0 }, T0, 4)
    expect(list.map((e) => [e.name, (e.at - T0) / 1000])).toEqual([
      ['活屍', 60],
      ['鎖潛能', 90],
      ['活屍', 120],
      ['活屍', 180],
    ])
  })

  it('只列現在之後的，過去的那幾輪跳過', () => {
    const list = upcomingCycleEvents(CYCLES, { a: T0 }, sec(130), 2)
    expect(list.map((e) => (e.at - T0) / 1000)).toEqual([180, 240])
  })

  it('全部都沒開始就是空的', () => {
    expect(upcomingCycleEvents(CYCLES, {}, T0)).toEqual([])
  })
})

describe('一波：魔消段內會不會撞到斷輸出的機制', () => {
  // 女皇：反盾在魔消期間無效、活屍不影響輸出，所以只看變豬／黑屋／鎖潛能
  const CYCLES = [
    { id: 'damage-reflect', name: '反盾', interval: 80 },
    { id: 'pig', name: '變豬', interval: 60 },
    { id: 'jail', name: '小黑屋', interval: 90 },
    { id: 'seal', name: '鎖潛能', interval: 90 },
    { id: 'zombie', name: '活屍', interval: 60 },
  ]
  // 魔消 20 秒＋反應寬容 5 秒＝要乾淨的長度 25 秒
  const FINISHER = { hpPercent: 11, blockedBy: ['pig', 'jail', 'seal'], seconds: 20, slack: 5 }
  const all = { 'damage-reflect': T0, pig: T0, jail: T0, seal: T0, zombie: T0 }

  it('三個時鐘剛觸發完 → 現在可以，窗口長到變豬觸發為止', () => {
    expect(finisherWindow(CYCLES, all, T0, FINISHER)).toEqual({
      wait: 0,
      startWithin: 35, // 變豬在 60 秒後觸發，扣掉魔消 20＋寬容 5
      waitingFor: [],
    })
  })

  it('變豬 10 秒後要來 → 等到變豬觸發那一刻，並說在等誰', () => {
    expect(finisherWindow(CYCLES, all, sec(50), FINISHER)).toEqual({
      wait: 10,
      startWithin: 5, // 變豬觸發後到黑屋／鎖潛能只剩 30 秒，能下手的只有 5 秒
      waitingFor: ['變豬'],
    })
  })

  it('剛好在邊界：機制在第 25 秒觸發還算撞到，第 26 秒不算', () => {
    expect(finisherWindow(CYCLES, all, sec(35), FINISHER)!.wait).toBe(25) // 變豬在 60，35+25=60
    expect(finisherWindow(CYCLES, all, sec(34), FINISHER)!.wait).toBe(0)
  })

  it('兩個機制同時觸發，兩個都要列出來', () => {
    // 從 70 起：黑屋與鎖潛能都在 90 觸發，等到 90 之後才乾淨
    expect(finisherWindow(CYCLES, all, sec(70), FINISHER)).toEqual({
      wait: 20,
      startWithin: 5,
      waitingFor: ['小黑屋', '鎖潛能'],
    })
  })

  it('等待期間連續撞到好幾個，依觸發順序全部列出', () => {
    const clocks = { ...all, jail: sec(-10) } // 黑屋改成在 80 觸發
    expect(finisherWindow(CYCLES, clocks, sec(50), FINISHER)).toEqual({
      wait: 40, // 變豬 60 → 黑屋 80 → 鎖潛能 90，到 90 才乾淨
      startWithin: 5,
      waitingFor: ['變豬', '小黑屋', '鎖潛能'],
    })
  })

  it('反盾與活屍要來了也不算撞到', () => {
    const clocks = { ...all, pig: sec(30), jail: sec(30), seal: sec(30) }
    const w = finisherWindow(CYCLES, clocks, sec(60), FINISHER)!
    expect(w.wait).toBe(0) // 反盾 80、活屍 60 都落在窗口內，照樣可以
    expect(w.startWithin).toBe(5) // 變豬在 90 觸發，能下手的只有 5 秒
  })

  it('三個時鐘有任一個沒按過觸發 → 沒依據，回 null', () => {
    expect(finisherWindow(CYCLES, { ...all, seal: undefined }, T0, FINISHER)).toBeNull()
    expect(finisherWindow(CYCLES, {}, T0, FINISHER)).toBeNull()
  })

  it('等待秒數無條件進位', () => {
    expect(finisherWindow(CYCLES, all, sec(50) - 500, FINISHER)!.wait).toBe(11)
  })
})
