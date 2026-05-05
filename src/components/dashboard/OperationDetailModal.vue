<script setup lang="ts">
import type { HoldingOperation, InvestorSide } from '@/types'

defineProps<{
  open: boolean
  selectedOperation: HoldingOperation | null
  selectedOperationsBySide: Record<InvestorSide, HoldingOperation | undefined>
  formatMoney: (value: number) => string
  formatNumber: (value: number) => string
  getOperationActionText: (type: HoldingOperation['type']) => string
  getInvestorSideText: (side: InvestorSide) => string
}>()

defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'revoke'): void
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
    <a-space v-if="selectedOperation" direction="vertical" :size="12" class="full-width">
      <a-descriptions bordered size="small" :column="1">
        <a-descriptions-item label="状态">
          {{ selectedOperation.status === 'pending' ? '待处理' : '已确认' }}
        </a-descriptions-item>
        <a-descriptions-item label="操作">{{
          getOperationActionText(selectedOperation.type)
        }}</a-descriptions-item>
        <a-descriptions-item v-if="selectedOperation.fundName" label="基金">
          {{ selectedOperation.fundName }}（{{ selectedOperation.fundCode }}）
        </a-descriptions-item>
        <a-descriptions-item v-if="selectedOperation.fromFundName" label="转出基金">
          {{ selectedOperation.fromFundName }}（{{ selectedOperation.fromFundCode }}）
        </a-descriptions-item>
        <a-descriptions-item v-if="selectedOperation.toFundName" label="转入基金">
          {{ selectedOperation.toFundName }}（{{ selectedOperation.toFundCode }}）
        </a-descriptions-item>
        <a-descriptions-item label="记录时间">
          {{ new Date(selectedOperation.date).toLocaleString('zh-CN', { hour12: false }) }}
        </a-descriptions-item>
      </a-descriptions>
      <div class="operation-side-grid">
        <div
          v-for="side in ['blogger', 'mine'] as InvestorSide[]"
          :key="side"
          class="operation-side-panel"
        >
          <div class="operation-side-title">{{ getInvestorSideText(side) }}</div>
          <div v-if="selectedOperationsBySide[side]" class="operation-side-fields">
            <div class="operation-side-field">
              <span>金额</span>
              <strong>{{ formatMoney(selectedOperationsBySide[side]?.amount ?? 0) }}</strong>
            </div>
            <div v-if="selectedOperationsBySide[side]?.share" class="operation-side-field">
              <span>转出份额</span>
              <strong>{{ formatNumber(selectedOperationsBySide[side]?.share ?? 0) }}</strong>
            </div>
          </div>
          <div v-else class="operation-side-empty">暂无记录</div>
        </div>
      </div>
      <a-button block danger @click="$emit('revoke')">删除这条记录</a-button>
    </a-space>
  </a-modal>
</template>
