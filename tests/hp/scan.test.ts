import { describe, it, expect } from 'vitest'
import { scanHpBar, readRatioIn, classify, FILL, EMPTY, BORDER, NONE } from '#src/hp/scan'

// ---- 合成一張畫面：背景 + 一條血條（外框、有血、空槽）----
interface BarSpec {
  width?: number
  height?: number
  x0?: number
  x1?: number
  y0?: number
  y1?: number
  /** 有血的區段，依序畫；[長度, 顏色] */
  fills?: Array<[number, [number, number, number]]>
  empty?: [number, number, number]
  background?: [number, number, number]
  border?: [number, number, number]
  /** 血條右側的背景改成跟空槽同色，用來驗證外框有沒有把右端收住 */
  greyRight?: boolean
  /** 血條左邊（外框外）也放一段同色，模擬畫面縮小後外框旁糊掉的陰影 */
  greyLeft?: boolean
  /** 血條下方再放一條同樣長的深色帶，模擬遊戲 UI 的橫帶 */
  bandBelow?: boolean
  /** 下緣外框被別的 UI 蓋掉，空槽會跟下方那條深色帶連成一片 */
  coverBottom?: boolean
  /** 不畫外框：模擬畫面上其他長條色塊（UI 橫幅、地圖背景） */
  noBorder?: boolean
}

function paint(spec: BarSpec = {}) {
  const width = spec.width ?? 200
  const height = spec.height ?? 40
  const x0 = spec.x0 ?? 20
  const x1 = spec.x1 ?? 180
  const y0 = spec.y0 ?? 10
  const y1 = spec.y1 ?? 24
  const bg = spec.background ?? [20, 20, 30]
  const border = spec.border ?? [255, 255, 255] // 遊戲的外框底線是純白
  const empty = spec.empty ?? [70, 70, 70]
  const fills = spec.fills ?? [[80, [220, 30, 10]]]
  const data = new Uint8ClampedArray(width * height * 4)
  const set = (x: number, y: number, c: number[]) => {
    const i = (y * width + x) * 4
    data[i] = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
    data[i + 3] = 255
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inRow = y >= y0 && y <= y1
      const rightOfBar = spec.greyRight && x > x1 && inRow
      const leftOfBar = spec.greyLeft && x < x0 - 1 && x >= x0 - 4 && inRow
      set(x, y, rightOfBar || leftOfBar ? empty : bg)
    }
  }
  // 外框：上下左右各一圈
  if (!spec.noBorder) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      set(x, y0 - 1, border)
      set(x, y1 + 1, border)
    }
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      set(x0 - 1, y, border)
      set(x1 + 1, y, border)
    }
  }
  // 內部：先鋪空槽，再從左邊依序畫有血的區段
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, empty)
  if (spec.bandBelow) {
    for (let y = y1 + 3; y <= y1 + 14 && y < height; y++) {
      for (let x = x0 - 6; x <= x1 + 6; x++) set(x, y, empty)
    }
  }
  if (spec.coverBottom) {
    for (let y = y1; y <= Math.min(height - 1, y1 + 30); y++) {
      for (let x = x0 - 6; x <= x1 + 6; x++) set(x, y, empty)
    }
  }
  let cursor = x0
  for (const [len, color] of fills) {
    for (let y = y0; y <= y1; y++) {
      for (let x = cursor; x < Math.min(cursor + len, x1 + 1); x++) set(x, y, color)
    }
    cursor += len
  }
  return { data, width, height, x0, x1, y0, y1 }
}

describe('像素分類', () => {
  it('外框是亮灰白', () => {
    expect(classify(255, 255, 255)).toBe(BORDER)
    expect(classify(196, 196, 196)).toBe(BORDER)
  })

  it('有血看飽和度不看色相——血條顏色本來就會變', () => {
    expect(classify(220, 33, 0)).toBe(FILL) // 紅
    expect(classify(186, 237, 7)).toBe(FILL) // 綠
    expect(classify(4, 120, 207)).toBe(FILL) // 藍
    expect(classify(0, 202, 185)).toBe(FILL) // 青
  })

  it('空槽是低飽和的中灰', () => {
    expect(classify(69, 68, 69)).toBe(EMPTY)
    expect(classify(83, 82, 85)).toBe(EMPTY)
  })

  it('太暗的背景不算血條', () => {
    expect(classify(20, 20, 30)).toBe(NONE)
    expect(classify(0, 0, 0)).toBe(NONE)
  })
})

describe('自動判讀血條', () => {
  it('找到血條並算出比例', () => {
    const { data, width, height, x0, x1 } = paint({ fills: [[80, [220, 30, 10]]] })
    const res = scanHpBar(data, width, height)!
    expect(res).not.toBeNull()
    expect(res.rect.x0).toBe(x0)
    expect(res.rect.x1).toBe(x1)
    expect(res.ratio).toBeCloseTo(80 / (x1 - x0 + 1), 2)
  })

  it('滿血（整條都是血、沒有空槽）算 100%', () => {
    const { data, width, height } = paint({ fills: [[161, [220, 30, 10]]] })
    expect(scanHpBar(data, width, height)!.ratio).toBe(1)
  })

  it('多條血：右邊露出的下一條底色不算血，只算最左邊那段', () => {
    const { data, width, height, x0, x1 } = paint({
      fills: [[80, [4, 120, 207]], [81, [0, 202, 185]]], // 藍＝剩下的血，青＝下一條的底
    })
    const res = scanHpBar(data, width, height)!
    expect(res.ratio).toBeCloseTo(80 / (x1 - x0 + 1), 2)
    expect(res.color).toBe('4,120,207')
    expect(res.nextColor).toBe('0,202,185')
  })

  it('最後一條血：右邊是灰色空槽，沒有下一條顏色', () => {
    const { data, width, height, x0, x1 } = paint({ fills: [[60, [220, 30, 10]]] })
    const res = scanHpBar(data, width, height)!
    expect(res.ratio).toBeCloseTo(60 / (x1 - x0 + 1), 2)
    expect(res.color).toBe('220,30,10')
    expect(res.nextColor).toBeNull()
  })

  it('空槽右邊接著同色背景時，外框把右端收住', () => {
    const { data, width, height, x1 } = paint({ greyRight: true })
    expect(scanHpBar(data, width, height)!.rect.x1).toBe(x1)
  })

  it('左外框外糊了一圈陰影時，起點要落在血條內容上', () => {
    // 畫面縮小後外框旁常糊出一片跟空槽同色的陰影，
    // 從那裡起算會在左外框就撞牆，整條血條只框到兩三個像素
    const { data, width, height, x0, x1 } = paint({ greyLeft: true, fills: [[80, [220, 30, 10]]] })
    const res = scanHpBar(data, width, height)!
    expect(res.rect.x0).toBe(x0)
    expect(res.rect.x1).toBe(x1)
    expect(res.ratio).toBeCloseTo(80 / (x1 - x0 + 1), 2)
  })

  it('血條下方另有一條深色帶時，不會把它併進血條', () => {
    // 併進來的話上下界就垮了，右端的整欄檢查會在空槽處失敗，
    // 空槽整段被排除、血量算成滿的
    const { data, width, height, x0, x1 } = paint({ bandBelow: true, fills: [[80, [220, 30, 10]]] })
    const res = scanHpBar(data, width, height)!
    expect(res.rect.x1).toBe(x1)
    expect(res.ratio).toBeCloseTo(80 / (x1 - x0 + 1), 2)
  })

  it('血條位置與長度換了也照樣讀得到——視窗大小會變', () => {
    const a = paint({ width: 300, height: 60, x0: 40, x1: 260, y0: 12, y1: 30, fills: [[110, [220, 30, 10]]] })
    const res = scanHpBar(a.data, a.width, a.height)!
    expect(res.rect.x0).toBe(40)
    expect(res.rect.x1).toBe(260)
    expect(res.ratio).toBeCloseTo(110 / 221, 2)
  })

  it('沒有外框的長條色塊不算血條——沒在打王時不該有讀數', () => {
    const { data, width, height } = paint({ noBorder: true, fills: [[80, [220, 30, 10]]] })
    expect(scanHpBar(data, width, height)).toBeNull()
  })

  it('下緣外框整條被蓋住時回 null——沒有外框就不猜', () => {
    // 邊界是外框定的。外框整條看不到時，從內容顏色去猜範圍的舊路徑會把
    // 空槽跟下方的 UI 帶連成一片、把對話框的色帶當成滿血；寧可沒有讀數
    const { data, width, height } = paint({
      height: 200,
      coverBottom: true,
      fills: [[8, [220, 30, 10]]],
    })
    expect(scanHpBar(data, width, height)).toBeNull()
  })

  it('畫面上沒有血條就回 null', () => {
    const width = 200, height = 40
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20; data[i + 1] = 20; data[i + 2] = 30; data[i + 3] = 255
    }
    expect(scanHpBar(data, width, height)).toBeNull()
  })

  it('短短的裝飾長條不會被當成血條', () => {
    const { data, width, height } = paint({ width: 400, x0: 20, x1: 90 }) // 只佔 17% 寬
    expect(scanHpBar(data, width, height)).toBeNull()
  })
})

describe('手動框選的範圍直接算比例', () => {
  it('框選範圍內的有血比例', () => {
    const { data, width, x0, x1, y0, y1 } = paint({ fills: [[40, [220, 30, 10]]] })
    const r = readRatioIn(data, width, { x0, x1, y0, y1 })
    expect(r.ratio).toBeCloseTo(40 / (x1 - x0 + 1), 2)
  })
})
