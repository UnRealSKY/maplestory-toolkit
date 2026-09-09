// 機制模板：一份模板＝一套節奏規則（狀態機＋參數欄位），王只提供各自的秒數。
// 目前只有「反盾」一種，engine.ts 的狀態機就是它；日後新增機制時，
// 這裡多一筆，王指到新的 mechanic，兩邊各自的參數就不會互相打架。

export interface Mechanic {
  id: string
  name: string
  /**
   * 子母畫面「不用縮放剛好塞滿」的尺寸。面板大小是模板決定的，不是王——
   * 皮卡啾與杜納斯同為反盾模板，量出來一模一樣。新增王時自動就有正確尺寸。
   *
   * 量法：在 PiP 裡切到該模板「內容最寬」的狀態（反盾切到間隔＋已魔消＋冷卻＋
   * 回饋、循環把五格都觸發讓秒數變兩位數、血條餵 88.8% 與 DPS），再二分找出
   * 「任何元素都不溢出容器、按鈕也不換行」的最小寬，加 3~4px 餘裕。
   * 高是各區塊固定高相加（時間列 23＋血條 92＋面板＋反盾的操作列 48）——面板高
   * 已由 min-height 釘在該模板最高的狀態，不隨計時狀態變動。
   */
  pip: { width: number; height: number }
}

export const MECHANICS: Mechanic[] = [
  // 反盾持續／間隔的階段循環（damageReflect.ts）。五顆操作按鈕排一行、每顆左右
  // 各留 13px 餘裕要 461
  { id: 'damage-reflect', name: '反盾', pip: { width: 467, height: 384 } },
  // 多個各自固定間隔的機制，只算多久觸發一次（cycle.ts）。五格並排、格子裡要塞
  // [−][88s][＋]，上面那排最右的「重置」按鈕在計時中才會啟用，一起算進去要 393
  { id: 'cycle', name: '循環', pip: { width: 399, height: 269 } },
  // 看的不是時間而是血量，掉到門檻就出招（hp/thresholds.ts）
  { id: 'hp', name: '血量', pip: { width: 347, height: 323 } },
  // 沒有機制要算，只用血條看輸出
  { id: 'dps', name: 'DPS', pip: { width: 347, height: 132 } },
]

export const DEFAULT_MECHANIC = MECHANICS[0]

// 找不到就退回預設模板——存在 localStorage 的舊值或手改的值不該讓頁面壞掉
export function mechanicById(id: string): Mechanic {
  return MECHANICS.find((m) => m.id === id) ?? DEFAULT_MECHANIC
}
