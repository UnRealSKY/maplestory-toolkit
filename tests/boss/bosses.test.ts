import { describe, it, expect } from 'vitest'
import { DEFAULT_MECHANIC, mechanicById } from '#src/boss/mechanics'
import {
  BOSSES,
  bossesOf,
  defaultBoss,
  reflectBossById,
  DEFAULT_DISPEL_DURATION,
  bossById,
  normalizeOverrides,
  paramsOf,
  setOverride,
} from '#src/boss/bosses'

const PINK_BEAN = reflectBossById('pink-bean')
const DUNAS = reflectBossById('dunas')

describe('王清單', () => {
  it('id 唯一', () => {
    expect(new Set(BOSSES.map((b) => b.id)).size).toBe(BOSSES.length)
  })

  it('未知 id 回第一隻王', () => {
    expect(bossById('nope').id).toBe(BOSSES[0].id)
    expect(bossById('').id).toBe(BOSSES[0].id)
  })
})

describe('paramsOf', () => {
  it('無覆寫時用王的預設', () => {
    expect(paramsOf(DUNAS, {}, DEFAULT_DISPEL_DURATION)).toEqual({
      reflectDuration: 20,
      interval: 25,
      intervalFloat: 0,
      dispelDuration: 20,
    })
  })

  it('有覆寫時用覆寫值', () => {
    const ov = { dunas: { reflectDuration: 21, interval: 26, intervalFloat: 2 } }
    expect(paramsOf(DUNAS, ov, 20)).toEqual({
      reflectDuration: 21,
      interval: 26,
      intervalFloat: 2,
      dispelDuration: 20,
    })
  })

  it('別隻王的覆寫不互相污染', () => {
    const ov = { 'pink-bean': { reflectDuration: 99, interval: 99, intervalFloat: 9 } }
    expect(paramsOf(DUNAS, ov, 20)).toEqual({
      reflectDuration: 20,
      interval: 25,
      intervalFloat: 0,
      dispelDuration: 20,
    })
  })

  it('魔消持續一律取全域值，不受王影響', () => {
    expect(paramsOf(PINK_BEAN, {}, 12).dispelDuration).toBe(12)
    expect(paramsOf(DUNAS, {}, 12).dispelDuration).toBe(12)
  })
})

describe('normalizeOverrides', () => {
  it('非物件回空', () => {
    expect(normalizeOverrides(null)).toEqual({})
    expect(normalizeOverrides('x')).toEqual({})
    expect(normalizeOverrides([1, 2])).toEqual({})
  })

  it('丟掉未知王與非正數秒數', () => {
    const raw = {
      'pink-bean': { reflectDuration: 26, interval: 21 },
      dunas: { reflectDuration: 0, interval: 25 },
      ghost: { reflectDuration: 10, interval: 10 },
    }
    // 舊資料沒有 intervalFloat，補上該王的預設（皮卡 3）
    expect(normalizeOverrides(raw)).toEqual({
      'pink-bean': { reflectDuration: 26, interval: 21, intervalFloat: 3 },
    })
  })
})

describe('setOverride', () => {
  it('寫入覆寫值', () => {
    const next = setOverride({}, DUNAS, { reflectDuration: 22, interval: 25, intervalFloat: 0 })
    expect(next).toEqual({ dunas: { reflectDuration: 22, interval: 25, intervalFloat: 0 } })
  })

  it('值等於王的預設時移除該筆（讓「還原預設」自然消失）', () => {
    const ov = { dunas: { reflectDuration: 22, interval: 25, intervalFloat: 0 } }
    expect(setOverride(ov, DUNAS, { reflectDuration: 20, interval: 25, intervalFloat: 0 })).toEqual({})
  })

  it('不改動傳入的物件', () => {
    const ov = { 'pink-bean': { reflectDuration: 26, interval: 20, intervalFloat: 3 } }
    setOverride(ov, DUNAS, { reflectDuration: 22, interval: 25, intervalFloat: 0 })
    expect(ov).toEqual({ 'pink-bean': { reflectDuration: 26, interval: 20, intervalFloat: 3 } })
  })
})

describe('機制模板', () => {
  it('每隻王都指到存在的模板', () => {
    for (const b of BOSSES) expect(mechanicById(b.mechanic).id).toBe(b.mechanic)
  })

  it('bossesOf 取出套用該模板的王', () => {
    expect(bossesOf('damage-reflect').map((b) => b.id)).toEqual(['pink-bean', 'dunas', 'hilla'])
    expect(bossesOf('cycle').map((b) => b.id)).toEqual(['cygnus'])
  })

  it('循環模板的王拿去反盾面板時退回反盾王', () => {
    expect(reflectBossById('cygnus').mechanic).toBe('damage-reflect')
  })

  it('沒有王套用的模板回空陣列', () => {
    expect(bossesOf('nope')).toEqual([])
  })

  it('未知模板 id 回預設模板', () => {
    expect(mechanicById('nope')).toBe(DEFAULT_MECHANIC)
  })

  it('預設王套用預設模板', () => {
    expect(defaultBoss().mechanic).toBe(DEFAULT_MECHANIC.id)
  })
})
