<script setup lang="ts">
import { ref, watch } from 'vue'
import { renderMarkdown } from '../format/markdown'

// 顯示一份 repo 上的 markdown（更新內容、說明）。內容點開才抓：多數時候沒人會看，
// 開站不必多打一個 request；抓過一次就留著，同一個分頁再開不重抓。
const props = defineProps<{
  open: boolean
  title: string
  pageUrl: string // 抓不到時給人去 GitHub 看的頁面
  load: () => Promise<string> // 回傳已處理好連結的 markdown
  wide?: boolean // 說明有圖跟表格，要寬一點
}>()
const emit = defineEmits<{ close: [] }>()

const html = ref('')
const busy = ref(false)
const error = ref('')

async function fetchOnce() {
  if (html.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    html.value = renderMarkdown(await props.load())
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

// immediate：一掛上就是打開的也要抓
watch(() => props.open, (isOpen) => isOpen && fetchOnce(), { immediate: true })
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <div class="dialog" :class="{ wide }">
      <div class="head">
        <h3>{{ title }}</h3>
        <div class="spacer" />
        <button type="button" class="btn btn-icon" title="關閉" @click="emit('close')">✕</button>
      </div>

      <p v-if="busy" class="muted">載入中…</p>
      <p v-else-if="error" class="field-error">
        無法載入（{{ error }}）。可以直接到
        <a :href="pageUrl" target="_blank" rel="noopener">GitHub</a> 看。
      </p>
      <!-- 內容來自本專案自己的 repo，不是使用者輸入 -->
      <div v-else class="md" v-html="html" />

      <div class="foot">
        <a :href="pageUrl" target="_blank" rel="noopener" class="muted">在 GitHub 看 ↗</a>
        <div class="spacer" />
        <button type="button" class="btn btn-primary" @click="emit('close')">知道了</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  background: rgba(17, 24, 39, .5); backdrop-filter: blur(2px); padding: 20px;
}
.dialog {
  display: flex; flex-direction: column;
  background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-lg);
  padding: 18px 20px; width: min(680px, 94vw); max-height: 80vh;
}
.dialog.wide { width: min(960px, 94vw); max-height: 88vh; }
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.head h3 { margin: 0; font-size: 16px; font-weight: 650; }
.head .spacer, .foot .spacer { flex: 1; }
.foot { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 13px; }

.md { overflow-y: auto; font-size: 14px; line-height: 1.7; }
.md :deep(h1) { font-size: 15px; font-weight: 650; color: var(--text-muted); margin: 0 0 10px; }
.md :deep(h2) {
  font-size: 15px; font-weight: 750; margin: 18px 0 6px; padding-top: 12px;
  border-top: 1px solid var(--border);
}
.md :deep(h2:first-of-type) { border-top: none; padding-top: 0; margin-top: 0; }
.md :deep(h3) { font-size: 13px; font-weight: 650; color: var(--text-muted); margin: 10px 0 4px; }
.md :deep(ul), .md :deep(ol) { margin: 0; padding-left: 20px; }
.md :deep(li) { margin: 5px 0; }
.md :deep(p) { margin: 6px 0; }
.md :deep(blockquote) {
  margin: 8px 0; padding: 6px 12px; border-left: 3px solid var(--border);
  color: var(--text-muted); background: var(--surface-2); border-radius: 0 6px 6px 0;
}
.md :deep(code) {
  font-family: var(--mono); font-size: 12.5px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 5px; padding: 1px 5px;
}
.md :deep(a) { color: var(--primary-hover); }
.md :deep(img) { max-width: 100%; border-radius: var(--radius-sm); margin: 8px 0; }
.md :deep(table) { border-collapse: collapse; margin: 8px 0; font-size: 13.5px; }
.md :deep(th), .md :deep(td) { border: 1px solid var(--border); padding: 4px 10px; text-align: left; }
.md :deep(th) { background: var(--surface-2); font-weight: 650; }
</style>
