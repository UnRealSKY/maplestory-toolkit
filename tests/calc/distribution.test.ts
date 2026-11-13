import { describe, it, expect } from 'vitest'
import { itemNet, netTotal, teamTotal, leaderFee, serviceFee, purchaseValue, memberPurchaseTotal, computeIncomes, consignmentValue, memberConsignmentTotal, awaitingSale } from '#src/calc/distribution'
import type { LootItem, LootRecord } from '#src/types'

const ok = (over: Partial<LootItem>): LootItem =>
  ({ status: 'ok', name: 'x', qty: 1, unitPrice: 0, ...over })

describe('itemNet', () => {
  it('單價×數量', () => {
    expect(itemNet(ok({ unitPrice: 475, qty: 6 }))).toBe(2850)
  })
  it('扣除剪刀成本', () => {
    expect(itemNet(ok({ unitPrice: 288, qty: 2, scissorUnitPrice: 80, scissorCount: 2 }))).toBe(416)
  })
  it('劃線項目不計入（回傳 0）', () => {
    expect(itemNet(ok({ status: 'struck', unitPrice: 999, qty: 3 }))).toBe(0)
  })
  it('unitPrice 為 null 視為 0', () => {
    expect(itemNet(ok({ unitPrice: null, qty: 3 }))).toBe(0)
  })
})

describe('netTotal', () => {
  it('加總未劃線項目淨額', () => {
    const items: LootItem[] = [
      ok({ unitPrice: 475, qty: 6 }),
      ok({ status: 'struck', unitPrice: 100, qty: 1 }),
      ok({ unitPrice: 168, qty: 2 }),
    ]
    expect(netTotal(items)).toBe(2850 + 336)
  })
})

describe('purchaseValue / memberPurchaseTotal', () => {
  it('單價×數量', () => {
    expect(purchaseValue({ buyer: '@a', name: 'x', qty: 2, unitPrice: 500 })).toBe(1000)
  })
  it('依買家加總', () => {
    const ps = [
      { buyer: '@a', name: 'x', qty: 2, unitPrice: 500 },
      { buyer: '@a', name: 'y', qty: 1, unitPrice: 500 },
      { buyer: '@b', name: 'z', qty: 1, unitPrice: 300 },
    ]
    expect(memberPurchaseTotal(ps, '@a')).toBe(1500)
    expect(memberPurchaseTotal(ps, '@b')).toBe(300)
  })
})

describe('consignmentValue / memberConsignmentTotal', () => {
  it('單價×數量', () => {
    expect(consignmentValue({ seller: '@a', name: 'x', qty: 2, unitPrice: 300 })).toBe(600)
  })
  it('扣除剪刀成本', () => {
    expect(consignmentValue({ seller: '@a', name: 'x', qty: 2, unitPrice: 300, scissorUnitPrice: 50, scissorCount: 2 })).toBe(500)
  })
  it('依代售者加總', () => {
    const cs = [
      { seller: '@a', name: 'x', qty: 1, unitPrice: 300 },
      { seller: '@a', name: 'y', qty: 2, unitPrice: 50 },
      { seller: '@b', name: 'z', qty: 1, unitPrice: 100 },
    ]
    expect(memberConsignmentTotal(cs, '@a')).toBe(400)
    expect(memberConsignmentTotal(cs, '@b')).toBe(100)
  })
})

describe('teamTotal', () => {
  const rec = (over: Partial<LootRecord>): LootRecord =>
    ({
      id: '1', date: '2026-08-05', boss: 'x', members: [], lootItems: [], purchases: [],
      createdAt: '', updatedAt: '', ...over,
    })

  it('總表淨額 ＋ 代售淨額', () => {
    const r = rec({
      lootItems: [ok({ unitPrice: 1000, qty: 1 })],
      consignments: [{ seller: '@a', name: 'y', qty: 1, unitPrice: 500 }],
    })
    expect(teamTotal(r)).toBe(1500)
  })

  it('沒有代售時等於總表淨額', () => {
    expect(teamTotal(rec({ lootItems: [ok({ unitPrice: 1000, qty: 1 })] }))).toBe(1000)
  })

  it('代售也要扣掉剪刀成本', () => {
    const r = rec({
      consignments: [{ seller: '@a', name: 'y', qty: 2, unitPrice: 300, scissorUnitPrice: 50, scissorCount: 2 }],
    })
    expect(teamTotal(r)).toBe(500)
  })
})

describe('代售收支平衡', () => {
  // 代售是團隊收益：必須先進總額被分掉，代售者手上那份再於結算時扣抵。
  // 驗證方式：所有人「該收/該付」的總和，應等於還在團長手上的錢（＝總表淨額）。
  const balanced = (r: LootRecord) => {
    const consignments = r.consignments ?? []
    const sum = computeIncomes(r).reduce(
      (s, inc) => s + inc.income - memberConsignmentTotal(consignments, inc.handle),
      0,
    )
    return Math.round(sum * 1e6) / 1e6
  }

  const members = ['@a', '@b', '@c', '@d', '@e'].map((handle) => ({ handle, settle: 'pending' as const }))
  const base: LootRecord = {
    id: '1', date: '2026-08-05', boss: 'x', members,
    lootItems: [], purchases: [], createdAt: '', updatedAt: '',
  }

  it('只有代售時，代售者交出的錢剛好等於其他人分到的', () => {
    const r: LootRecord = {
      ...base,
      consignments: [{ seller: '@a', name: 'y', qty: 1, unitPrice: 500 }],
    }
    // 總表沒東西 → 團長手上沒錢 → 所有人結算加總應為 0
    expect(balanced(r)).toBe(0)
    const incomes = computeIncomes(r)
    expect(incomes[0].income).toBe(100) // 500/5
    expect(incomes[0].income - 500).toBe(-400) // @a 交出 400
  })

  it('總表與代售並存時仍平衡', () => {
    const r: LootRecord = {
      ...base,
      lootItems: [ok({ unitPrice: 1000, qty: 1 })],
      consignments: [{ seller: '@a', name: 'y', qty: 1, unitPrice: 500 }],
    }
    expect(balanced(r)).toBe(1000) // 剩下要從團長手上發出去的就是總表那 1000
  })

  it('有內購時也平衡', () => {
    const r: LootRecord = {
      ...base,
      lootItems: [ok({ unitPrice: 1000, qty: 1 })],
      purchases: [{ buyer: '@b', name: 'z', qty: 1, unitPrice: 300 }],
      consignments: [{ seller: '@a', name: 'y', qty: 1, unitPrice: 500 }],
    }
    expect(balanced(r)).toBe(1000)
  })
})

describe('leaderFee', () => {
  const members = ['@a', '@b', '@c', '@d', '@e'].map((handle) => ({ handle, settle: 'pending' as const }))
  const rec = (over: Partial<LootRecord>): LootRecord =>
    ({
      id: '1', date: '2026-08-05', boss: 'x', members,
      lootItems: [ok({ unitPrice: 10000, qty: 1 })], purchases: [],
      createdAt: '', updatedAt: '', ...over,
    })

  it('沒有團長時為 0', () => {
    expect(leaderFee(rec({}))).toBe(0)
  })

  it('百分比以團隊總額為基準', () => {
    expect(leaderFee(rec({ leader: { handle: '@a', feeMode: 'percent', feeValue: 5 } }))).toBe(500)
  })

  it('百分比基準含代售', () => {
    const r = rec({
      leader: { handle: '@a', feeMode: 'percent', feeValue: 10 },
      consignments: [{ seller: '@b', name: 'y', qty: 1, unitPrice: 2000 }],
    })
    expect(leaderFee(r)).toBe(1200) // (10000 + 2000) × 10%
  })

  it('固定金額直接採用', () => {
    expect(leaderFee(rec({ leader: { handle: '@a', feeMode: 'fixed', feeValue: 800 } }))).toBe(800)
  })

  it('超過團隊總額時夾在總額，不讓其他人倒貼', () => {
    expect(leaderFee(rec({ leader: { handle: '@a', feeMode: 'fixed', feeValue: 99999 } }))).toBe(10000)
    expect(leaderFee(rec({ leader: { handle: '@a', feeMode: 'percent', feeValue: 150 } }))).toBe(10000)
  })

  it('負數視為 0', () => {
    expect(leaderFee(rec({ leader: { handle: '@a', feeMode: 'fixed', feeValue: -100 } }))).toBe(0)
  })

  it('團長不在團員列表時為 0（否則那筆錢會發給不在分配名單上的人）', () => {
    expect(leaderFee(rec({ leader: { handle: '@notmember', feeMode: 'fixed', feeValue: 500 } }))).toBe(0)
  })
})

describe('computeIncomes 團長辛苦費', () => {
  const members = ['@a', '@b', '@c', '@d', '@e'].map((handle) => ({ handle, settle: 'pending' as const }))
  const base: LootRecord = {
    id: '1', date: '2026-08-05', boss: 'x', members,
    lootItems: [ok({ unitPrice: 10000, qty: 1 })], purchases: [],
    leader: { handle: '@a', feeMode: 'percent', feeValue: 5 },
    createdAt: '', updatedAt: '',
  }

  it('團員拿 (總額−辛苦費)/人數，團長再加辛苦費', () => {
    const r = computeIncomes(base)
    expect(r[0]).toMatchObject({ handle: '@a', fee: 500, income: 1900 + 500 })
    expect(r[1]).toMatchObject({ handle: '@b', fee: 0, income: 1900 })
  })

  it('收入總和仍等於團隊總額', () => {
    const sum = computeIncomes(base).reduce((s, i) => s + i.income, 0)
    expect(sum).toBe(10000)
  })

  it('與內購、代售並存時收入總和不變', () => {
    const r: LootRecord = {
      ...base,
      purchases: [{ buyer: '@b', name: 'z', qty: 1, unitPrice: 300 }],
      consignments: [{ seller: '@c', name: 'y', qty: 1, unitPrice: 2000 }],
    }
    const sum = computeIncomes(r).reduce((s, i) => s + i.income, 0)
    expect(sum).toBe(12000) // 團隊總額 10000 + 代售 2000
  })
})

describe('computeIncomes', () => {
  const base: LootRecord = {
    id: '1', date: '2026-07-19', boss: '混龍',
    members: [
      { handle: '@.unrealsky', settle: 'settled' },
      { handle: '@xiangjiaojiu', settle: 'pending' },
      { handle: '@must0505110', settle: 'pending' },
      { handle: '@auwoo', settle: 'pending' },
      { handle: '@x', settle: 'pending' },
    ],
    lootItems: [{ status: 'ok', name: '總表', qty: 1, unitPrice: 11288 }],
    purchases: [{ buyer: '@.unrealsky', name: '龍', qty: 3, unitPrice: 500 }],
    createdAt: '', updatedAt: '',
  }

  it('買家 = base - 自己內購', () => {
    const r = computeIncomes(base)
    const u = r.find((x) => x.handle === '@.unrealsky')!
    expect(Math.round(u.income)).toBe(758) // 11288/5 + 0 - 1500 = 757.6 → 758
  })
  it('其他人 = base + 他人內購/(N-1)', () => {
    const r = computeIncomes(base)
    const o = r.find((x) => x.handle === '@xiangjiaojiu')!
    expect(Math.round(o.income)).toBe(2633) // 2257.6 + 375 = 2632.6 → 2633
  })
})

describe('手續費', () => {
  const members = ['@a', '@b', '@c', '@d', '@e'].map((handle) => ({ handle, settle: 'pending' as const }))
  const base: LootRecord = {
    id: '1', date: '2026-08-16', boss: 'x', members,
    lootItems: [ok({ unitPrice: 10000, qty: 1 })], purchases: [],
    createdAt: '', updatedAt: '',
  }

  it('沒填的舊紀錄視為 0，金額不變', () => {
    expect(serviceFee(base)).toBe(0)
    expect(computeIncomes(base)[0].income).toBe(2000)
  })

  it('依團隊總額計算', () => {
    expect(serviceFee({ ...base, serviceFeePercent: 3 })).toBe(300)
  })

  it('基準含代售', () => {
    const r = { ...base, serviceFeePercent: 3, consignments: [{ seller: '@b', name: 'y', qty: 1, unitPrice: 2000 }] }
    expect(serviceFee(r)).toBe(360) // (10000 + 2000) × 3%
  })

  it('0 與負數都當 0', () => {
    expect(serviceFee({ ...base, serviceFeePercent: 0 })).toBe(0)
    expect(serviceFee({ ...base, serviceFeePercent: -5 })).toBe(0)
  })

  it('超過 100% 以總額為上限，不讓其他人倒貼', () => {
    expect(serviceFee({ ...base, serviceFeePercent: 150 })).toBe(10000)
  })

  it('扣掉手續費後才均分', () => {
    const r = { ...base, serviceFeePercent: 3 }
    expect(computeIncomes(r)[0].income).toBe(1940) // (10000 − 300) / 5
  })
})

describe('手續費與辛苦費並列', () => {
  const members = ['@a', '@b', '@c', '@d', '@e'].map((handle) => ({ handle, settle: 'pending' as const }))
  const base: LootRecord = {
    id: '1', date: '2026-08-16', boss: 'x', members,
    lootItems: [ok({ unitPrice: 10000, qty: 1 })], purchases: [],
    serviceFeePercent: 3,
    leader: { handle: '@a', feeMode: 'percent', feeValue: 5 },
    createdAt: '', updatedAt: '',
  }

  it('兩者都從團隊總額算，不是一層扣完再扣另一層', () => {
    expect(serviceFee(base)).toBe(300) // 10000 × 3%
    expect(leaderFee(base)).toBe(500) // 10000 × 5%，不是 (10000−300) × 5%
  })

  it('每人基本＝(總額 − 手續費 − 辛苦費) ÷ 人數', () => {
    const r = computeIncomes(base)
    expect(r[1].income).toBe(1840) // (10000 − 300 − 500) / 5
    expect(r[0].income).toBe(1840 + 500) // 團長再加辛苦費
  })

  it('收入總和＝團隊總額 − 手續費（手續費被遊戲收走，不屬於任何人）', () => {
    const sum = computeIncomes(base).reduce((s, i) => s + i.income, 0)
    expect(sum).toBe(9700)
  })

  it('群組關閉辛苦費時當作沒有團長', () => {
    const opts = { leaderFeeEnabled: false }
    expect(leaderFee(base, opts)).toBe(0)
    const r = computeIncomes(base, opts)
    expect(r[0].income).toBe(1940) // (10000 − 300) / 5，沒有辛苦費
    expect(r[0].fee).toBe(0)
  })
})

describe('awaitingSale', () => {
  it('待售但數量還沒填：還是待售', () => {
    expect(awaitingSale({ status: 'cart', name: 'a', qty: null, unitPrice: null }, 4)).toBe(true)
  })
  it('勾均分剛好分完：不是待售', () => {
    expect(awaitingSale({ status: 'cart', name: 'a', qty: 8, unitPrice: null, split: true }, 4)).toBe(false)
  })
  it('勾均分還有餘數：待售', () => {
    expect(awaitingSale({ status: 'cart', name: 'a', qty: 9, unitPrice: null, split: true }, 4)).toBe(true)
  })
})
