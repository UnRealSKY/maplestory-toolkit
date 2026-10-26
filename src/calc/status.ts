import type { LootRecord } from '../types'
import { awaitingSale } from './distribution'

// 是否全數賣出：沒有還要賣的項目（售出/不計入、均分後沒剩的都算處理完）
export function allSold(r: LootRecord): boolean {
  const n = r.members.length
  return r.lootItems.length > 0 && !r.lootItems.some((it) => awaitingSale(it, n))
}

// 是否已把錢交給所有團員：所有團員皆已結清
export function allSettled(r: LootRecord): boolean {
  return r.members.length > 0 && r.members.every((m) => m.settle === 'settled')
}
