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
export function readRatioIn(data: Pixels, width: number, rect: Rect): Omit<HpReading, 'rect'> {
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
      ended = true // 走到灰色空槽，血就是到這裡為止
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

/** 自動判讀一整張畫面；找不到血條回 null */
export function scanHpBar(
  data: Pixels,
  width: number,
  height: number,
  opts: ScanOptions = {},
): HpReading | null {
  // 候選帶依「像血條的程度」排好了，但排第一的不一定是——彩度高的背景會贏過
  // 血量低的血條。逐一走完後面三關，第一個全部過關的才是。
  for (const band of detectBands(data, width, height, { topFrac: 0.2, ...opts })) {
    const reading = readBand(data, width, height, band)
    if (reading) return reading
  }
  return null
}
