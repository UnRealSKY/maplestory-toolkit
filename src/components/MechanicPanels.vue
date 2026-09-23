<script setup lang="ts">
import { computed, provide } from 'vue'
import type { CycleBoss, HpBoss } from '../boss/bosses'
import { currentBoss } from '../boss/session'
import HpCapture from './HpCapture.vue'
import CycleBoard from './CycleBoard.vue'
import HpThresholdBoard from './HpThresholdBoard.vue'
import DamageReflectPanel from './DamageReflectPanel.vue'
import AnchorRow from './AnchorRow.vue'

// 這一組面板會同時出現在主視窗與抬頭顯示——兩份各自渲染，讀的是同一份狀態。
// compact 是抬頭顯示那份：小視窗塞不下的東西在那裡收起來。
const props = defineProps<{ compact?: boolean }>()
// 徽章元件靠這個知道自己在哪一份
provide('pipCompact', props.compact === true)

const boss = computed(() => currentBoss())
const cycleBoss = computed(() => (boss.value.mechanic === 'cycle' ? (boss.value as CycleBoss) : null))
const hpBoss = computed(() => (boss.value.mechanic === 'hp' ? (boss.value as HpBoss) : null))
const reflectBoss = computed(() => boss.value.mechanic === 'damage-reflect')
</script>

<template>
  <!-- 小視窗看不到下面的事件表，遊戲計時要自己帶一份 -->
  <div v-if="props.compact && !cycleBoss" class="card pip-clock"><AnchorRow /></div>

  <HpCapture />

  <HpThresholdBoard v-if="hpBoss" :boss="hpBoss" />

  <CycleBoard v-else-if="cycleBoss" :boss="cycleBoss">
    <!-- 小視窗把遊戲計時放進重置那一列，省一條只放一顆按鈕的空列 -->
    <template #lead>
      <AnchorRow v-if="props.compact" />
    </template>
  </CycleBoard>

  <DamageReflectPanel v-else-if="reflectBoss" />
</template>
