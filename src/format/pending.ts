import type { LootRecord } from '../types'
import { memberDists, distSummary, summaryMath, distLine, splitDropShares, dropsSuffix, dropsList, type DropShare } from './dist'
import type { DistOptions } from '../calc/distribution'

export interface PendingRecordDetail {
  recordId: string
  hasCart: boolean // 尚有待售項目，金額可能變動
  amount: number // 還沒領的錢；錢領了就是 0
  moneyPending: boolean // 錢還沒領
  dropsPending: boolean // 這場有可分實物而且還沒領
  lines: string[] // 依序：標題行、金額行（總額 / 人數 = 每人 ｜ 均分實物）、有調整項時多一行本人算式。
                  // 錢領了就只剩實物那行；實物領了金額行就沒有字尾
}

export interface PendingBlock {
  handle: string
  display: string
  records: PendingRecordDetail[]
  totalLine: string // 「總計: 總和 ｜ 實物同名相加」；沒有實物就只有金額
  total: number
}

// 日期舊→新（空日期最後），同日期依團名
function byDateAsc(a: LootRecord, b: LootRecord): number {
  if (a.date !== b.date) {
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date < b.date ? -1 : 1
  }
  return a.boss.localeCompare(b.boss)
}

// 未領總覽：每位有未結清款項的團員一個區塊，逐行可直接複製進遊戲
export function pendingBlocks(
  records: LootRecord[],
  // 每筆紀錄可能屬於不同 DC 群組，名字要在該群組的名冊裡查
  display: (handle: string, groupId?: string) => string,
  // 辛苦費開關是群組層級的，逐筆紀錄查
  optionsFor?: (groupId?: string) => DistOptions,
): PendingBlock[] {
  const blocks = new Map<string, PendingBlock>()
  // 每個人跨場次的實物加總，同名相加、依第一次出現的順序
  const dropTotals = new Map<string, Map<string, number>>()
  for (const r of [...records].sort(byDateAsc)) {
    if (r.shelved) continue // 擱置中：暫不列入統計
    const hasCart = r.lootItems.some((it) => it.status === 'cart')
    const opts = optionsFor?.(r.groupId)
    const shares = splitDropShares(r)
    const { base } = distSummary(r, opts)
    for (const d of memberDists(r, opts)) {
      const m = d.member
      const moneyPending = m.settle !== 'settled'
      // 沒有可分實物的場次只有錢一件事，dropsSettle 不管填什麼都不算
      const dropsPending = shares.length > 0 && m.dropsSettle !== 'settled'
      if (!moneyPending && !dropsPending) continue
      const handle = m.handle
      const lines: string[] = [[r.date, r.boss].filter(Boolean).join(' ')]
      if (moneyPending) {
        // 金額行：總額 / 人數 = 每人，實物還沒領就接在後面
        lines.push(`${summaryMath(r, opts)}${dropsPending ? dropsSuffix(shares) : ''}`)
        // 有內購、代售或辛苦費時這個人實拿的跟每人均分額不同，另起一行寫他的算式
        if (d.expr !== String(base)) lines.push(`${display(handle, r.groupId)}: ${distLine(d)}`)
      } else {
        // 錢領了，只剩實物
        lines.push(dropsList(shares))
      }
      let block = blocks.get(handle)
      if (!block) {
        block = { handle, display: display(handle, r.groupId), records: [], totalLine: '', total: 0 }
        blocks.set(handle, block)
        dropTotals.set(handle, new Map())
      }
      block.records.push({ recordId: r.id, hasCart, amount: moneyPending ? d.amount : 0, moneyPending, dropsPending, lines })
      if (dropsPending) {
        const totals = dropTotals.get(handle)!
        for (const s of shares) totals.set(s.name, (totals.get(s.name) ?? 0) + s.each)
      }
    }
  }
  for (const b of blocks.values()) {
    b.total = b.records.reduce((s, x) => s + x.amount, 0)
    const summed: DropShare[] = [...dropTotals.get(b.handle)!].map(([name, each]) => ({ name, each }))
    // 錢全領完只剩實物時，「總計: 0 ｜ …」會誤導，直接列實物
    const anyMoney = b.records.some((x) => x.moneyPending)
    b.totalLine = anyMoney ? `總計: ${b.total}${dropsSuffix(summed)}` : `總計: ${dropsList(summed)}`
  }
  return [...blocks.values()]
}
