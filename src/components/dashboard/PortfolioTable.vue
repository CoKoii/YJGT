<script setup lang="ts">
import type { HoldingOperation, HoldingRow, OperationType } from '@/types'
import {
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons-vue'

defineProps<{
  rows: HoldingRow[]
  todayProfit: { mine: number | null; blogger: number | null }
  totals: {
    myProfit: number
    bloggerProfit: number
    myProfitRate: number
    bloggerProfitRate: number
  }
  formatMoney: (value: number) => string
  formatNumber: (value: number) => string
  formatPercent: (value: number) => string
  formatPlainPercent: (value: number) => string
  getOperationLabel: (value: OperationType) => string
  getFollowTrendClass: (current: number, target: number) => string
  getFollowTrendIcon: (current: number, target: number) => string
}>()

defineEmits<{
  (event: 'create'): void
  (event: 'open-ai'): void
  (event: 'export', key: 'json' | 'csv'): void
  (event: 'detail', row: HoldingRow): void
  (event: 'operation-detail', operations: HoldingOperation[]): void
  (event: 'operation', payload: { row: HoldingRow; type: OperationType }): void
  (event: 'edit', row: HoldingRow): void
  (event: 'remove', row: HoldingRow): void
}>()

function getProfitClass(value: number): 'red' | 'green' {
  return value >= 0 ? 'red' : 'green'
}

function formatDailyProfit(formatMoney: (value: number) => string, value: number | null): string {
  return value === null ? '--' : formatMoney(value)
}

function getOptionalProfitClass(value: number | null): 'red' | 'green' | '' {
  return value === null ? '' : getProfitClass(value)
}
</script>

<template>
  <section class="portfolio-panel">
    <vxe-toolbar class="portfolio-toolbar" size="medium">
      <template #buttons>
        <div class="portfolio-summary">
          <span class="portfolio-title">持仓列表</span>
          <span class="summary-label">我的当日收益</span>
          <span :class="getOptionalProfitClass(todayProfit.mine)">{{
            formatDailyProfit(formatMoney, todayProfit.mine)
          }}</span>
          <span class="summary-label">博主当日收益</span>
          <span :class="getOptionalProfitClass(todayProfit.blogger)">{{
            formatDailyProfit(formatMoney, todayProfit.blogger)
          }}</span>
          <span class="summary-label">我的总收益</span>
          <span :class="getProfitClass(totals.myProfit)">
            {{ formatMoney(totals.myProfit) }}（{{ formatPercent(totals.myProfitRate) }}）
          </span>
          <span class="summary-label">博主总收益</span>
          <span :class="getProfitClass(totals.bloggerProfit)">
            {{ formatMoney(totals.bloggerProfit) }}（{{ formatPercent(totals.bloggerProfitRate) }}）
          </span>
        </div>
      </template>
      <template #tools>
        <div class="portfolio-actions">
          <a-button type="primary" @click="$emit('create')">
            <template #icon><PlusOutlined /></template>
            添加持仓
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
                <a-menu-item key="json">导出为 JSON</a-menu-item>
                <a-menu-item key="csv">导出为 CSV</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </template>
    </vxe-toolbar>

    <div class="vxe-wrap">
      <vxe-table
        :data="rows"
        :column-config="{ resizable: true }"
        :row-config="{ isHover: true }"
        auto-resize
        border
        height="100%"
        show-overflow="tooltip"
      >
        <vxe-column type="seq" title="序号" width="64" fixed="left" align="center" />
        <vxe-column title="基金名称" field="fundName" fixed="left">
          <template #default="{ row }">
            <div class="fund-cell">
              <button class="link-button" @click.stop="$emit('detail', row)">
                <span class="fund-name-text">{{ row.fundName }}</span>
                <span>{{ row.fundCode }}</span>
              </button>
              <button
                v-if="row.pendingOperations.length > 0"
                type="button"
                class="operation-float-tag"
                @click.stop="$emit('operation-detail', row.pendingOperations)"
              >
                {{ getOperationLabel(row.pendingOperations[0].type) }}
              </button>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="博主持仓金额" align="right">
          <template #default="{ row }">
            <span class="metric-main money-main">{{ formatNumber(row.bloggerInvested) }}</span>
          </template>
        </vxe-column>
        <vxe-column title="我的持仓金额" align="right">
          <template #default="{ row }">
            <div class="metric-stack">
              <div
                class="target-line"
                :class="getFollowTrendClass(row.myInvested, row.targetInvested)"
              >
                <span
                  class="metric-main money-main follow-trend-value"
                  :class="getFollowTrendClass(row.myInvested, row.targetInvested)"
                >
                  {{ formatNumber(row.myInvested) }}
                </span>
                <span
                  class="target-arrow"
                  :class="getFollowTrendClass(row.myInvested, row.targetInvested)"
                  >{{ getFollowTrendIcon(row.myInvested, row.targetInvested) }}</span
                >
              </div>
              <span class="target-hint">应投入：{{ formatNumber(row.targetInvested) }}</span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="占比" align="right">
          <template #default="{ row }">
            <div class="metric-stack">
              <span class="metric-main percent-main">{{
                formatPlainPercent(row.myPositionRate)
              }}</span>
              <span class="target-hint"
                >博主占比：{{ formatPlainPercent(row.bloggerPositionRate) }}</span
              >
            </div>
          </template>
        </vxe-column>
        <vxe-column title="博主持有收益" align="right">
          <template #default="{ row }">
            <div class="metric-stack">
              <span
                class="metric-main money-main profit-value"
                :class="getProfitClass(row.bloggerProfit)"
              >
                {{ formatMoney(row.bloggerProfit) }}
              </span>
              <span class="target-hint profit-value" :class="getProfitClass(row.bloggerRate)">
                {{ formatPercent(row.bloggerRate) }}
              </span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="我的持有收益" align="right">
          <template #default="{ row }">
            <div class="metric-stack">
              <span
                class="metric-main money-main profit-value"
                :class="getProfitClass(row.myProfit)"
              >
                {{ formatMoney(row.myProfit) }}
              </span>
              <span class="target-hint profit-value" :class="getProfitClass(row.myRate)">
                {{ formatPercent(row.myRate) }}
              </span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="当日收益" align="right">
          <template #default="{ row }">
            <div class="metric-stack">
              <span
                class="metric-main money-main profit-value"
                :class="getOptionalProfitClass(row.myDailyProfit)"
              >
                {{ formatDailyProfit(formatMoney, row.myDailyProfit) }}
              </span>
              <span class="target-hint profit-value">
                博主收益：
                <span :class="getOptionalProfitClass(row.bloggerDailyProfit)">
                  {{ formatDailyProfit(formatMoney, row.bloggerDailyProfit) }}
                </span>
              </span>
            </div>
          </template>
        </vxe-column>
        <vxe-column title="操作" fixed="right" align="center">
          <template #default="{ row }">
            <a-space :size="2" class="row-actions" @click.stop>
              <a-button type="link" size="small" @click="$emit('operation', { row, type: 'buy' })"
                >买</a-button
              >
              <a-button type="link" size="small" @click="$emit('operation', { row, type: 'sell' })"
                >卖</a-button
              >
              <a-button
                type="link"
                size="small"
                @click="$emit('operation', { row, type: 'convert' })"
                >转</a-button
              >
              <a-button type="link" size="small" title="编辑" @click="$emit('edit', row)">
                <EditOutlined />
              </a-button>
              <a-button type="link" size="small" danger title="删除" @click="$emit('remove', row)">
                <DeleteOutlined />
              </a-button>
            </a-space>
          </template>
        </vxe-column>
      </vxe-table>
    </div>
  </section>
</template>
