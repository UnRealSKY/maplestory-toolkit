<script setup lang="ts">
import type { Consignment, Member } from '../types'
import { computed } from 'vue'
import ConsignmentRow from './ConsignmentRow.vue'
import { useRowDrag } from './rowDrag'
import { moveItem } from '../store/groups'

const props = defineProps<{ modelValue: Consignment[]; members: Member[]; groupId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: Consignment[]] }>()

const memberHandles = computed(() => props.members.map((m) => m.handle).filter(Boolean))

// 拖拉把手排序
const { over: dropOver, start: startDrag, enter: dragEnter, end: endDrag, drop: dropRow } =
  useRowDrag((from, to) => emit('update:modelValue', moveItem(props.modelValue, from, to)))

function updateAt(i: number, c: Consignment) {
  const next = [...props.modelValue]
  next[i] = c
  emit('update:modelValue', next)
}
function removeAt(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
function add() {
  emit('update:modelValue', [
    ...props.modelValue,
    { seller: '', name: '', qty: 1, unitPrice: 0, id: crypto.randomUUID() },
  ])
}
</script>

<template>
  <div class="card">
    <div class="section-head">
      <h3>代售</h3>
      <span class="count">{{ modelValue.length }} 筆</span>
      <div class="spacer" />
      <button type="button" class="btn btn-sm" @click="add">＋ 新增代售</button>
    </div>
    <p v-if="!modelValue.length" class="muted">尚無代售。</p>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th></th><th>代售者</th><th>品名 / 說明</th><th class="num">單價</th><th class="num">數量</th><th class="num">剪刀價</th><th class="num">剪刀數</th><th class="num">金額</th><th></th></tr></thead>
        <tbody>
          <ConsignmentRow
            v-for="(c, i) in modelValue"
            :key="c.id"
            :model-value="c"
            :member-handles="memberHandles"
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
