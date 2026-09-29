<script setup lang="ts">
import { computed } from 'vue'
import type { LootRecord, SettleStatus } from '../types'
import {
  teamTotal,
  leaderFee,
  serviceFee,
  computeIncomes,
  memberConsignmentTotal,
  roundDisplay,
} from '../calc/distribution'
import { displayNameIn, distOptionsFor } from '../store/groups'
import { splitDropShares } from '../format/dist'

const props = defineProps<{ record: LootRecord }>()
const emit = defineEmits<{ 'toggle-settle': [index: number]; 'toggle-drops-settle': [index: number] }>()
// 有可分的實物才有「物」這件事要標記
const hasDrops = computed(() => splitDropShares(props.record).length > 0)

const n = computed(() => props.record.members.length)
const total = computed(() => teamTotal(props.record))
const opts = computed(() => distOptionsFor(props.record.groupId))
const service = computed(() => serviceFee(props.record))
const fee = computed(() => leaderFee(props.record, opts.value))
const baseDisplay = computed(() =>
  Math.ceil(n.value > 0 ? (total.value - service.value - fee.value) / n.value : 0),
)
const consignments = computed(() => props.record.consignments ?? [])
const hasConsignments = computed(() => consignments.value.length > 0)
const rows = computed(() =>
  computeIncomes(props.record, opts.value).map((inc, i) => {
    const held = memberConsignmentTotal(consignments.value, inc.handle)
    return {
      ...inc,
      rounded: Math.ceil(inc.income),
      held,
      settleAmount: Math.ceil(inc.income) - held,
      settle: (props.record.members[i]?.settle ?? 'pending') as SettleStatus,
      dropsSettle: (props.record.members[i]?.dropsSettle ?? 'pending') as SettleStatus,
      index: i,
    }
  }),
)
</script>

<template>
  <div class="card dist">
    <div class="section-head"><h3>分配</h3></div>

    <div class="summary">
      <div class="stat">
        <span class="stat-label">團隊總額</span>
        <span class="stat-value">{{ total }}</span>
      </div>
      <template v-if="service > 0">
        <div class="stat-op">−</div>
        <div class="stat">
          <span class="stat-label">手續費</span>
          <span class="stat-value">{{ roundDisplay(service) }}</span>
        </div>
      </template>
      <template v-if="fee > 0">
        <div class="stat-op">−</div>
        <div class="stat">
          <span class="stat-label">辛苦費</span>
          <span class="stat-value">{{ roundDisplay(fee) }}</span>
        </div>
      </template>
      <div class="stat-op">÷</div>
      <div class="stat">
        <span class="stat-label">人數</span>
        <span class="stat-value">{{ n }}</span>
      </div>
      <div class="stat-op">=</div>
      <div class="stat">
        <span class="stat-label">每人基本</span>
        <span class="stat-value accent">{{ baseDisplay }}</span>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>團員</th><th class="num">基本</th>
          <th v-if="fee > 0" class="num">辛苦費</th>
          <th class="num">他人內購/(N-1)</th><th class="num">自己內購</th>
          <th class="num">收入</th>
          <th v-if="hasConsignments" class="num">代售</th>
          <th v-if="hasConsignments" class="num">結算</th>
          <th>結清</th>
        </tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.index">
            <td class="handle">{{ r.handle ? displayNameIn(record.groupId, r.handle) : '—' }}</td>
            <td class="num">{{ baseDisplay }}</td>
            <td v-if="fee > 0" class="num plus">{{ r.fee ? '+' + roundDisplay(r.fee) : 0 }}</td>
            <td class="num plus">{{ n > 1 ? '+' + Math.ceil(r.others / (n - 1)) : 0 }}</td>
            <td class="num minus">{{ r.own ? '−' + roundDisplay(r.own) : 0 }}</td>
            <td class="num income">{{ r.rounded }}</td>
            <td v-if="hasConsignments" class="num minus">{{ r.held ? '−' + r.held : 0 }}</td>
            <td v-if="hasConsignments" class="num settle">{{ r.settleAmount }}</td>
            <td class="settle-cell">
              <button type="button" class="chip" :class="r.settle === 'settled' ? 'chip-ok' : 'chip-pending'"
                @click="emit('toggle-settle', r.index)">
                {{ r.settle === 'settled' ? '✓ 錢已領' : '● 待領錢' }}
              </button>
              <button v-if="hasDrops" type="button" class="chip" :class="r.dropsSettle === 'settled' ? 'chip-ok' : 'chip-pending'"
                @click="emit('toggle-drops-settle', r.index)">
                {{ r.dropsSettle === 'settled' ? '✓ 物已領' : '● 待領物' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.summary {
  display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap;
  padding: 14px 16px; margin-bottom: 16px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
}
.stat { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 11.5px; color: var(--text-muted); font-weight: 550; }
.stat-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat-value.accent { color: var(--primary); }
.stat-op { align-self: center; color: var(--text-muted); font-size: 18px; font-weight: 600; }
.handle { font-weight: 550; }
.plus { color: var(--success); }
.minus { color: var(--danger); }
.income { font-weight: 750; font-size: 15px; }
.settle { font-weight: 750; font-size: 15px; color: var(--primary); }
.settle-cell { white-space: nowrap; }
.settle-cell .chip + .chip { margin-left: 6px; }
</style>
