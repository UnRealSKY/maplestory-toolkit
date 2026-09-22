// 王的機制節奏資料（純資料＋純函式，不碰 localStorage）
//
// 每隻王指定套用哪一份機制模板（mechanic），模板決定規則、王只填秒數。
// 反盾模板的王各自填反盾秒數；循環模板的王填一串「多久觸發一次」的機制。
// 魔消是玩家自己放的技能，秒數與打哪隻王無關，因此不進王的資料，由呼叫端當全域值傳入。

import type { ReflectParams } from './damageReflect'
import { DEFAULT_MECHANIC } from './mechanics'
import type { Finisher } from './cycle'

// 反盾模板的王：一組反盾節奏
export interface ReflectBoss {
  id: string
  name: string
  mechanic: 'damage-reflect'
  reflectDuration: number // 反盾持續（秒）
  interval: number       // 反盾間隔（秒，實戰是「最少」這麼久）
  intervalFloat: number  // 間隔浮動（秒）：實際重施落在 interval ~ interval+float
}

// 循環模板的王：多個機制各自固定間隔，只在意多久觸發一次（不管持續多久）
export interface CycleBoss {
  id: string
  name: string
  mechanic: 'cycle'
  cycles: Array<{ id: string; name: string; interval: number }>
  /** 有回血機制的王才填：哪幾個機制會在魔消段斷輸出、要看幾秒 */
  finisher?: Finisher
}

// 血量門檻模板的王：關鍵不是時間而是血量，掉到門檻就會出招
export interface HpBoss {
  id: string
  name: string
  mechanic: 'hp'
  /** 會出招的血量百分比，由高到低 */
  thresholds: number[]
  /** 過了最後一個門檻之後，機制改成固定幾秒一輪 */
  finalCycle?: number
}

// 只看血條與輸出，沒有機制要算
export interface DpsBoss {
  id: string
  name: string
  mechanic: 'dps'
}

export type Boss = ReflectBoss | CycleBoss | HpBoss | DpsBoss

export const BOSSES: Boss[] = [
  { id: 'pink-bean', name: '皮卡啾／粉豆', mechanic: 'damage-reflect', reflectDuration: 25, interval: 20, intervalFloat: 3 },
  { id: 'dunas', name: '杜納斯', mechanic: 'damage-reflect', reflectDuration: 20, interval: 25, intervalFloat: 0 },
  {
    id: 'cygnus',
    name: '女皇',
    mechanic: 'cycle',
    cycles: [
      { id: 'damage-reflect', name: '反盾', interval: 80 },
      { id: 'pig', name: '變豬', interval: 60 },
      { id: 'jail', name: '小黑屋', interval: 90 },
      { id: 'seal', name: '鎖潛能', interval: 90 },
      { id: 'zombie', name: '活屍', interval: 60 },
    ],
    // 低於 11% 回血到 50%；魔消 20 秒擋回血，這期間變豬、黑屋、鎖潛能會斷輸出；
    // 反盾放了無效、活屍不影響輸出，所以不列。從亮「可以」到魔消生效留 5 秒反應
    finisher: { hpPercent: 11, blockedBy: ['pig', 'jail', 'seal'], seconds: 20, slack: 5 },
  },
  {
    id: 'arkarium',
    name: '阿卡伊農',
    mechanic: 'hp',
    thresholds: [80, 60, 40, 20],
    finalCycle: 70, // 20% 以下改成每 70 秒一次
  },
  { id: 'dps', name: '效率推估', mechanic: 'dps' },
]

// 套用某機制模板的王；頁面就是拿這個清單當王選單
export function bossesOf(mechanicId: 'damage-reflect'): ReflectBoss[]
export function bossesOf(mechanicId: 'cycle'): CycleBoss[]
export function bossesOf(mechanicId: 'hp'): HpBoss[]
export function bossesOf(mechanicId: 'dps'): DpsBoss[]
export function bossesOf(mechanicId: string): Boss[]
export function bossesOf(mechanicId: string): Boss[] {
  return BOSSES.filter((b) => b.mechanic === mechanicId)
}

export function defaultBoss(): Boss {
  return bossesOf(DEFAULT_MECHANIC.id)[0] ?? BOSSES[0]
}

// 反盾模板專用的取王：拿到別種模板的王就退回第一隻反盾王，讓反盾面板永遠有合法參數
export function reflectBossById(id: string): ReflectBoss {
  const b = bossById(id)
  return b.mechanic === 'damage-reflect' ? b : bossesOf('damage-reflect')[0]
}

// 玩家的魔消技能持續（秒）
export const DEFAULT_DISPEL_DURATION = 20

export interface BossOverride {
  reflectDuration: number
  interval: number
  intervalFloat: number
}

// 只存被改過的王；沒改過的王不佔位，日後調整內建預設值才能直接生效
export type BossOverrides = Record<string, BossOverride>

export function bossById(id: string): Boss {
  return BOSSES.find((b) => b.id === id) ?? defaultBoss()
}

export function paramsOf(
  boss: ReflectBoss,
  overrides: BossOverrides,
  dispelDuration: number,
): ReflectParams {
  const ov = overrides[boss.id]
  return {
    reflectDuration: ov?.reflectDuration ?? boss.reflectDuration,
    interval: ov?.interval ?? boss.interval,
    intervalFloat: ov?.intervalFloat ?? boss.intervalFloat,
    dispelDuration,
  }
}

// localStorage 讀入的覆寫表防呆：丟掉未知王與非正數秒數
export function normalizeOverrides(raw: unknown): BossOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: BossOverrides = {}
  for (const boss of bossesOf('damage-reflect')) {
    const ov = (raw as Record<string, unknown>)[boss.id]
    if (!ov || typeof ov !== 'object') continue
    const { reflectDuration, interval, intervalFloat } = ov as Partial<BossOverride>
    if (!(typeof reflectDuration === 'number' && reflectDuration > 0)) continue
    if (!(typeof interval === 'number' && interval > 0)) continue
    // 浮動可以是 0（杜納斯就沒有），只擋負數與非數字；舊資料沒這欄就用王的預設
    const float =
      typeof intervalFloat === 'number' && intervalFloat >= 0 ? intervalFloat : boss.intervalFloat
    out[boss.id] = { reflectDuration, interval, intervalFloat: float }
  }
  return out
}

// 寫入覆寫；值與王的內建預設相同時移除該筆，「還原預設」按鈕便會自然消失
export function setOverride(
  overrides: BossOverrides,
  boss: ReflectBoss,
  patch: BossOverride,
): BossOverrides {
  const next = { ...overrides }
  if (
    patch.reflectDuration === boss.reflectDuration &&
    patch.interval === boss.interval &&
    patch.intervalFloat === boss.intervalFloat
  ) {
    delete next[boss.id]
  } else {
    next[boss.id] = { ...patch }
  }
  return next
}
