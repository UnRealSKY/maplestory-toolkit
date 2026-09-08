<script setup lang="ts">
import { computed } from 'vue'
import type { CycleBoss } from '../boss/bosses'
import { secondsLeft, cyclesElapsed } from '../boss/cycle'
import { cycleClocks, triggerCycle, nudgeCycle, resetCycles, anyCycleRunning } from '../boss/cycleClocks'
import { ensureAudio } from '../boss/sound'
import { fmtTime } from '../boss/anchor'
import { now, touchNow } from '../boss/clock'

const props = defineProps<{ boss: CycleBoss }>()

// 計時狀態與響鈴都在模組層：這個面板會同時開在主視窗與抬頭顯示，
// 放元件裡的話兩份會各走各的、還會響兩次
const clocks = cycleClocks()
// 剩幾秒內算「快來了」：反盾面板用整段顏色表達安全與否，這裡沿用同一組語意
const WARN_SECONDS = 5

const running = computed(() => anyCycleRunning(props.boss.cycles))

function onTrigger(id: string) {
  // 用同一個時間戳，倒數才不會在下次更新之前先閃一個大 1 秒的數字
  triggerCycle(id, touchNow())
  ensureAudio()
}
function onNudge(id: string, deltaSec: number) {
  nudgeCycle(id, deltaSec)
}
function resetAll() {
  resetCycles(props.boss.cycles)
}

function leftOf(id: string, interval: number): number | null {
  return secondsLeft(clocks[id], interval, now.value)
}
// 下次觸發的時刻。跟反盾的「可輸出到」一樣是固定的一刻，不隨 now 抖動
function nextAt(id: string, interval: number): number | null {
  const clock = clocks[id]
  if (clock == null) return null
  return clock + (cyclesElapsed(clock, interval, now.value) + 1) * interval * 1000
}
// 面板配色：未開始灰、計時中綠、剩 5 秒內轉紅（機制要來了）
function phaseClass(id: string, interval: number): string {
  const left = leftOf(id, interval)
  if (left == null) return 'phase-idle'
  return left <= WARN_SECONDS ? 'phase-reflect' : 'phase-attack'
}
// 引信與進度條共用同一個比例：本輪已經過多少
function progress(id: string, interval: number): number {
  const clock = clocks[id]
  if (clock == null) return 0
  const elapsed = ((now.value - clock) / 1000) % interval
  return Math.min(100, Math.max(0, (elapsed / interval) * 100))
}
</script>

<template>
  <div class="cycle-board">
    <div class="cycle-head">
      <!-- 子母畫面把遊戲計時塞在這裡，跟重置共用一列 -->
      <slot name="lead" />
      <div class="spacer" />
      <button type="button" class="btn btn-sm" :disabled="!running" @click="resetAll">重置</button>
    </div>
    <ul class="cycle-grid" :style="{ '--cycle-count': boss.cycles.length }">
      <li v-for="c in boss.cycles" :key="c.id" class="card phase-panel cycle-item"
        :class="phaseClass(c.id, c.interval)">
        <!-- 引信：與反盾面板同一套，邊框燒短就是本輪快到了 -->
        <svg v-if="clocks[c.id] != null" class="fuse" aria-hidden="true">
          <rect pathLength="100" :stroke-dasharray="`${100 - progress(c.id, c.interval)} 100`" />
        </svg>
        <div class="phase-title">
          {{ c.name }}<span class="cycle-interval">{{ c.interval }}s</span>
        </div>
        <!-- 主角是「下次幾點觸發」，本輪剩幾秒退成小字（跟反盾面板同一個安排）。
             還沒觸發的也保留同一組欄位，不然一按下去卡片就撐高、整排高低不齊 -->
        <div class="until-label">下次</div>
        <div class="phase-remaining until-time" :class="{ 'not-started': clocks[c.id] == null }">
          {{ clocks[c.id] == null ? '—' : fmtTime(nextAt(c.id, c.interval)!, now) }}
        </div>
        <div class="remaining-row seg-row">
          <button type="button" class="btn btn-sm nudge" title="減 1 秒"
            :disabled="clocks[c.id] == null" @click="onNudge(c.id, -1)">−<span class="nudge-unit">1s</span></button>
          <span class="seg-remaining">{{ clocks[c.id] == null ? '—' : `${leftOf(c.id, c.interval)}s` }}</span>
          <button type="button" class="btn btn-sm nudge" title="加 1 秒"
            :disabled="clocks[c.id] == null" @click="onNudge(c.id, 1)">＋<span class="nudge-unit">1s</span></button>
        </div>
        <div class="phase-bar">
          <div class="phase-bar-fill" :style="{ width: progress(c.id, c.interval) + '%' }" />
        </div>
        <button type="button" class="btn ctrl trigger" @click="onTrigger(c.id)">觸發</button>
      </li>
    </ul>

  </div>
</template>

<style scoped>
.cycle-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cycle-head .spacer { flex: 1; }
.cycle-grid {
  list-style: none; margin: 0; padding: 0;
  display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
/* 寬螢幕一列擺完，不管有幾個機制 */
@media (min-width: 860px) {
  .cycle-grid { grid-template-columns: repeat(var(--cycle-count), minmax(0, 1fr)); }
}
/* 反盾面板是整頁一塊，這裡一列五塊，字級與留白等比縮小 */
.cycle-item { padding: 14px 10px; }
.cycle-item .phase-title { font-size: 16px; display: flex; align-items: baseline; justify-content: center; gap: 5px; }
.cycle-interval { font-size: 12px; font-weight: 500; color: var(--text-muted); }
.until-label { margin-top: 6px; font-size: 12px; font-weight: 650; color: var(--text-muted); }
.cycle-item .phase-remaining { font-size: 30px; }
.until-time { font-family: var(--mono); letter-spacing: -1px; }
.cycle-item .remaining-row { gap: 4px; margin-top: 6px; }
.cycle-item .nudge { padding: 3px 6px; font-size: 11.5px; }
.seg-remaining {
  font-size: 12.5px; font-weight: 650; font-variant-numeric: tabular-nums;
  padding: 2px 6px; border-radius: 6px; background: rgba(0, 0, 0, .07);
}
.cycle-item .phase-bar { margin-top: 10px; }
.not-started { color: var(--text-muted); }
.trigger { margin-top: 10px; width: 100%; padding: 8px 10px; font-size: 14px; font-weight: 650; }

</style>
