<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useRecordsStore } from '../store/records'
import { useHistory } from '../store/history'
import { aliasOfIn, groupOf, useGroups, leaderFeeEnabled } from '../store/groups'
import { publishOrSync, publishContent, hasImageChanges, dcSyncStatus, ATTACHMENT_LIMIT } from '../dc/publish'
import { parseMessageLink, isBindingLost, getMessage } from '../dc/webhook'
import type { LootRecord, LootItem, Member, Purchase, Stream, Consignment, SplitDrop, DcImage, DcImageKind } from '../types'
import { undividable } from '../calc/splitDrops'
import { filesToImages, hoveredImageKind } from '../images'
import ImageSection from './ImageSection.vue'
import LootTable from './LootTable.vue'
import AutocompleteInput from './AutocompleteInput.vue'
import PurchaseTable from './PurchaseTable.vue'
import StreamTable from './StreamTable.vue'
import ConsignmentTable from './ConsignmentTable.vue'
import SplitDropTable from './SplitDropTable.vue'
import DistributionPanel from './DistributionPanel.vue'
import ExportDialog from './ExportDialog.vue'
import ImportDialog from './ImportDialog.vue'

const route = useRoute()
const store = useRecordsStore()
const history = useHistory(() => record.value?.groupId)

const record = computed<LootRecord | undefined>(() => store.get(route.params.id as string))

function patch(part: Partial<LootRecord>) {
  if (record.value) store.upsert({ ...record.value, ...part })
}

const bossError = computed(() => !record.value || !record.value.boss.trim())

// ---- 所屬 DC 群組（決定用哪個 webhook 與哪份名冊）----
const { groups } = useGroups()
const groupId = computed(() => record.value?.groupId)
// 沒指定的舊紀錄落在第一個群組，下拉要顯示成那一個
const shownGroupId = computed(() => groupOf(groupId.value)?.id ?? '')

function setGroup(id: string) {
  const r = record.value
  if (!r || id === r.groupId) return
  // 已發佈的貼文綁在原群組的頻道上，換群組等於之後同步會發到別的地方
  if (r.dc && !window.confirm('這筆紀錄已經發佈到 DC。\n換群組之後同步會送到新群組的頻道，確定要換嗎？')) {
    return
  }
  patch({ groupId: id })
}

// 群組關掉辛苦費時，整張「團長」卡片與團員列上的標記都不顯示
const showLeader = computed(() => leaderFeeEnabled(groupOf(groupId.value)))

// 團長那一列在團員清單裡唯讀（改人與移除都在上方「團長」做），空 handle 不算
function isLeaderRow(handle: string): boolean {
  return showLeader.value && !!handle && record.value?.leader?.handle === handle
}

// 交易手續費 %：未填的舊紀錄是 0，新紀錄由 records store 帶入預設 3
const serviceFeePercent = computed({
  get: () => record.value?.serviceFeePercent ?? 0,
  set: (v: number) => patch({ serviceFeePercent: Number.isFinite(v) && v > 0 ? v : 0 }),
})

// 下拉顯示「別名 (handle)」，選取仍存 handle
function handleLabel(h: string): string {
  const a = aliasOfIn(groupId.value, h)
  return a ? `${a} (${h})` : h
}

function ensureIds() {
  const r = record.value
  if (!r) return
  const streams = r.streams ?? []
  const consignments = r.consignments ?? []
  const splitDrops = r.splitDrops ?? []
  const needs =
    r.lootItems.some((it) => !it.id) ||
    r.members.some((m) => !m.id) ||
    r.purchases.some((p) => !p.id) ||
    streams.some((s) => !s.id) ||
    consignments.some((c) => !c.id) ||
    splitDrops.some((d) => !d.id)
  if (!needs) return
  store.upsert({
    ...r,
    lootItems: r.lootItems.map((it) => (it.id ? it : { ...it, id: crypto.randomUUID() })),
    members: r.members.map((m) => (m.id ? m : { ...m, id: crypto.randomUUID() })),
    purchases: r.purchases.map((p) => (p.id ? p : { ...p, id: crypto.randomUUID() })),
    streams: streams.map((s) => (s.id ? s : { ...s, id: crypto.randomUUID() })),
    consignments: consignments.map((c) => (c.id ? c : { ...c, id: crypto.randomUUID() })),
    splitDrops: splitDrops.map((d) => (d.id ? d : { ...d, id: crypto.randomUUID() })),
  })
}
watch(() => route.params.id, ensureIds, { immediate: true })

// 自未領總覽「開啟 ↗」進入（?focus=dist）時，捲動至分配名單
const distEl = ref<HTMLElement | null>(null)
onMounted(() => {
  if (route.query.focus !== 'dist') return
  nextTick(() => distEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
})

// ---- 發佈/同步至 DC ----
const dcUrl = computed(() => groupOf(record.value?.groupId)?.webhookUrl ?? '')
type PublishState = 'idle' | 'busy' | 'ok' | 'fail'
const publishState = ref<PublishState>('idle')
const publishError = ref('')
const publishProgress = ref('')
let publishTimer: ReturnType<typeof setTimeout> | undefined

function fmtSync(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}

// 成功/失敗短暫顯示後回復；執行中不排程
function settleState(state: PublishState) {
  publishState.value = state
  if (state !== 'busy') publishProgress.value = ''
  clearTimeout(publishTimer)
  if (state === 'ok' || state === 'fail') {
    publishTimer = setTimeout(() => (publishState.value = 'idle'), 2200)
  }
}

// ---- 與 DC 貼文的一致性檢查 ----
const remoteContent = ref<string | null>(null) // null＝尚未取得（未綁定/讀取失敗）
const checkingRemote = ref(false)
const remoteLost = ref(false)

async function checkRemote() {
  const r = record.value
  remoteContent.value = null
  remoteLost.value = false
  if (!r?.dc || !dcUrl.value) return
  checkingRemote.value = true
  try {
    const m = await getMessage(dcUrl.value, r.dc.messageId, r.dc.threadId)
    remoteContent.value = m.content
  } catch (e) {
    if (isBindingLost(e)) remoteLost.value = true
    // 其他錯誤（網路等）維持「無法確認」，不打擾操作
  } finally {
    checkingRemote.value = false
  }
}
watch(() => [route.params.id, record.value?.dc?.messageId], checkRemote, { immediate: true })

const localContent = computed(() => (record.value ? publishContent(record.value) : ''))
type SyncState = 'unbound' | 'checking' | 'lost' | 'unknown' | 'inSync' | 'dirty'
const syncState = computed<SyncState>(() => {
  const r = record.value
  if (!r?.dc) return 'unbound'
  if (r.images && hasImageChanges(r)) return 'dirty'
  if (checkingRemote.value) return 'checking'
  if (remoteLost.value) return 'lost'
  if (remoteContent.value == null) return 'unknown'
  return localContent.value === remoteContent.value ? 'inSync' : 'dirty'
})

async function publishToDc() {
  const r = record.value
  if (!r || publishState.value === 'busy') return
  publishError.value = ''
  if (!dcUrl.value) {
    publishError.value = '這個群組還沒設定 Webhook URL（設定頁 → DC 群組）'
    return
  }
  if (bossError.value) {
    publishError.value = '團名為必填，填好再發佈'
    return
  }
  settleState('busy')
  const hooks = {
    onProgress: (done: number, total: number) => {
      publishProgress.value = total > 1 ? `${done}/${total}` : ''
    },
    onUpdate: (updated: LootRecord) => store.upsert(updated), // 逐步落盤，部分成功不遺失
  }
  try {
    store.upsert(await publishOrSync(dcUrl.value, r, hooks))
    settleState('ok')
    checkRemote() // 同步成功後復查一致性
  } catch (e) {
    // 綁定失效（貼文/討論串已被刪除）：詢問是否重新發一篇新貼文
    if (r.dc && isBindingLost(e)) {
      if (window.confirm('DC 上找不到原本的貼文（可能已被刪除）。\n要重新發一篇新貼文嗎？\n（已上傳到舊貼文的圖片檔無法救回，會一併移除）')) {
        try {
          // 已上傳圖片（url 已存在）檔案隨舊貼文消失、本地 blob 也已清除，僅保留尚未上傳的
          const fresh: LootRecord = {
            ...r,
            dc: undefined,
            images: r.images?.filter((i) => !i.url && !i.removed),
          }
          store.upsert(await publishOrSync(dcUrl.value, fresh, hooks))
          settleState('ok')
          checkRemote()
        } catch (e2) {
          publishError.value = e2 instanceof Error ? e2.message : String(e2)
          settleState('fail')
        }
        return
      }
      publishError.value = '原貼文已失效，未重新發佈；也可用「綁定貼文」接回其他既有貼文'
      settleState('fail')
      return
    }
    publishError.value = e instanceof Error ? e.message : String(e)
    settleState('fail')
  }
}

// 救援：換裝置/清資料後，把既有貼文綁回本紀錄
function bindExisting() {
  const r = record.value
  if (!r) return
  const link = window.prompt('貼上貼文「開頭訊息」的連結（DC 右鍵訊息 → 複製訊息連結）：')
  if (!link) return
  const parsed = parseMessageLink(link)
  if (!parsed) {
    publishError.value = '連結格式不對，應為 https://discord.com/channels/…/…/…'
    return
  }
  publishError.value = ''
  store.upsert({ ...r, dc: { ...parsed, publishedAt: new Date().toISOString() } })
}

// 離開編輯頁（返回列表等）時，已發佈紀錄若有未同步變更先確認
onBeforeRouteLeave(() => {
  const r = record.value
  if (r && dcSyncStatus(r) === 'dirty') {
    return window.confirm('此紀錄的變更尚未同步到 DC。仍要離開嗎？\n（資料已存在本機，之後隨時可再同步）')
  }
  return true
})

const showExport = ref(false)
const showImport = ref(false)
function applyImport(parsed: LootRecord) {
  if (!record.value) return
  store.upsert({
    ...record.value,
    date: parsed.date,
    boss: parsed.boss,
    members: parsed.members,
    lootItems: parsed.lootItems,
    purchases: parsed.purchases,
    streams: parsed.streams ?? [],
    consignments: parsed.consignments ?? [],
    splitDrops: parsed.splitDrops ?? [],
  })
  ensureIds() // 為剛匯入的資料列補上穩定 id（迴圈安全，手動呼叫）
}
function setLootItems(items: LootItem[]) {
  patch({ lootItems: items })
}
function setMembers(members: Member[]) {
  patch({ members })
}
function setPurchases(purchases: Purchase[]) {
  patch({ purchases })
}
function setStreams(streams: Stream[]) {
  patch({ streams })
}
function setConsignments(consignments: Consignment[]) {
  patch({ consignments })
}
function setSplitDrops(splitDrops: SplitDrop[]) {
  patch({ splitDrops })
}
// 掉落物除不盡就不給發：跟 publishOrSync 裡的擋門同一個判定，這裡只是提早告訴人
const publishBlock = computed(() => {
  const r = record.value
  if (!r) return ''
  const bad = undividable(r)
  if (!bad.length) return ''
  const n = r.members.length
  return bad.map((d) => `${d.name} ${d.qty} 個無法均分 ${n} 人`).join('；') + '，改好數字再發佈'
})
// ---- 圖片（三類：掉落/領錢/外購）----
function imagesOf(kind: DcImage['kind']): DcImage[] {
  return (record.value?.images ?? []).filter((i) => i.kind === kind)
}
function addImages(imgs: DcImage[]) {
  if (!record.value) return
  patch({ images: [...(record.value.images ?? []), ...imgs] })
}
function updateImage(img: DcImage) {
  if (!record.value) return
  patch({ images: (record.value.images ?? []).map((i) => (i.id === img.id ? img : i)) })
}
function removeImage(id: string) {
  if (!record.value) return
  patch({ images: (record.value.images ?? []).filter((i) => i.id !== id) })
}
// CDN URL 簽名過期（img onerror）：GET 訊息取刷新後的附件 URL
let refreshingUrls = false
async function refreshImageUrl(img: DcImage) {
  const r = record.value
  if (!r?.dc || !dcUrl.value || refreshingUrls) return
  refreshingUrls = true
  try {
    if (img.kind === 'drop') {
      const msg = await getMessage(dcUrl.value, r.dc.messageId, r.dc.threadId)
      const byId = new Map(msg.attachments.map((a) => [a.id, a]))
      patch({
        images: (r.images ?? []).map((i) =>
          i.kind === 'drop' && i.attachmentId && byId.has(i.attachmentId)
            ? { ...i, url: byId.get(i.attachmentId)!.url }
            : i,
        ),
      })
    } else if (img.dcMessageId) {
      const msg = await getMessage(dcUrl.value, img.dcMessageId, r.dc.threadId)
      const url = msg.attachments[0]?.url
      if (url) updateImage({ ...img, url })
    }
  } catch {
    // 刷新失敗維持破圖，不打擾操作
  } finally {
    refreshingUrls = false
  }
}

// 貼上：停在某圖片區→直接加入該區；否則跳選單問要放哪一區
const pastePending = ref<File[] | null>(null)
async function addPastedTo(kind: DcImageKind, files: File[]) {
  addImages(await filesToImages(files, kind))
}
function onGlobalPaste(e: ClipboardEvent) {
  if (!record.value) return
  const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  const hovered = hoveredImageKind.value
  if (hovered) {
    addPastedTo(hovered, files)
    return
  }
  pastePending.value = files
}
function choosePasteKind(kind: DcImageKind) {
  const files = pastePending.value
  pastePending.value = null
  if (files) addPastedTo(kind, files)
}
onMounted(() => window.addEventListener('paste', onGlobalPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onGlobalPaste))

function addMember() {
  if (!record.value) return
  setMembers([...record.value.members, { handle: '', settle: 'pending', id: crypto.randomUUID() }])
}
function updateMember(i: number, part: Partial<Member>) {
  if (!record.value) return
  const prevHandle = record.value.members[i]?.handle
  const next = [...record.value.members]
  next[i] = { ...next[i], ...part }
  const leader = record.value.leader
  // 團長改了 handle，團長設定要跟著改，否則會指向已不存在的 handle
  if (leader && part.handle !== undefined && leader.handle === prevHandle) {
    patch({ members: next, leader: { ...leader, handle: part.handle } })
    return
  }
  setMembers(next)
}
function removeMember(i: number) {
  if (!record.value) return
  const removed = record.value.members[i]
  const next = record.value.members.filter((_, idx) => idx !== i)
  // 團長被移出團員就不再是團長，否則辛苦費會掛在不存在的人身上
  if (record.value.leader?.handle === removed?.handle) patch({ members: next, leader: undefined })
  else setMembers(next)
}

// ---- 團長辛苦費 ----
// 團長也要分錢，所以他必須在團員列表裡。這裡先填團長、後填其他團員，
// 因此填了團長就自動把他補進團員（排最前面）；改名時更新原本那一列，
// 不是每打一個字就新增一個人。
function setLeaderHandle(handle: string) {
  const rec = record.value
  if (!rec) return
  const h = handle.trim()
  const prev = rec.leader
  // 清空團長：他仍留在團員列表裡，只是不再是團長
  if (!h) return patch({ leader: undefined })

  const leader = { handle: h, feeMode: prev?.feeMode ?? 'percent', feeValue: prev?.feeValue ?? 0 }
  const members = [...rec.members]
  if (members.some((m) => m.handle === h)) return patch({ leader })

  const prevIdx = prev ? members.findIndex((m) => m.handle === prev.handle) : -1
  if (prevIdx >= 0) {
    members[prevIdx] = { ...members[prevIdx], handle: h }
  } else {
    members.unshift({ handle: h, settle: 'pending', id: crypto.randomUUID() })
  }
  patch({ leader, members })
}
function setFeeValue(value: number) {
  const l = record.value?.leader
  if (!l) return
  patch({ leader: { ...l, feeValue: Number.isFinite(value) && value > 0 ? value : 0 } })
}
function toggleFeeMode() {
  const l = record.value?.leader
  if (!l) return
  patch({ leader: { ...l, feeMode: l.feeMode === 'percent' ? 'fixed' : 'percent' } })
}
function toggleSettle(i: number) {
  const m = record.value?.members[i]
  if (!m) return
  updateMember(i, { settle: m.settle === 'settled' ? 'pending' : 'settled' })
}
</script>

<template>
  <section v-if="record">
    <div class="editor-top">
      <router-link to="/loot" class="btn btn-ghost btn-sm back">← 返回列表</router-link>
      <div class="spacer" />
      <span v-if="syncState === 'checking'" class="sync-chip muted">⋯ 檢查中</span>
      <span v-else-if="syncState === 'inSync'" class="chip chip-ok sync-chip" title="DC 貼文內容與目前紀錄一致">✓ 與 DC 一致</span>
      <span v-else-if="syncState === 'dirty'" class="chip chip-pending sync-chip" title="紀錄有變更尚未同步到 DC">● 與 DC 不同步</span>
      <span v-else-if="syncState === 'lost'" class="chip chip-struck sync-chip" title="DC 上找不到綁定的貼文（可能已被刪除）">⚠ 貼文已失效</span>
      <button type="button" class="btn btn-ghost btn-sm"
        title="把既有 DC 貼文綁到本紀錄（換裝置、清資料或原貼文失效時用）" @click="bindExisting">
        {{ record.dc ? '換綁貼文' : '綁定貼文' }}
      </button>
      <button type="button" class="btn btn-sm publish-btn" :class="`publish-${publishState}`"
        :disabled="publishState === 'busy' || !!publishBlock"
        :title="record.dc ? `上次同步 ${record.dc.lastSyncAt ? fmtSync(record.dc.lastSyncAt) : '—'}` : '建立論壇貼文（討論串標題建立後不可改）'"
        @click="publishToDc">
        <span v-if="publishState === 'busy'" class="spinner" aria-hidden="true" />
        <template v-if="publishState === 'busy'">同步中{{ publishProgress ? ` ${publishProgress}` : '' }}…</template>
        <template v-else-if="publishState === 'ok'">✓ 已同步</template>
        <template v-else-if="publishState === 'fail'">✕ 同步失敗</template>
        <template v-else>{{ record.dc ? '同步至 DC' : '發佈至 DC' }}</template>
      </button>
      <button type="button" class="btn btn-sm" @click="showImport = true">重新貼上匯入</button>
      <button type="button" class="btn btn-primary btn-sm" @click="showExport = true">複製回 DC</button>
    </div>
    <p v-if="publishError" class="alert alert-warn">{{ publishError }}</p>
    <p v-else-if="publishBlock" class="alert alert-warn">{{ publishBlock }}</p>

    <div class="card">
      <div class="section-head"><h3>基本資料</h3></div>
      <div class="header-fields">
        <label class="field field-title">
          <span class="field-label">團名 <em>*</em></span>
          <AutocompleteInput :model-value="record.boss" :suggestions="history.bosses.value"
            :class="{ invalid: bossError }" placeholder="例：混龍"
            @update:model-value="patch({ boss: $event })" />
          <span v-if="bossError" class="field-error">團名為必填</span>
        </label>
        <label class="field">
          <span class="field-label">日期</span>
          <input type="date" :value="record.date"
            @input="patch({ date: ($event.target as HTMLInputElement).value })" />
        </label>
        <label class="field">
          <span class="field-label">DC 群組</span>
          <select :value="shownGroupId" @change="setGroup(($event.target as HTMLSelectElement).value)">
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">交易手續費（%）</span>
          <input v-model.number="serviceFeePercent" type="number" min="0" step="0.1" />
        </label>
      </div>
    </div>

    <div v-if="showLeader" class="card">
      <div class="section-head"><h3>團長</h3></div>
      <div class="leader-fields">
        <label class="field">
          <span class="field-label">人</span>
          <div class="leader-handle-row">
            <AutocompleteInput :model-value="record.leader?.handle ?? ''"
              :suggestions="history.handles.value" :label-for="handleLabel"
              :loading="history.handlesLoading.value" placeholder="@handle（留空＝沒有團長）"
              @update:model-value="setLeaderHandle($event)" />
            <span v-if="record.leader && aliasOfIn(groupId, record.leader.handle)" class="alias-badge">
              {{ aliasOfIn(groupId, record.leader.handle) }}
            </span>
          </div>
        </label>
        <label v-if="record.leader" class="field">
          <span class="field-label">辛苦費</span>
          <div class="fee-row">
            <input type="number" min="0" :value="record.leader.feeValue"
              @input="setFeeValue(Number(($event.target as HTMLInputElement).value))" />
            <button type="button" class="btn fee-mode" :title="record.leader.feeMode === 'percent'
              ? '目前為團隊總額的百分比，點一下改成固定金額' : '目前為固定金額，點一下改成百分比'"
              @click="toggleFeeMode">
              {{ record.leader.feeMode === 'percent' ? '%' : '固定' }}
            </button>
          </div>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="section-head">
        <h3>團員</h3>
        <span class="count">{{ record.members.length }} 人</span>
        <div class="spacer" />
        <button type="button" class="btn btn-sm" @click="addMember">＋ 新增團員</button>
      </div>
      <p v-if="!record.members.length" class="muted">尚無團員。</p>
      <ul class="members">
        <li v-for="(m, i) in record.members" :key="m.id" class="member-row">
          <!-- 團長那列在這裡唯讀：他是上面「團長」欄位設的，兩處都能改會互相打架 -->
          <div v-if="isLeaderRow(m.handle)" class="member-handle locked">{{ m.handle }}</div>
          <AutocompleteInput v-else class="member-handle" :model-value="m.handle" :suggestions="history.handles.value"
            :label-for="handleLabel" :loading="history.handlesLoading.value" placeholder="@handle"
            @update:model-value="updateMember(i, { handle: $event })" />
          <span v-if="aliasOfIn(groupId, m.handle)" class="alias-badge">{{ aliasOfIn(groupId, m.handle) }}</span>
          <span v-if="isLeaderRow(m.handle)" class="chip chip-cart leader-tag">團長</span>
          <button v-else type="button" class="btn btn-icon btn-danger" title="移除"
            @click="removeMember(i)">✕</button>
        </li>
      </ul>
    </div>

    <LootTable :model-value="record.lootItems" @update:model-value="setLootItems" />
    <PurchaseTable :model-value="record.purchases" :members="record.members" :group-id="record.groupId"
      @update:model-value="setPurchases" />
    <StreamTable :model-value="record.streams ?? []" @update:model-value="setStreams" />
    <ConsignmentTable :model-value="record.consignments ?? []" :members="record.members" :group-id="record.groupId"
      @update:model-value="setConsignments" />

    <SplitDropTable :model-value="record.splitDrops ?? []" :member-count="record.members.length"
      :group-id="record.groupId" @update:model-value="setSplitDrops" />
    <ImageSection title="掉落截圖" kind="drop" :images="imagesOf('drop')" :limit="ATTACHMENT_LIMIT"
      @add="addImages" @update="updateImage" @remove="removeImage" @refresh="refreshImageUrl" />
    <ImageSection title="物品出售" kind="sale" :images="imagesOf('sale')" :limit="ATTACHMENT_LIMIT"
      @add="addImages" @update="updateImage" @remove="removeImage" @refresh="refreshImageUrl" />
    <ImageSection title="領錢截圖" kind="payout" :images="imagesOf('payout')" :members="record.members" :group-id="record.groupId"
      @add="addImages" @update="updateImage" @remove="removeImage" @refresh="refreshImageUrl" />
    <ImageSection title="外購截圖" kind="external" :images="imagesOf('external')"
      @add="addImages" @update="updateImage" @remove="removeImage" @refresh="refreshImageUrl" />
    <div ref="distEl" class="dist-anchor">
      <DistributionPanel :record="record" @toggle-settle="toggleSettle" />
    </div>

    <ImportDialog :open="showImport" @close="showImport = false" @imported="applyImport" />
    <ExportDialog :open="showExport" :record="record" @close="showExport = false" />

    <div v-if="pastePending" class="overlay" @click.self="pastePending = null">
      <div class="paste-dialog">
        <h3>剪貼簿有 {{ pastePending.length }} 張圖片，要加到哪一區？</h3>
        <div class="paste-choices">
          <button type="button" class="btn" @click="choosePasteKind('drop')">掉落截圖</button>
          <button type="button" class="btn" @click="choosePasteKind('sale')">物品出售</button>
          <button type="button" class="btn" @click="choosePasteKind('payout')">領錢截圖</button>
          <button type="button" class="btn" @click="choosePasteKind('external')">外購截圖</button>
        </div>
        <div class="paste-cancel">
          <button type="button" class="btn btn-ghost" @click="pastePending = null">取消</button>
        </div>
      </div>
    </div>
  </section>
  <div v-else class="empty">找不到此紀錄。</div>
</template>

<style scoped>
/* 捲動定位時預留 sticky appbar 高度 */
.dist-anchor { scroll-margin-top: 70px; }

.sync-chip { cursor: default; white-space: nowrap; font-size: 12.5px; }

/* 貼上圖片的區塊選單 */
.overlay {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
  background: rgba(17, 24, 39, .5); backdrop-filter: blur(2px); padding: 20px;
}
.paste-dialog {
  background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-lg);
  padding: 20px; width: min(420px, 92vw);
}
.paste-dialog h3 { margin: 0 0 14px; font-size: 15.5px; font-weight: 650; }
.paste-choices { display: flex; gap: 8px; flex-wrap: wrap; }
.paste-choices .btn { flex: 1; }
.paste-cancel { display: flex; justify-content: flex-end; margin-top: 12px; }

/* 同步按鈕三態回饋 */
.publish-btn { min-width: 108px; transition: background .18s, border-color .18s, color .18s; }
.publish-ok { background: var(--success-soft); border-color: var(--success); color: var(--success); }
.publish-fail { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
.spinner {
  width: 12px; height: 12px; flex: none;
  border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%;
  animation: publish-spin .7s linear infinite;
}
@keyframes publish-spin { to { transform: rotate(360deg); } }

.editor-top { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.editor-top .spacer { flex: 1; }
.back { text-decoration: none; }

/* 窄螢幕：返回鍵獨占一行，同步狀態與操作鈕在下面自行換行 */
@media (max-width: 720px) {
  .editor-top { flex-wrap: wrap; }
  .editor-top .spacer { flex: 1 0 100%; }
}

.header-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }

.leader-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
.leader-handle-row { display: flex; gap: 8px; align-items: center; min-width: 0; }
.leader-handle-row > :first-child { flex: 1; min-width: 0; }
.fee-row { display: flex; gap: 8px; }
.fee-mode { flex: none; min-width: 56px; }
.leader-tag { flex: none; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field-title { grid-column: 1 / -1; }
.field-title .invalid :deep(input) { border-color: var(--danger); }
.field-label { font-size: 12.5px; font-weight: 550; color: var(--text-muted); }
.field-label em { color: var(--danger); font-style: normal; }

.members { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.member-row { display: flex; gap: 8px; align-items: center; }
.member-handle { flex: 1; max-width: 320px; }
/* 唯讀的團長列：外觀比照輸入框但明確表示不能改 */
.member-handle.locked {
  padding: 8px 11px; border: 1px dashed var(--border-strong); border-radius: var(--radius-sm);
  background: var(--surface-2); color: var(--text-muted); font-size: 14px;
}
.alias-badge {
  padding: 3px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
  background: var(--primary-soft); color: var(--primary-hover); white-space: nowrap;
}
</style>
