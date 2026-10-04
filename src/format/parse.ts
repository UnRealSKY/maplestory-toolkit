import type { LootRecord, LootItem, LootStatus, Stream, Consignment, SettleStatus, Member } from '../types'

type Section = 'loot' | 'purchase' | 'stream' | 'consignment' | 'splitDrop' | 'dist' | 'none'
// 均分行：* 品名xN，後面可能跟著「（無法均分 N 人）」的註記；品名裡可能有 x，取最後一個 xN
const SPLIT_DROP_RE = /^\*\s*(.+)x(\d+)\s*(?:（[^）]*）)?\s*$/

// 標頭：日期 團名［/ 人數（舊格式，僅供辨識）］［｜ 狀態尾綴（相容 ｜/|/・）］
const HEADER_RE = /^##\s+(\S+)\s+(.+?)(?:\s*\/\s*(\d+))?\s*(?:[｜|・].*)?$/
const STRUCK_RE = /^\*\s*~~(.+?)~~\s*$/
// 狀態 token 寬鬆捕捉，相容 :ok: 短碼與 🆗 unicode（DC 兩種編輯模式）
const LOOT_RE = /^\*\s*(\S+)\s+(.+?)x(\d+)\s*:\s*(.+?)\s*$/
// 金額可為 ?（未填、未知），對應 unitPrice null / scissorUnitPrice undefined
const PRICE_RE = /^(\d+|\?)x(\d+)(?:\s*-\s*(\d+|\?)\(剪刀\)x(\d+))?/
// 尾綴 (均攤) 表示買家只付 1/N（相容全形括號）；無尾綴為全額
const PURCHASE_RE = /^(<@\d+>|@\S+?)\s*:\s*(.+?)x(\d+)\s*=\s*(\d+)x(\d+)\s*([（(]均攤[)）])?\s*$/
// 代售行：@代售者: 品名xN = 單價xN[ - 剪刀單價(剪刀)x剪刀數]，金額部分用 PRICE_RE 解析
const CONSIGNMENT_RE = /^(<@\d+>|@\S+?)\s*:\s*(.+?)x(\d+)\s*=\s*(.+?)\s*$/
const STREAM_RE = /^\*\s*(.+?)\s*:\s*(https?:\/\/\S+)\s*$/
// 分配行只取結清狀態與團員 handle（相容 @名稱 與 <@數字ID>，不強制冒號）
const DIST_RE = /^\*\s*(\S+)\s+(<@\d+>|@[^\s:：]+)/
// 同一行的算式部分（辨識團長用）
const DIST_EXPR_RE = /^\*\s*\S+\s+(?:<@\d+>|@[^\s:：]+)\s*[:：]?\s*(.*)$/
// ｜後面是均分實物：開頭可能帶著「領了沒」的狀態 token
const DIST_DROPS_RE = /｜\s*(:\w+:|[^\s\w一-鿿]+)\s/
// 總共行：先抓到除號前的整個算式，再從裡面挑出扣除項。
// 形如 10000 * (1 - 3%[手續費] - 5%[辛苦費]) / 5 = 1840
//   或 (10000 * (1 - 3%[手續費]) - 500[辛苦費]) / 5 = 1840
const DIST_TOTAL_RE = /^總共\s*[:：]\s*(.+?)\s*\/\s*\d+\s*=/
const DIST_BASE_RE = /^\(?\s*([\d.]+)/
// 百分比項寫在算式裡，金額項寫在乘法外面
const PERCENT_RE = /([\d.]+)%\[(手續費|辛苦費)\]/g
const FLAT_RE = /([\d.]+)\[(辛苦費)\]/g
// v1.20 以前的格式：(10000 - 300(手續費) - 500(辛苦費)) / 5
// DC 上已經發佈的貼文都長這樣，匯入時仍要讀得懂
const LEGACY_RE = /([\d.]+)\((手續費|辛苦費)\)/g

// 算式裡的辛苦費項＝「+ 純數字」；他人內購是「+ 數字/N」有斜線，不能誤認
function hasFeeTerm(expr: string, fee: number): boolean {
  const literal = String(fee).replace(/\./g, '\\.')
  return new RegExp(`\\+\\s*${literal}(?![\\d./])`).test(expr)
}
// 劃線項目內部形如 "上衣命60%x1: (價格太低不計入)" 或 "上衣命60%x1"
const STRUCK_INNER_RE = /^(.+?)x(\d+)(?:\s*:\s*(.+?))?\s*$/

const OK_TOKENS = new Set([':ok:', '🆗'])
const CART_TOKENS = new Set([':shopping_cart:', '🛒'])
const PENDING_TOKENS = new Set([':orange_square:', '🟧'])

function lootStatusFrom(token: string): LootStatus {
  if (OK_TOKENS.has(token)) return 'ok'
  if (CART_TOKENS.has(token)) return 'cart'
  return 'cart'
}
function settleFrom(token: string): SettleStatus {
  return PENDING_TOKENS.has(token) ? 'pending' : 'settled'
}
// 移除開頭的狀態 token（:shortcode: 或 emoji），保留品名
function stripLeadingStatus(s: string): string {
  return s.replace(/^\s*(?::\w+:|[^\s\w一-鿿]+)\s*/, '')
}

function parseLoot(line: string): LootItem | null {
  const struck = line.match(STRUCK_RE)
  if (struck) {
    const inner = stripLeadingStatus(struck[1].trim())
    const m2 = inner.match(STRUCK_INNER_RE)
    if (!m2) return { status: 'struck', name: inner.trim(), qty: 1, unitPrice: null }
    return {
      status: 'struck',
      name: m2[1].trim(),
      qty: Number(m2[2]),
      unitPrice: null,
      ...(m2[3] ? { note: m2[3].trim() } : {}),
    }
  }
  const m = line.match(LOOT_RE)
  if (!m) return null
  const price = m[4].match(PRICE_RE)
  const item: LootItem = {
    status: lootStatusFrom(m[1]),
    name: m[2].trim(),
    qty: Number(m[3]),
    unitPrice: price && price[1] !== '?' ? Number(price[1]) : null,
  }
  if (price && price[4]) {
    item.scissorCount = Number(price[4])
    if (price[3] !== '?') item.scissorUnitPrice = Number(price[3])
  }
  return item
}

export function parse(md: string): LootRecord {
  const record: LootRecord = {
    id: '', date: '', boss: '',
    members: [], lootItems: [], purchases: [], streams: [], consignments: [], createdAt: '', updatedAt: '',
  }
  const streams: Stream[] = record.streams!
  const consignments: Consignment[] = record.consignments!
  let section: Section = 'none'
  let fee = 0
  let leaderFeeValue = 0
  let leaderFeeMode: 'percent' | 'fixed' = 'fixed'
  let leaderHandle = ''

  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) continue

    const header = line.match(HEADER_RE)
    if (header) {
      record.date = header[1]
      record.boss = header[2].trim()
      // header[3] 為 DC 標頭的人數，僅供辨識；本工具 N 由 members.length 推導
      section = 'loot'
      continue
    }
    if (/^##\s*內購區/.test(line)) { section = 'purchase'; continue }
    if (/^##\s*直播檔/.test(line)) { section = 'stream'; continue }
    if (/^##\s*代售/.test(line)) { section = 'consignment'; continue }
    if (/^##\s*掉落物均分/.test(line)) { section = 'splitDrop'; continue }
    if (/^##\s*分配/.test(line)) { section = 'dist'; continue }

    if (section === 'loot') {
      // 縮排行＝上一個項目的備註（非劃線項目輸出格式）
      const noteMatch = line.match(/^\s+(\S.*)$/)
      if (noteMatch && record.lootItems.length) {
        const last = record.lootItems[record.lootItems.length - 1]
        if (!last.note) last.note = noteMatch[1].trim()
        continue
      }
      const item = parseLoot(line)
      if (item) record.lootItems.push(item)
    } else if (section === 'purchase') {
      const p = line.match(PURCHASE_RE)
      if (p) {
        record.purchases.push({
          buyer: p[1], name: p[2].trim(), qty: Number(p[3]), unitPrice: Number(p[4]),
          ...(p[6] ? { mode: 'split' as const } : {}),
        })
      }
    } else if (section === 'stream') {
      const s = line.match(STREAM_RE)
      if (s) streams.push({ label: s[1].trim(), url: s[2].trim() })
    } else if (section === 'consignment') {
      const c = line.match(CONSIGNMENT_RE)
      const price = c ? c[4].match(PRICE_RE) : null
      if (c && price) {
        const entry: Consignment = {
          seller: c[1], name: c[2].trim(), qty: Number(c[3]),
          unitPrice: price[1] === '?' ? 0 : Number(price[1]),
        }
        if (price[4]) {
          entry.scissorCount = Number(price[4])
          if (price[3] !== '?') entry.scissorUnitPrice = Number(price[3])
        }
        consignments.push(entry)
      }
    } else if (section === 'splitDrop') {
      const m = line.match(SPLIT_DROP_RE)
      if (m) (record.splitDrops ??= []).push({ name: m[1].trim(), qty: Number(m[2]) })
    } else if (section === 'dist') {
      const totalLine = line.match(DIST_TOTAL_RE)
      if (totalLine) {
        const expr = totalLine[1]
        const total = Number(expr.match(DIST_BASE_RE)?.[1] ?? 0)
        for (const [, value, kind] of expr.matchAll(PERCENT_RE)) {
          if (kind === '手續費') record.serviceFeePercent = Number(value)
          else {
            leaderFeeValue = Number(value)
            leaderFeeMode = 'percent'
            // 分配行寫的是金額，先換算好才比對得到誰是團長
            fee = (total * Number(value)) / 100
          }
        }
        // 金額形式的辛苦費（percent 的已在上面處理，不會重複命中）
        const withoutPercent = expr.replace(PERCENT_RE, '')
        for (const [, amount] of withoutPercent.matchAll(FLAT_RE)) {
          leaderFeeValue = Number(amount)
          leaderFeeMode = 'fixed'
          fee = Number(amount)
        }
        // 舊格式：兩者都是金額，手續費換算回百分比才能跟著總額連動
        for (const [, amount, kind] of withoutPercent.matchAll(LEGACY_RE)) {
          if (kind === '辛苦費') {
            leaderFeeValue = Number(amount)
            leaderFeeMode = 'fixed'
            fee = Number(amount)
          } else if (total > 0) {
            record.serviceFeePercent = (Number(amount) / total) * 100
          }
        }
        continue
      }
      const d = line.match(DIST_RE)
      if (!d) continue
      const member: Member = { handle: d[2], settle: settleFrom(d[1]) }
      const drops = line.match(DIST_DROPS_RE)
      if (drops) member.dropsSettle = settleFrom(drops[1])
      record.members.push(member)
      // 總共行一定在分配行之前，所以這時 fee 已經知道了
      if (fee > 0 && hasFeeTerm(line.match(DIST_EXPR_RE)?.[1] ?? '', fee)) leaderHandle = d[2]
    }
  }

  // 百分比留在算式裡，所以 percent 模式現在讀得回來，不必再降級成 fixed
  if (leaderHandle && leaderFeeValue > 0) {
    record.leader = { handle: leaderHandle, feeMode: leaderFeeMode, feeValue: leaderFeeValue }
  }

  return record
}
