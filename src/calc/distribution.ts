import type { LootItem, Purchase, Consignment, LootRecord } from '../types'

// 總表勾「均分」的項目怎麼拆：每人 each 個、共 split 個直接分，剩下 sell 個照單價賣。
// 沒勾或還沒有團員就是全部拿去賣
export function lootSplit(item: LootItem, n: number): { each: number; split: number; sell: number } {
  const qty = item.qty ?? 0
  if (!item.split || n <= 0) return { each: 0, split: 0, sell: qty }
  const each = Math.floor(qty / n)
  return { each, split: each * n, sell: qty - each * n }
}

// 還要拿去賣的項目：待售，而且扣掉均分之後還有剩
export function awaitingSale(item: LootItem, n: number): boolean {
  return item.status === 'cart' && lootSplit(item, n).sell > 0
}

// n＝團員人數，勾了均分的項目只算賣掉的那幾個
export function itemNet(item: LootItem, n = 0): number {
  if (item.status === 'struck') return 0
  const price = (item.unitPrice ?? 0) * lootSplit(item, n).sell
  const scissor = (item.scissorUnitPrice ?? 0) * (item.scissorCount ?? 0)
  return price - scissor
}

export function netTotal(items: LootItem[], n = 0): number {
  return items.reduce((sum, it) => sum + itemNet(it, n), 0)
}

// 團隊總收益＝總表淨額 ＋ 代售淨額。
// 代售是團員代替團隊賣掉的東西，錢暫時握在他手上，但收益屬於團隊，
// 必須先進總額被分掉；他手上那份於結算時扣抵（見 memberConsignmentTotal）。
export function teamTotal(record: LootRecord): number {
  const consigned = (record.consignments ?? []).reduce((s, c) => s + consignmentValue(c), 0)
  return netTotal(record.lootItems, record.members.length) + consigned
}

export function purchaseValue(p: Purchase): number {
  return p.unitPrice * p.qty
}

// 買家實付額：全額付原價；均攤只付 1/N
export function purchaseCharge(p: Purchase, n: number): number {
  const v = purchaseValue(p)
  return p.mode === 'split' && n > 0 ? v / n : v
}

export function memberPurchaseTotal(purchases: Purchase[], handle: string): number {
  return purchases
    .filter((p) => p.buyer === handle)
    .reduce((s, p) => s + purchaseValue(p), 0)
}

// 顯示用：小數截到 2 位（整數維持原樣）
export function roundDisplay(x: number): number {
  return Math.round(x * 100) / 100
}

export function consignmentValue(c: Consignment): number {
  const price = c.unitPrice * c.qty
  const scissor = (c.scissorUnitPrice ?? 0) * (c.scissorCount ?? 0)
  return price - scissor
}

// 某團員代售、手上握著的金額總和
export function memberConsignmentTotal(consignments: Consignment[], handle: string): number {
  return consignments
    .filter((c) => c.seller === handle)
    .reduce((s, c) => s + consignmentValue(c), 0)
}

// 辛苦費是否啟用由 DC 群組決定（設定頁的開關）。calc 層保持純函式不碰 store，
// 由呼叫端把開關傳進來；沒傳就是啟用（維持既有行為）。
export interface DistOptions {
  leaderFeeEnabled?: boolean
}

// 交易手續費：遊戲賣東西時就被收走的那筆，不屬於任何人。
// 沒填的舊紀錄視為 0，既有金額不受影響。
export function serviceFee(record: LootRecord): number {
  const pct = record.serviceFeePercent ?? 0
  const total = teamTotal(record)
  return Math.max(0, Math.min((total * pct) / 100, total))
}

// 團長辛苦費金額。夾在 0 ~ 團隊總額之間：填超過總額就取總額（base 歸零），
// 不讓 base 變負數導致其他人倒貼。
export function leaderFee(record: LootRecord, opts: DistOptions = {}): number {
  if (opts.leaderFeeEnabled === false) return 0
  const l = record.leader
  // 團長被移出團員列表時視同沒有團長，否則這筆錢會發給不在分配名單上的人
  if (!l || !record.members.some((m) => m.handle === l.handle)) return 0
  const total = teamTotal(record)
  const fee = l.feeMode === 'percent' ? (total * l.feeValue) / 100 : l.feeValue
  return Math.max(0, Math.min(fee, total))
}

export interface Income {
  handle: string
  base: number
  own: number
  others: number
  fee: number // 該人拿到的辛苦費（非團長為 0）
  income: number
}

export function computeIncomes(record: LootRecord, opts: DistOptions = {}): Income[] {
  const n = record.members.length
  const fee = leaderFee(record, opts)
  // 手續費與辛苦費並列，都從團隊總額扣掉，不是一層扣完再扣另一層
  const base = n > 0 ? (teamTotal(record) - serviceFee(record) - fee) / n : 0
  // own/others 以「實付額」計：均攤內購買家只付 1/N，其他人仍分 (實付)/(N-1)
  const totalCharge = record.purchases.reduce((s, p) => s + purchaseCharge(p, n), 0)
  return record.members.map((m) => {
    const own = record.purchases
      .filter((p) => p.buyer === m.handle)
      .reduce((s, p) => s + purchaseCharge(p, n), 0)
    const others = totalCharge - own
    const ownFee = m.handle === record.leader?.handle ? fee : 0
    const income = base + (n > 1 ? others / (n - 1) : 0) - own + ownFee
    return { handle: m.handle, base, own, others, fee: ownFee, income }
  })
}
