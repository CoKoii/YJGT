<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { InboxOutlined, RobotOutlined } from '@ant-design/icons-vue'
import type { InvestorSide, RecognizedHolding, UploadedFileItem, UploadedFileMeta } from '@/types'

const props = defineProps<{
  open: boolean
  aiSide: InvestorSide
  uploadedFiles: UploadedFileMeta[]
  recognizedRows: RecognizedHolding[]
  recognizedSummary: { amount: number; profit: number }
  isRecognizing: boolean
  isPreparingUploads: boolean
  formatMoney: (value: number) => string
}>()

defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:ai-side', value: InvestorSide): void
  (event: 'upload-change', payload: { fileList: UploadedFileItem[] }): void
  (event: 'recognize'): void
  (event: 'apply'): void
}>()

const tableWrapRef = ref<HTMLDivElement | null>(null)
const tableScrollY = ref(0)
let tableResizeObserver: ResizeObserver | null = null
const TABLE_HEADER_SELECTOR = '.ant-table-thead'
const TABLE_SCROLL_PADDING = 2

function updateTableScrollY() {
  const wrap = tableWrapRef.value
  if (!wrap) {
    tableScrollY.value = 0
    return
  }

  const headerHeight =
    wrap.querySelector<HTMLElement>(TABLE_HEADER_SELECTOR)?.getBoundingClientRect().height ?? 0

  tableScrollY.value = Math.max(wrap.clientHeight - headerHeight - TABLE_SCROLL_PADDING, 0)
}

function bindTableResizeObserver() {
  if (!tableWrapRef.value) return

  tableResizeObserver = new ResizeObserver(updateTableScrollY)
  tableResizeObserver.observe(tableWrapRef.value)
}

function unbindTableResizeObserver() {
  tableResizeObserver?.disconnect()
  tableResizeObserver = null
}

function syncTableLayout() {
  unbindTableResizeObserver()
  bindTableResizeObserver()
  updateTableScrollY()
}

onBeforeUnmount(() => {
  unbindTableResizeObserver()
})

watch(
  [() => props.open, () => props.recognizedRows.length],
  ([isOpen]) => {
    if (!isOpen) return

    void nextTick(() => {
      syncTableLayout()
    })
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <a-modal
    :open="open"
    centered
    title="AI 识别持仓截图"
    width="1040px"
    wrap-class-name="ai-recognition-modal"
    ok-text="确认"
    cancel-text="取消"
    @update:open="$emit('update:open', $event)"
    @ok="$emit('apply')"
  >
    <a-row :gutter="[20, 20]" class="ai-recognition-layout">
      <a-col :xs="24" :md="8">
        <a-card size="small" class="ai-control-card">
          <div class="ai-control-stack">
            <div class="ai-control-section">
              <div class="ai-card-title">选择截图类型</div>
              <a-radio-group
                :value="aiSide"
                button-style="solid"
                class="ai-side-tabs"
                @update:value="$emit('update:ai-side', $event)"
              >
                <a-radio-button value="mine">我的截图</a-radio-button>
                <a-radio-button value="blogger">博主截图</a-radio-button>
              </a-radio-group>
            </div>
            <a-upload-dragger
              :file-list="uploadedFiles"
              accept="image/*"
              multiple
              :before-upload="() => false"
              :max-count="20"
              class="upload-box"
              @change="$emit('upload-change', $event)"
            >
              <div class="upload-content">
                <p class="ant-upload-drag-icon"><InboxOutlined /></p>
                <p class="ant-upload-text">上传持仓截图</p>
                <p class="ant-upload-hint">支持多张连续截图，自动匹配基金代码、金额、收益</p>
              </div>
            </a-upload-dragger>
            <a-button
              type="primary"
              :loading="isRecognizing || isPreparingUploads"
              :disabled="isPreparingUploads"
              block
              class="ai-recognize-button"
              @click="$emit('recognize')"
            >
              <RobotOutlined />开始识别
            </a-button>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :md="16">
        <a-card size="small" class="ai-result-card">
          <a-space direction="vertical" :size="12" class="ai-panel-stack">
            <a-row justify="space-between" align="top" :wrap="false">
              <a-col>
                <div class="ai-card-title">识别结果</div>
                <div class="ai-card-subtitle">确认无误后点击 OK 写入持仓</div>
              </a-col>
              <a-col>
                <div class="ai-result-summary">
                  <span class="ai-result-count">{{ recognizedRows.length }} 条</span>
                  <span class="ai-result-stat"
                    >总金额 {{ formatMoney(recognizedSummary.amount) }}</span
                  >
                  <span
                    class="ai-result-stat"
                    :class="recognizedSummary.profit >= 0 ? 'red' : 'green'"
                  >
                    总收益 {{ formatMoney(recognizedSummary.profit) }}
                  </span>
                </div>
              </a-col>
            </a-row>
          </a-space>
          <a-divider class="ai-result-divider" />
          <div ref="tableWrapRef" class="recognized-table-wrap">
            <a-table
              :data-source="recognizedRows"
              :locale="{ emptyText: '暂无数据' }"
              :pagination="false"
              :scroll="{ y: tableScrollY }"
              size="small"
              :row-key="(record: RecognizedHolding) => record.fundCode || record.fundName"
              class="recognized-table"
            >
              <a-table-column title="基金">
                <template #default="{ record }">
                  <div class="recognized-fund-cell">
                    <div class="recognized-fund-name">{{ record.fundName }}</div>
                    <div class="recognized-fund-code">{{ record.fundCode || '未匹配代码' }}</div>
                  </div>
                </template>
              </a-table-column>
              <a-table-column title="金额" :width="128" align="right">
                <template #default="{ record }">{{ formatMoney(record.amount) }}</template>
              </a-table-column>
              <a-table-column title="收益" :width="128" align="right">
                <template #default="{ record }">
                  <span class="profit-value" :class="record.profit >= 0 ? 'red' : 'green'">
                    {{ formatMoney(record.profit) }}
                  </span>
                </template>
              </a-table-column>
            </a-table>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </a-modal>
</template>
