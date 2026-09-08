<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BOSSES, bossById, reflectBossById, setOverride, type BossOverride, type CycleBoss } from '../boss/bosses'
import { DEFAULT_DISPEL_DURATION } from '../boss/bosses'
import { mechanicById } from '../boss/mechanics'
import {
  bossId,
  overrides,
  dispelDuration,
  soundOn,
  reflectState,
  reflectParams,
  cycleRunning,
  now,
  startSessionLoop,
  stopSessionLoop,
} from '../boss/session'
import { upcomingEvents } from '../boss/damageReflect'
import { fmtTime } from '../boss/anchor'
import { openPipWindow, pipSupported, keepFitted, resizePip } from '../pip/documentPip'
import MechanicPanels from './MechanicPanels.vue'
import CycleEvents from './CycleEvents.vue'
import AnchorRow from './AnchorRow.vue'

// 計時推進與音效只有一份（在 boss/session），面板不管開幾份都讀它
onMounted(startSessionLoop)
onBeforeUnmount(stopSessionLoop)

// 王選單列出所有王；選到誰就換成該王機制模板的面板
const bosses = BOSSES
const current = computed(() => bossById(bossId.value))
const cycleBoss = computed(() => (current.value.mechanic === 'cycle' ? (current.value as CycleBoss) : null))
const reflectOnly = computed(() => current.value.mechanic === 'damage-reflect')
const boss = computed(() => reflectBossById(bossId.value))
const params = computed(() => reflectParams())

// ---- 抬頭顯示 ----
// 打王時遊戲佔滿螢幕，這個視窗會浮在最上面。面板是「再渲染一份」而不是搬過去，
// 主視窗那份照樣留著——狀態全在模組層，兩份看的是同一份資料。
const pipBody = ref<HTMLElement | null>(null)
const canPip = pipSupported()
// 每個機制模板的面板大小差很多（反盾 463x384、效率推估 335x132），開起來與換王時
// 都調成當下這隻王剛好塞滿的尺寸，字級才會是設計的大小。
const pipSize = computed(() => mechanicById(current.value.mechanic).pip)
// 使用者自己拉過視窗之後就不再自動調——他調的尺寸比我們的預設更清楚他要什麼。
// 判斷方式是時間窗而不是比對尺寸：resizeTo 一次會連續發好幾個 resize 事件，
// 中間那些量到的是過渡尺寸，跟目標值對不上，比對法會把自己的調整誤判成手動
let pipIgnoreResizeUntil = 0
const pipResizedByUser = ref(false)

function applyPipSize(win: Window) {
  if (pipResizedByUser.value) return
  pipIgnoreResizeUntil = Date.now() + 600
  resizePip(win, pipSize.value)
}

async function togglePip() {
  if (pipBody.value) {
    ;(pipBody.value.ownerDocument.defaultView as Window | null)?.close()
    pipBody.value = null
    return
  }
  pipResizedByUser.value = false
  pipIgnoreResizeUntil = Date.now() + 600 // 開窗本身也會發 resize
  const win = await openPipWindow(pipSize.value)
  if (!win) return
  win.addEventListener('pagehide', () => (pipBody.value = null))
  win.addEventListener('resize', () => {
    if (Date.now() < pipIgnoreResizeUntil) return
    pipResizedByUser.value = true
  })
  pipBody.value = win.document.body
  await nextTick()
  keepFitted(win)
}

// 換王就換尺寸。要等 DOM 換完再調，不然量到的還是上一隻王的版面
watch(pipSize, async () => {
  const win = pipBody.value?.ownerDocument.defaultView
  if (!win) return
  await nextTick()
  applyPipSize(win)
})

// ---- 選王與參數 ----
// 計時中換王會拿到錯的倒數，鎖住；要換先按「重置」
const locked = computed(() => reflectState.value.phase !== 'idle' || cycleRunning.value)

// 網址是「現在在看哪隻王」的唯一真相，bossId 那份 ref 跟著它走。
// 單向的：選王只負責改網址，改完再由這個 watch 灌回去。
const route = useRoute()
const router = useRouter()
watch(
  () => route.params.bossId as string | undefined,
  (id) => {
    if (!id) return
    // 手打的、或改版前的舊書籤：bossById 會退回預設王，網址也一起改掉，
    // 不然網址寫著一隻、畫面顯示另一隻
    const boss = bossById(id)
    if (boss.id !== id) return void router.replace(`/boss-toolkit/${boss.id}`)
    // 王選單在計時中是鎖住的，這裡擋的是繞過選單的那些路——直接改網址、
    // 按上一頁。放行就會觸發換場重置，把正在跑的計時丟掉
    if (locked.value && boss.id !== bossId.value) {
      return void router.replace(`/boss-toolkit/${bossId.value}`)
    }
    bossId.value = boss.id
  },
  { immediate: true },
)

function selectBoss(id: string) {
  if (locked.value) return
  router.push(`/boss-toolkit/${id}`)
}

// 參數輸入框寫入的是「該王的覆寫」；秒數改回內建預設會自動移除覆寫
function patchOverride(part: Partial<BossOverride>) {
  const p = params.value
  overrides.value = setOverride(overrides.value, boss.value, {
    reflectDuration: p.reflectDuration,
    interval: p.interval,
    intervalFloat: p.intervalFloat ?? 0,
    ...part,
  })
}
const reflectDuration = computed({
  get: () => params.value.reflectDuration,
  set: (v: number) => v > 0 && patchOverride({ reflectDuration: v }),
})
const intervalSeconds = computed({
  get: () => params.value.interval,
  set: (v: number) => v > 0 && patchOverride({ interval: v }),
})
// 浮動可以是 0（杜納斯沒有浮動），只擋負數
const intervalFloat = computed({
  get: () => params.value.intervalFloat ?? 0,
  set: (v: number) => Number.isFinite(v) && v >= 0 && patchOverride({ intervalFloat: v }),
})
const dispelSeconds = computed({
  get: () => dispelDuration.value,
  set: (v: number) => v > 0 && (dispelDuration.value = v),
})

const isOverridden = computed(() => !!overrides.value[boss.value.id])
function resetBossParams() {
  const next = { ...overrides.value }
  delete next[boss.value.id]
  overrides.value = next
}

const events = computed(() => upcomingEvents(reflectState.value, params.value, now.value, 6))
</script>

<template>
  <section>
    <div class="page-head">
      <h2>BOSS 工具箱</h2>
      <div class="boss-tabs" role="group" aria-label="選擇王">
        <button v-for="b in bosses" :key="b.id" type="button" class="btn btn-sm boss-chip"
          :class="{ 'boss-on': b.id === bossId }" :disabled="locked" :aria-pressed="b.id === bossId"
          @click="selectBoss(b.id)">{{ b.name }}</button>
      </div>
      <span v-if="locked" class="muted lock-hint">計時中無法換王——請先按「重置」</span>
      <div class="spacer" />
      <button v-if="canPip" type="button" class="btn btn-sm" @click="togglePip">
        {{ pipBody ? '關閉抬頭顯示' : '抬頭顯示（子母畫面）' }}
      </button>
      <label class="sound-toggle">
        <input v-model="soundOn" type="checkbox" /> 聲音提醒
      </label>
    </div>

    <!-- 主視窗這一份 -->
    <MechanicPanels />

    <!-- 抬頭顯示那一份：同一份狀態、另一套排版 -->
    <Teleport v-if="pipBody" :to="pipBody">
      <MechanicPanels compact />
    </Teleport>

    <!-- 時間表只放主視窗：小視窗塞不下，大畫面才看得到完整的接下來 -->
    <CycleEvents v-if="cycleBoss" :boss="cycleBoss" />

    <template v-if="reflectOnly">
      <!-- 時間軸 -->
      <div class="card">
        <div class="section-head">
          <h3>接下來</h3>
          <div class="spacer" />
          <AnchorRow />
        </div>
        <p v-if="reflectState.phase === 'idle'" class="muted">按「反盾開始」後這裡會列出接下來的事件。</p>
        <ul v-else class="event-list">
          <li v-for="e in events" :key="e.at" class="event" :class="e.canAttack ? 'ev-ok' : 'ev-warn'">
            <span class="ev-time">{{ fmtTime(e.at, now) }}</span>
            <span class="ev-label">{{ e.label }}</span>
          </li>
        </ul>
      </div>

      <!-- 參數 -->
      <div class="card">
        <div class="section-head">
          <h3>參數</h3>
          <div class="spacer" />
          <button v-if="isOverridden" type="button" class="btn btn-sm reset-boss" @click="resetBossParams">
            還原{{ boss.name }}預設
          </button>
        </div>
        <fieldset class="param-group">
          <legend>{{ boss.name }}</legend>
          <div class="param-grid">
            <label class="field">
              <span class="field-label">反盾持續（秒）</span>
              <input v-model.number="reflectDuration" type="number" min="1" step="1" />
            </label>
            <label class="field">
              <span class="field-label">反盾間隔（秒）</span>
              <input v-model.number="intervalSeconds" type="number" min="1" step="1" />
            </label>
            <label class="field">
              <span class="field-label">間隔浮動（秒）</span>
              <input v-model.number="intervalFloat" type="number" min="0" step="1" />
            </label>
          </div>
        </fieldset>
        <fieldset class="param-group">
          <legend>玩家技能</legend>
          <div class="param-grid">
            <label class="field">
              <span class="field-label">魔消持續（秒，預設 {{ DEFAULT_DISPEL_DURATION }}）</span>
              <input v-model.number="dispelSeconds" type="number" min="1" step="1" />
            </label>
          </div>
        </fieldset>
      </div>
    </template>
  </section>
</template>

<style scoped>
.page-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.page-head h2 { margin: 0; font-size: 20px; font-weight: 680; }
.page-head .spacer { flex: 1; }
.sound-toggle { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--text-muted); cursor: pointer; }

.boss-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.boss-chip { border-radius: 999px; }
.boss-on, .boss-on:hover { background: var(--primary); border-color: var(--primary); color: #fff; }
.boss-on:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.boss-chip:disabled, .boss-chip:disabled:hover {
  opacity: .55; cursor: not-allowed;
}
.boss-on:disabled, .boss-on:disabled:hover {
  background: var(--primary); border-color: var(--primary); color: #fff;
}
.lock-hint { font-size: 12.5px; }

.section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.section-head h3 { margin: 0; }
.section-head .spacer { flex: 1; }
.event-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.event { display: flex; gap: 12px; align-items: center; padding: 7px 12px; border-radius: var(--radius-sm); font-size: 14.5px; }
.ev-ok { background: var(--success-soft); color: var(--success); }
.ev-warn { background: var(--danger-soft); color: var(--danger); font-weight: 650; }
.ev-time { font-family: var(--mono); font-variant-numeric: tabular-nums; min-width: 64px; font-weight: 650; flex: none; }
.ev-label { white-space: nowrap; }

.param-group {
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 12px 14px; margin: 0 0 14px;
}
.param-group:last-child { margin-bottom: 0; }
.param-group legend { padding: 0 6px; font-size: 12.5px; font-weight: 650; color: var(--text-muted); }
.reset-boss { margin-top: 0; color: var(--text-muted); }
.param-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12.5px; font-weight: 550; color: var(--text-muted); white-space: nowrap; }
</style>
