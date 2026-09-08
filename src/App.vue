<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useRecordsStore } from './store/records'
import { dcSyncStatus } from './dc/publish'
import ChangelogDialog from './components/ChangelogDialog.vue'
import pkg from '../package.json'

// 版本號從 package.json 讀（CI 發版時更新的權威來源），不依賴網路
const version = pkg.version
const showChangelog = ref(false)

// 關閉分頁守衛：只管「當下正在編輯的這一筆」。掃全部紀錄會讓刻意留著不同步的
// 場次（例如東西還在慢慢賣）每次關分頁都跳提醒。
// 先跳瀏覽器標準確認；使用者選擇留下（頁面仍存活）→ 再跳自訂 dialog 補上原因。
const store = useRecordsStore()
const route = useRoute()
const showUnsynced = ref(false)

// 導覽分兩層：上面是兩個工具箱，分寶那邊的三個頁面收成第二層。
// 兩個工具箱的 active 都得自己判斷：/boss-toolkit 與 /boss-toolkit/:bossId、
// /loot 與 /loot/xxx 都是平行的路由紀錄，router-link 的 active 不會跨過去
const inBoss = computed(() => route.path.startsWith('/boss-toolkit'))
const inLoot = computed(() => route.path.startsWith('/loot'))

const currentDirty = computed(() => {
  if (!route.path.startsWith('/loot/edit/')) return undefined
  const r = store.get(route.params.id as string)
  return r && dcSyncStatus(r) === 'dirty' ? r : undefined
})

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!currentDirty.value) return
  e.preventDefault()
  e.returnValue = '' // 觸發瀏覽器標準「未儲存變更」確認
  setTimeout(() => {
    // 走到這裡代表使用者取消了關閉，補上原因說明
    if (currentDirty.value) showUnsynced.value = true
  }, 400)
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <div class="app">
    <!-- appbar 是一個 grid：標題跨兩列，第一列放兩個工具箱與版本，第二列只有分寶
         那一欄有東西。同一列的東西共用一個 row、各自在 row 內置中，字級不同也不會
         參差。第二層的縮排跟著分頁寬度自己算，不寫死 -->
    <header class="appbar">
      <router-link to="/boss-toolkit" class="brand">
        <span class="logo">楓</span>
        <h1>天天的楓之谷工具箱</h1>
      </router-link>
      <!-- display: contents，讓這幾個連結直接當 appbar 的 grid 項目，
           同時保留 nav 這個地標。第二層留在 appbar 裡是因為浮在頁面上時
           沒有底色也沒有框線撐著，看不出那幾個字可以點。
           BOSS 工具箱的王選單不搬——那排數量多，右邊還跟著抬頭顯示與聲音提醒 -->
      <nav class="nav">
        <router-link to="/boss-toolkit" class="nav-link nav-boss" :class="{ 'nav-active': inBoss }">BOSS 工具箱</router-link>
        <router-link to="/loot" class="nav-link nav-loot" :class="{ 'nav-active': inLoot }">分寶工具箱</router-link>
        <div v-if="inLoot" class="subnav">
          <router-link to="/loot" class="nav-link subnav-link" exact-active-class="nav-active">分寶紀錄</router-link>
          <router-link to="/loot/pending" class="nav-link subnav-link" active-class="nav-active">未領總覽</router-link>
          <router-link to="/loot/settings" class="nav-link subnav-link" active-class="nav-active">設定</router-link>
        </div>
      </nav>
      <button type="button" class="btn btn-ghost btn-sm version" title="看更新內容"
        @click="showChangelog = true">v{{ version }}</button>
    </header>

    <ChangelogDialog :open="showChangelog" @close="showChangelog = false" />

    <div v-if="showUnsynced" class="unsync-overlay" @click.self="showUnsynced = false">
      <div class="unsync-dialog">
        <h3>這筆紀錄尚未同步到 DC</h3>
        <p class="unsync-note">資料已存在本機，不會遺失；要更新 DC 貼文請按「同步至 DC」。</p>
        <div class="unsync-actions">
          <button type="button" class="btn btn-primary" @click="showUnsynced = false">知道了</button>
        </div>
      </div>
    </div>

    <router-view />
  </div>
</template>

<style>
:root {
  --font: 'Segoe UI', system-ui, -apple-system, 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
  --mono: 'JetBrains Mono', 'Consolas', 'Menlo', monospace;
  --bg: #f3f4f6;
  --surface: #ffffff;
  --surface-2: #f9fafb;
  --border: #e5e7eb;
  --border-strong: #d1d5db;
  --text: #1f2937;
  --text-muted: #6b7280;
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --primary-soft: #eef2ff;
  --success: #15803d;
  --success-soft: #dcfce7;
  --warn: #b45309;
  --warn-soft: #fef3c7;
  --danger: #dc2626;
  --danger-soft: #fee2e2;
  --info-soft: #e0f2fe;
  --info: #0369a1;
  --radius: 12px;
  --radius-sm: 8px;
  --shadow-sm: 0 1px 2px rgba(16, 24, 40, .06), 0 1px 3px rgba(16, 24, 40, .08);
  --shadow-md: 0 4px 6px -1px rgba(16, 24, 40, .08), 0 2px 4px -2px rgba(16, 24, 40, .05);
  --shadow-lg: 0 20px 25px -5px rgba(16, 24, 40, .14), 0 8px 10px -6px rgba(16, 24, 40, .08);
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.app { max-width: 980px; margin: 0 auto; padding: 0 20px 72px; }

/* ---- App bar ---- */
.appbar {
  position: sticky; top: 0; z-index: 30;
  margin: 0 -20px 26px; padding: 13px 20px;
  /*  [標題]  [BOSS]  [分寶]      [版本]
      [ 空 ]  [ 空 ]  [分寶第二層]        ← 只有分寶頁才有第二列
      標題待在第一列，不跨列——跨了會相對整條列置中，就跟第一列的分頁錯開  */
  display: grid;
  grid-template-columns: max-content max-content max-content 1fr;
  column-gap: 4px; row-gap: 5px;
  align-items: center; justify-items: start;
  background: rgba(255, 255, 255, .82);
  backdrop-filter: saturate(1.4) blur(10px);
  border-bottom: 1px solid var(--border);
}
.nav { display: contents; }
.brand { grid-row: 1; grid-column: 1; margin-right: 20px; }
.nav-boss { grid-row: 1; grid-column: 2; }
.nav-loot { grid-row: 1; grid-column: 3; }
.subnav { grid-row: 2; grid-column: 3; display: flex; gap: 4px; }
.version { grid-row: 1; grid-column: 4; justify-self: end; }
.nav-link {
  text-decoration: none; color: var(--text-muted);
  font-size: 14px; font-weight: 550; padding: 6px 13px; border-radius: 999px;
  transition: color .14s, background .14s;
  white-space: nowrap; /* 中文每字都是斷點，不鎖住會被擠成一字一行 */
}
.nav-link:hover { color: var(--text); background: var(--surface-2); }
.nav-active { color: var(--primary-hover); background: var(--primary-soft); }
.brand { display: inline-flex; align-items: center; gap: 11px; text-decoration: none; color: inherit; }
.brand .logo {
  width: 32px; height: 32px; border-radius: 9px; flex: none;
  display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 16px;
  background: linear-gradient(135deg, var(--primary), #8b5cf6);
  box-shadow: var(--shadow-sm);
}
.brand h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: .01em; }
.version { font-family: var(--mono); font-size: 12px; color: var(--text-muted); }
.version:hover { color: var(--text); }

/* 第二層小一號，看得出是下一層 */
.subnav-link { font-size: 13px; padding: 4px 11px; }

/* ---- Buttons ---- */
button { font-family: inherit; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 15px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--text);
  font-size: 14px; font-weight: 550; line-height: 1; cursor: pointer;
  transition: background .14s, border-color .14s, color .14s, transform .06s, box-shadow .14s;
  white-space: nowrap;
}
.btn:hover { background: var(--surface-2); border-color: var(--border-strong); }
.btn:active { transform: translateY(1px); }
.btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--primary-soft); }
.btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; box-shadow: var(--shadow-sm); }
.btn-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.btn-sm { padding: 6px 11px; font-size: 13px; }
.btn-danger { color: var(--danger); }
.btn-danger:hover { background: var(--danger-soft); border-color: var(--danger); }
.btn-ghost { background: transparent; border-color: transparent; }
.btn-ghost:hover { background: var(--surface-2); border-color: var(--border); }
.btn-icon {
  padding: 0; width: 34px; height: 34px; flex: none; color: var(--text-muted);
  border-radius: var(--radius-sm);
}
.btn-icon:hover { color: var(--text); }
.btn-icon.btn-danger:hover { color: var(--danger); }

/* ---- Inputs ---- */
.app input:not([type=checkbox]):not([type=radio]),
.app textarea,
.app select {
  font-family: inherit; font-size: 14px; color: var(--text);
  padding: 8px 11px; width: 100%;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface);
  transition: border-color .14s, box-shadow .14s;
}
.app input::placeholder, .app textarea::placeholder { color: #9ca3af; }
.app input:focus, .app textarea:focus, .app select:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
}
.app input.field-invalid { border-color: var(--danger); }
.app input.field-invalid:focus { box-shadow: 0 0 0 3px var(--danger-soft); }
.app input[type=number] { text-align: right; font-variant-numeric: tabular-nums; }

/* ---- Cards & sections ---- */
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow-sm);
  padding: 18px 20px; margin-bottom: 18px;
}
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
.section-head h3 { margin: 0; font-size: 15px; font-weight: 650; white-space: nowrap; }
.section-head .spacer { flex: 1; }
.section-head .count { font-size: 12px; color: var(--text-muted); font-weight: 500; }

/* ---- Tables ---- */
.table-wrap { overflow-x: auto; margin: 0 -4px; }
.app table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
.app thead th {
  text-align: left; font-weight: 600; font-size: 11.5px; letter-spacing: .03em;
  text-transform: none; color: var(--text-muted);
  padding: 6px 10px; border-bottom: 1px solid var(--border); white-space: nowrap;
}
.app tbody td { padding: 7px 10px; border-bottom: 1px solid var(--surface-2); vertical-align: middle; }
.app tbody tr:last-child td { border-bottom: none; }
.app tbody tr:hover { background: var(--surface-2); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.app thead th.num { text-align: right; }

/* ---- Chips ---- */
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; border-radius: 999px; border: 1px solid transparent;
  font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
  transition: filter .14s;
}
.chip:hover { filter: brightness(.96); }
.chip-ok { background: var(--success-soft); color: var(--success); }
.chip-cart { background: var(--info-soft); color: var(--info); }
.chip-struck { background: #f3f4f6; color: #9ca3af; }
.chip-pending { background: var(--warn-soft); color: var(--warn); }

/* ---- Alerts ---- */
.alert { padding: 9px 13px; border-radius: var(--radius-sm); font-size: 13.5px; margin: 0 0 14px; }
.alert-warn { background: var(--warn-soft); color: var(--warn); border: 1px solid #fcd888; }
.field-error { color: var(--danger); font-size: 12px; margin-top: 3px; display: block; }

/* ---- 未同步提醒 dialog ---- */
.unsync-overlay {
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  background: rgba(17, 24, 39, .5); backdrop-filter: blur(2px); padding: 20px;
}
.unsync-dialog {
  background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-lg);
  padding: 20px; width: min(440px, 92vw);
}
.unsync-dialog h3 { margin: 0 0 8px; font-size: 16px; font-weight: 650; }
.unsync-note { margin: 0 0 12px; font-size: 13px; color: var(--text-muted); }
.unsync-actions { display: flex; justify-content: flex-end; margin-top: 14px; }

/* ---- 窄螢幕（手機）----
   通則：短標籤一律 nowrap，放不下時讓容器橫捲或整塊換行，
   絕不讓中文被擠成一字一行。 */
@media (max-width: 720px) {
  .app { padding: 0 14px 56px; }

  /* 窄螢幕改成：標題與版本鈕一列，導覽往下移一列（第二層再往下一列）
     [標題　　][版本]
     [BOSS][分寶]
     [ 　 ][分寶第二層] */
  .appbar {
    margin: 0 -14px 20px; padding: 10px 14px;
    grid-template-columns: max-content max-content 1fr; row-gap: 8px;
  }
  .brand { grid-row: 1; grid-column: 1 / span 2; margin-right: 0; }
  .brand h1 { font-size: 16px; }
  .version { grid-row: 1; grid-column: 3; }
  .nav-boss { grid-row: 2; grid-column: 1; }
  .nav-loot { grid-row: 2; grid-column: 2; }
  .subnav { grid-row: 3; grid-column: 2; }

  .card { padding: 14px; margin-bottom: 14px; }
  .section-head { flex-wrap: wrap; }
  /* 表格原本被壓縮到容器寬，每格一起逐字折行；改成不小於內容自然寬度，
     .table-wrap 的 overflow-x 才會真的接手橫向捲動（欄少的表格則維持不捲） */
  .app table { min-width: max-content; }
  .empty { padding: 32px 16px; }
}

/* ---- Utility ---- */
.muted { color: var(--text-muted); }
.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.empty {
  text-align: center; color: var(--text-muted); padding: 48px 20px;
  border: 1px dashed var(--border-strong); border-radius: var(--radius); background: var(--surface);
}

/* ---- 機制計算機的色塊面板（反盾與女皇兩種模板共用同一套視覺語言）----
   idle 灰＝還沒開始；attack 綠＝安全可打；reflect 紅＝機制正在發生或即將發生。
   引信邊框與進度條都表示「本段剩多少」。 */
.phase-panel {
  position: relative; text-align: center; padding: 26px 20px;
  transition: background .25s, border-color .25s;
}

/* 引信：SVG 不設 viewBox，rect 用 100% 貼齊容器，所以圓角與線寬都不會被拉伸。
   pathLength=100 把周長正規化成 100，dasharray 直接吃百分比。 */
.fuse { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.fuse rect {
  x: 1.5px; y: 1.5px; width: calc(100% - 3px); height: calc(100% - 3px);
  rx: 11px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round;
}
.phase-reflect .fuse rect { stroke: var(--danger); }
.phase-attack .fuse rect { stroke: var(--success); }
.phase-idle { background: var(--surface-2); }
.phase-reflect { background: var(--danger-soft); border-color: var(--danger); }
.phase-attack { background: var(--success-soft); border-color: var(--success); }
.phase-title { font-size: 22px; font-weight: 750; }
.phase-reflect .phase-title { color: var(--danger); }
.phase-attack .phase-title { color: var(--success); }
.remaining-row { display: flex; align-items: center; justify-content: center; gap: 14px; }
.nudge { flex: none; font-variant-numeric: tabular-nums; }
.phase-remaining { font-size: 64px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.phase-remaining .unit { font-size: 24px; font-weight: 600; margin-left: 4px; }
.phase-bar { height: 6px; border-radius: 999px; background: rgba(0,0,0,.08); margin: 12px auto 0; max-width: 420px; overflow: hidden; }
.phase-bar-fill { height: 100%; background: currentColor; opacity: .45; }

/* 對齊遊戲計時：反盾與女皇兩個面板共用 */
.anchor-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
/* 用 flex-basis 定寬：全域的 input{width:100%} 特異性較高，
   在有 spacer 的標題列裡會把輸入框整條撐開 */
.anchor-input { flex: 0 0 130px; font-family: var(--mono); font-size: 13px; }
.game-clock {
  font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 15px; font-weight: 750;
  padding: 3px 10px; border-radius: 6px; background: var(--primary-soft); color: var(--primary);
}

/* ---- 子母畫面：整組面板搬到一個很小的置頂視窗 ----
   這裡的每一條都在擠高度：視窗只有 200px，內容越矮、等比縮放的倍率就越大，
   字反而看得更清楚。 */
.pip-body {
  margin: 0; padding: 5px; background: var(--bg); overflow: hidden;
  /* 小視窗上都是要連點的按鈕，手一滑就整片反白，看起來像壞掉 */
  user-select: none; -webkit-user-select: none;
  /* 縱向排：時間、血條、機制各佔自己的高度，反盾的操作區吃掉底下剩餘的空間——
     矮的王（反盾王 196 vs 阿卡 250）底下才不會空一截。視窗開得夠高（310）時
     fitToWindow 判定塞得下就不縮，縮放固定 1，字級固定、換王不會整個視窗忽大忽小 */
  display: flex; flex-direction: column; align-items: stretch; min-height: 100vh; box-sizing: border-box;
}
.pip-body > * { flex: 0 0 auto; }
.pip-body > :last-child { margin-bottom: 0; }
/* 剩餘的高度給血條——打王時眼睛盯的是它；按鈕固定高，不跟著長 */
.pip-body > .hp-card { flex: 1 0 auto; display: flex; flex-direction: column; }
/* 只有輸入框留著可以選、可以編輯 */
.pip-body input { user-select: text; -webkit-user-select: text; }
.pip-body.app { max-width: none; padding: 5px; }
.pip-body .card { margin-bottom: 4px; padding: 5px 7px; }
/* HpCapture 自己 scoped 了 margin-bottom: 12px，跟上一條同特異性、它後載入所以贏；
   多寫一個 class 壓回來，不然血量那列平白多吃 8px */
.pip-body .card.hp-card { margin-bottom: 4px; }
.pip-body .phase-panel { padding: 6px 8px; }
/* 面板高度釘在該王「最高的那個狀態」。子母畫面是依內容高度等比縮放的，
   面板一從待機進入計時中（反盾）、或血量從等待變成有數字再進 70 秒循環（阿卡），
   內容一變高縮放就跟著跳，整個視窗的字忽大忽小——而且正好發生在開打那一刻。
   待機時先把空間留著，那塊本來就是等下要用的。數字是 480x144 視窗、width 100%
   時量的 CSS px：反盾計時中 75、阿卡過 20% 進循環 169。循環面板每個 item 都帶
   phase-panel，但它觸發前後等高，不需要、也不能被這條撐開 */
.pip-body .phase-panel:not(.cycle-item):not(.hp-threshold) { min-height: 75px; }
.pip-body .hp-threshold { min-height: 169px; }
.pip-body .phase-title { font-size: 15px; }
.pip-body .phase-remaining { font-size: 26px; }
.pip-body .phase-bar { height: 4px; margin-top: 4px; }
.pip-body .remaining-row, .pip-body .seg-row { margin-top: 2px; gap: 5px; }
/* DamageReflectPanel scoped 的 .ctrl[data-v] { min-width: 120px } 跟 .pip-body .ctrl 同特異性、
   它後載入所以贏——min-width: 0 從來沒生效過，五顆按鈕最少 600px 塞不進 480 寬。多寫一層
   .controls 壓過去 */
.pip-body .controls .ctrl { min-width: 0; padding: 10px 4px; font-size: 14px; }
.pip-body .controls { gap: 6px; }
/* 折行只看視窗寬，不看 fitToWindow 撐開後的 body 寬——不然換行改高度、高度改縮放、
   縮放又改換行，算不收斂。窄視窗 3+2 兩排 */
@media (max-width: 420px) { .pip-body .controls .ctrl { flex-basis: 30%; } }
/* 小視窗放不下也不需要的：操作說明、事件表、待機時的提示 */
.pip-body .ctrl-hint, .pip-body .phase-note, .pip-body .events-card { display: none; }
/* 標題在小視窗裡是廢話，血條本身就說明一切；「下次」「60s」同理 */
.pip-body .hp-card h3, .pip-body .until-label, .pip-body .cycle-interval { display: none; }
.pip-body .hp-card .section-head { margin-bottom: 2px; }
.pip-body .hp-card .btn { padding: 3px 8px; font-size: 12px; }
.pip-body .hp-bar { height: 12px; }
.pip-body .hp-row { margin-top: 2px; }
.pip-body .hp-percent { font-size: 24px; min-width: 5ch; }
.pip-body .hp-dps { font-size: 11px; }
/* 小視窗裡排成一列：疊成多排會讓整體變高，等比縮下來字就小到看不清 */
.pip-body .cycle-grid {
  grid-template-columns: none !important;
  grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px;
  align-items: stretch;
}
.pip-body .cycle-item { padding: 4px 3px; gap: 2px; }
/* 五格並排每格只有 86px，−1s／＋1s 兩顆塞不下會擠出格子邊界；PiP 裡只留符號。
   CycleBoard scoped 的 .cycle-item .nudge[data-v] 跟 .pip-body .cycle-item .nudge 同特異性、
   後載入的贏，所以多加 .btn 才壓得過（標題與倒數的縮字規則同樣輸給 scoped，但視窗現在
   夠高不縮放、你要的就是大字，那兩條直接拿掉讓元件原值生效） */
.pip-body .cycle-item .btn.nudge { padding: 2px 6px; font-size: 13px; }
.pip-body .cycle-item .nudge-unit { display: none; }
.pip-body .cycle-item .seg-remaining { padding: 1px 4px; font-size: 11px; }
/* 跟反盾的五顆 .ctrl 同一個尺寸——同樣是打王時要按的主按鈕，不該一邊 36px 一邊 22px */
.pip-body .cycle-item .trigger { margin-top: 3px; padding: 10px 4px; font-size: 14px; }
.pip-body .pip-clock {
  padding: 0 2px 3px; margin-bottom: 3px;
  background: none; border: none; box-shadow: none;
}
.pip-body .anchor-row { justify-content: flex-start; gap: 4px; flex-wrap: nowrap; }
/* 上面 .app input:not(…):not(…) 是 (0,3,1)，.pip-body .anchor-input 只有 (0,2,0) 會輸給它——
   這條之前從來沒生效過，時間那列因此高了 7px。疊到 (0,4,1) 才壓得過 */
.pip-body.app input.anchor-input { flex: 0 0 74px; font-size: 11.5px; padding: 3px 6px; text-align: center; }
.pip-body .hp-threshold .marks { margin-top: 5px; gap: 4px; }
.pip-body .hp-threshold .mark { padding: 2px 8px; font-size: 11.5px; }
.pip-body .hp-threshold .sub-row { margin-top: 4px; gap: 5px; }
.pip-body .hp-threshold .gap-value { font-size: 24px; }
.pip-body .hp-threshold .need-capture { margin-top: 4px; }
.pip-body .cycle-head { margin-bottom: 3px; }
.pip-body .cycle-head .btn { padding: 2px 8px; font-size: 11.5px; }
.pip-body .anchor-row .btn { padding: 3px 7px; font-size: 11.5px; }
.pip-body .game-clock { font-size: 13px; padding: 1px 7px; }
</style>
