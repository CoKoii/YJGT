<script setup lang="ts">
import type { InvestorSide, Trade } from '@/types/portfolio'

defineProps<{
  open: boolean
  events: Trade[]
  formatMoney: (value: number) => string
  formatNumber: (value: number) => string
}>()

defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'remove', id: string): void
}>()

function typeText(type: Trade['type']): string {
  if (type === 'buy') return '买入'
  if (type === 'sell') return '卖出'
  return '转换'
}

function sideLabel(side: InvestorSide): string {
  return side === 'blogger' ? '博主' : '我的'
}

function sideValue(event: Trade, side: InvestorSide, formatMoney: (value: number) => string, formatNumber: (value: number) => string): string {
  if (event.type === 'buy') return formatMoney(event.amounts[side])
  if (event.type === 'sell') return `${formatNumber(event.sharesBySide[side])} 份`
  return `${formatNumber(event.outSharesBySide[side])} 份`
}

function navText(event: Trade): string {
  if (event.type === 'buy') return event.navBySide?.mine ? event.navBySide.mine.toFixed(4) : '--'
  if (event.type === 'sell') return event.navBySide?.mine ? event.navBySide.mine.toFixed(4) : '--'
  return event.outNavBySide?.mine ? event.outNavBySide.mine.toFixed(4) : '--'
}
</script>

<template>
  <a-modal
    :open="open"
    centered
    title="操作记录"
    width="620px"
    :footer="null"
    @update:open="$emit('update:open', $event)"
  >
    <a-space v-if="events.length > 0" direction="vertical" :size="12" class="full-width">
      <a-card v-for="event in events" :key="event.id" size="small">
        <a-space direction="vertical" :size="12" class="full-width">
          <a-descriptions bordered size="small" :column="1">
            <a-descriptions-item label="状态">
              {{ event.status === 'settled' ? '已结算' : '待结算' }}
            </a-descriptions-item>
            <a-descriptions-item label="操作">{{ typeText(event.type) }}</a-descriptions-item>
            <a-descriptions-item label="基金">
              {{ event.fundName }}（{{ event.fundCode }}）
            </a-descriptions-item>
            <a-descriptions-item v-if="event.type === 'convert'" label="转入基金">
              {{ event.targetFundName }}（{{ event.targetFundCode }}）
            </a-descriptions-item>
            <a-descriptions-item
              v-for="side in (['blogger', 'mine'] as InvestorSide[])"
              :key="side"
              :label="`${sideLabel(side)}${event.type === 'buy' ? '金额' : '份额'}`"
            >
              {{ sideValue(event, side, formatMoney, formatNumber) }}
            </a-descriptions-item>
            <a-descriptions-item label="记录时间">
              {{ new Date(event.recordedAt).toLocaleString('zh-CN', { hour12: false }) }}
            </a-descriptions-item>
            <a-descriptions-item label="交易日">{{ event.tradeDate }}</a-descriptions-item>
            <a-descriptions-item v-if="event.status === 'settled'" label="成交净值">
              {{ navText(event) }}
            </a-descriptions-item>
            <a-descriptions-item
              v-if="event.type === 'convert' && event.status === 'settled'"
              label="转入净值"
            >
              {{ event.inNavBySide?.mine ? event.inNavBySide.mine.toFixed(4) : '--' }}
            </a-descriptions-item>
          </a-descriptions>
          <a-button block danger @click="$emit('remove', event.id)">删除这条记录</a-button>
        </a-space>
      </a-card>
    </a-space>
    <a-empty v-else description="暂无操作记录" />
  </a-modal>
</template>
