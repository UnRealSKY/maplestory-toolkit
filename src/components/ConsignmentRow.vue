<script setup lang="ts">
import { computed } from 'vue'
import type { Consignment } from '../types'
import { consignmentValue } from '../calc/distribution'
import { useHistory } from '../store/history'
import { displayNameIn } from '../store/groups'
import AutocompleteInput from './AutocompleteInput.vue'

const props = defineProps<{ modelValue: Consignment; memberHandles: string[]; groupId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: Consignment]; remove: []; grab: [e: DragEvent] }>()
const history = useHistory()

function patch(part: Partial<Consignment>) {
  emit('update:modelValue', { ...props.modelValue, ...part })
}
const value = computed(() => consignmentValue(props.modelValue))
</script>

<template>
  <tr>
    <td class="drag-cell"><span class="drag-handle" draggable="true" title="拖拉排序" @dragstart="emit('grab', $event)">⠿</span></td>
    <td class="seller-cell">
      <select :value="modelValue.seller"
        @change="patch({ seller: ($event.target as HTMLSelectElement).value })">
        <option value="">選擇團員…</option>
        <option v-for="h in memberHandles" :key="h" :value="h">{{ displayNameIn(groupId, h) }}</option>
        <option v-if="modelValue.seller && !memberHandles.includes(modelValue.seller)" :value="modelValue.seller">
          {{ displayNameIn(groupId, modelValue.seller) }}（非團員）
        </option>
      </select>
    </td>
    <td class="name-cell">
      <AutocompleteInput :model-value="modelValue.name" :suggestions="history.itemNames.value"
        :loading="history.itemNamesLoading.value"
        placeholder="品名 / 說明" fuzzy @update:model-value="patch({ name: $event })" />
    </td>
    <td><input type="number" class="cell-num" :value="modelValue.unitPrice" placeholder="單價"
      @input="patch({ unitPrice: Number(($event.target as HTMLInputElement).value) })" /></td>
    <td><input type="number" class="cell-num sm" :value="modelValue.qty"
      @input="patch({ qty: Number(($event.target as HTMLInputElement).value) })" /></td>
    <td><input type="number" class="cell-num" :value="modelValue.scissorUnitPrice ?? ''" placeholder="剪刀價"
      @input="patch({ scissorUnitPrice: Number(($event.target as HTMLInputElement).value) || undefined })" /></td>
    <td><input type="number" class="cell-num sm" :value="modelValue.scissorCount ?? ''" placeholder="剪刀數"
      @input="patch({ scissorCount: Number(($event.target as HTMLInputElement).value) || undefined })" /></td>
    <td class="num val">{{ value }}</td>
    <td><button type="button" class="btn btn-icon btn-danger" title="移除" @click="emit('remove')">✕</button></td>
  </tr>
</template>

<style scoped>
.seller-cell { min-width: 150px; }
.name-cell { min-width: 140px; }
.cell-num { width: 6em; }
.cell-num.sm { width: 4.5em; }
.val { font-weight: 650; white-space: nowrap; }
</style>
