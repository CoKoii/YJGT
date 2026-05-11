<script setup lang="ts">
import { computed } from 'vue'
import { InboxOutlined, RobotOutlined } from '@ant-design/icons-vue'
import type { InvestorSide, RecognizedHolding } from '@/types/portfolio'
import type { UploadChangeParam, UploadFile } from 'ant-design-vue'
import { formatMoney, profitColorClass } from '@/utils/number'

const props = defineProps<{
  open: boolean
  side: InvestorSide
  fileList: UploadFile[]
  rows: RecognizedHolding[]
  recognizing: boolean
  preparing: boolean
}>()

defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:side', value: InvestorSide): void
  (event: 'upload-change', value: UploadChangeParam): void
  (event: 'recognize'): void
  (event: 'apply'): void
}>()

const summary = computed(() =>
  props.rows.reduce(
    (total, row) => ({
      amount: total.amount + (Number.isFinite(row.amount) ? row.amount : 0),
      profit: total.profit + (Number.isFinite(row.profit) ? row.profit : 0),
    }),
    { amount: 0, profit: 0 },
  ),
)
</script>

<template>
  <a-modal
    :open="open"
    centered
    title="截图导入"
    width="980px"
    ok-text="写入快照事件"
    cancel-text="关闭"
    @update:open="$emit('update:open', $event)"
    @ok="$emit('apply')"
  >
    <a-row :gutter="[18, 18]" class="ai-recognition-layout">
      <a-col :xs="24" :md="8">
        <a-space direction="vertical" :size="14" class="full-width">
          <a-radio-group
            :value="side"
            button-style="solid"
            class="full-width segmented-radio"
            @update:value="$emit('update:side', $event)"
          >
            <a-radio-button value="mine">我的截图</a-radio-button>
            <a-radio-button value="blogger">博主截图</a-radio-button>
          </a-radio-group>
          <a-upload-dragger
            :file-list="fileList"
            accept="image/*"
            multiple
            :before-upload="() => false"
            :max-count="20"
            @change="$emit('upload-change', $event)"
          >
            <p class="ant-upload-drag-icon"><InboxOutlined /></p>
            <p class="ant-upload-text">拖入或选择持仓截图</p>
            <p class="ant-upload-hint">识别结果会写入源快照，不会反推份额</p>
          </a-upload-dragger>
          <a-button
            type="primary"
            block
            :loading="recognizing || preparing"
            :disabled="preparing"
            @click="$emit('recognize')"
          >
            <RobotOutlined />
            开始识别
          </a-button>
        </a-space>
      </a-col>
      <a-col :xs="24" :md="16">
        <div class="ai-result-summary-bar">
          <span class="ai-result-count">{{ rows.length }} 条</span>
          <span class="ai-result-stat">总金额 {{ formatMoney(summary.amount) }}</span>
          <span class="ai-result-stat" :class="profitColorClass(summary.profit)">
            总收益 {{ formatMoney(summary.profit) }}
          </span>
        </div>
        <a-table
          :data-source="rows"
          :pagination="{ pageSize: 8 }"
          size="small"
          :row-key="(record: RecognizedHolding) => record.fundCode || record.fundName"
        >
          <a-table-column title="基金">
            <template #default="{ record }">
              <div class="recognized-fund-cell">
                <div class="recognized-fund-name">{{ record.fundName || '未识别名称' }}</div>
                <div class="recognized-fund-code">{{ record.fundCode || '未识别代码' }}</div>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="金额" :width="130" align="right">
            <template #default="{ record }">{{ formatMoney(record.amount) }}</template>
          </a-table-column>
          <a-table-column title="收益" :width="130" align="right">
            <template #default="{ record }">
              <span :class="profitColorClass(record.profit)">
                {{ formatMoney(record.profit) }}
              </span>
            </template>
          </a-table-column>
        </a-table>
      </a-col>
    </a-row>
  </a-modal>
</template>
