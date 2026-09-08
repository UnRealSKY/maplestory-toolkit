// BOSS 血條判讀（純函式，不碰 DOM；輸入是一張畫面的 RGBA 像素）
//
// 先找外框，再讀框內——就像車牌辨識先找車牌才讀車號。外框是幾何結構，不隨
// 血量顏色變。從內容顏色去猜邊界的舊路徑已經拆掉：外框找不到就回 null，
// 不猜。猜出來的讀數比沒有讀數更糟——沒在打王時它會把 UI 上任何一條色帶
// 當成滿血的血條。
//
// 下面的像素分類只剩兩個用途：手動框選的 readRatioIn，以及判斷整條同色的
// 血條是滿血（彩色）還是空血（灰色）。
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

function px(data: Pixels, width: number, x: number, y: number): [number, number, number] {
  const i = (y * width + x) * 4
  return [data[i], data[i + 1], data[i + 2]]
}

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

/**
 * 手動框選的範圍內算血量。
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
/**
 * 判「白」：亮度夠高、色度夠低。不能用跟純白的整體 ΔE——串流的 JPEG 色度
 * 降採樣會把鄰近血條的顏色染到 1px 的白線上（綠條上方變 246,255,203、
 * 紅條上方變 255,240,233，ΔE 到 26），但亮度幾乎不動、色度只到 24；
 * 真正的飽和亮色（純黃）色度是 96
 */
// 亮度門檻 85：外框內襯最亮到 L 80（血色側 227,188,182），要留在門檻下；
// 畫面縮到八成時白線跟內襯糊在一起只剩 L 87，要留在門檻上。1080p 的外框
// 只有 1px，縮到七成以下就糊成兩列各 L 70~80，那時找不到是物理限制
const WHITE_L_MIN = 85
const WHITE_CHROMA_MAX = 30
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
const isWhite = (lab: Lab) => lab[0] >= WHITE_L_MIN && Math.hypot(lab[1], lab[2]) <= WHITE_CHROMA_MAX
const labAt = (data: Pixels, width: number, x: number, y: number) =>
  toLab(...px(data, width, x, y))

/** 這一格是不是外框下邊線：白，而且正上方明顯比它暗 */
function isBottomEdge(data: Pixels, width: number, x: number, y: number): boolean {
  if (y < 1) return false
  const here = labAt(data, width, x, y)
  if (!isWhite(here)) return false
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
      if (isWhite(here)) continue
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
    const kind = only ? classify(only[0], only[1], only[2]) : NONE
    // 既不是血色也不是空槽灰，那就不是血條——背景、對話框都會走到這裡
    if (kind !== FILL && kind !== EMPTY) return null
    // 分界是「已損失區的第一格」，滿血時在 x1 的下一格，fill 才會等於 total
    splitX = kind === FILL ? x1 + 1 : x0
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

/** 自動判讀一整張畫面；找不到外框就回 null——沒有外框就不猜 */
export function scanHpBar(data: Pixels, width: number, height: number): HpReading | null {
  const frame = findBarFrame(data, width, height)
  if (!frame) return null
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
