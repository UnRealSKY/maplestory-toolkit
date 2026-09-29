<script setup lang="ts">
import type { SplitDrop } from '../types'
import SplitDropRow from './SplitDropRow.vue'

// 掉落物均分：實物平分給每個人，跟錢無關。這裡只管清單；每人幾個、除不盡的提醒在列裡算。
const props = defineProps<{ modelValue: SplitDrop[]; memberCount: number; groupId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: SplitDrop[]] }>()

function updateAt(i: number, d: SplitDrop) {
  const next = [...props.modelValue]
  next[i] = d
  emit('update:modelValue', next)
}
function removeAt(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i))
}
function add() {
  emit('update:modelValue', [...props.modelValue, { name: '', qty: 1, id: crypto.randomUUID() }])
}
</script>

<template>
  <div class="card">
    <div class="section-head">
      <h3>掉落物均分區</h3>
      <span class="count">{{ modelValue.length }} 筆</span>
      <div class="spacer" />
      <button type="button" class="btn btn-sm" @click="add">＋ 新增均分</button>
    </div>
    <p v-if="!modelValue.length" class="muted">尚無均分。</p>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th>品名 / 說明</th><th class="num">總數</th><th class="num">每人</th><th></th></tr></thead>
        <tbody>
          <SplitDropRow
            v-for="(d, i) in modelValue"
            :key="d.id"
            :model-value="d"
            :member-count="memberCount"
            :group-id="groupId"
            @update:model-value="updateAt(i, $event)"
            @remove="removeAt(i)"
          />
        </tbody>
      </table>
    </div>
  </div>
</template>
