// BOSS 血條判讀（純函式，不碰 DOM；輸入是一張畫面的 RGBA 像素）
//
// 判讀依據是血條本身的三種像素：
//   BORDER 外框——固定的亮灰白，血條左右兩端就靠它收邊
//   FILL   有血——高飽和的彩色。顏色不固定（會隨王／階段變），所以只看飽和度不看色相；
//          多條血的王會同時出現好幾種顏色，一律都算有血
//   EMPTY  空槽——低飽和的中灰
// 位置不寫死：視窗大小一變，血條的位置與長度都會跟著變，所以每次都重新找。

export const NONE = 0
export const FILL = 1
export const EMPTY = 2
export const BORDER = 3
export type PixelKind = typeof NONE | typeof FILL | typeof EMPTY | typeof BORDER

const BORDER_SAT = 0.15, BORDER_V = 170
const FILL_SAT = 0.35, FILL_V = 60
const EMPTY_SAT = 0.18, EMPTY_V_MIN = 35, EMPTY_V_MAX = 140

export function classify(r: number, g: number, b: number): PixelKind {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  if (mx === 0) return NONE
  const sat = (mx - mn) / mx
  if (sat <= BORDER_SAT && mx >= BORDER_V) return BORDER
  if (sat >= FILL_SAT && mx >= FILL_V) return FILL
  if (sat <= EMPTY_SAT && mx >= EMPTY_V_MIN && mx <= EMPTY_V_MAX) return EMPTY
  return NONE
}

const isInner = (k: PixelKind) => k === FILL || k === EMPTY

export type Pixels = Uint8ClampedArray | Uint8Array

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface HpReading {
  rect: Rect
  fill: number
  total: number
  ratio: number
  /** 目前這條血的顏色，"r,g,b" */
  color: string | null
  /** 右邊露出來的下一條血顏色；只剩最後一條時是 null（那時右邊是灰色空槽） */
  nextColor: string | null
}

export interface ScanOptions {
  /** 只掃畫面上方這個比例——血條固定在最上方 */
  topFrac?: number
  /** 血條至少要有畫面寬度的多少 */
  minWidthFrac?: number
  /** 至少要連續幾列長得一樣才算血條，不然畫面上的長條裝飾也會中 */
  minRows?: number
}

function px(data: Pixels, width: number, x: number, y: number): [number, number, number] {
  const i = (y * width + x) * 4
  return [data[i], data[i + 1], data[i + 2]]
}

const diff = (a: number[], b: number[]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

// 色相（0~360）。同一條血從左到右有明暗漸層，但色相幾乎不動；
// 換成另一條血則是換一個色系——所以「是不是同一條血」要看色相，不能比 RGB 距離。
export function hueOf(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  if (d === 0) return 0
  let h: number
  if (mx === r) h = ((g - b) / d) % 6
  else if (mx === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

export function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// 一列裡最長的血條內部連續段。只容忍 1px 雜訊——這一步要的是穩，不是全。
function rowRun(data: Pixels, width: number, y: number) {
  let best = { len: 0, x0: 0, x1: 0, fills: 0 }
  let run = 0
  let gap = 0
  let start = 0
  let fills = 0
  for (let x = 0; x < width; x++) {
    const kind = classify(...px(data, width, x, y))
    if (kind === FILL) fills++
    if (isInner(kind)) {
      if (run === 0) start = x
      run += gap + 1
      gap = 0
      if (run > best.len) best = { len: run, x0: start, x1: x, fills: 0 }
    } else if (++gap > 1) {
      run = 0
      gap = 0
    }
  }
  return { ...best, fills }
}

export interface Band {
  x0: number
  y0: number
  y1: number
  /** 有血色最多的那一列；全空的血條退回幾何中線 */
  bestY: number
}

/**
 * 第一步：找出候選的橫帶——血條的左端與上下界。
 * 分組只看左端——左端是血條的固定邊，右端會隨血量與 UI 遮擋一直變。
 * 回傳的是「先試誰」的順序，不是「是誰」：哪一條真的是血條要靠後面幾關判斷。
 */
export function detectBands(data: Pixels, width: number, height: number, opts: ScanOptions = {}): Band[] {
  const rows = Math.max(1, Math.round(height * (opts.topFrac ?? 1)))
  const minWidth = (opts.minWidthFrac ?? 0.2) * width
  const minRows = opts.minRows ?? 5
  const bands: Array<{
    x0: number
    x1: number
    ys: number[]
    bestY: number
    bestFills: number
    fillSum: number
  }> = []
  let cur: (typeof bands)[number] | null = null
  for (let y = 0; y < rows; y++) {
    const r = rowRun(data, width, y)
    if (r.len < minWidth) {
      cur = null
      continue
    }
    if (cur && Math.abs(r.x0 - cur.x0) <= 3) {
      cur.ys.push(y)
      cur.x1 = Math.max(cur.x1, r.x1)
      cur.fillSum += r.fills
      if (r.fills > cur.bestFills) {
        cur.bestFills = r.fills
        cur.bestY = y
      }
    } else {
      cur = { x0: r.x0, x1: r.x1, ys: [y], bestY: y, bestFills: r.fills, fillSum: r.fills }
      bands.push(cur)
    }
  }
  const valid = bands.filter((b) => b.ys.length >= minRows)
  // 血色多的先試——血條下方的 UI 深色橫帶可能比血條還長，光比寬度會挑錯；
  // 而那條帶子常跟血條最後一列黏在一起，所以「有沒有血色」也不夠，要比總量。
  // 血量歸零的血條沒有血色，那時就純比寬度。
  // 但這只能決定順序，不能決定答案：血量一低，血條的血色總量會輸給彩度高的
  // 遊戲背景（粉紫色的天空整條都算「有血」），真正的血條得等假的被後面幾關
  // 擋掉之後才輪得到。
  valid.sort((a, b) => b.fillSum - a.fillSum || b.x1 - b.x0 - (a.x1 - a.x0))
  return valid.map((band) => {
    // 這一帶可能連同血條下方的深色 UI 橫帶一起框進來，中線取「有血色最多的那一列」，
    // 才不會整條判讀跑到那條帶子上；全空的血條就退回幾何中線
    const middle = Math.floor((band.ys[0] + band.ys[band.ys.length - 1]) / 2)
    return {
      x0: band.x0,
      y0: band.ys[0],
      y1: band.ys[band.ys.length - 1],
      bestY: band.bestFills > 0 ? band.bestY : middle,
    }
  })
}

/**
 * 從中線往上下擴，把血條的上下界收住。
 * 逐列掃描很容易把血條下方的深色帶也當成同一條（它同樣是低飽和的中灰、同樣很長），
 * 範圍一垮，右端的整欄檢查就會在空槽處失敗，把空槽整段排除、血量算成滿的。
 * 血條上下就是外框，遇到外框或非血條像素就停。
 */
export function verticalBounds(
  data: Pixels,
  width: number,
  height: number,
  x: number,
  mid: number,
  maxReach = Number.POSITIVE_INFINITY,
): { y0: number; y1: number } {
  const base = px(data, width, x, mid)
  const baseKind = classify(base[0], base[1], base[2])
  const baseHue = hueOf(base[0], base[1], base[2])
  // 同一條血上下只有明暗漸層，色相不動；白色外框與下方那條深色帶都不是這個色相。
  // 起點若落在空槽（血量很低時），就改用「同樣是空槽的灰」當條件。
  const sameBar = (y: number) => {
    const p = px(data, width, x, y)
    const k = classify(p[0], p[1], p[2])
    if (k !== baseKind) return false
    if (k !== FILL) return true
    return hueDiff(hueOf(p[0], p[1], p[2]), baseHue) <= 30
  }
  // 擴張距離要有上限：血量很低時基準欄落在空槽上，而空槽跟血條下方的
  // 深色 UI 帶是同一種灰，外框一旦被遮住就會連成一片、範圍整個垮掉
  let y0 = mid
  let y1 = mid
  while (y0 > 0 && mid - y0 < maxReach && sameBar(y0 - 1)) y0--
  while (y1 < height - 1 && y1 - mid < maxReach && sameBar(y1 + 1)) y1++
  return { y0, y1 }
}

/**
 * 找出血條內容真正的起點。detectBand 給的左端可能落在外框、甚至外框外的陰影上
 * （畫面被縮小時特別明顯），從那裡起算會在左外框就撞牆結束。
 * 往右找第一段「連續且同色」的內部像素，那才是血條的第一格。
 */
export function contentStart(
  data: Pixels,
  width: number,
  y: number,
  x0: number,
  opts: { run?: number; maxSkip?: number; colorTol?: number } = {},
): number {
  const run = opts.run ?? 6
  const maxSkip = opts.maxSkip ?? 80
  const colorTol = opts.colorTol ?? 50
  for (let x = x0; x < Math.min(width - run, x0 + maxSkip); x++) {
    const p = px(data, width, x, y)
    if (!isInner(classify(p[0], p[1], p[2]))) continue
    let ok = true
    for (let k = 1; k < run; k++) {
      const q = px(data, width, x + k, y)
      if (!isInner(classify(q[0], q[1], q[2])) || diff(q, p) > colorTol) {
        ok = false
        break
      }
    }
    if (ok) return x
  }
  return x0
}

/**
 * 第三步：從左端沿著中線往右走到血條盡頭。
 * 同色就繼續；顏色跳掉時，只有「後面接著一段穩定的血條色」才算還在血條裡
 * （跨得過 有血→空槽 的抗鋸齒過渡帶，又不會滑進背景）。撞到外框就結束。
 */
export function extendRight(
  data: Pixels,
  width: number,
  y: number,
  x0: number,
  opts: { columnYs?: number[]; stableRun?: number; colorTol?: number; maxBad?: number } = {},
): number {
  const stable = opts.stableRun ?? 20
  const colorTol = opts.colorTol ?? 50
  const maxBad = opts.maxBad ?? 12
  // 血條是個矩形：每一欄從上到下都該是血條像素。背景就算某一列的顏色像空槽，
  // 整欄也很難跟著像，這條檢查把右端釘在真正的邊界上。
  const ys = opts.columnYs ?? [y]
  const columnOk = (x: number) => {
    let hit = 0
    for (const cy of ys) if (isInner(classify(...px(data, width, x, cy)))) hit++
    return hit / ys.length >= 0.7
  }
  let cur = px(data, width, x0, y)
  let sawEmpty = classify(...cur) === EMPTY
  let last = x0
  let bad = 0
  for (let x = x0 + 1; x < width; x++) {
    const p = px(data, width, x, y)
    if (classify(...p) === BORDER) break
    if (columnOk(x) && isInner(classify(...p)) && diff(p, cur) <= colorTol) {
      last = x
      bad = 0
      continue
    }
    if (bad === 0) {
      // 代表色取中位數——過渡帶的第一個髒像素當代表會誤判成「離開血條」
      const win: Array<[number, number, number]> = []
      let cols = 0
      let hitBorder = false
      for (let k = 0; k < stable && x + k < width; k++) {
        const q = px(data, width, x + k, y)
        const kq = classify(...q)
        if (kq === BORDER) {
          hitBorder = true
          break
        }
        if (!isInner(kq)) continue
        win.push(q)
        if (columnOk(x + k)) cols++
      }
      if (hitBorder) break
      if (win.length >= 6 && cols >= win.length * 0.5) {
        const probe = [0, 1, 2].map((c) => median(win.map((q) => q[c])))
        const agree = win.filter((q) => diff(q, probe) <= colorTol).length
        const kind = classify(probe[0], probe[1], probe[2])
        // 血量只會從右邊往左減：出現空槽之後不可能再有滿血色
        if (agree / win.length >= 0.7 && isInner(kind) && !(kind === FILL && sawEmpty)) {
          cur = probe as [number, number, number]
          if (kind === EMPTY) sawEmpty = true
          bad = 1
          continue
        }
      }
    }
    if (++bad > maxBad) break
  }
  return last
}

/**
 * 第四步：在框好的範圍內算血量。
 *
 * 多條血的王，扣掉的部分會露出「下一條血」的顏色而不是灰色空槽，
 * 所以血量只算「從左端數過來的第一段顏色」——右邊那段亮色是底，不是血。
 * 取中央幾列多數決，避開上下緣的漸層與外框。
 */
export function readRatioIn(
  data: Pixels,
  width: number,
  rect: Rect,
): Omit<HpReading, 'rect'> {
  const mid = Math.floor((rect.y0 + rect.y1) / 2)
  const ys = [mid - 2, mid, mid + 2].filter((y) => y >= rect.y0 && y <= rect.y1)
  const hueTol = 25 // 同一條血的漸層色相頂多晃這麼多
  const switchRun = 6 // 換色要連續這麼多欄才算數，短的是抗鋸齒過渡帶
  let total = 0
  let fill = 0
  let head: number[] | null = null // 目前這條血的顏色
  let tail: number[] | null = null // 右邊露出來的顏色（下一條血）
  let pending = 0 // 連續幾欄跟目前這條血不同色
  let ended = false
  for (let x = rect.x0; x <= rect.x1; x++) {
    let f = 0
    let e = 0
    const cols: number[][] = []
    for (const y of ys) {
      const p = px(data, width, x, y)
      const k = classify(p[0], p[1], p[2])
      if (k === FILL) {
        f++
        cols.push(p)
      } else if (k === EMPTY) e++
    }
    if (f + e === 0) continue
    total++
    if (f <= e) {
      // 還沒數到任何血色就先遇到暗色，那是左端外框內側的漸層，不是「血用完了」。
      // 外框定出來的左緣會比血條內容早幾格，這裡不放行的話整條會被判成 0%
      if (head) ended = true // 走到灰色空槽，血就是到這裡為止
      continue
    }
    if (ended) continue
    const c = [0, 1, 2].map((i) => median(cols.map((p) => p[i])))
    if (!head) {
      head = c
      fill++
      continue
    }
    if (hueDiff(hueOf(c[0], c[1], c[2]), hueOf(head[0], head[1], head[2])) <= hueTol) {
      fill += 1 + pending // 剛才那幾欄只是過渡，補回來
      pending = 0
      continue
    }
    if (++pending >= switchRun) {
      ended = true
      tail = c
    }
  }
  const key = (c: number[] | null) => (c ? `${c[0]},${c[1]},${c[2]}` : null)
  return { fill, total, ratio: total ? fill / total : 0, color: key(head), nextColor: key(tail) }
}

/**
 * 這一塊到底是不是血條——上下要有外框包著。
 * 畫面上長條狀的色塊很多（UI 橫幅、地圖、背景），光看「夠長又夠齊」會把它們全當成血條，
 * 沒在打王的時候也照樣給出讀數。外框是血條才有的東西，拿它當門檻。
 * 只要求上下其中一邊：另一邊常被別的 UI 蓋住（例如剩餘時間面板壓在血條下緣）。
 */
export function hasBorder(
  data: Pixels,
  width: number,
  height: number,
  rect: Rect,
  minRatio = 0.5,
): boolean {
  const samples = 20
  // 內部與外框之間隔著漸層與抗鋸齒，往外找幾格。血條越粗這段越寬：2560x1440 下
  // 血條高 30px、外框落在第 4~5 格，串流一壓縮 verticalBounds 偏 1px 就出界找不到。
  // 依高度取兩成，1280x720（高 15）維持 4 格，不動既有的判讀
  const reach = Math.max(4, Math.round((rect.y1 - rect.y0) * 0.2))
  const span = rect.x1 - rect.x0
  if (span <= 0) return false
  const borderAt = (x: number, from: number, step: number) => {
    for (let k = 1; k <= reach; k++) {
      const y = from + step * k
      if (y < 0 || y >= height) return false
      if (classify(...px(data, width, x, y)) === BORDER) return true
    }
    return false
  }
  let top = 0
  let bottom = 0
  for (let i = 0; i < samples; i++) {
    const x = Math.round(rect.x0 + (span * i) / (samples - 1))
    if (borderAt(x, rect.y0, -1)) top++
    if (borderAt(x, rect.y1, 1)) bottom++
  }
  return Math.max(top, bottom) / samples >= minRatio
}

/** 從一條候選帶往下走完剩下三關；哪一關擋下就回 null */
function readBand(data: Pixels, width: number, height: number, band: Band): HpReading | null {
  const guess = band.bestY
  const x0 = contentStart(data, width, guess, band.x0)
  // 量上下界要挑「有血色」的那一欄：血量很低時 x0 附近就只剩幾格血，
  // 隨便往右取一欄會落在空槽上，那條灰跟血條下方的 UI 帶分不出來
  let probeX = Math.min(width - 1, x0 + 20)
  for (let x = x0; x <= Math.min(width - 1, x0 + 200); x++) {
    if (classify(...px(data, width, x, guess)) === FILL) {
      probeX = x
      break
    }
  }
  const bounds = verticalBounds(data, width, height, probeX, guess, Math.max(6, height * 0.08))
  const mid = Math.floor((bounds.y0 + bounds.y1) / 2)
  // 整欄檢查只看中間那幾列。上下界是從血色區量的，紅色漸層填滿整個高度，
  // 但空槽的有效灰只有中間那一截（上下各約三成是過亮或過暗的過渡帶）——
  // 削得不夠，整欄檢查一走進空槽區就在上下緣撞到非血條像素而失敗，
  // 右端停在血色結束的地方，血量被算成滿的
  const inset = Math.floor((bounds.y1 - bounds.y0) * 0.3)
  const columnYs: number[] = []
  for (let y = bounds.y0 + inset; y <= bounds.y1 - inset; y++) columnYs.push(y)
  const x1 = extendRight(data, width, mid, x0, { columnYs: columnYs.length ? columnYs : [mid] })
  if (x1 - x0 < width * 0.1) return null // 只框到一小截，當作沒找到
  const rect: Rect = { x0, x1, y0: bounds.y0, y1: bounds.y1 }
  // 血條再高也就那麼高；整片色塊被框起來的話高度會離譜
  if (rect.y1 - rect.y0 > height * 0.5) return null
  if (!hasBorder(data, width, height, rect)) return null
  return { rect, ...readRatioIn(data, width, rect) }
}

// ---- 先找外框，再讀框內 ----
//
// 血條的外框是幾何結構，不隨血量顏色變；從內容的顏色去猜邊界則會在三個地方出錯：
// 已損失區變白（被當成外框，右端停在半路）、左端的漸層（被當成非內容而跳過）、
// 上緣的立體亮邊（擋住往上的展開）。所以邊界一律由外框決定。
//
// 1080p 的血條沒有左右柱、上邊也不是白的，所以不能找「矩形四邊」。八張實戰截圖
// 裡唯一穩定的特徵是下邊那條白線，它的結構是固定三層：
//   y   純白 255,255,255
//   y-1 中灰內襯 186~229
//   y-2 暗色內襯
// 只驗「白」不夠——場景裡的白色物件會被收進來（實測讓下邊線多長 80px）。
// 白線正上方一定比白線暗：真下邊線的亮度落差最低 11.1，純白場景是 0.0。
const FRAME_MIN_WIDTH_FRAC = 0.45
/** 判「白」的 CIE ΔE 容許值 */
const WHITE_DE = 12
/** 白線與其正上方那列的亮度落差下限 */
const LINING_DROP = 6
/** 連續白段至少這麼長才算數，濾掉零星白點 */
const RUN_MIN = 8
/** 白段加起來至少佔下邊線跨距多少——被 UI 蓋住的實測還有 47% */
const WHITE_RUN_FRAC = 0.25
/** 白線實際存在的區段裡，前幾色要佔多少才算血條 */
const BAR_COLOR_FRAC = 0.8
/** 分界點跟中位數的容許差 */
const SPLIT_TOL = 8
/** 框內至少這麼多比例的列，分界要合中位數 */
const SPLIT_AGREE_FRAC = 0.3
/** 顏色分群的 ΔE 半徑 */
const CLUSTER_DE = 10
/** 分界處抗鋸齒過渡帶最多幾格 */
const BLEND_MAX = 4

type Lab = [number, number, number]

function toLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const R = lin(r), G = lin(g), B = lin(b)
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X), fy = f(Y), fz = f(Z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
const deltaE = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const WHITE_LAB = toLab(255, 255, 255)
const labAt = (data: Pixels, width: number, x: number, y: number) =>
  toLab(...px(data, width, x, y))

/** 這一格是不是外框下邊線：白，而且正上方明顯比它暗 */
function isBottomEdge(data: Pixels, width: number, x: number, y: number): boolean {
  if (y < 1) return false
  const here = labAt(data, width, x, y)
  if (deltaE(here, WHITE_LAB) > WHITE_DE) return false
  return here[0] - labAt(data, width, x, y - 1)[0] >= LINING_DROP
}

interface Span { a: number; b: number }

/** 這幾段區間裡，最大的前 n 個顏色群佔多少 */
function topColorShare(
  data: Pixels,
  width: number,
  y: number,
  spans: Span[],
  n: number,
  step: number,
): number {
  if (y < 0) return 0
  const groups: Array<{ lab: Lab; count: number }> = []
  let total = 0
  for (const s of spans) {
    for (let x = s.a; x <= s.b; x += step) {
      const lab = labAt(data, width, x, y)
      const hit = groups.find((g) => deltaE(g.lab, lab) <= CLUSTER_DE)
      if (hit) hit.count++
      else groups.push({ lab, count: 1 })
      total++
    }
  }
  const sorted = groups.map((g) => g.count).sort((a, b) => b - a)
  let top = 0
  for (let i = 0; i < n; i++) top += sorted[i] ?? 0
  return top / Math.max(1, total)
}

export interface BottomEdge {
  y: number
  x0: number
  x1: number
  /** 白線實際存在的區段——中間被 UI 蓋掉的缺口不在內 */
  spans: Span[]
}

/**
 * 找外框下邊線的候選，由上往下排。被 UI 蓋住時只剩 47% 的白，所以要把斷開的
 * 白段接回同一條線；能不能接看的不是距離，而是「缺口上方是不是還是血條」。
 *
 * 不在這裡挑「最寬的」：畫面縮到一半時，血條下方「Boss通知」橫幅的上緣白線
 * 會跟右邊一個 12px 的白點橋接成 965px，比真底線的 771px 寬。哪條才是要靠
 * 框內的分界一致性決定，交給 findBarFrame。
 */
export function findBottomEdges(data: Pixels, width: number, height: number): BottomEdge[] {
  const minWidth = width * FRAME_MIN_WIDTH_FRAC
  const found: BottomEdge[] = []
  for (let y = 2; y < height - 2; y++) {
    const runs: Span[] = []
    let start = -1
    for (let x = 0; x <= width; x++) {
      const white = x < width && isBottomEdge(data, width, x, y)
      if (white && start < 0) start = x
      else if (!white && start >= 0) {
        if (x - start >= RUN_MIN) runs.push({ a: start, b: x - 1 })
        start = -1
      }
    }
    if (!runs.length) continue
    // 逐段往右併。缺口上方若還是血條（只有兩三種顏色）就當同一條線
    let group = { a: runs[0].a, b: runs[0].b, spans: [runs[0]] }
    let widest: typeof group | null = null
    for (let i = 1; i <= runs.length; i++) {
      const next = runs[i]
      const gapA = group.b + 1
      const gapB = next ? next.a - 1 : -1
      const bridge = next != null && gapB >= gapA &&
        [3, 5, 7].filter(
          (d) => topColorShare(data, width, y - d, [{ a: gapA, b: gapB }], 3, 3) >= 0.85,
        ).length >= 2
      if (bridge && next) {
        group = { a: group.a, b: next.b, spans: [...group.spans, next] }
        continue
      }
      if (!widest || group.b - group.a > widest.b - widest.a) widest = { ...group }
      if (next) group = { a: next.a, b: next.b, spans: [next] }
    }
    if (!widest || widest.b - widest.a + 1 < minWidth) continue
    // 白段本身要夠多。血條被 UI 蓋住時還有 47% 是白；世界地圖對話框的白邊
    // 只在兩端各露幾格（3.6%），中間整片是對話框本體，橋接測試擋不住它
    const whiteTotal = widest.spans.reduce((n, s) => n + (s.b - s.a + 1), 0)
    if (whiteTotal / (widest.b - widest.a + 1) < WHITE_RUN_FRAC) continue
    // 這條線上方必須是血條。只取樣白線實際存在的區段——缺口那幾百格是被 UI
    // 蓋住的，算進去會把三色比從 90% 壓到 47%，真血條反而過不了篩選
    const inner = widest.spans.map((s) => ({ a: s.a + 5, b: s.b - 5 })).filter((s) => s.b > s.a)
    let ok = 0
    for (let k = 2; k <= 6; k++) {
      if (topColorShare(data, width, y - k, inner, 3, 5) >= BAR_COLOR_FRAC) ok++
    }
    if (ok < 4) continue
    found.push({ y, x0: widest.a, x1: widest.b, spans: widest.spans })
  }
  return found
}

export interface RowSplit {
  /** 剩餘與已損失的交界 x */
  x: number
  /** 前兩色佔這一列多少——被 UI 蓋住的列掉到 50~71%，乾淨的血條列 80~100% */
  twoColor: number
  /** 整列同一色時沒有分界點可言 */
  hasSplit: boolean
}

/**
 * 一列的血量分界點。不能用「第一群顏色連續到哪」——一個壓縮雜訊像素跳出分群
 * 半徑就把 run 切斷（實測分界在 x432 卻讀到 x394）。改成找最佳分割點：
 * 左邊盡量都是剩餘色、右邊盡量都是已損失色，不屬於這兩群的雜訊兩邊都不算分。
 */
export function splitRow(
  data: Pixels,
  width: number,
  y: number,
  x0: number,
  x1: number,
): RowSplit {
  const groups: Array<{ lab: Lab; count: number }> = []
  const owner: number[] = []
  for (let x = x0; x <= x1; x++) {
    const lab = labAt(data, width, x, y)
    let hit = groups.findIndex((g) => deltaE(g.lab, lab) <= CLUSTER_DE)
    if (hit < 0) { groups.push({ lab, count: 1 }); hit = groups.length - 1 }
    else groups[hit].count++
    owner.push(hit)
  }
  const ranked = groups.map((g, i) => ({ i, count: g.count })).sort((a, b) => b.count - a.count)
  const twoColor = ((ranked[0]?.count ?? 0) + (ranked[1]?.count ?? 0)) / Math.max(1, owner.length)
  const left = owner[0]
  const right = ranked.find((g) => g.i !== left)?.i ?? -1
  if (right < 0) return { x: x1, twoColor, hasSplit: false }
  let score = 0
  for (const g of owner) if (g === right) score++
  let bestScore = score
  let bestAt = 0
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] === left) score++
    else if (owner[i] === right) score--
    if (score > bestScore) { bestScore = score; bestAt = i + 1 }
  }
  // 分界處有幾格抗鋸齒混色，兩群都不屬於，最佳分割點會停在過渡帶左端。
  // 取過渡帶中點才對得上「血條實際範圍直接算」的答案（差 1~4px）。
  // 上限不能拿掉：一列有第三種顏色時（已損失區變色、只剩中段是原本的灰），
  // 那一整段也兩群都不屬於，沒有上限就會被整段當成過渡帶
  let blend = 0
  while (
    blend < BLEND_MAX &&
    bestAt + blend < owner.length &&
    owner[bestAt + blend] !== left &&
    owner[bestAt + blend] !== right
  ) blend++
  return {
    x: x0 + Math.round(bestAt + blend / 2),
    twoColor,
    hasSplit: bestAt > 0 && bestAt < owner.length,
  }
}

export interface BarFrame extends Rect {
  /** 外框下邊那一列 */
  edgeY: number
  /** 血量分界 x */
  splitX: number
}

/**
 * 找出血條的外框與血量分界。回傳的框已經往內縮掉外框本身。
 *
 * 候選線由上往下試，第一條「框內有分界、而且分界垂直對齊」的就是血條——
 * 一條血條不可能把另一條底線包在裡面，而血條又是畫面最上方的 UI。
 * 整條同色的候選（滿血或空血，沒有分界可比）只在沒有別的候選時才採用，
 * 免得血條自己的上框線被當成一條空血條。
 */
export function findBarFrame(data: Pixels, width: number, height: number): BarFrame | null {
  let uniform: BarFrame | null = null
  for (const edge of findBottomEdges(data, width, height)) {
    const fr = frameFromEdge(data, width, edge)
    if (!fr) continue
    if (fr.agreeing > 0) return fr
    uniform ??= fr
  }
  return uniform
}

/** 以這條下邊線為底算出的框；分界對不齊回 null */
function frameFromEdge(
  data: Pixels,
  width: number,
  edge: BottomEdge,
): (BarFrame & { agreeing: number }) | null {
  const from = edge.x0 + 4
  const to = edge.x1 - 4
  if (to - from < width * FRAME_MIN_WIDTH_FRAC) return null

  // 上緣不能靠「往上走到對不上就停」：實測會停在高光帶或面板邊緣那一列；改成
  // 容忍 N 列又跨不過連續 8 列的遮擋。血量比例是由中位數決定的，上緣只要取
  // 「窗內最上面一列合乎中位數的列」，窗高就把誤收的範圍限住了。
  // 從 edge.y - 2 起算：edge.y - 1 是外框的內襯灰邊，不是血條內容。它會沾染
  // 上下的顏色而留著分界點，整條血被塗成同一色時就只剩它還「有分界」
  const bottom = edge.y - 2
  const window = Math.max(8, Math.round(width * 0.025))
  const fromY = Math.max(1, bottom - window)
  const rows = new Map<number, RowSplit>()
  for (let y = bottom; y >= fromY; y--) rows.set(y, splitRow(data, width, y, from, to))
  const clean = (s: RowSplit) => s.twoColor >= BAR_COLOR_FRAC && s.hasSplit
  const xs = [...rows.values()].filter(clean).map((s) => s.x).sort((a, b) => a - b)
  let splitX = xs.length ? xs[Math.floor(xs.length / 2)] : to
  let top = bottom
  let agreeing = 0
  for (let y = bottom; y >= fromY; y--) {
    const s = rows.get(y)!
    if (!clean(s) || Math.abs(s.x - splitX) > SPLIT_TOL) continue
    top = y
    agreeing++
  }
  // 血量分界是垂直對齊的：真血條每一列沒被遮住的分界都在同一個 x（被遮最多的
  // 那張還有 47% 的列合中位數）。世界地圖對話框的白邊上方是場景，23 列裡只有
  // 2 列碰巧相近。整條同色（xs 空）沒有分界可比，走下面的顏色判斷
  if (xs.length && (agreeing < 3 || agreeing < (bottom - top + 1) * SPLIT_AGREE_FRAC)) return null

  // 左右收邊：從下邊線兩端往內走，直到顏色連續穩定。外框、抗鋸齒、暗襯的 ΔE
  // 會亂跳，血條內容一路穩定。這一步在解「左緣多算幾格導致比例偏低」
  const mid = Math.floor((top + bottom) / 2)
  // 只走這麼多格：外框加抗鋸齒實測 0~4 格。沒有上限的話，已損失區整片變白時
  // 「跳過白色」會一路吃掉整段已損失區，框寬只剩一半、整條血條就被判為不存在
  const SETTLE_MAX = 8
  const settle = (start: number, dir: 1 | -1) => {
    for (let n = 0, x = start; n < SETTLE_MAX && x > 2 && x < width - 3; n++, x += dir) {
      const here = labAt(data, width, x, mid)
      if (deltaE(here, WHITE_LAB) <= WHITE_DE) continue
      const b = labAt(data, width, x + dir, mid)
      const c = labAt(data, width, x + dir * 2, mid)
      if (deltaE(here, b) <= 6 && deltaE(b, c) <= 6) return x
    }
    return start
  }
  const x0 = settle(edge.x0, 1)
  const x1 = settle(edge.x1, -1)
  if (x1 - x0 < width * FRAME_MIN_WIDTH_FRAC) return null
  // 整條同色時分不出是滿血還是空血——兩者都沒有分界點。滿血是彩色、空血是
  // 灰色，靠顏色本身決定；不判的話王被打死那一刻會讀成 100%
  if (!xs.length) {
    const only = dominantColor(data, width, mid, x0 + 2, x1 - 2)
    const full = only != null && classify(only[0], only[1], only[2]) === FILL
    splitX = full ? x1 : x0
  }
  return { x0, x1, y0: top, y1: bottom, edgeY: edge.y, splitX, agreeing }
}

/** [a,b] 這段裡最大的顏色群 */
function dominantColor(
  data: Pixels,
  width: number,
  y: number,
  a: number,
  b: number,
): [number, number, number] | null {
  if (b - a < 2) return null
  const groups: Array<{ lab: Lab; rgb: [number, number, number]; count: number }> = []
  for (let x = a; x <= b; x++) {
    const rgb = px(data, width, x, y)
    const lab = toLab(...rgb)
    const hit = groups.find((g) => deltaE(g.lab, lab) <= CLUSTER_DE)
    if (hit) hit.count++
    else groups.push({ lab, rgb, count: 1 })
  }
  return groups.sort((p, q) => q.count - p.count)[0]?.rgb ?? null
}

/** 自動判讀一整張畫面；找不到血條回 null */
export function scanHpBar(
  data: Pixels,
  width: number,
  height: number,
  opts: ScanOptions = {},
): HpReading | null {
  // 先找外框。它是幾何結構，血量顏色怎麼變都不影響邊界，比從內容爬行可靠得多
  const frame = findBarFrame(data, width, height)
  if (frame) {
    const rect: Rect = { x0: frame.x0, x1: frame.x1, y0: frame.y0, y1: frame.y1 }
    // 分母是框寬。血條的整體長度（剩餘＋已損失）是固定的，而已損失區可能變白
    // 或變成別的顏色——那些欄位認不出是空槽，靠顏色數欄位的話分母會跟著縮水
    const total = rect.x1 - rect.x0 + 1
    const fill = Math.max(0, Math.min(total, frame.splitX - rect.x0))
    const mid = Math.floor((rect.y0 + rect.y1) / 2)
    const head = dominantColor(data, width, mid, rect.x0 + 2, frame.splitX - 2)
    const tail = dominantColor(data, width, mid, frame.splitX + 2, rect.x1 - 2)
    const key = (c: [number, number, number] | null) => (c ? `${c[0]},${c[1]},${c[2]}` : null)
    return {
      rect,
      fill,
      total,
      ratio: total ? fill / total : 0,
      color: key(head),
      // 右邊是灰色空槽時代表這是最後一條血；是彩色才是下一條血露出來
      nextColor: tail && classify(tail[0], tail[1], tail[2]) === FILL ? key(tail) : null,
    }
  }
  // 外框被擋住時退回舊路：候選帶逐一走完後面三關，第一個全部過關的才是。
  // 這條路認得出血條但邊界靠顏色爬，已損失變色時右端會停在半路
  for (const band of detectBands(data, width, height, { topFrac: 0.2, ...opts })) {
    const reading = readBand(data, width, height, band)
    if (reading) return reading
  }
  return null
}
