<script setup lang="ts">
import { computed } from 'vue'
import type { SplitDrop } from '../types'
import { perMember } from '../calc/splitDrops'
import { useHistory } from '../store/history'
import AutocompleteInput from './AutocompleteInput.vue'

const props = defineProps<{ modelValue: SplitDrop; memberCount: number; groupId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: SplitDrop]; remove: [] }>()
const history = useHistory()

function patch(part: Partial<SplitDrop>) {
  emit('update:modelValue', { ...props.modelValue, ...part })
}
// 每人幾個；除不盡就是除不盡，這裡標出來、發佈那邊會擋
const each = computed(() => perMember(props.modelValue.qty, props.memberCount))
const eachText = computed(() => {
  if (each.value != null) return String(each.value)
  if (props.memberCount <= 0) return '⚠ 先加團員'
  return `⚠ 無法均分 ${props.memberCount} 人`
})
</script>

<template>
  <tr>
    <td class="name-cell">
      <AutocompleteInput :model-value="modelValue.name" :suggestions="history.itemNames.value"
        :loading="history.itemNamesLoading.value"
        placeholder="品名 / 說明" fuzzy @update:model-value="patch({ name: $event })" />
    </td>
    <td><input type="number" class="cell-num sm" :value="modelValue.qty" min="1"
      @input="patch({ qty: Number(($event.target as HTMLInputElement).value) })" /></td>
    <td class="num split-each" :class="{ 'split-warn': each == null }">{{ eachText }}</td>
    <td><button type="button" class="btn btn-icon btn-danger" title="移除" @click="emit('remove')">✕</button></td>
  </tr>
</template>

<style scoped>
.name-cell { min-width: 160px; }
.cell-num.sm { width: 4.5em; }
.split-each { font-weight: 650; white-space: nowrap; }
.split-warn { color: var(--warn); }
</style>
