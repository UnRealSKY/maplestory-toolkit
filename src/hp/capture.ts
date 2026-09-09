// 畫面擷取與血量判讀的共用狀態。
//
// 血量卡會同時出現在主視窗與抬頭顯示（兩份），但畫面只能分享一次、
// 也只該掃描一次，所以串流、讀數、歷史都放在這裡，元件只負責畫出來。
// 「從畫面同步」讀遊戲計時時也是拿這同一份畫面。

import { computed, ref, shallowRef } from 'vue'
import { scanHpBar, readRatioIn, type Rect, type HpReading } from './scan'
import { pushPoint, recentDps, pushDps, peakDps, etaSeconds, sameBar, type HpPoint, type DpsSample } from './history'
import { setHpNow, clearHpNow } from './current'
import { createDebounce, settle, type PreviousBar } from './debounce'

// 掃描頻率。血條變化不需要每幀讀，一秒一次就夠，
// 而且瀏覽器切到背景時 setInterval 本來就會被壓到一秒一次。
const SCAN_MS = 1000
// 只掃畫面上方——血條固定在最上方，掃整張是白費力氣
const TOP_FRAC = 0.2

const video = document.createElement('video')
video.muted = true
video.playsInline = true

const stream = shallowRef<MediaStream | null>(null)
export const capturing = computed(() => stream.value != null)
export const error = ref('')

/** 即時讀數：判讀結果加上裁下來的頭像（dataURL） */
export type LiveReading = HpReading & { portraitUrl: string | null }

export const ratio = ref<number | null>(null)
export const color = ref<string | null>(null)
export const nextColor = ref<string | null>(null)
export const portraitUrl = ref<string | null>(null)
/** 換色後凍住的上一條血，帶著它的頭像；到期就 null */
export const previousBar = ref<PreviousBar<LiveReading> | null>(null)
let debounce = createDebounce<LiveReading>()
export const points = ref<HpPoint[]>([])
export const dpsSamples = ref<DpsSample[]>([])
/** 手動框選（存畫面比例，視窗大小變了也還能用） */
export const manualRect = ref<Rect | null>(null)

let timer: ReturnType<typeof setInterval> | undefined

export interface Frame {
  data: Uint8ClampedArray
  width: number
  height: number
  /** 需要把畫面做成圖片時用（手動框選的快照） */
  toDataURL: () => string
  /** 裁一塊下來做成圖片（頭像） */
  crop: (rect: Rect) => string
}

/**
 * 抓一張畫面。topFrac 是只取上面多少比例——血條固定在最上方；
 * 計時器則可以被拖到任何地方，那時就要整張。
 */
export function grabFrame(topFrac = 1): Frame | null {
  const w = video.videoWidth
  const h = Math.round(video.videoHeight * topFrac)
  if (!w || !h) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h, 0, 0, w, h)
  return {
    data: ctx.getImageData(0, 0, w, h).data,
    width: w,
    height: h,
    toDataURL: () => canvas.toDataURL('image/png'),
    crop: (rect) => {
      const c = document.createElement('canvas')
      c.width = rect.x1 - rect.x0 + 1
      c.height = rect.y1 - rect.y0 + 1
      c.getContext('2d')?.drawImage(canvas, rect.x0, rect.y0, c.width, c.height, 0, 0, c.width, c.height)
      return c.toDataURL('image/png')
    },
  }
}

export function isCapturing(): boolean {
  return stream.value != null && video.videoWidth > 0
}

function toPixels(r: Rect, w: number, h: number): Rect {
  return {
    x0: Math.round(r.x0 * w),
    x1: Math.round(r.x1 * w),
    y0: Math.round(r.y0 * h),
    y1: Math.round(r.y1 * h),
  }
}

export function scan(): void {
  const frame = grabFrame(TOP_FRAC)
  if (!frame) return
  const rect = manualRect.value ? toPixels(manualRect.value, frame.width, frame.height) : null
  const raw = rect
    ? { ...readRatioIn(frame.data, frame.width, rect), rect }
    : scanHpBar(frame.data, frame.width, frame.height)
  const live: LiveReading | null =
    raw && raw.total > 0 ? { ...raw, portraitUrl: raw.portrait ? frame.crop(raw.portrait) : null } : null
  // 單幀讀不到或換色，先過去抖動再決定畫面要顯示什麼、歷史要不要記
  const at = Date.now()
  const out = settle(debounce, live, at)
  debounce = out.state
  previousBar.value = out.previous
  const res = out.reading
  if (!res) {
    ratio.value = null
    color.value = null
    nextColor.value = null
    portraitUrl.value = null
    clearHpNow()
    return
  }
  ratio.value = res.ratio
  color.value = res.color
  nextColor.value = res.nextColor
  portraitUrl.value = res.portraitUrl
  if (out.record) {
    points.value = pushPoint(points.value, at, res.ratio, res.color)
    const speed = recentDps(points.value)
    // 樣本帶著血條顏色，峰值才不會混到別的階段
    if (speed != null) dpsSamples.value = pushDps(dpsSamples.value, at, speed, res.color)
  }
  // 血量門檻的機制面板讀的是這份；找不到時撐著的那幾秒也照樣給它上一次的值
  setHpNow(res.ratio * 100, dps.value, at)
}

export async function startCapture(): Promise<void> {
  error.value = ''
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    stream.value = s
    video.srcObject = s
    await video.play()
    s.getVideoTracks()[0].addEventListener('ended', stopCapture)
    timer = setInterval(scan, SCAN_MS)
    scan()
  } catch (e) {
    // 使用者自己按取消不算錯誤，不用跳訊息
    error.value = e instanceof Error && e.name === 'NotAllowedError' ? '' : '無法擷取畫面'
  }
}

export function stopCapture(): void {
  clearHpNow()
  clearInterval(timer)
  timer = undefined
  stream.value?.getTracks().forEach((t) => t.stop())
  stream.value = null
  video.srcObject = null
  ratio.value = null
  color.value = null
  nextColor.value = null
  portraitUrl.value = null
  previousBar.value = null
  debounce = createDebounce<LiveReading>()
}

export function clearHistory(): void {
  points.value = []
  dpsSamples.value = []
}

export function useManualRect(rect: Rect | null): void {
  manualRect.value = rect
  scan()
}

// ---- 顯示用的推算 ----
const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10)
export const percent = computed(() => (ratio.value == null ? null : Math.round(ratio.value * 1000) / 10))
// 換色確認中，歷史還停在上一條血；那條的速度不是現在這條的，不顯示
export const dps = computed(() => {
  const last = points.value[points.value.length - 1]
  if (!last || !sameBar(last.color, color.value)) return null
  return round1(recentDps(points.value))
})
export const peak60 = computed(() => round1(peakDps(dpsSamples.value, 60_000, color.value)))
export const peakAll = computed(() => round1(peakDps(dpsSamples.value, undefined, color.value)))
export const etaSec = computed(() => etaSeconds(percent.value, dps.value))
