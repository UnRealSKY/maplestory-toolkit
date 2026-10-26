import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useRecordsStore } from './records'
import { rosterHandlesIn, rosterLoading, groupOf, regularsIn } from './groups'
import { sharedItemNames, sharedItemsLoading } from './sharedItems'

function uniqueByFrequency(values: string[]): string[] {
  const freq = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
}

export interface PriceSuggestion {
  price: number
  date: string
}

export function useHistory(groupId?: () => string | undefined, channelId?: () => string | undefined) {
  const store = useRecordsStore()

  // 建議 = 共用品名清單 ∪ 本機歷史品名（共用清單優先列前）
  const itemNames: ComputedRef<string[]> = computed(() =>
    uniqueByFrequency([
      ...sharedItemNames(),
      ...store.records.flatMap((r) => r.lootItems.map((it) => it.name)),
    ]),
  )

  // 建議 = 該群名冊 handle ∪ 該群歷史 handle（名冊優先列前），常駐這個頻道的人再提到最前面。
  // 人是分群的：別團的團員不該出現在這團的建議裡。歸屬用 groupOf 正規化，
  // 沒有 groupId 的舊紀錄跟著第一個群組走。
  const handles: ComputedRef<string[]> = computed(() => {
    const id = groupOf(groupId?.())?.id
    const all = uniqueByFrequency([
      ...rosterHandlesIn(groupId?.()),
      ...store.records
        .filter((r) => groupOf(r.groupId)?.id === id)
        .flatMap((r) => r.members.map((m) => m.handle)),
    ])
    const regulars = new Set(regularsIn(groupId?.(), channelId?.()))
    return [...all.filter((h) => regulars.has(h)), ...all.filter((h) => !regulars.has(h))]
  })

  const bosses: ComputedRef<string[]> = computed(() =>
    uniqueByFrequency(store.records.map((r) => r.boss)),
  )

  function priceSuggestions(name: string): PriceSuggestion[] {
    const out: PriceSuggestion[] = []
    for (const r of store.records) {
      for (const it of r.lootItems) {
        if (it.name === name && it.unitPrice != null) {
          out.push({ price: it.unitPrice, date: r.date })
        }
      }
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }

  return {
    itemNames,
    handles,
    bosses,
    priceSuggestions,
    // 共用清單背景載入中（autocomplete 載入提示用）
    itemNamesLoading: sharedItemsLoading(),
    handlesLoading: rosterLoading(),
  }
}
