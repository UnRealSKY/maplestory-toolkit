<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecordsStore } from '../store/records'
import { displayNameIn, distOptionsFor } from '../store/groups'
import { pendingBlocks } from '../format/pending'

const store = useRecordsStore()
const router = useRouter()

// 開新分頁進編輯頁並跳至分配名單（focus=dist 由 RecordEditor 處理捲動）
function editHref(recordId: string): string {
  return router.resolve({ path: `/loot/edit/${recordId}`, query: { focus: 'dist' } }).href
}
const blocks = computed(() => pendingBlocks(store.records, (handle, groupId) => displayNameIn(groupId, handle), distOptionsFor))

const copiedKey = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = key
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copiedKey.value = ''), 1500)
  } catch {
    // 剪貼簿不可用（如非 https）時僅不顯示回饋
  }
}

// 錢與實物各自標記領了；哪一部分領了，那部分就從畫面消失
function markReceived(recordId: string, handle: string, field: 'settle' | 'dropsSettle') {
  const r = store.get(recordId)
  if (!r) return
  store.upsert({
    ...r,
    members: r.members.map((m) => (m.handle === handle ? { ...m, [field]: 'settled' as const } : m)),
  })
}
</script>

<template>
  <section>
    <div class="page-head">
      <h2>未領總覽</h2>
    </div>

    <div v-if="!blocks.length" class="empty">目前沒有未結清款項。</div>

    <div v-for="b in blocks" :key="b.handle" class="card">
      <div class="section-head">
        <h3>{{ b.display }}</h3>
        <span class="count">{{ b.records.length }} 場未領</span>
        <div class="spacer" />
        <span class="block-total">應領 {{ b.total }}</span>
      </div>

      <div v-for="rec in b.records" :key="rec.recordId" class="rec-group">
        <div v-for="(line, i) in rec.lines" :key="i" class="line">
          <code class="line-text">{{ line }}</code>
          <span v-if="i === 0 && rec.hasCart" class="chip chip-cart cart-note" title="金額可能變動">尚有待售</span>
          <a v-if="i === 0" class="btn btn-sm open-btn" :href="editHref(rec.recordId)"
            target="_blank" rel="noopener" title="開新分頁編輯並跳至分配名單">開啟 ↗</a>
          <button v-if="i === rec.lines.length - 1 && rec.moneyPending" type="button" class="chip chip-pending"
            title="這場的錢已經交給他" @click="markReceived(rec.recordId, b.handle, 'settle')">錢已領</button>
          <button v-if="i === rec.lines.length - 1 && rec.dropsPending" type="button" class="chip chip-pending"
            title="這場均分的實物已經交給他" @click="markReceived(rec.recordId, b.handle, 'dropsSettle')">掉落物已領</button>
          <button type="button" class="btn btn-sm copy-btn"
            @click="copy(line, `${b.handle}:${rec.recordId}:${i}`)">
            {{ copiedKey === `${b.handle}:${rec.recordId}:${i}` ? '✓' : '複製' }}
          </button>
        </div>
      </div>

      <div class="line total-line">
        <code class="line-text">{{ b.totalLine }}</code>
        <button type="button" class="btn btn-sm copy-btn" @click="copy(b.totalLine, `${b.handle}:total`)">
          {{ copiedKey === `${b.handle}:total` ? '✓' : '複製' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 680; flex: 1; }

.block-total { font-weight: 680; color: var(--primary-hover); white-space: nowrap; }

.rec-group { padding: 8px 0; border-bottom: 1px dashed var(--border); }
.line { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.line-text {
  flex: 1; min-width: 0; overflow-x: auto;
  font-family: var(--mono); font-size: 13px; white-space: nowrap;
  background: var(--surface-2); padding: 6px 10px; border-radius: 6px;
}
.copy-btn { flex: none; min-width: 58px; }
.open-btn { flex: none; text-decoration: none; }
.cart-note { cursor: default; }
.total-line { padding-top: 10px; }
.total-line .line-text { font-weight: 650; }
</style>
