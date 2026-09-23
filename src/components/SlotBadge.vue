<script setup lang="ts">
import { computed, inject } from 'vue'
import { bindings, extensionReady } from '../hotkey/bridge'

// 按鈕角落的一個小標，告訴你這顆的快捷鍵是哪個。
// 沒裝擴充套件就整個不出現——大多數人不會裝，不能讓他們看到一堆空徽章。
// 子母畫面那份也不畫：小視窗寸土寸金，會用快捷鍵的人根本不需要看。
const props = defineProps<{ slot: number }>()

const compact = inject<boolean>('pipCompact', false)
const key = computed(() => bindings.value[`slot${props.slot}`] ?? '')
const show = computed(() => extensionReady.value && !compact)
</script>

<template>
  <span v-if="show" class="slot-badge" :class="{ 'slot-unbound': !key }">
    {{ key || `未綁 ${slot}` }}
  </span>
</template>

<style scoped>
.slot-badge {
  position: absolute; top: 3px; right: 5px;
  font-size: 10.5px; font-weight: 650; font-family: var(--mono);
  padding: 1px 4px; border-radius: 5px;
  background: rgba(0, 0, 0, .10); color: var(--text-muted);
  pointer-events: none;
}
.slot-unbound { background: var(--warn-soft); color: var(--warn); }
</style>
