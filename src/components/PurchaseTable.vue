<script setup lang="ts">
import type { Purchase, Member } from '../types'
import { computed } from 'vue'
import PurchaseRow from './PurchaseRow.vue'
import { useRowDrag } from './rowDrag'
import { moveItem } from '../store/groups'

const props = defineProps<{ modelValue: Purchase[]; members: Member[]; groupId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: Purchase[]] }>()

const memberHandles = computed(() => props.members.map((m) => m.handle).filter(Boolean))

// 拖拉把手排序
const { over: dropOver, start: startDrag, enter: dragEnter, end: endDrag, drop: dropRow } =
  useRowDrag((from, to) => emit('update:modelValue', moveItem(props.modelValue, from, to)))

function updateAt(i: number, p: Purchase) {
  const next = [...props.modelValue]
  next[i] = p
  emit('update:modelValue', next)
}
function removeAt(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
function add() {
  emit('update:modelValue', [
    ...props.modelValue,
    { buyer: '', name: '', qty: 1, unitPrice: 0, id: crypto.randomUUID() },
  ])
}
</script>

<template>
  <div class="card">
    <div class="section-head">
      <h3>內購區</h3>
      <span class="count">{{ modelValue.length }} 筆</span>
      <div class="spacer" />
      <button type="button" class="btn btn-sm" @click="add">＋ 新增內購</button>
    </div>
    <p v-if="!modelValue.length" class="muted">尚無內購。</p>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th></th><th>買家</th><th>品名</th><th class="num">單價</th><th class="num">數量</th><th>模式</th><th class="num">實付</th><th></th></tr></thead>
        <tbody>
          <PurchaseRow
            v-for="(p, i) in modelValue"
            :key="p.id"
            :model-value="p"
            :member-handles="memberHandles"
            :member-count="members.length"
            :group-id="groupId"
            :class="{ 'drop-target': dropOver === i }"
            @grab="startDrag(i, $event)" @dragover="dragEnter(i, $event)"
            @drop.prevent="dropRow(i)" @dragend="endDrag"
            @update:model-value="updateAt(i, $event)"
            @remove="removeAt(i)"
          />
        </tbody>
      </table>
    </div>
  </div>
</template>
