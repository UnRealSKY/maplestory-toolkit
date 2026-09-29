// 掉落物均分：實物平分給每個人，不是錢，不進任何金額計算。
// 除不盡就是除不盡，不取整、不留餘——擋住發佈，讓人先在 DC 商量完再改數字。

import type { LootRecord, SplitDrop } from '../types'

/** 每人幾個；沒有人、總數不是正整數、或除不盡都回 null */
export function perMember(qty: number, n: number): number | null {
  if (n <= 0) return null
  if (!Number.isInteger(qty) || qty <= 0) return null
  if (qty % n !== 0) return null
  return qty / n
}

/** 除不盡的那幾筆；編輯頁的提醒與發佈的擋門都用這一份 */
export function undividable(record: LootRecord): SplitDrop[] {
  const n = record.members.length
  return (record.splitDrops ?? []).filter((d) => perMember(d.qty, n) == null)
}
