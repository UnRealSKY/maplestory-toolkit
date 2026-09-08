/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { findBarFrame, scanHpBar } from '#src/hp/scan'

// 真實遊戲畫面（1280x720 的上方 20%，跟 capture.ts 抓的範圍一樣）
function frame(name: string, width = 1280, height = 144) {
  const gz = readFileSync(resolve(process.cwd(), 'tests/hp/fixtures', `${name}.rgba.gz`))
  return { data: new Uint8ClampedArray(gunzipSync(gz)), width, height }
}
const hp = (data: Uint8ClampedArray, w: number, h: number) => {
  const r = scanHpBar(data, w, h, { topFrac: 1 })
  return r ? Math.round(r.ratio * 1000) / 10 : null
}

describe('找外框', () => {
  it('外框的左右邊由垂直柱定出來，不會滑進旁邊的頭像框', () => {
    const f = frame('hp-20')
    const fr = findBarFrame(f.data, f.width, f.height)
    expect(fr).not.toBeNull()
    // 頭像框的邊在 x268 附近、血條外框的左邊在 x274~277。只看水平方向的話
    // 兩者會連成一條（中間只隔幾格），左緣就會滑到 x159 那麼遠
    expect(fr!.x0).toBeGreaterThan(270)
    expect(fr!.x0).toBeLessThan(285)
    expect(fr!.x1).toBeGreaterThanOrEqual(1040)
  })

  it('血條佔螢幕寬六成，背景橫帶不可能有這個寬度', () => {
    const f = frame('hp-20')
    const fr = findBarFrame(f.data, f.width, f.height)!
    expect((fr.x1 - fr.x0) / f.width).toBeGreaterThan(0.45)
  })

  it('已損失區的亮緣沒有垂直柱，不會被當成外框', () => {
    // hp-20 的 y11 有一段 619px 的亮緣（x433~1051），比外框短但仍夠長
    const f = frame('hp-20')
    const fr = findBarFrame(f.data, f.width, f.height)!
    expect(fr.y1).toBeGreaterThan(20) // 外框下邊在 y27，不是亮緣的 y11
  })
})

describe('判讀不受已損失區的顏色影響', () => {
  // 塗的是血條內容 y9~25。y26 是外框自己的內襯灰邊、y27 是外框白線，
  // 那兩列不屬於已損失區——連它們一起塗等於把外框塗掉，那是另一回事
  it('已損失區整片變白，血量照樣算對', () => {
    const f = frame('hp-20')
    const 塗白 = new Uint8ClampedArray(f.data)
    for (let y = 9; y <= 25; y++) {
      for (let x = 600; x <= 1049; x++) {
        const i = (y * f.width + x) * 4
        塗白[i] = 250; 塗白[i + 1] = 250; 塗白[i + 2] = 252
      }
    }
    expect(hp(塗白, f.width, f.height)).toBeCloseTo(19.8, 0)
  })

  it('已損失區變成別的顏色，血量照樣算對', () => {
    const f = frame('hp-20')
    const 變色 = new Uint8ClampedArray(f.data)
    for (let y = 9; y <= 25; y++) {
      for (let x = 600; x <= 1049; x++) {
        const i = (y * f.width + x) * 4
        變色[i] = 90; 變色[i + 1] = 30; 變色[i + 2] = 120  // 紫色錯誤色
      }
    }
    expect(hp(變色, f.width, f.height)).toBeCloseTo(19.8, 0)
  })
})

describe('整條同色：滿血與空血分得出來', () => {
  // 兩種情況都沒有分界點，只能靠顏色本身分——彩色是滿血、灰色是空血。
  // 分不出來的話王被打死那一刻會讀成 100%
  const 塗滿 = (rgb: [number, number, number]) => {
    const f = frame('hp-20')
    const d = new Uint8ClampedArray(f.data)
    for (let y = 9; y <= 25; y++) {
      for (let x = 282; x <= 1048; x++) {
        const i = (y * f.width + x) * 4
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]
      }
    }
    return hp(d, f.width, f.height)
  }

  it('整條都是血色 → 滿血', () => {
    expect(塗滿([220, 33, 0])).toBeGreaterThan(99)
  })

  it('整條都是空槽灰 → 0%', () => {
    expect(塗滿([69, 68, 69])).toBeLessThan(1)
  })
})

describe('極低血量', () => {
  // 舊版要求一群顏色佔寬度 1.2% 以上才算「剩餘」，真實血量 1.6% 時會讀成 0%。
  // 最佳分割點沒有這個門檻——左邊只有幾格血色照樣是最佳解
  for (const 目標 of [0.5, 1.6, 3]) {
    it(`剩 ${目標}% 也讀得出來`, () => {
      const f = frame('hp-20')
      const d = new Uint8ClampedArray(f.data)
      const 邊 = 281 + Math.round(769 * 目標 / 100)
      for (let y = 9; y <= 25; y++) {
        for (let x = 邊; x <= 1048; x++) {
          const i = (y * f.width + x) * 4
          d[i] = 69; d[i + 1] = 68; d[i + 2] = 69 // 塗成空槽灰
        }
      }
      expect(hp(d, f.width, f.height)).toBeCloseTo(目標, 0)
    })
  }
})

describe('真實畫面的血量（八張）', () => {
  const 答案: Array<[string, number, number, number]> = [
    ['hp-20', 19.8, 1280, 144],
    ['hp-26-multi', 26.4, 1280, 144],
    ['hp-85', 84.5, 1280, 144],
    ['hp-18', 17.8, 1280, 144],
    ['hp-80-multi-2k-jpeg', 80.0, 2560, 288],
  ]
  for (const [name, 正確, w, h] of 答案) {
    it(`${name} → ${正確}%`, () => {
      const f = frame(name, w, h)
      expect(hp(f.data, f.width, f.height)).toBeCloseTo(正確, 0)
    })
  }
})
