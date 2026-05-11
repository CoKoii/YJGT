<script setup lang="ts">
import { computed } from 'vue'
import type { HoldingRow, Trade, TradeType } from '@/types/portfolio'
import { profitColorClass } from '@/utils/number'
import {
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  PlusOutlined,
  RobotOutlined,
  SwapOutlined,
} from '@ant-design/icons-vue'

const props = defineProps<{
  rows: HoldingRow[]
  myTodayProfit: number | null
  bloggerTodayProfit: number | null
  myTodayProfitRate: number | null
  bloggerTodayProfitRate: number | null
  myTotalProfit: number
  bloggerTotalProfit: number
  myTotalProfitRate: number
  bloggerTotalProfitRate: number
  formatMoney: (value: number) => string
  formatNumber: (value: number) => string
  formatPercent: (value: number) => string
  formatPlainPercent: (value: number) => string
}>()

defineEmits<{
  (event: 'snapshot'): void
  (event: 'open-ai'): void
  (event: 'export', key: 'json' | 'csv'): void
  (event: 'detail', row: HoldingRow): void
  (event: 'operation-detail', events: Trade[]): void
  (event: 'trade', payload: { row: HoldingRow; type: TradeType }): void
  (event: 'remove', row: HoldingRow): void
}>()

type SummaryMetric = {
  label: string
  value: number | null
  rate: number | null
  optional?: boolean
}

const summaryMetrics = computed<SummaryMetric[]>(() => [
  {
    label: '我的最新单日收益',
    value: props.myTodayProfit,
    rate: props.myTodayProfitRate,
    optional: true,
  },
  {
    label: '博主最新单日收益',
    value: props.bloggerTodayProfit,
    rate: props.bloggerTodayProfitRate,
    optional: true,
  },
  {
    label: '我的总收益',
    value: props.myTotalProfit,
    rate: props.myTotalProfitRate,
  },
  {
    label: '博主总收益',
    value: props.bloggerTotalProfit,
    rate: props.bloggerTotalProfitRate,
  },
])

function formatNullable(
  formatter: (value: number) => string,
  value: number | null,
): string {
  return value === null ? '--' : formatter(value)
}

function tradeLabel(type: TradeType): string {
  if (type === 'buy') return '买'
  if (type === 'sell') return '卖'
  return '转'
}
</script>

<template>
  <section class="portfolio-panel">
    <vxe-toolbar class="portfolio-toolbar" size="medium">
      <template #buttons>
        <div class="portfolio-summary">
          <span class="portfolio-title">持仓列表</span>
          <template v-for="item in summaryMetrics" :key="item.label">
            <span class="summary-label">{{ item.label }}</span>
            <span class="summary-profit">
              <span class="profit-value" :class="profitColorClass(item.value)">
                {{ item.optional ? formatNullable(props.formatMoney, item.value) : props.formatMoney(item.value ?? 0) }}
              </span>
              <span class="summary-rate profit-value" :class="profitColorClass(item.rate)">
                {{ item.optional ? formatNullable(props.formatPercent, item.rate) : props.formatPercent(item.rate ?? 0) }}
              </span>
            </span>
          </template>
        </div>
      </template>
      <template #tools>
        <div class="portfolio-actions">
          <a-button type="primary" @click="$emit('snapshot')">
            <template #icon><PlusOutlined /></template>
            买入基金
          </a-button>
          <a-button @click="$emit('open-ai')">
            <template #icon><RobotOutlined /></template>
            截图识别
          </a-button>
          <a-dropdown>
            <a-button>
              <template #icon><DownloadOutlined /></template>
              导出
              <DownOutlined />
            </a-button>
            <template #overlay>
              <a-menu
                @click="
                  ({ key }: { key: string | number }) => $emit('export', key as 'json' | 'csv')
                "
              >
                <a-menu-item key="json">源数据 JSON</a-menu-item>
                <a-menu-item key="csv">当前持仓 CSV</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </template>
    </vxe-toolbar>

    <div class="vxe-wrap">
      <vxe-table
        :data="props.rows"
        :row-config="{ isHover: true }"
        :column-config="{ resizable: true }"
        auto-resize
        border
        height="100%"
        show-overflow="tooltip"
      >
        <vxe-column type="seq" title="序号" width="64" fixed="left" align="center" />
        <vxe-column title="基金名称" field="fundName" fixed="left" min-width="190">
          <template #default="{ row }">
            <div class="fund-cell">
              <button class="link-button" @click.stop="$emit('detail', row)">
                <span class="fund-name-text">{{ row.fundName || '未命名基金' }}</span>
                <span>{{ row.fundCode }}</span>
              </button>
              <button
                v-if="row.pendingEvents.length > 0"
                type="button"
                class="operation-float-tag"
                @click.stop="$emit('operation-detail', row.pendingEvents)"
              >
                {{ tradeLabel(row.pendingEvents[0].type) }}
              </button>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="持有份额" align="right" min-width="140">
          <template #default="{ row }">
            <div class="metric-stack">
              <span class="metric-main">{{ formatNumber(row.myShares) }}</span>
              <span class="target-hint">博主：{{ formatNumber(row.bloggerShares) }}</span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="博主持仓金额" align="right" min-width="130">
          <template #default="{ row }">
            <span class="metric-main money-main">{{ formatNumber(row.bloggerAmount) }}</span>
          </template>
        </vxe-column>
        <vxe-column title="我的持仓金额" align="right" min-width="150">
          <template #default="{ row }">
            <div class="metric-stack">
              <span class="metric-main money-main">{{ formatNumber(row.myAmount) }}</span>
              <span class="target-hint">应投入：{{ formatNumber(row.targetInvested) }}</span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="占比" align="right" min-width="130">
          <template #default="{ row }">
            <div class="metric-stack">
              <span class="metric-main">{{ formatPlainPercent(row.myPositionRate) }}</span>
              <span class="target-hint">博主：{{ formatPlainPercent(row.bloggerPositionRate) }}</span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="博主持有收益" align="right" min-width="150">
          <template #default="{ row }">
            <div class="metric-stack">
              <span class="metric-main profit-value" :class="profitColorClass(row.bloggerProfit)">
                {{ formatMoney(row.bloggerProfit) }}
              </span>
              <span class="target-hint">
                <span class="profit-value" :class="profitColorClass(row.bloggerProfitRate)">
                  {{ formatPercent(row.bloggerProfitRate) }}
                </span>
              </span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="我的持有收益" align="right" min-width="150">
          <template #default="{ row }">
            <div class="metric-stack">
              <span class="metric-main profit-value" :class="profitColorClass(row.myProfit)">
                {{ formatMoney(row.myProfit) }}
              </span>
              <span class="target-hint">
                <span class="profit-value" :class="profitColorClass(row.myProfitRate)">
                  {{ formatPercent(row.myProfitRate) }}
                </span>
              </span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="当日收益" align="right" min-width="140">
          <template #default="{ row }">
            <div class="metric-stack">
              <span class="metric-main profit-value" :class="profitColorClass(row.myTodayProfit)">
                {{ formatNullable(props.formatMoney, row.myTodayProfit) }}
              </span>
              <span class="target-hint">
                博主：<span class="profit-value" :class="profitColorClass(row.bloggerTodayProfit)">
                  {{ formatNullable(props.formatMoney, row.bloggerTodayProfit) }}
                </span>
              </span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="操作" fixed="right" align="center" width="150">
          <template #default="{ row }">
            <a-space :size="2" class="row-actions" @click.stop>
              <a-button type="link" size="small" @click="$emit('trade', { row, type: 'buy' })">买</a-button>
              <a-button type="link" size="small" @click="$emit('trade', { row, type: 'sell' })">卖</a-button>
              <a-button type="link" size="small" @click="$emit('trade', { row, type: 'convert' })">
                <SwapOutlined />
              </a-button>
              <a-button type="link" size="small" danger title="清空当前持仓" @click="$emit('remove', row)">
                <DeleteOutlined />
              </a-button>
            </a-space>
          </template>
        </vxe-column>
      </vxe-table>
    </div>
  </section>
</template>
