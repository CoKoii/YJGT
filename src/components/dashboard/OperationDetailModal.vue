<script setup lang="ts">
import type { HoldingOperation } from '@/types'

defineProps<{
  open: boolean
  operations: HoldingOperation[]
  formatMoney: (value: number) => string
  formatNumber: (value: number) => string
  getOperationActionText: (type: HoldingOperation['type']) => string
}>()

defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'revoke', id: string): void
}>()
</script>

<template>
  <a-modal
    :open="open"
    centered
    title="操作记录"
    :footer="null"
    width="620px"
    @update:open="$emit('update:open', $event)"
  >
    <a-space v-if="operations.length > 0" direction="vertical" :size="12" class="full-width">
      <a-card v-for="operation in operations" :key="operation.id" size="small">
        <a-space direction="vertical" :size="12" class="full-width">
          <a-descriptions bordered size="small" :column="1">
            <a-descriptions-item label="状态">
              {{ operation.status === 'pending' ? '待结算' : '已结算' }}
            </a-descriptions-item>
            <a-descriptions-item label="操作">
              {{ getOperationActionText(operation.type) }}
            </a-descriptions-item>
            <a-descriptions-item label="基金">
              {{ operation.fundName }}（{{ operation.fundCode }}）
            </a-descriptions-item>
            <a-descriptions-item v-if="operation.toFundName" label="转入基金">
              {{ operation.toFundName }}（{{ operation.toFundCode }}）
            </a-descriptions-item>
            <a-descriptions-item :label="operation.type === 'buy' ? '博主金额' : '博主份额'">
              {{
                operation.type === 'buy'
                  ? formatMoney(operation.bloggerAmount)
                  : `${formatNumber(operation.bloggerAmount)} 份`
              }}
            </a-descriptions-item>
            <a-descriptions-item :label="operation.type === 'buy' ? '我的金额' : '我的份额'">
              {{
                operation.type === 'buy'
                  ? formatMoney(operation.myAmount)
                  : `${formatNumber(operation.myAmount)} 份`
              }}
            </a-descriptions-item>
            <a-descriptions-item label="记录时间">
              {{ new Date(operation.submittedAt).toLocaleString('zh-CN', { hour12: false }) }}
            </a-descriptions-item>
            <a-descriptions-item label="交易日">
              {{ operation.tradeDate }}
            </a-descriptions-item>
            <a-descriptions-item v-if="operation.settledAt" label="结算时间">
              {{ new Date(operation.settledAt).toLocaleString('zh-CN', { hour12: false }) }}
            </a-descriptions-item>
            <a-descriptions-item v-if="operation.settledFundNav" label="成交净值">
              {{ operation.settledFundNav.toFixed(4) }}
            </a-descriptions-item>
            <a-descriptions-item v-if="operation.settledTargetNav" label="转入净值">
              {{ operation.settledTargetNav.toFixed(4) }}
            </a-descriptions-item>
          </a-descriptions>
          <a-button block danger @click="$emit('revoke', operation.id)">删除这条记录</a-button>
        </a-space>
      </a-card>
    </a-space>
  </a-modal>
</template>
