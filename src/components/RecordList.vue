<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useRecordsStore } from '../store/records'
import { allSold, allSettled } from '../calc/status'
import { dcSyncStatus } from '../dc/publish'
import { groupOf, channelOf } from '../store/groups'
import type { LootRecord } from '../types'
import ImportDialog from './ImportDialog.vue'

const store = useRecordsStore()
const router = useRouter()

// 依日期新到舊排序；同日期再依團名，空日期排最後
const sorted = computed(() =>
  [...store.records].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.boss.localeCompare(b.boss)
  }),
)

// 紀錄屬於哪個群組（沒設 groupId 的舊紀錄跟著第一個群組走，與名冊、統計同一套判定）
function groupName(groupId?: string, channelId?: string): string {
  const g = groupOf(groupId)
  if (!g) return ''
  const c = channelOf(groupId, channelId)
  return c ? `${g.name} › #${c.name}` : g.name
}

const showImport = ref(false)

function createNew() {
  const r = store.create()
  router.push(`/loot/edit/${r.id}`)
}

function onImported(parsed: LootRecord) {
  const r = store.create({ ...parsed })
  router.push(`/loot/edit/${r.id}`)
}

function remove(id: string) {
  if (window.confirm('確定刪除這筆紀錄？')) store.remove(id)
}

function duplicate(id: string) {
  store.duplicate(id)
}

function toggleShelve(id: string) {
  const r = store.get(id)
  if (!r) return
  store.upsert({ ...r, shelved: !r.shelved })
}
</script>

<template>
  <section>
    <div class="page-head">
      <h2>分寶紀錄</h2>
      <div class="toolbar">
        <button class="btn" @click="showImport = true">貼上 DC 匯入</button>
        <button class="btn btn-primary" @click="createNew">＋ 新增紀錄</button>
      </div>
    </div>

    <ImportDialog :open="showImport" @close="showImport = false" @imported="onImported" />

    <div v-if="!sorted.length" class="empty">
      尚無紀錄，點右上角「新增紀錄」或「貼上 DC 匯入」開始。
    </div>

    <ul v-else class="record-list">
      <li v-for="r in sorted" :key="r.id" class="record-card">
        <router-link :to="`/loot/edit/${r.id}`" class="record-main">
          <span class="record-title">{{ r.boss || '(未命名)' }}</span>
          <span class="record-meta">
            <span v-if="groupName(r.groupId, r.channelId)" class="record-group">{{ groupName(r.groupId, r.channelId) }}</span>
            <span v-if="r.date">{{ r.date }}</span>
            <span v-if="r.members.length">{{ r.members.length }} 人</span>
          </span>
        </router-link>
        <div class="record-status">
          <span v-if="r.shelved" class="badge badge-shelved">⏸ 擱置中</span>
          <span v-if="dcSyncStatus(r) === 'synced'" class="badge badge-done">✓ DC 已同步</span>
          <span v-else-if="dcSyncStatus(r) === 'dirty'" class="badge badge-warn">● DC 未同步</span>
          <span v-else-if="dcSyncStatus(r) === 'published'" class="badge badge-pending">已發佈 DC</span>
          <span class="badge" :class="allSold(r) ? 'badge-done' : 'badge-pending'">
            {{ allSold(r) ? '✓ 全數賣出' : '● 待售出' }}
          </span>
          <span class="badge" :class="allSettled(r) ? 'badge-done' : 'badge-pending'">
            {{ allSettled(r) ? '✓ 全部結清' : '● 未結清' }}
          </span>
        </div>
        <div class="record-actions">
          <button class="btn btn-icon" :class="{ shelving: r.shelved }"
            :title="r.shelved ? '取消擱置' : '擱置（暫不列入未領總覽）'"
            @click="toggleShelve(r.id)">⏸</button>
          <button class="btn btn-icon" title="複製" @click="duplicate(r.id)">⧉</button>
          <button class="btn btn-icon btn-danger" title="刪除" @click="remove(r.id)">🗑</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.page-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 680; flex: 1; }

.record-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.record-card {
  display: flex; align-items: center; gap: 12px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow-sm);
  padding: 4px 8px 4px 16px; transition: border-color .14s, box-shadow .14s, transform .06s;
}
.record-card:hover { border-color: var(--border-strong); box-shadow: var(--shadow-md); }
.record-main {
  flex: 1; display: flex; flex-direction: column; gap: 2px;
  text-decoration: none; color: inherit; padding: 10px 0; min-width: 0;
}
.record-title { font-weight: 600; font-size: 15px; }
.record-meta { display: flex; gap: 12px; align-items: center; font-size: 12.5px; color: var(--text-muted); flex-wrap: wrap; }
.record-group {
  padding: 1px 8px; border-radius: 999px; font-weight: 650;
  background: var(--primary-soft); color: var(--primary);
}
.record-actions { display: flex; gap: 4px; flex: none; }
.record-status { display: flex; gap: 6px; flex: none; flex-wrap: wrap; justify-content: flex-end; }
.badge { padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.badge-done { background: var(--success-soft); color: var(--success); }
.badge-pending { background: var(--surface-2); color: var(--text-muted); }
.badge-shelved { background: var(--warn-soft); color: var(--warn); }
.badge-warn { background: var(--warn-soft); color: var(--warn); }
.record-actions .shelving { background: var(--warn-soft); color: var(--warn); border-color: var(--warn); }
</style>
