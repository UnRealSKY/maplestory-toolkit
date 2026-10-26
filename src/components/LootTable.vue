<script setup lang="ts">
import type { LootItem } from '../types'
import LootRow from './LootRow.vue'
import { useRowDrag } from './rowDrag'
import { moveItem } from '../store/groups'

const props = defineProps<{ modelValue: LootItem[]; memberCount: number }>()
const emit = defineEmits<{ 'update:modelValue': [v: LootItem[]] }>()

// 拖拉把手排序
const { over: dropOver, start: startDrag, enter: dragEnter, end: endDrag, drop: dropRow } =
  useRowDrag((from, to) => emit('update:modelValue', moveItem(props.modelValue, from, to)))

// 同一個表別列已經用過的品名，不再出現在這一列的選單
function takenBy(i: number): string[] {
  return props.modelValue.filter((_, j) => j !== i).map((x) => x.name.trim()).filter(Boolean)
}

function updateAt(i: number, item: LootItem) {
  const next = [...props.modelValue]
  next[i] = item
  emit('update:modelValue', next)
}
function removeAt(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
function add() {
  emit('update:modelValue', [
    ...props.modelValue,
    { status: 'cart', name: '', qty: null, unitPrice: null, id: crypto.randomUUID() },
  ])
}
</script>

<template>
  <div class="card">
    <div class="section-head">
      <h3>總表</h3>
      <span class="count">{{ modelValue.length }} 項</span>
      <div class="spacer" />
      <button type="button" class="btn btn-sm" @click="add">＋ 新增項目</button>
    </div>
    <p v-if="!modelValue.length" class="muted">尚無項目。</p>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr><th></th><th>狀態</th><th>品名</th><th class="num">單價</th><th class="num">數量</th><th title="可整除人數的部分直接分給每個人，剩下的照單價賣">均分</th><th class="num">剪刀價</th><th class="num">剪刀數</th><th>註解</th><th class="num">淨額</th><th></th></tr>
        </thead>
        <tbody>
          <LootRow
            v-for="(it, i) in modelValue"
            :key="it.id"
            :model-value="it"
            :taken="takenBy(i)"
            :member-count="memberCount"
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
