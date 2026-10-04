import type { LootRecord, Member } from '../types'
import { perMember } from '../calc/splitDrops'
import {
  teamTotal,
  leaderFee,
  serviceFee,
  computeIncomes,
  memberConsignmentTotal,
  roundDisplay,
  type DistOptions,
} from '../calc/distribution'

export interface DistSummary {
  total: number // 團隊總收益（總表淨額 ＋ 代售淨額）
  service: number // 交易手續費（未填為 0）
  fee: number // 團長辛苦費（沒有團長或群組關閉為 0）
  n: number
  base: number // 顯示用均分額（無條件進位）
}

export function distSummary(record: LootRecord, opts?: DistOptions): DistSummary {
  const total = teamTotal(record)
  const service = serviceFee(record)
  const fee = leaderFee(record, opts)
  const n = record.members.length
  const base = Math.ceil(n > 0 ? (total - service - fee) / n : 0)
  // service / fee 與 base 同為顯示用（base 進位、費用截到 2 位），計算一律用上面的原值
  return { total, service: roundDisplay(service), fee: roundDisplay(fee), n, base }
}

export interface MemberDist {
  member: Member
  expr: string // 例 "654 + 1000/4 - 300"，不含「= 金額」
  amount: number // ceil(income) − 代售持有額
}

// serialize 與未領總覽共用的每人分配公式，保證兩邊輸出一致
export function memberDists(record: LootRecord, opts?: DistOptions): MemberDist[] {
  const { n, base } = distSummary(record, opts)
  const consignments = record.consignments ?? []
  const incomeByHandle = new Map(computeIncomes(record, opts).map((i) => [i.handle, i]))
  const out: MemberDist[] = []
  for (const m of record.members) {
    const inc = incomeByHandle.get(m.handle)
    if (!inc) continue
    const held = memberConsignmentTotal(consignments, m.handle)
    let expr = `${base}`
    // 辛苦費緊接 base（同屬分配所得），內購與代售是之後的調整項
    if (inc.fee > 0) expr += ` + ${roundDisplay(inc.fee)}`
    if (n > 1 && inc.others > 0) expr += ` + ${roundDisplay(inc.others)}/${n - 1}`
    if (inc.own > 0) expr += ` - ${roundDisplay(inc.own)}`
    if (held > 0) expr += ` - ${held}`
    out.push({ member: m, expr, amount: Math.ceil(inc.income) - held })
  }
  return out
}

// 分配區塊的「總共」行。有辛苦費時一定要括號，
// 否則 "10000 - 500 / 5" 按四則運算會算成 9900。
// 扣除項寫成百分比留在算式裡（而不是先換算成金額），匯入時才讀得回原本的設定；
// 註記用方括號，跟運算用的圓括號分開。
// 固定金額的辛苦費沒辦法放進乘法括號，改放外面減——數學上等價，順序也仍然正確。
export function summaryLine(record: LootRecord, opts?: DistOptions): string {
  return `總共: ${summaryMath(record, opts)}`
}

// 「總共」那行冒號後面的算式：總額（與扣除項）/ 人數 = 每人。未領總覽的金額行直接用它，不帶「總共:」
export function summaryMath(record: LootRecord, opts?: DistOptions): string {
  const { n, base } = distSummary(record, opts)
  return `${summaryExpr(record, opts)} / ${n} = ${base}`
}

// 除法之前的算式：總額與扣除項
function summaryExpr(record: LootRecord, opts?: DistOptions): string {
  const { total, service, fee } = distSummary(record, opts)
  const asPct = (amount: number) => roundDisplay(total > 0 ? (amount / total) * 100 : 0)

  const percentTerms: string[] = []
  let flat = ''
  if (service > 0) percentTerms.push(`${asPct(service)}%[手續費]`)
  if (fee > 0) {
    // 夾在總額上限時實際生效的比例會與填的值不同，一律用生效值才對得上金額
    if (record.leader?.feeMode === 'percent') percentTerms.push(`${asPct(fee)}%[辛苦費]`)
    else flat = `${fee}[辛苦費]`
  }

  let expr = `${total}`
  if (percentTerms.length) expr = `${total} * (1 - ${percentTerms.join(' - ')})`
  if (flat) expr = `(${expr} - ${flat})`
  return expr
}

// 每人分配行的算式部分：沒有運算時算式本身就是答案，不再重複寫一次
export function distLine(d: MemberDist): string {
  return d.expr === String(d.amount) ? d.expr : `${d.expr} = ${d.amount}`
}

export interface DropShare {
  name: string
  each: number // 每人幾個
}

// 這筆紀錄每人分到的實物。除不盡的項目略過——它們在區塊那邊已經標了無法均分，發佈也會被擋
export function splitDropShares(record: LootRecord): DropShare[] {
  const n = record.members.length
  const out: DropShare[] = []
  for (const d of record.splitDrops ?? []) {
    const each = perMember(d.qty, n)
    if (each != null) out.push({ name: d.name, each })
  }
  return out
}

// 份數清單本身，例如「星星碎片x2、魔法石x1」
export function dropsList(shares: DropShare[]): string {
  return shares.map((s) => `${s.name}x${s.each}`).join('、')
}

// 份數清單排成字尾，例如「 ｜ 星星碎片x2、魔法石x1」；空清單就是空字串
export function dropsSuffix(shares: DropShare[]): string {
  return shares.length ? ` ｜ ${dropsList(shares)}` : ''
}
