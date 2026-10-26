<script setup lang="ts">
import { computed } from 'vue'
import type { LootItem, LootStatus } from '../types'
import { itemNet, lootSplit } from '../calc/distribution'
import { useHistory } from '../store/history'
import AutocompleteInput from './AutocompleteInput.vue'

const props = defineProps<{ modelValue: LootItem; taken: string[]; memberCount: number }>()
const emit = defineEmits<{ 'update:modelValue': [v: LootItem]; remove: []; grab: [e: DragEvent] }>()

const history = useHistory()
// 別列已用過的品名不列出
const nameSuggestions = computed(() => history.itemNames.value.filter((n) => !props.taken.includes(n)))
const STATUS_CYCLE: LootStatus[] = ['cart', 'ok', 'struck']
const STATUS_META: Record<LootStatus, { cls: string; label: string }> = {
  cart: { cls: 'chip-cart', label: '🛒 待售' },
  ok: { cls: 'chip-ok', label: '✓ 售出' },
  struck: { cls: 'chip-struck', label: '✖ 不計入' },
}

function patch(part: Partial<LootItem>) {
  emit('update:modelValue', { ...props.modelValue, ...part })
}
const STRUCK_NOTE = '(價格過低不計入)'
function cycleStatus() {
  const i = STATUS_CYCLE.indexOf(props.modelValue.status)
  const status = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length]
  const part: Partial<LootItem> = { status }
  if (status === 'struck') {
    // 標記不計入時自動帶上原因（已有自訂註解則保留）
    if (!props.modelValue.note) part.note = STRUCK_NOTE
  } else if (props.modelValue.note === STRUCK_NOTE) {
    // 離開不計入且註解為自動值時清除
    part.note = undefined
  }
  patch(part)
}
const net = computed(() => itemNet(props.modelValue, props.memberCount))
// 勾了均分時旁邊寫怎麼拆
const splitText = computed(() => {
  if (!props.modelValue.split) return ''
  if (props.memberCount <= 0) return '先加團員'
  const { each, sell } = lootSplit(props.modelValue, props.memberCount)
  return sell > 0 ? `每人 ${each}・賣 ${sell}` : `每人 ${each}`
})
const priceHints = computed(() =>
  history.priceSuggestions(props.modelValue.name).map((p) => `${p.price}（${p.date}）`),
)
</script>

<template>
  <tr>
    <td class="drag-cell"><span class="drag-handle" draggable="true" title="拖拉排序" @dragstart="emit('grab', $event)">⠿</span></td>
    <td>
      <button type="button" class="chip" :class="STATUS_META[modelValue.status].cls" @click="cycleStatus">
        {{ STATUS_META[modelValue.status].label }}
      </button>
    </td>
    <td class="name-cell">
      <AutocompleteInput
        :model-value="modelValue.name"
        :suggestions="nameSuggestions"
        :loading="history.itemNamesLoading.value"
        placeholder="品名"
        fuzzy
        @update:model-value="patch({ name: $event })"
      />
    </td>
    <td>
      <input type="number" class="cell-num" :value="modelValue.unitPrice ?? ''"
        :title="priceHints.length ? '歷史：' + priceHints.join(' / ') : ''"
        placeholder="單價" autocomplete="off"
        @input="patch({ unitPrice: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })" />
    </td>
    <td>
      <input type="number" class="cell-num sm" :value="modelValue.qty ?? ''" placeholder="數量"
        @input="patch({ qty: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })" />
    </td>
    <td class="split-cell">
      <label class="split-toggle">
        <input type="checkbox" :checked="!!modelValue.split"
          @change="patch({ split: ($event.target as HTMLInputElement).checked || undefined })" />
        <span v-if="splitText" class="split-text">{{ splitText }}</span>
      </label>
    </td>
    <td>
      <input type="number" class="cell-num" :value="modelValue.scissorUnitPrice ?? ''" placeholder="剪刀價"
        @input="patch({ scissorUnitPrice: Number(($event.target as HTMLInputElement).value) || undefined })" />
    </td>
    <td>
      <input type="number" class="cell-num sm" :value="modelValue.scissorCount ?? ''" placeholder="剪刀數"
        @input="patch({ scissorCount: Number(($event.target as HTMLInputElement).value) || undefined })" />
    </td>
    <td>
      <input class="cell-note" :value="modelValue.note ?? ''" placeholder="註解"
        @input="patch({ note: ($event.target as HTMLInputElement).value || undefined })" />
    </td>
    <td class="num net">{{ net }}</td>
    <td><button type="button" class="btn btn-icon btn-danger" title="移除" @click="emit('remove')">✕</button></td>
  </tr>
</template>

<style scoped>
.name-cell { min-width: 150px; }
.cell-num { width: 6em; }
.cell-num.sm { width: 4.5em; }
.cell-note { min-width: 110px; }
.net { font-weight: 650; white-space: nowrap; }
.split-cell { white-space: nowrap; }
.split-toggle { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.split-text { font-size: 12.5px; color: var(--text-muted); }
</style>
