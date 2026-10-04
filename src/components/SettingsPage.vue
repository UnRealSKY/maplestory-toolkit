<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  useGroups,
  activeGroup,
  setActiveGroup,
  createGroup,
  patchGroup,
  deleteGroup,
  createChannel,
  patchChannel,
  deleteChannel,
  moveGroup,
  moveChannelTo,
  countRecordsIn,
  countRecordsInChannel,
  leaderFeeEnabled,
  rosterLoading,
  type DcGroup,
  type RosterMode,
} from '../store/groups'
import { fetchRoster, type RosterEntry } from '../store/roster'
import { normalizeWebhookUrl, getWebhook, type WebhookInfo } from '../dc/webhook'
import { useRecordsStore } from '../store/records'
import {
  sharedItemNames,
  itemsSource,
  setItemsSource,
  fetchItems,
  saveItemsLocal,
  initSharedItems,
  sharedItemsLoading,
} from '../store/sharedItems'
import type { ListSourceMode } from '../store/roster'

const ITEM_MODES: Array<{ value: ListSourceMode; label: string }> = [
  { value: 'default', label: '預設來源' },
  { value: 'url', label: '自訂 URL' },
  { value: 'local', label: '自行輸入' },
]
const ROSTER_MODES: Array<{ value: RosterMode; label: string }> = [
  { value: 'url', label: '自訂 URL' },
  { value: 'local', label: '自行輸入' },
]

const { groups, activeId } = useGroups()
const store = useRecordsStore()
const current = computed<DcGroup | undefined>(() => activeGroup())

// ---- 伺服器本身 ----
function addGroupRow() {
  const name = window.prompt('新伺服器名稱：', `伺服器 ${groups.value.length + 1}`)
  if (name?.trim()) createGroup(name.trim())
}

function renameGroup(name: string) {
  if (current.value) patchGroup(current.value.id, { name })
}

// 綁著紀錄的伺服器不能刪：那些紀錄的名冊與頻道都靠它，刪掉會讓金額顯示與發佈目標一起錯亂
const boundCount = computed(() =>
  current.value ? countRecordsIn(store.records, groups.value, current.value.id) : 0,
)
const deleteBlockReason = computed(() => {
  if (groups.value.length <= 1) return '至少要保留一個伺服器'
  if (boundCount.value) return `還有 ${boundCount.value} 筆紀錄綁在這個伺服器，請先把它們改到別的伺服器`
  return ''
})

function removeCurrent() {
  const g = current.value
  if (!g || deleteBlockReason.value) return
  if (window.confirm(`確定刪除伺服器「${g.name}」？`)) deleteGroup(g.id)
}

// ---- 頻道（每個頻道一條 webhook）----
function addChannelRow() {
  const g = current.value
  if (!g) return
  const name = window.prompt('新頻道名稱：', `頻道 ${g.channels.length + 1}`)
  if (name?.trim()) createChannel(g.id, name.trim())
}

// 綁著紀錄的頻道不能刪；最後一個也不能刪，伺服器不能沒有頻道
function channelDeleteReason(channelId: string): string {
  const g = current.value
  if (!g) return ''
  if (g.channels.length <= 1) return '至少要保留一個頻道'
  const n = countRecordsInChannel(store.records, groups.value, channelId)
  return n ? `還有 ${n} 筆紀錄發到這個頻道，請先把它們改到別的頻道` : ''
}

function removeChannelRow(channelId: string) {
  const g = current.value
  if (!g || channelDeleteReason(channelId)) return
  const c = g.channels.find((x) => x.id === channelId)
  if (c && window.confirm(`確定刪除頻道「${c.name}」？`)) deleteChannel(g.id, channelId)
}

// 驗證狀態依頻道各記各的，驗了這條不會把另一條的結果洗掉
const hookBusy = ref('')
const hookError = ref<Record<string, string>>({})
const hookInfo = ref<Record<string, WebhookInfo | undefined>>({})

async function verifyHook(channelId: string) {
  const g = current.value
  const c = g?.channels.find((x) => x.id === channelId)
  if (!g || !c) return
  hookError.value = { ...hookError.value, [channelId]: '' }
  hookInfo.value = { ...hookInfo.value, [channelId]: undefined }
  const norm = normalizeWebhookUrl(c.webhookUrl)
  if (!norm.ok) {
    hookError.value = { ...hookError.value, [channelId]: norm.error }
    return
  }
  hookBusy.value = channelId
  try {
    const info = await getWebhook(norm.url)
    hookInfo.value = { ...hookInfo.value, [channelId]: info }
    patchChannel(g.id, channelId, { webhookUrl: norm.url })
  } catch (e) {
    hookError.value = { ...hookError.value, [channelId]: e instanceof Error ? e.message : String(e) }
  } finally {
    hookBusy.value = ''
  }
}

function setHook(channelId: string, url: string) {
  hookError.value = { ...hookError.value, [channelId]: '' }
  hookInfo.value = { ...hookInfo.value, [channelId]: undefined }
  if (current.value) patchChannel(current.value.id, channelId, { webhookUrl: url })
}

function clearHook(channelId: string) {
  setHook(channelId, '')
}

// ---- 拖拉：伺服器排序、頻道排序、頻道拖到別的伺服器 ----
// 用瀏覽器原生拖放；拖的是什麼記在自己這裡，不靠 dataTransfer（jsdom 沒有）
type Dragging = { kind: 'server'; index: number } | { kind: 'channel'; id: string } | null
const dragging = ref<Dragging>(null)
const dropHint = ref('') // 目前懸在哪個 id 上，畫個框

function startDragServer(index: number, e: DragEvent) {
  dragging.value = { kind: 'server', index }
  e.dataTransfer?.setData('text/plain', 'server')
}
function startDragChannel(id: string, e: DragEvent) {
  dragging.value = { kind: 'channel', id }
  e.dataTransfer?.setData('text/plain', 'channel')
}
function endDrag() {
  dragging.value = null
  dropHint.value = ''
}
// 丟到伺服器 chip 上：伺服器拖過來就是排序；頻道拖過來就是搬家（接在那個伺服器最後）
function dropOnServer(groupId: string, index: number) {
  const d = dragging.value
  endDrag()
  if (!d) return
  if (d.kind === 'server') {
    moveGroup(d.index, index)
    return
  }
  const from = groups.value.find((g) => g.channels.some((c) => c.id === d.id))
  if (!from || from.id === groupId) return
  const target = groups.value.find((g) => g.id === groupId)
  if (from.channels.length <= 1) {
    window.alert('這是該伺服器最後一個頻道，不能搬走')
    return
  }
  const n = countRecordsInChannel(store.records, groups.value, d.id)
  if (n && !window.confirm(`這個頻道有 ${n} 筆紀錄，搬到「${target?.name}」之後那些紀錄會改用那邊的名冊與辛苦費設定，確定要搬嗎？`)) return
  moveChannelTo(d.id, groupId, target?.channels.length ?? 0)
  // 綁著的紀錄跟著搬：groupId 指到新伺服器
  for (const r of store.records) {
    if (r.channelId === d.id || (!r.channelId && r.groupId === d.id)) store.upsert({ ...r, groupId, channelId: d.id })
  }
}
// 丟到同伺服器的某一列上：排到那一列的位置
function dropOnChannel(index: number) {
  const d = dragging.value
  endDrag()
  if (!d || d.kind !== 'channel' || !current.value) return
  moveChannelTo(d.id, current.value.id, index)
}

// ---- 名單 ----
const rosterBusy = ref(false)
const rosterError = ref('')
const rosterOk = ref('')

function setRosterMode(mode: RosterMode) {
  rosterError.value = ''
  rosterOk.value = ''
  if (current.value) patchGroup(current.value.id, { rosterMode: mode })
}

async function applyRosterUrl() {
  const g = current.value
  if (!g) return
  rosterError.value = ''
  rosterOk.value = ''
  const url = (g.rosterUrl ?? '').trim()
  if (!url) {
    rosterError.value = '請貼上 JSON 網址'
    return
  }
  rosterBusy.value = true
  try {
    const roster = await fetchRoster(url)
    patchGroup(g.id, { rosterUrl: url, roster })
    rosterOk.value = `✓ 已套用，共 ${roster.length} 筆`
  } catch (e) {
    rosterError.value = e instanceof Error ? e.message : String(e)
  } finally {
    rosterBusy.value = false
  }
}

function editRoster(i: number, part: Partial<RosterEntry>) {
  const g = current.value
  if (!g) return
  patchGroup(g.id, { roster: g.roster.map((e, idx) => (idx === i ? { ...e, ...part } : e)) })
}
function addRosterRow() {
  const g = current.value
  if (!g) return
  // 手動加的一列沒有 Discord 資料，名字填在 alias
  patchGroup(g.id, { roster: [...g.roster, { discordHandle: '', discordNickName: '', alias: '' }] })
}
function removeRosterRow(i: number) {
  const g = current.value
  if (!g) return
  patchGroup(g.id, { roster: g.roster.filter((_, idx) => idx !== i) })
}

// ---- 品名清單（所有群組共用）----
const iSource = itemsSource()
const iUrlDraft = ref(iSource.value.url ?? '')
const iBusy = ref(false)
const iError = ref('')
const iOk = ref('')
const itemsText = computed({
  get: () => sharedItemNames().join('\n'),
  set: (v: string) => saveItemsLocal(v.split('\n').map((s) => s.trim()).filter(Boolean)),
})

function setItemsMode(mode: ListSourceMode) {
  iError.value = ''
  iOk.value = ''
  if (mode === 'url') {
    iSource.value.mode !== 'url' && setItemsSource({ mode: 'url', url: iSource.value.url })
    return
  }
  setItemsSource({ mode })
  if (mode === 'default') initSharedItems()
}

async function applyItemsUrl() {
  iError.value = ''
  iOk.value = ''
  const url = iUrlDraft.value.trim()
  if (!url) {
    iError.value = '請貼上 JSON 網址'
    return
  }
  iBusy.value = true
  try {
    const names = await fetchItems(url)
    saveItemsLocal(names)
    setItemsSource({ mode: 'url', url })
    iOk.value = `✓ 已套用，共 ${names.length} 項`
  } catch (e) {
    iError.value = e instanceof Error ? e.message : String(e)
  } finally {
    iBusy.value = false
  }
}

// ---- 匯出 JSON ----
const copied = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copyJson(key: 'roster' | 'items') {
  const data = key === 'roster' ? (current.value?.roster ?? []) : sharedItemNames()
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    copied.value = key
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = ''), 1500)
  } catch {
    // 剪貼簿不可用時僅不顯示回饋
  }
}
</script>

<template>
  <section>
    <div class="page-head">
      <h2>設定</h2>
    </div>
    <p class="muted intro">
      一個伺服器＝一份名單與辛苦費設定，底下每個頻道各有一條發佈用的 Webhook。
      每筆分寶紀錄選「發到」哪個頻道：發佈走那條 Webhook，名字查該伺服器的名冊。
    </p>

    <!-- 伺服器 -->
    <div class="card">
      <div class="section-head">
        <h3>伺服器</h3>
        <span class="count">{{ groups.length }} 個</span>
        <div class="spacer" />
        <button type="button" class="btn btn-sm" @click="addGroupRow">＋ 新增伺服器</button>
      </div>

      <!-- 拖 chip 排序；把下面的頻道拖到 chip 上就搬到那個伺服器 -->
      <div class="group-tabs" role="group" aria-label="選擇伺服器">
        <button v-for="(g, i) in groups" :key="g.id" type="button" class="btn btn-sm group-chip"
          :class="{ 'group-on': g.id === activeId, 'drop-target': dropHint === g.id }" :aria-pressed="g.id === activeId"
          draggable="true"
          @click="setActiveGroup(g.id)"
          @dragstart="startDragServer(i, $event)" @dragend="endDrag"
          @dragover.prevent="dropHint = g.id" @dragleave="dropHint = ''"
          @drop.prevent="dropOnServer(g.id, i)">{{ g.name }}</button>
      </div>

      <template v-if="current">
        <div class="group-fields">
          <label class="field">
            <span class="field-label">名稱</span>
            <input :value="current.name" placeholder="伺服器名稱"
              @input="renameGroup(($event.target as HTMLInputElement).value)" />
          </label>
        </div>
        <label class="toggle-row">
          <input type="checkbox" :checked="leaderFeeEnabled(current)"
            @change="patchGroup(current.id, { enableLeaderFee: ($event.target as HTMLInputElement).checked })" />
          啟用團長辛苦費
        </label>

        <div class="section-head channels-head">
          <h3>頻道</h3>
          <span class="count">{{ current.channels.length }} 個</span>
          <div class="spacer" />
          <button type="button" class="btn btn-sm" @click="addChannelRow">＋ 新增頻道</button>
        </div>
        <ul class="channel-list">
          <li v-for="(c, i) in current.channels" :key="c.id" class="channel-row"
            :class="{ 'drop-target': dropHint === c.id }"
            draggable="true"
            @dragstart="startDragChannel(c.id, $event)" @dragend="endDrag"
            @dragover.prevent="dropHint = c.id" @dragleave="dropHint = ''"
            @drop.prevent="dropOnChannel(i)">
            <span class="drag-handle" title="拖拉排序，拖到上面的伺服器就搬過去">⠿</span>
            <input class="channel-name" :value="c.name" placeholder="頻道名稱"
              @input="patchChannel(current.id, c.id, { name: ($event.target as HTMLInputElement).value })" />
            <input class="channel-hook" :value="c.webhookUrl" placeholder="https://discord.com/api/webhooks/…"
              autocomplete="off" spellcheck="false"
              @input="setHook(c.id, ($event.target as HTMLInputElement).value)" />
            <button type="button" class="btn btn-primary btn-sm" :disabled="hookBusy === c.id"
              @click="verifyHook(c.id)">{{ hookBusy === c.id ? '驗證中…' : '驗證' }}</button>
            <button v-if="c.webhookUrl" type="button" class="btn btn-ghost btn-danger btn-sm"
              @click="clearHook(c.id)">清除</button>
            <button type="button" class="btn btn-icon btn-danger channel-remove"
              :title="channelDeleteReason(c.id) || '刪除頻道'" :disabled="!!channelDeleteReason(c.id)"
              @click="removeChannelRow(c.id)">✕</button>
            <p v-if="hookError[c.id]" class="field-error channel-note">{{ hookError[c.id] }}</p>
            <p v-else-if="hookInfo[c.id]" class="ok-note channel-note">
              ✓ 已驗證並儲存：<strong>{{ hookInfo[c.id]?.name }}</strong>
              <span class="muted">（頻道 {{ hookInfo[c.id]?.channelId }}）</span>
            </p>
          </li>
        </ul>
        <p class="muted hook-note">
          目標頻道必須是<strong>論壇頻道</strong>（一般文字頻道無法由 webhook 建立討論串）。
          Webhook URL 等同密鑰，勿貼到公開頻道；共用電腦用畢請清除。
        </p>

        <div class="section-head roster-head">
          <h3>名單</h3>
          <span class="count">{{ current.roster.length }} 筆</span>
          <span v-if="rosterLoading().value" class="count">載入中…</span>
          <div class="spacer" />
          <button type="button" class="btn btn-sm" @click="copyJson('roster')">
            {{ copied === 'roster' ? '✓ 已複製' : '匯出 JSON' }}
          </button>
        </div>
        <div class="mode-row">
          <button v-for="m in ROSTER_MODES" :key="m.value" type="button" class="chip"
            :class="current.rosterMode === m.value ? 'chip-ok' : 'chip-struck'"
            @click="setRosterMode(m.value)">{{ m.label }}</button>
        </div>
        <div v-if="current.rosterMode === 'url'" class="url-row">
          <input :value="current.rosterUrl ?? ''" spellcheck="false"
            placeholder="https://raw.githubusercontent.com/…/members.json"
            @input="patchGroup(current.id, { rosterUrl: ($event.target as HTMLInputElement).value })" />
          <button type="button" class="btn btn-primary btn-sm" :disabled="rosterBusy"
            @click="applyRosterUrl">{{ rosterBusy ? '抓取中…' : '抓取並套用' }}</button>
        </div>
        <p v-if="rosterError" class="field-error">{{ rosterError }}</p>
        <p v-if="rosterOk" class="ok-note">{{ rosterOk }}</p>

        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Discord 帳號</th><th>Discord 顯示名</th><th>自訂別名</th><th>Discord 使用者 ID</th>
              <th v-if="current.rosterMode === 'local'"></th>
            </tr></thead>
            <tbody>
              <tr v-for="(e, i) in current.roster" :key="i">
                <template v-if="current.rosterMode === 'local'">
                  <td><input :value="e.discordHandle" placeholder="@handle"
                    @input="editRoster(i, { discordHandle: ($event.target as HTMLInputElement).value })" /></td>
                  <td><input :value="e.discordNickName" placeholder="（同步時自動填入）"
                    @input="editRoster(i, { discordNickName: ($event.target as HTMLInputElement).value })" /></td>
                  <td><input :value="e.alias ?? ''" placeholder="自己取的名字"
                    @input="editRoster(i, { alias: ($event.target as HTMLInputElement).value || undefined })" /></td>
                  <td><input :value="e.discordId ?? ''" placeholder="（選填，真 mention 用）"
                    @input="editRoster(i, { discordId: ($event.target as HTMLInputElement).value || undefined })" /></td>
                  <td><button type="button" class="btn btn-icon btn-danger" title="移除"
                    @click="removeRosterRow(i)">✕</button></td>
                </template>
                <template v-else>
                  <td>{{ e.discordHandle }}</td>
                  <td>{{ e.discordNickName || '—' }}</td>
                  <td :class="{ muted: !e.alias }">{{ e.alias || '—' }}</td>
                  <td class="muted">{{ e.discordId ?? '—' }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="group-actions">
          <button v-if="current.rosterMode === 'local'" type="button" class="btn btn-sm"
            @click="addRosterRow">＋ 新增一列</button>
          <div class="spacer" />
          <span v-if="deleteBlockReason" class="muted delete-note">{{ deleteBlockReason }}</span>
          <button type="button" class="btn btn-sm btn-danger" :disabled="!!deleteBlockReason"
            :title="deleteBlockReason || '刪除這個群組'" @click="removeCurrent">刪除這個群組</button>
        </div>
      </template>
    </div>

    <!-- 品名清單 -->
    <div class="card">
      <div class="section-head">
        <h3>品名清單</h3>
        <span class="count">{{ sharedItemNames().length }} 項</span>
        <span v-if="sharedItemsLoading().value" class="count">載入中…</span>
        <span class="count">所有伺服器共用</span>
        <div class="spacer" />
        <button type="button" class="btn btn-sm" @click="copyJson('items')">
          {{ copied === 'items' ? '✓ 已複製' : '匯出 JSON' }}
        </button>
      </div>
      <div class="mode-row">
        <button v-for="m in ITEM_MODES" :key="m.value" type="button" class="chip"
          :class="iSource.mode === m.value ? 'chip-ok' : 'chip-struck'"
          @click="setItemsMode(m.value)">{{ m.label }}</button>
      </div>
      <div v-if="iSource.mode === 'url'" class="url-row">
        <input v-model="iUrlDraft" placeholder="https://raw.githubusercontent.com/…/items.json"
          spellcheck="false" @input="iError = ''" />
        <button type="button" class="btn btn-primary btn-sm" :disabled="iBusy" @click="applyItemsUrl">
          {{ iBusy ? '抓取中…' : '抓取並套用' }}
        </button>
      </div>
      <p v-if="iError" class="field-error">{{ iError }}</p>
      <p v-if="iOk" class="ok-note">{{ iOk }}</p>

      <textarea v-if="iSource.mode === 'local'" v-model="itemsText" rows="12"
        placeholder="一行一個品名"></textarea>
      <ul v-else class="item-list">
        <li v-for="name in sharedItemNames()" :key="name">{{ name }}</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.page-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 680; flex: 1; }
.intro { margin: 0 0 18px; font-size: 13.5px; }

.group-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
.group-chip { border-radius: 999px; }
.group-on, .group-on:hover { background: var(--primary); border-color: var(--primary); color: #fff; }
.group-on:hover { background: var(--primary-hover); border-color: var(--primary-hover); }

.group-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.group-fields .field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.group-fields .field-label { font-size: 12.5px; font-weight: 550; color: var(--text-muted); }
.field-wide { grid-column: span 2; }
.channels-head { margin-top: 18px; }
.channel-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.channel-row {
  display: grid; grid-template-columns: auto 160px 1fr auto auto auto; gap: 8px; align-items: center;
  padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface);
}
.channel-row .channel-hook { font-family: var(--mono); font-size: 13px; min-width: 0; }
.channel-row .btn { flex: none; }
.channel-note { grid-column: 1 / -1; margin: 0; }
.drag-handle { cursor: grab; color: var(--text-muted); user-select: none; font-size: 16px; padding: 0 2px; }
.channel-row:active .drag-handle { cursor: grabbing; }
.drop-target { outline: 2px dashed var(--primary); outline-offset: 2px; }
.channel-remove:disabled { opacity: .4; cursor: not-allowed; }
@media (max-width: 720px) { .channel-row { grid-template-columns: auto 1fr; } .channel-row .channel-hook { grid-column: 1 / -1; } }
.hook-note { margin: 10px 0 0; font-size: 12.5px; }
.toggle-row { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 14px; cursor: pointer; }
.toggle-row input { width: auto; }

.roster-head { margin-top: 22px; }
.mode-row { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.url-row { display: flex; gap: 8px; margin-bottom: 10px; }
.url-row input { font-family: var(--mono); font-size: 13px; }
.url-row .btn { flex: none; }
.ok-note { margin: 0 0 10px; font-size: 13px; color: var(--success); }
.field-error { margin: 0 0 10px; }

.group-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.group-actions .spacer { flex: 1; }
.delete-note { font-size: 12.5px; }
.group-actions .btn:disabled { opacity: .5; cursor: not-allowed; }
.group-actions .btn:disabled:hover { background: var(--surface); border-color: var(--border); color: var(--danger); }

.item-list {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px 14px;
  font-size: 13.5px;
}
.item-list li { padding: 3px 0; border-bottom: 1px solid var(--surface-2); }
textarea { font-size: 13.5px; line-height: 1.7; resize: vertical; }

@media (max-width: 720px) {
  .field-wide { grid-column: 1 / -1; }
  .hook-row, .url-row { flex-wrap: wrap; }
}
</style>
