import type { LootRecord, LootItem, SettleStatus } from '../types'
import { memberDists, summaryLine, distLine, splitDropShares, dropsList } from './dist'
import { perMember } from '../calc/splitDrops'
import type { DistOptions } from '../calc/distribution'

function lootLine(it: LootItem): string {
  const q = it.qty ?? ''
  if (it.status === 'struck') {
    const notePart = it.note ? `: ${it.note}` : ''
    return `* ~~:heavy_multiplication_x: ${it.name}x${q}${notePart}~~`
  }
  const emoji = it.status === 'ok' ? ':ok:' : ':shopping_cart:'
  // 未填金額輸出 ?（未知），不是 0
  let price = `${it.unitPrice ?? '?'}x${q}`
  if (it.scissorCount) {
    price += ` - ${it.scissorUnitPrice ?? '?'}(剪刀)x${it.scissorCount}`
  }
  return `* ${emoji} ${it.name}x${q}: ${price}`
}

function settleEmoji(s: SettleStatus): string {
  return s === 'settled' ? ':ok:' : ':orange_square:'
}

// 標題行狀態標記：:shopping_cart:(待售項數) :dollar:(未結清人數)，歸零的標記不顯示；
// 兩者皆歸零＝全結案，顯示單一 :ballot_box_with_check:。
// webhook 改不了討論串標題與 tag，會變動的狀態放內文標題行、同步時更新
function statusSuffix(record: LootRecord): string {
  const cartCount = record.lootItems.filter((it) => it.status === 'cart').length
  const unsettled = record.members.filter((m) => m.settle === 'pending').length
  const marks: string[] = []
  if (cartCount > 0) marks.push(`:shopping_cart:(${cartCount})`)
  if (unsettled > 0) marks.push(`:dollar:(${unsettled})`)
  return marks.length ? marks.join(' ') : ':ballot_box_with_check:'
}

export function serialize(record: LootRecord, opts?: DistOptions): string {
  const lines: string[] = []
  lines.push(`## ${record.date} ${record.boss} ｜ ${statusSuffix(record)}`)
  for (const it of record.lootItems) {
    lines.push(lootLine(it))
    // 非劃線項目的備註：項目行下方縮排一行（劃線項目維持行內註解）
    if (it.status !== 'struck' && it.note) lines.push(`  ${it.note}`)
  }

  if (record.purchases.length) {
    lines.push('', '## 內購區')
    for (const p of record.purchases) {
      const mode = p.mode === 'split' ? ' (均攤)' : ''
      lines.push(`${p.buyer}: ${p.name}x${p.qty} = ${p.unitPrice}x${p.qty}${mode}`)
    }
  }

  const streams = record.streams ?? []
  if (streams.length) {
    lines.push('', '## 直播檔')
    for (const s of streams) {
      lines.push(`* ${s.label}: ${s.url}`)
    }
  }

  const consignments = record.consignments ?? []
  if (consignments.length) {
    lines.push('', '## 代售')
    for (const c of consignments) {
      let amt = `${c.unitPrice}x${c.qty}`
      if (c.scissorCount) {
        amt += ` - ${c.scissorUnitPrice ?? '?'}(剪刀)x${c.scissorCount}`
      }
      lines.push(`${c.seller}: ${c.name}x${c.qty} = ${amt}`)
    }
  }

  const splitDrops = record.splitDrops ?? []
  if (splitDrops.length) {
    lines.push('', '## 掉落物均分區')
    const n = record.members.length
    for (const d of splitDrops) {
      // 除不盡的標出來；發佈會被擋，但「複製回 DC」不擋，複製出去也要看得到問題在哪
      const note = perMember(d.qty, n) == null ? `（無法均分 ${n} 人）` : ''
      lines.push(`* ${d.name}x${d.qty}${note}`)
    }
  }

  lines.push('', '## 分配')
  lines.push(summaryLine(record, opts))

  // 有可分的實物時每人那行接「｜ 物的狀態 清單」；錢的狀態在行首，物的在｜後面，兩個各自標
  const shares = splitDropShares(record)
  const list = dropsList(shares)
  for (const d of memberDists(record, opts)) {
    const drops = shares.length ? ` ｜ ${settleEmoji(d.member.dropsSettle ?? 'pending')} ${list}` : ''
    lines.push(`* ${settleEmoji(d.member.settle)} ${d.member.handle}: ${distLine(d)}${drops}`)
  }

  return lines.join('\n')
}
