<script setup lang="ts">
import { computed } from 'vue'
import type { Purchase } from '../types'
import { purchaseValue, purchaseCharge, roundDisplay } from '../calc/distribution'
import { useHistory } from '../store/history'
import { displayNameIn } from '../store/groups'
import AutocompleteInput from './AutocompleteInput.vue'

const props = defineProps<{ modelValue: Purchase; memberHandles: string[]; memberCount: number; groupId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: Purchase]; remove: []; grab: [e: DragEvent] }>()
const history = useHistory()

function patch(part: Partial<Purchase>) {
  emit('update:modelValue', { ...props.modelValue, ...part })
}
const isSplit = computed(() => props.modelValue.mode === 'split')
function toggleMode() {
  patch({ mode: isSplit.value ? undefined : 'split' })
}
// 金額欄顯示買家實付：均攤為原價 1/N
const value = computed(() => roundDisplay(purchaseCharge(props.modelValue, props.memberCount)))
const fullValue = computed(() => purchaseValue(props.modelValue))
</script>

<template>
  <tr>
    <td class="drag-cell"><span class="drag-handle" draggable="true" title="拖拉排序" @dragstart="emit('grab', $event)">⠿</span></td>
    <td class="buyer-cell">
      <select :value="modelValue.buyer"
        @change="patch({ buyer: ($event.target as HTMLSelectElement).value })">
        <option value="">選擇團員…</option>
        <option v-for="h in memberHandles" :key="h" :value="h">{{ displayNameIn(groupId, h) }}</option>
        <option v-if="modelValue.buyer && !memberHandles.includes(modelValue.buyer)" :value="modelValue.buyer">
          {{ displayNameIn(groupId, modelValue.buyer) }}（非團員）
        </option>
      </select>
    </td>
    <td class="name-cell">
      <AutocompleteInput :model-value="modelValue.name" :suggestions="history.itemNames.value"
        :loading="history.itemNamesLoading.value"
        placeholder="品名" fuzzy @update:model-value="patch({ name: $event })" />
    </td>
    <td><input type="number" class="cell-num" :value="modelValue.unitPrice" placeholder="單價"
      @input="patch({ unitPrice: Number(($event.target as HTMLInputElement).value) })" /></td>
    <td><input type="number" class="cell-num sm" :value="modelValue.qty"
      @input="patch({ qty: Number(($event.target as HTMLInputElement).value) })" /></td>
    <td>
      <button type="button" class="chip" :class="isSplit ? 'chip-cart' : 'chip-struck'"
        :title="isSplit ? '均攤：買家只付原價的 1/N，由其他人分' : '全額：買家付全額，由其他人分'"
        @click="toggleMode">{{ isSplit ? '均攤' : '全額' }}</button>
    </td>
    <td class="num val" :title="isSplit ? `原價 ${fullValue}，均攤 1/${memberCount}` : ''">{{ value }}</td>
    <td><button type="button" class="btn btn-icon btn-danger" title="移除" @click="emit('remove')">✕</button></td>
  </tr>
</template>

<style scoped>
.buyer-cell { min-width: 150px; }
.name-cell { min-width: 140px; }
.cell-num { width: 6em; }
.cell-num.sm { width: 4.5em; }
.val { font-weight: 650; white-space: nowrap; }
</style>
