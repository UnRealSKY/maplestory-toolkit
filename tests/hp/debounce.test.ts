import { describe, it, expect } from 'vitest'
import {
  createDebounce,
  settle,
  NOT_FOUND_HOLD_MS,
  COLOR_CONFIRM_MS,
  PREVIOUS_BAR_MS,
  type DebounceState,
} from '#src/hp/debounce'
import type { HpReading } from '#src/hp/scan'

const 紅 = '204,34,0'
const 綠 = '170,204,0'

function 讀數(ratio: number, color: string | null = 紅): HpReading {
  const total = 1000
  return {
    rect: { x0: 0, x1: total - 1, y0: 0, y1: 10 },
    fill: Math.round(ratio * total),
    total,
    ratio,
    color,
    nextColor: null,
    portrait: null,
  }
}

/** 依序餵一串 (時間, 讀數)，回傳每一步的輸出 */
function 餵(steps: Array<[number, HpReading | null]>, from: DebounceState = createDebounce()) {
  let state = from
  const outs = []
  for (const [t, r] of steps) {
    const out = settle(state, r, t)
    state = out.state
    outs.push(out)
  }
  return { state, outs, last: outs[outs.length - 1] }
}

describe('找不到血條的保持期', () => {
  it('第一次讀到就發布並記錄', () => {
    const { last } = 餵([[0, 讀數(0.8)]])
    expect(last.reading?.ratio).toBe(0.8)
    expect(last.record).toBe(true)
  })

  it('還沒讀到過任何值時，找不到就是找不到', () => {
    const { last } = 餵([[0, null]])
    expect(last.reading).toBeNull()
  })

  it('單幀找不到：維持上一次讀數，但不記錄', () => {
    const { last } = 餵([[0, 讀數(0.8)], [1000, null]])
    expect(last.reading?.ratio).toBe(0.8)
    expect(last.record).toBe(false)
  })

  it('找不到不到 10 秒又讀到：照常', () => {
    const { last } = 餵([[0, 讀數(0.8)], [1000, null], [5000, null], [9000, 讀數(0.7)]])
    expect(last.reading?.ratio).toBe(0.7)
    expect(last.record).toBe(true)
  })

  it('超過 10 秒都找不到才歸零', () => {
    const { outs } = 餵([
      [0, 讀數(0.8)],
      [NOT_FOUND_HOLD_MS, null],
      [NOT_FOUND_HOLD_MS + 1, null],
    ])
    expect(outs[1].reading?.ratio).toBe(0.8)
    expect(outs[2].reading).toBeNull()
  })

  it('0% 是讀數，不是找不到', () => {
    const { last } = 餵([[0, 讀數(0.8)], [1000, 讀數(0)]])
    expect(last.reading?.ratio).toBe(0)
    expect(last.record).toBe(true)
  })

  it('歸零之後再讀到，從頭開始', () => {
    const { last } = 餵([[0, 讀數(0.8)], [NOT_FOUND_HOLD_MS + 1, null], [20000, 讀數(1)]])
    expect(last.reading?.ratio).toBe(1)
    expect(last.record).toBe(true)
    expect(last.previous).toBeNull()
  })
})

describe('換色的確認期', () => {
  it('換色的當下就把新讀數發布出來，但不記錄', () => {
    const { last } = 餵([[0, 讀數(0.4, 紅)], [1000, 讀數(1, 綠)]])
    expect(last.reading?.ratio).toBe(1)
    expect(last.reading?.color).toBe(綠)
    expect(last.record).toBe(false)
  })

  it('3 秒內跳回舊色：當沒事，舊條消失', () => {
    const { last } = 餵([[0, 讀數(0.4, 紅)], [1000, 讀數(1, 綠)], [2000, 讀數(0.39, 紅)]])
    expect(last.reading?.color).toBe(紅)
    expect(last.record).toBe(true)
    expect(last.previous).toBeNull()
  })

  it('新色連續滿 3 秒才確認、開始記錄', () => {
    const { outs } = 餵([
      [0, 讀數(0.4, 紅)],
      [1000, 讀數(1, 綠)],
      [1000 + COLOR_CONFIRM_MS - 1, 讀數(0.99, 綠)],
      [1000 + COLOR_CONFIRM_MS, 讀數(0.98, 綠)],
    ])
    expect(outs[2].record).toBe(false)
    expect(outs[3].record).toBe(true)
  })

  it('確認中的舊條凍在換色前最後一次讀數', () => {
    const { last } = 餵([[0, 讀數(0.5, 紅)], [1000, 讀數(0.4, 紅)], [2000, 讀數(1, 綠)]])
    expect(last.previous?.reading).toMatchObject({ ratio: 0.4, color: 紅 })
  })

  it('舊的高於 5%：確認後舊條留到換色起算 10 秒', () => {
    const 換 = 1000
    const { outs } = 餵([
      [0, 讀數(0.4, 紅)],
      [換, 讀數(1, 綠)],
      [換 + COLOR_CONFIRM_MS, 讀數(0.98, 綠)],
      [換 + PREVIOUS_BAR_MS, 讀數(0.9, 綠)],
      [換 + PREVIOUS_BAR_MS + 1, 讀數(0.9, 綠)],
    ])
    expect(outs[2].previous?.reading).toMatchObject({ ratio: 0.4, color: 紅 })
    expect(outs[3].previous?.reading).toMatchObject({ ratio: 0.4, color: 紅 })
    expect(outs[4].previous).toBeNull()
  })

  it('舊的不到 5%（正常打完）：確認後沒有舊條', () => {
    const { last } = 餵([
      [0, 讀數(0.03, 紅)],
      [1000, 讀數(1, 綠)],
      [1000 + COLOR_CONFIRM_MS, 讀數(0.98, 綠)],
    ])
    expect(last.record).toBe(true)
    expect(last.previous).toBeNull()
  })

  it('確認中碰到找不到：維持新讀數，確認期不重來', () => {
    const { outs } = 餵([
      [0, 讀數(0.4, 紅)],
      [1000, 讀數(1, 綠)],
      [2000, null],
      [1000 + COLOR_CONFIRM_MS, 讀數(0.98, 綠)],
    ])
    expect(outs[2].reading?.color).toBe(綠)
    expect(outs[3].record).toBe(true)
  })
})
