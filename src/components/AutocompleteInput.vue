<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { fuzzyFilter } from '../fuzzy'

const props = defineProps<{
  modelValue: string
  suggestions: string[]
  placeholder?: string
  labelFor?: (value: string) => string  // 下拉顯示文字（如別名），選取仍存原 value
  tagFor?: (value: string) => string    // 下拉文字後面的小標（如「常駐」）；空字串＝不標
  fuzzy?: boolean                       // 改用模糊比對（品名搜尋用）
  loading?: boolean                     // 名單背景載入中：無建議時顯示載入提示列
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [value: string]
}>()

const open = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

// 下拉用 fixed 定位（依輸入框位置），避免被表格 overflow 容器裁切
function updatePos() {
  const el = inputRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  menuStyle.value = {
    top: `${r.bottom + 4}px`,
    left: `${r.left}px`,
    minWidth: `${r.width}px`,
  }
}
function onScrollResize() {
  if (open.value) updatePos()
}
onMounted(() => {
  window.addEventListener('scroll', onScrollResize, true)
  window.addEventListener('resize', onScrollResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScrollResize, true)
  window.removeEventListener('resize', onScrollResize)
})

function openMenu() {
  open.value = true
  updatePos()
}

function label(s: string): string {
  return props.labelFor ? props.labelFor(s) : s
}

const filtered = computed(() => {
  const q = props.modelValue.trim()
  if (props.fuzzy) return fuzzyFilter(q, props.suggestions)
  if (!q) return props.suggestions.slice(0, 20)
  // value 以前綴比對；另有 labelFor（別名）時，額外允許以顯示文字子字串比對
  return props.suggestions
    .filter((s) => s.startsWith(q) || (props.labelFor ? props.labelFor(s).includes(q) : false))
    .slice(0, 20)
})

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
  openMenu()
}

function choose(s: string) {
  emit('update:modelValue', s)
  emit('select', s)
  open.value = false
}
</script>

<template>
  <div class="autocomplete">
    <input
      ref="inputRef"
      :value="modelValue"
      :placeholder="placeholder"
      @input="onInput"
      @focus="openMenu"
      @blur="open = false"
    />
    <ul v-if="open && (filtered.length || loading)" class="suggestions" :style="menuStyle">
      <li
        v-for="s in filtered"
        :key="s"
        class="suggestion"
        @mousedown.prevent="choose(s)"
      >
        {{ label(s) }}<span v-if="tagFor?.(s)" class="chip chip-ok suggestion-tag">{{ tagFor(s) }}</span>
      </li>
      <li v-if="loading && !filtered.length" class="loading-row">⋯ 名單載入中</li>
    </ul>
  </div>
</template>

<style scoped>
.autocomplete { position: relative; }
.suggestions {
  position: fixed; z-index: 1000;
  margin: 0; padding: 4px; list-style: none;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-sm); box-shadow: var(--shadow-lg);
  max-height: 240px; overflow-y: auto; min-width: 140px;
}
.suggestion { padding: 6px 10px; cursor: pointer; border-radius: 6px; font-size: 14px; white-space: nowrap; }
.suggestion-tag { margin-left: 6px; padding: 1px 7px; font-size: 11.5px; }
.suggestion:hover { background: var(--primary-soft); color: var(--primary-hover); }
.loading-row { padding: 6px 10px; font-size: 13px; color: var(--text-muted); white-space: nowrap; }
</style>
