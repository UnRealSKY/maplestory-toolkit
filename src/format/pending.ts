import type { LootRecord } from '../types'
import { memberDists, summaryLine, summaryExpr, distLine, splitDropSuffix } from './dist'
import type { DistOptions } from '../calc/distribution'

export interface PendingRecordDetail {
  recordId: string
  hasCart: boolean // 尚有待售項目，金額可能變動
  amount: number
  lines: string[] // 依序：標題行、他人內購行*、總共行、公式行
}

export interface PendingBlock {
  handle: string
  display: string
  records: PendingRecordDetail[]
  totalLine: string // 「應領: a + b = 總和」；單場為「應領: 總和」
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
  for (const r of [...records].sort(byDateAsc)) {
    if (r.shelved) continue // 擱置中：暫不列入統計
    const hasCart = r.lootItems.some((it) => it.status === 'cart')
    for (const d of memberDists(r, optionsFor?.(r.groupId))) {
      if (d.member.settle !== 'pending') continue
      const handle = d.member.handle
      const lines: string[] = [[r.date, r.boss].filter(Boolean).join(' ')]
      for (const p of r.purchases) {
        if (p.buyer === handle) continue
        const mode = p.mode === 'split' ? ' (均攤)' : ''
        lines.push(`${display(p.buyer, r.groupId)}: 內購 ${p.name}x${p.qty} = ${p.unitPrice}x${p.qty}${mode}`)
      }
      // 有可分的實物時，物品放總共那行、拿掉「/ 人數 = 每人」——每人金額在下一行本來就有
      const drops = splitDropSuffix(r)
      const opts = optionsFor?.(r.groupId)
      lines.push(drops ? `總共: ${summaryExpr(r, opts)}${drops}` : summaryLine(r, opts))
      lines.push(`${display(handle, r.groupId)}: ${distLine(d)}`)
      let block = blocks.get(handle)
      if (!block) {
        block = { handle, display: display(handle, r.groupId), records: [], totalLine: '', total: 0 }
        blocks.set(handle, block)
      }
      block.records.push({ recordId: r.id, hasCart, amount: d.amount, lines })
    }
  }
  for (const b of blocks.values()) {
    const amounts = b.records.map((x) => x.amount)
    b.total = amounts.reduce((s, v) => s + v, 0)
    b.totalLine = amounts.length > 1 ? `應領: ${amounts.join(' + ')} = ${b.total}` : `應領: ${b.total}`
  }
  return [...blocks.values()]
}
