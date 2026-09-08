<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  attackEndAt,
  cooldownRemaining,
  dispelWindowStart,
  phaseEnd,
  resistRemaining,
  DISPEL_RESIST,
  DISPEL_COOLDOWN,
} from '../boss/damageReflect'
import {
  reflectState,
  reflectParams,
  dispelFeedback,
  onStartReflect,
  onStartInterval,
  onStartBlocked,
  onDispel,
  onResetReflect,
  onNudgeReflect,
} from '../boss/session'
import { now } from '../boss/clock'
import { ensureAudio } from '../boss/sound'
import { fmtTime } from '../boss/anchor'

// 反盾面板。狀態機在 boss/session 那一份跑，這裡只負責畫與接操作——
// 這個面板會同時出現在主視窗與抬頭顯示，推進與音效不能各做一次。
const state = reflectState
const params = computed(() => reflectParams())

const remaining = computed(() => {
  if (state.value.phase === 'idle') return 0
  return Math.max(0, Math.ceil((phaseEnd(state.value, params.value) - now.value) / 1000))
})
const progress = computed(() => {
  if (state.value.phase === 'idle') return 0
  const total = phaseEnd(state.value, params.value) - state.value.phaseStart
  return Math.min(100, Math.max(0, ((now.value - state.value.phaseStart) / total) * 100))
})
// 引信：邊框剩下的比例。pathLength=100 把周長正規化，這裡直接給百分比
const fuseLeft = computed(() => 100 - progress.value)
// 可以打到什麼時候。這是固定的一刻（由階段結束時間推出），不隨 now 抖動
const attackEnd = computed(() => attackEndAt(state.value, params.value))

const PHASE_META = {
  idle: { cls: 'phase-idle', title: '待機', note: '開戰看到反盾出現時按「反盾開始」' },
  reflect: { cls: 'phase-reflect', title: '反盾中 ⛔ 禁止輸出', note: '' },
  interval: { cls: 'phase-attack', title: '間隔 ⚔ 可輸出', note: '' },
  blocked: { cls: 'phase-attack', title: '反盾阻止成功 ⚔ 可輸出', note: '' },
} as const
const meta = computed(() => PHASE_META[state.value.phase])
// 王的耐性／技能冷卻剩餘（純提醒，不阻擋任何按鈕）
const resistLeft = computed(() => resistRemaining(state.value, now.value))
const cooldownLeft = computed(() => cooldownRemaining(state.value, now.value))

// 魔消有效中（間隔進入有效窗、尚未標記、且王的耐性已退）：色塊閃爍提醒。
// 耐性還在時放了也擋不掉，閃爍催人去放會誤導。
const dispelActive = computed(() => {
  const s = state.value
  if (s.phase !== 'interval' || s.dispelValid || resistLeft.value > 0) return false
  return (now.value - s.phaseStart) / 1000 >= dispelWindowStart(params.value)
})
const intervalNote = computed(() => {
  if (state.value.phase !== 'interval') return ''
  if (resistLeft.value > 0) return `王的耐性還有 ${resistLeft.value} 秒，這段時間魔消擋不掉反盾`
  return ''
})

// 魔消時機錯誤：閃黃三下
const earlyFlash = ref(false)
let earlyTimer: ReturnType<typeof setTimeout> | undefined
function flashEarly() {
  earlyFlash.value = false
  requestAnimationFrame(() => {
    earlyFlash.value = true
    clearTimeout(earlyTimer)
    earlyTimer = setTimeout(() => (earlyFlash.value = false), 1000)
  })
}

let feedbackTimer: ReturnType<typeof setTimeout> | undefined
function dispel() {
  const result = onDispel()
  ensureAudio()
  if (result === 'wrongPhase') return
  if (result === 'tooEarly') flashEarly()
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => (dispelFeedback.value = ''), 2000)
}
const startReflect = () => {
  onStartReflect()
  ensureAudio()
}
const startInterval = () => {
  onStartInterval()
  ensureAudio()
}
const startBlocked = () => {
  onStartBlocked()
  ensureAudio()
}

// 大色塊的「下一階段」列（僅在有遊戲計時對齊時顯示）
const nextPhaseInfo = computed(() => {
  const s = state.value
  if (s.phase === 'idle') return null
  const time = fmtTime(phaseEnd(s, params.value), now.value)
  if (!time.includes(':')) return null // 還沒對齊遊戲計時就沒有時刻可講
  const label =
    s.phase === 'reflect'
      ? '間隔（可輸出）'
      : s.phase === 'interval'
        ? s.dispelValid
          ? '反盾阻止成功（可輸出）'
          : '反盾期間（禁止輸出）'
        : '間隔（可輸出）'
  return { label, time }
})
</script>

<template>
  <!-- 大字現況 -->
  <div class="card phase-panel" :class="[meta.cls, { 'dispel-active': dispelActive, 'flash-early': earlyFlash }]">
    <!-- 引信：邊框繞著色塊燒短，燒完就是本階段結束 -->
    <svg v-if="state.phase !== 'idle'" class="fuse" aria-hidden="true">
      <rect pathLength="100" :stroke-dasharray="`${fuseLeft} 100`" />
    </svg>
    <div class="phase-title">{{ meta.title }}</div>
    <!-- 可輸出時：主角是「可以打到什麼時候」；本段倒數退成旁邊的小字 -->
    <template v-if="attackEnd != null">
      <div class="until-label">可輸出到</div>
      <div class="phase-remaining until-time">{{ fmtTime(attackEnd, now) }}</div>
      <div class="remaining-row seg-row">
        <button type="button" class="btn btn-sm nudge" title="當前階段減 1 秒"
          @click="onNudgeReflect(-1)">−1s</button>
        <span class="seg-remaining">本段 {{ remaining }}s</span>
        <button type="button" class="btn btn-sm nudge" title="當前階段加 1 秒"
          @click="onNudgeReflect(1)">＋1s</button>
      </div>
    </template>
    <!-- 反盾中沒得打，主角就是這段還要忍多久 -->
    <div v-else-if="state.phase !== 'idle'" class="remaining-row">
      <button type="button" class="btn btn-sm nudge" title="當前階段減 1 秒"
        @click="onNudgeReflect(-1)">−1s</button>
      <div class="phase-remaining">{{ remaining }}<span class="unit">s</span></div>
      <button type="button" class="btn btn-sm nudge" title="當前階段加 1 秒"
        @click="onNudgeReflect(1)">＋1s</button>
    </div>
    <div v-if="state.phase !== 'idle'" class="phase-bar">
      <div class="phase-bar-fill" :style="{ width: progress + '%' }" />
    </div>
    <div v-if="nextPhaseInfo" class="phase-next">
      下一階段：{{ nextPhaseInfo.label }} <span class="next-time">{{ nextPhaseInfo.time }}</span>
    </div>
    <div v-if="meta.note || intervalNote" class="phase-note">{{ intervalNote || meta.note }}</div>
    <div v-if="cooldownLeft > 0" class="phase-sub muted">技能冷卻 {{ cooldownLeft }} 秒</div>
    <div v-if="dispelFeedback" class="dispel-feedback" :class="dispelFeedback">
      {{ dispelFeedback === 'valid' ? '✓ 有效魔消' : '✕ 無效魔消（太早，反盾重施前就失效了）' }}
    </div>
  </div>

  <!-- 操作 -->
  <div class="card controls-card">
    <div class="controls">
      <button type="button" class="btn ctrl ctrl-reflect" @click="startReflect">反盾開始</button>
      <button type="button" class="btn ctrl ctrl-interval" @click="startInterval">反盾結束</button>
      <button type="button" class="btn ctrl ctrl-interval" @click="startBlocked">反盾阻止成功</button>
      <button type="button" class="btn btn-primary ctrl" :disabled="state.phase !== 'interval'"
        @click="dispel">魔消成功</button>
      <button type="button" class="btn btn-ghost ctrl" @click="onResetReflect">重置</button>
    </div>
    <p class="muted ctrl-hint">
      反盾持續是標準 {{ params.reflectDuration }} 秒；間隔是「最少」{{ params.interval }} 秒，
      <template v-if="params.intervalFloat">最晚可能拖到 {{ params.interval + params.intervalFloat }} 秒才重施——</template>
      <template v-else>——</template>
      倒數到 0 會自動推進，看到遊戲內實況時按上方按鈕即可隨時校正。
      魔消要在間隔第 {{ dispelWindowStart(params) }} 秒之後放才撐得到反盾重施；
      對王有 {{ DISPEL_RESIST }} 秒耐性、技能本身 {{ DISPEL_COOLDOWN }} 秒冷卻。
    </p>
  </div>
</template>

<style scoped>
.phase-next { margin-top: 12px; font-size: 15.5px; font-weight: 600; }
.phase-next .next-time {
  font-family: var(--mono); font-variant-numeric: tabular-nums; font-weight: 750;
  padding: 2px 8px; border-radius: 6px; background: rgba(0, 0, 0, .07); margin-left: 4px;
}
.phase-note { margin-top: 12px; font-size: 14.5px; font-weight: 550; }
.phase-sub { margin-top: 4px; font-size: 12.5px; }
.until-label { margin-top: 6px; font-size: 13px; font-weight: 650; color: var(--success); }
.until-time { font-family: var(--mono); color: var(--success); letter-spacing: -1px; }
.seg-row { margin-top: 6px; }
.seg-remaining {
  font-size: 13.5px; font-weight: 650; font-variant-numeric: tabular-nums;
  padding: 2px 8px; border-radius: 6px; background: rgba(0, 0, 0, .07);
}
.dispel-feedback { margin-top: 10px; font-size: 14px; font-weight: 650; }
.dispel-feedback.valid { color: var(--success); }
.dispel-feedback.tooEarly { color: var(--danger); }
.controls { display: flex; gap: 10px; flex-wrap: wrap; }
.ctrl { flex: 1; min-width: 120px; padding: 14px 16px; font-size: 15px; font-weight: 650; }
.ctrl-reflect { border-color: var(--danger); color: var(--danger); }
.ctrl-reflect:hover { background: var(--danger-soft); }
.ctrl-interval { border-color: var(--success); color: var(--success); }
.ctrl-interval:hover { background: var(--success-soft); }
.ctrl-hint { margin: 12px 0 0; font-size: 13px; }
.nudge { flex: none; font-variant-numeric: tabular-nums; }
</style>
