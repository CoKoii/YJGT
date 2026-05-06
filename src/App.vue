<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { BarChartOutlined, BulbOutlined, SettingOutlined } from '@ant-design/icons-vue'
import OverviewPanel from '@/components/dashboard/OverviewPanel.vue'
import PortfolioTable from '@/components/dashboard/PortfolioTable.vue'
import { usePortfolioDashboard } from '@/composables/usePortfolioDashboard'
import type { AiConfig, BudgetConfig } from '@/types'
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatPlainPercent,
  getFollowTrendClass,
  getFollowTrendIcon,
  getInvestorSideText,
  getOperationActionText,
  getOperationLabel,
} from '@/utils/calculations'

const AiChatPanel = defineAsyncComponent(() => import('@/components/dashboard/AiChatPanel.vue'))
const AiRecognitionModal = defineAsyncComponent(
  () => import('@/components/dashboard/AiRecognitionModal.vue'),
)
const HoldingDetailModal = defineAsyncComponent(
  () => import('@/components/dashboard/HoldingDetailModal.vue'),
)
const HoldingModal = defineAsyncComponent(() => import('@/components/dashboard/HoldingModal.vue'))
const HoldingTrendCard = defineAsyncComponent(
  () => import('@/components/dashboard/HoldingTrendCard.vue'),
)
const OperationDetailModal = defineAsyncComponent(
  () => import('@/components/dashboard/OperationDetailModal.vue'),
)
const OperationModal = defineAsyncComponent(
  () => import('@/components/dashboard/OperationModal.vue'),
)
const SettingsModal = defineAsyncComponent(() => import('@/components/dashboard/SettingsModal.vue'))

const OPERATION_TITLES = {
  buy: '买入',
  sell: '卖出',
  convert: '转换',
} as const

const {
  aiChatMessages,
  aiConfigForm,
  aiSide,
  budgetForm,
  budgetUsage,
  holdingForm,
  holdingRows,
  isAiModalOpen,
  isBudgetModalOpen,
  isChatStreaming,
  isDetailModalOpen,
  isFundInfoLoading,
  isHoldingModalOpen,
  isOperationDetailOpen,
  isOperationModalOpen,
  isPreparingUploads,
  isRecognizing,
  openBudgetModal,
  openCreateModal,
  openDetailModal,
  openEditModal,
  openOperationDetail,
  openOperationModal,
  operationForm,
  ratio,
  recognizedRows,
  recognizedSummary,
  revokeSelectedOperations,
  runRecognition,
  saveHolding,
  saveOperation,
  saveSettings,
  selectedHolding,
  selectedOperation,
  selectedOperationsBySide,
  sendAiChatMessage,
  settingsSection,
  shouldInvest,
  store,
  syncOperationAmount,
  syncMyOperationAmount,
  todayProfit,
  uploadedFiles,
  applyRecognized,
  clearAiChatMessages,
  exportCsv,
  exportJson,
  fillFundNameByCode,
  fillOperationTargetFundName,
  handleUploadChange,
  removeHolding,
  setOperationShare,
} = usePortfolioDashboard()

function getOperationTitle() {
  const actionText = OPERATION_TITLES[operationForm.type]
  return `${actionText}：${operationForm.fundName}（${operationForm.fundCode}）`
}

function patchBudget(field: keyof BudgetConfig, value: number | null) {
  store.setBudget({ ...store.budget, [field]: Number(value ?? 0) })
}

function mergeState<T extends object>(target: T, value: Partial<T>) {
  Object.assign(target, value)
}

function updateBudgetForm(value: BudgetConfig) {
  mergeState(budgetForm, value)
}

function updateAiConfigForm(value: AiConfig) {
  mergeState(aiConfigForm, value)
}
</script>

<template>
  <a-config-provider
    :theme="{
      token: {
        colorPrimary: '#2563ff',
        borderRadius: 8,
        colorText: '#172554',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif',
      },
    }"
  >
    <a-layout class="app-shell" style="background: #f7f9fc">
      <a-layout-header class="page-header" style="background: transparent">
        <a-row align="middle" justify="space-between" :wrap="false">
          <a-col>
            <a-space align="center" :size="12">
              <span class="brand-icon"><BarChartOutlined /></span>
              <span class="brand-title">跟投助手</span>
            </a-space>
          </a-col>
          <a-col>
            <a-space>
              <a-button type="text" shape="circle"><BulbOutlined /></a-button>
              <a-button type="text" @click="openBudgetModal"><SettingOutlined />偏好设置</a-button>
            </a-space>
          </a-col>
        </a-row>
      </a-layout-header>

      <a-layout-content>
        <div class="page-stack main-stack">
          <OverviewPanel
            :blogger-budget="store.budget.bloggerBudget"
            :my-budget="store.budget.myBudget"
            :blogger-invested="store.totals.bloggerInvested"
            :my-invested="store.totals.myInvested"
            :budget-usage="budgetUsage"
            :ratio="ratio"
            :should-invest="shouldInvest"
            :format-money="formatMoney"
            @update:blogger-budget="patchBudget('bloggerBudget', $event)"
            @update:my-budget="patchBudget('myBudget', $event)"
          />

          <a-row :gutter="[12, 12]" align="stretch" class="content-row">
            <a-col :xs="24" :xl="18">
              <PortfolioTable
                :rows="holdingRows"
                :today-profit="todayProfit"
                :totals="store.totals"
                :format-money="formatMoney"
                :format-number="formatNumber"
                :format-percent="formatPercent"
                :format-plain-percent="formatPlainPercent"
                :get-operation-label="getOperationLabel"
                :get-follow-trend-class="getFollowTrendClass"
                :get-follow-trend-icon="getFollowTrendIcon"
                @create="openCreateModal"
                @open-ai="isAiModalOpen = true"
                @export="(key) => (key === 'json' ? exportJson() : exportCsv())"
                @detail="openDetailModal"
                @operation-detail="openOperationDetail"
                @operation="openOperationModal($event.row, $event.type)"
                @edit="openEditModal"
                @remove="removeHolding"
              />
            </a-col>

            <a-col :xs="24" :xl="6">
              <div class="page-stack side-stack">
                <HoldingTrendCard :history="store.history" />
                <AiChatPanel
                  :messages="aiChatMessages"
                  :is-streaming="isChatStreaming"
                  @send="sendAiChatMessage"
                  @clear="clearAiChatMessages"
                />
              </div>
            </a-col>
          </a-row>
        </div>
      </a-layout-content>

      <HoldingDetailModal
        :open="isDetailModalOpen"
        :holding="selectedHolding"
        :operations="store.operations"
        @update:open="isDetailModalOpen = $event"
      />

      <SettingsModal
        :open="isBudgetModalOpen"
        :budget="budgetForm"
        :ai-config="aiConfigForm"
        :section="settingsSection"
        @update:open="isBudgetModalOpen = $event"
        @update:section="settingsSection = $event"
        @update:budget="updateBudgetForm"
        @update:ai-config="updateAiConfigForm"
        @save="saveSettings"
      />

      <HoldingModal
        :open="isHoldingModalOpen"
        :form="holdingForm"
        :is-fund-info-loading="isFundInfoLoading"
        @update:open="isHoldingModalOpen = $event"
        @update:form="mergeState(holdingForm, $event)"
        @save="saveHolding"
        @fill-name="fillFundNameByCode"
      />

      <OperationModal
        :open="isOperationModalOpen"
        :form="operationForm"
        :format-number="formatNumber"
        :title="getOperationTitle()"
        @update:open="isOperationModalOpen = $event"
        @update:form="mergeState(operationForm, $event)"
        @save="saveOperation"
        @sync-my-amount="syncMyOperationAmount"
        @set-share="setOperationShare"
        @sync-operation-amount="syncOperationAmount"
        @fill-target-name="fillOperationTargetFundName"
      />

      <OperationDetailModal
        :open="isOperationDetailOpen"
        :selected-operation="selectedOperation"
        :selected-operations-by-side="selectedOperationsBySide"
        :format-money="formatMoney"
        :format-number="formatNumber"
        :get-operation-action-text="getOperationActionText"
        :get-investor-side-text="getInvestorSideText"
        @update:open="isOperationDetailOpen = $event"
        @revoke="revokeSelectedOperations"
      />

      <AiRecognitionModal
        :open="isAiModalOpen"
        :ai-side="aiSide"
        :uploaded-files="uploadedFiles"
        :recognized-rows="recognizedRows"
        :recognized-summary="recognizedSummary"
        :is-recognizing="isRecognizing"
        :is-preparing-uploads="isPreparingUploads"
        :format-money="formatMoney"
        @update:open="isAiModalOpen = $event"
        @update:ai-side="aiSide = $event"
        @upload-change="handleUploadChange"
        @recognize="runRecognition"
        @apply="applyRecognized"
      />
    </a-layout>
  </a-config-provider>
</template>
