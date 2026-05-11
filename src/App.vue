<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref, watch } from 'vue'
import { BarChartOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import type { UploadChangeParam, UploadFile } from 'ant-design-vue'
import DetailModal from '@/components/DetailModal.vue'
import HistoryCard from '@/components/HistoryCard.vue'
import OverviewPanel from '@/components/OverviewPanel.vue'
import OperationDetailModal from '@/components/OperationDetailModal.vue'
import PortfolioTable from '@/components/PortfolioTable.vue'
import SettingsModal from '@/components/SettingsModal.vue'
import SnapshotModal, { type SnapshotForm } from '@/components/SnapshotModal.vue'
import TradeModal, { type TradeForm } from '@/components/TradeModal.vue'
import { FUND_CODE_PATTERN } from '@/constants/portfolio'
import { fetchFundInfo, fetchFundNetWorthTrend, searchFundByName } from '@/services/fund'
import { loadAiChatMessages, saveAiChatMessages } from '@/services/storage'
import { usePortfolioStore } from '@/stores/portfolio'
import type {
  AiChatMessage,
  HoldingRow,
  InvestorSide,
  RecognizedHolding,
  Settings,
  SideValues,
  Trade,
  TradeType,
} from '@/types/portfolio'
import { formatDateKey } from '@/utils/date'
import {
  csvEscape,
  followRatio,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPlainPercent,
  roundMoney,
} from '@/utils/number'
import { downloadText } from '@/utils/file'
import { readImageDataUrl } from '@/utils/file'

const store = usePortfolioStore()
const AiChatPanel = defineAsyncComponent(() => import('@/components/AiChatPanel.vue'))
const AiRecognitionModal = defineAsyncComponent(() => import('@/components/AiRecognitionModal.vue'))

const isSnapshotOpen = ref(false)
const isTradeOpen = ref(false)
const isDetailOpen = ref(false)
const isSettingsOpen = ref(false)
const isAiRecognitionOpen = ref(false)
const isOperationDetailOpen = ref(false)
const loadingFundInfo = ref(false)
const loadingTargetFund = ref(false)
const syncingNav = ref(false)
const preparingUploads = ref(false)
const recognizing = ref(false)
const chatStreaming = ref(false)
const selectedHoldingCode = ref<string | null>(null)
const navSyncPromise = ref<Promise<void> | null>(null)
const aiSide = ref<InvestorSide>('mine')
const aiFiles = ref<UploadFile[]>([])
const aiImageDataUrls = ref<Record<string, string>>({})
const recognizedRows = ref<RecognizedHolding[]>([])
const selectedOperationEvents = ref<Trade[]>([])
const chatMessages = ref<AiChatMessage[]>(loadAiChatMessages())

const emptyValues = (): SideValues => ({ mine: 0, blogger: 0 })

const snapshotForm = reactive<SnapshotForm>({
  fundCode: '',
  fundName: '',
  myAmount: 0,
  bloggerAmount: 0,
})

const settingsForm = reactive<Settings>({
  myBudget: 0,
  bloggerBudget: 0,
  aiBaseURL: '',
  aiApiKey: '',
  aiModel: '',
})

const tradeForm = reactive<TradeForm>({
  type: 'buy',
  fundCode: '',
  fundName: '',
  targetFundCode: '',
  targetFundName: '',
  amounts: emptyValues(),
  shares: emptyValues(),
})

const ratio = computed(() => followRatio(store.settings))
const shouldInvest = computed(() =>
  ratio.value.blogger > 0 ? store.totals.bloggerCost / ratio.value.blogger : 0,
)
const myTodayProfitRate = computed(() =>
  store.totals.myTodayProfit === null || store.totals.myAmount === store.totals.myTodayProfit
    ? null
    : (store.totals.myTodayProfit / (store.totals.myAmount - store.totals.myTodayProfit)) * 100,
)
const bloggerTodayProfitRate = computed(() =>
  store.totals.bloggerTodayProfit === null ||
  store.totals.bloggerAmount === store.totals.bloggerTodayProfit
    ? null
    : (store.totals.bloggerTodayProfit /
        (store.totals.bloggerAmount - store.totals.bloggerTodayProfit)) *
      100,
)
const budgetUsage = computed(() => ({
  mine: store.settings.myBudget > 0 ? (store.totals.myCost / store.settings.myBudget) * 100 : 0,
  blogger:
    store.settings.bloggerBudget > 0
      ? (store.totals.bloggerCost / store.settings.bloggerBudget) * 100
      : 0,
}))
const followRatioText = computed(() => `${ratio.value.blogger || 0} : ${ratio.value.mine}`)
const selectedHolding = computed(() => {
  return store.holdings.find((holding) => holding.fundCode === selectedHoldingCode.value) ?? null
})
const currentTradeHolding = computed(() => {
  return store.holdings.find((holding) => holding.fundCode === tradeForm.fundCode) ?? null
})
const selectedNavPoints = ref<Array<{ date: string; nav: number }>>([])

const tradeTitle = computed(() => {
  const action = tradeForm.type === 'buy' ? '买入' : tradeForm.type === 'sell' ? '卖出' : '转换'
  return `${action}：${tradeForm.fundName || tradeForm.fundCode}`
})

const antThemeConfig = {
  token: {
    colorPrimary: '#2563ff',
    colorText: '#172554',
    colorTextSecondary: '#64748b',
    colorTextHeading: '#172554',
    colorBgBase: '#f7f9fc',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorder: '#e3e8f2',
    colorBorderSecondary: '#edf1f7',
    colorSplit: '#edf1f7',
    colorFillSecondary: '#f8fafc',
    borderRadius: 8,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif',
  },
} as const

function patchSettings(field: keyof Settings, value: number | null): void {
  store.setSettings({ ...store.settings, [field]: Number(value ?? 0) })
}

function patchSettingsForm(value: Settings): void {
  Object.assign(settingsForm, value)
}

function patchSnapshotForm(value: SnapshotForm): void {
  Object.assign(snapshotForm, value)
}

function patchTradeForm(value: TradeForm): void {
  Object.assign(tradeForm, value)
}

function resetSnapshotForm(): void {
  Object.assign(snapshotForm, {
    fundCode: '',
    fundName: '',
    myAmount: 0,
    bloggerAmount: 0,
  })
}

function resetTradeForm(row: HoldingRow, type: TradeType): void {
  Object.assign(tradeForm, {
    type,
    fundCode: row.fundCode,
    fundName: row.fundName,
    targetFundCode: '',
    targetFundName: '',
    amounts: emptyValues(),
    shares: emptyValues(),
  })
}

function openSnapshotModal(): void {
  resetSnapshotForm()
  isSnapshotOpen.value = true
}

function openSettings(): void {
  Object.assign(settingsForm, store.settings)
  isSettingsOpen.value = true
}

function saveSettings(): void {
  store.setSettings({ ...settingsForm })
  isSettingsOpen.value = false
  message.success('设置已保存')
}

function openTradeModal(payload: { row: HoldingRow; type: TradeType }): void {
  resetTradeForm(payload.row, payload.type)
  isTradeOpen.value = true
}

function openOperationDetail(events: Trade[]): void {
  selectedOperationEvents.value = events
  isOperationDetailOpen.value = true
}

async function openDetail(row: HoldingRow): Promise<void> {
  selectedHoldingCode.value = row.fundCode
  selectedNavPoints.value =
    store.navHistory.find((item) => item.fundCode === row.fundCode)?.points ?? []
  isDetailOpen.value = true
  if (selectedNavPoints.value.length > 0) return

  try {
    if (navSyncPromise.value) {
      await navSyncPromise.value
      const cachedPoints = store.navHistory.find((item) => item.fundCode === row.fundCode)?.points ?? []
      if (selectedHoldingCode.value === row.fundCode && cachedPoints.length > 0) {
        selectedNavPoints.value = cachedPoints
        return
      }
    }

    const fallbackPoints = await fetchFundNetWorthTrend(row.fundCode)
    if (fallbackPoints.length > 0) {
      store.setFundNavHistory([{ fundCode: row.fundCode, points: fallbackPoints }])
      if (selectedHoldingCode.value === row.fundCode) {
        selectedNavPoints.value = fallbackPoints
      }
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '基金走势加载失败')
  }
}

async function fillSnapshotFundName(): Promise<void> {
  const code = snapshotForm.fundCode.trim()
  if (!FUND_CODE_PATTERN.test(code)) return
  loadingFundInfo.value = true
  try {
    const info = await fetchFundInfo(code)
    if (!info) {
      message.warning('未找到基金信息')
      return
    }
    snapshotForm.fundCode = info.code
    snapshotForm.fundName = info.name
  } finally {
    loadingFundInfo.value = false
  }
}

async function fillTargetFundName(): Promise<void> {
  const code = tradeForm.targetFundCode.trim()
  if (!FUND_CODE_PATTERN.test(code)) return
  loadingTargetFund.value = true
  try {
    const info = await fetchFundInfo(code)
    if (!info) {
      message.warning('未找到转入基金信息')
      return
    }
    tradeForm.targetFundCode = info.code
    tradeForm.targetFundName = info.name
  } finally {
    loadingTargetFund.value = false
  }
}

function validateFund(code: string, name: string): boolean {
  if (!FUND_CODE_PATTERN.test(code.trim()) || !name.trim()) {
    message.warning('请填写 6 位基金代码和基金名称')
    return false
  }
  return true
}

function operationDate(): string {
  return formatDateKey()
}

async function syncNavForFunds(fundCodes: string[], silent = true): Promise<void> {
  const uniqueFundCodes = [...new Set(fundCodes.map((code) => code.trim()).filter(Boolean))]
  if (uniqueFundCodes.length === 0) return

  const task = Promise.all(uniqueFundCodes.map((code) => fetchFundNetWorthTrend(code)))
    .then((trends) => {
      store.setFundNavHistory(
        uniqueFundCodes.map((fundCode, index) => ({ fundCode, points: trends[index] ?? [] })),
      )
      if (!silent) message.success('净值已同步')
    })
    .catch((error) => {
      if (!silent) message.error(error instanceof Error ? error.message : '净值同步失败')
      else throw error
    })

  navSyncPromise.value = task
  syncingNav.value = true
  try {
    await task
  } finally {
    if (navSyncPromise.value === task) {
      navSyncPromise.value = null
      syncingNav.value = false
    }
  }
}

function syncCurrentHoldingNavs(): Promise<void> {
  return syncNavForFunds(
    store.holdings.map((holding) => holding.fundCode),
    true,
  )
}

async function saveSnapshot(): Promise<void> {
  if (!validateFund(snapshotForm.fundCode, snapshotForm.fundName)) {
    return
  }
  if (snapshotForm.myAmount < 0 || snapshotForm.bloggerAmount < 0) {
    message.warning('持有金额不能为负')
    return
  }
  if (snapshotForm.myAmount <= 0 && snapshotForm.bloggerAmount <= 0) {
    message.warning('请填写我的买入金额或博主买入金额')
    return
  }

  store.addTrade({
    type: 'buy',
    fundCode: snapshotForm.fundCode.trim(),
    fundName: snapshotForm.fundName.trim(),
    tradeDate: operationDate(),
    amounts: {
      mine: roundMoney(snapshotForm.myAmount),
      blogger: roundMoney(snapshotForm.bloggerAmount),
    },
  })
  isSnapshotOpen.value = false
  message.success('买入操作已记录，待净值结算后自动流转')
}

function hasAnyValue(values: SideValues): boolean {
  return values.mine > 0 || values.blogger > 0
}

function validateKnownShares(row: HoldingRow, shares: SideValues): boolean {
  if (shares.mine > row.myShares + 0.0001 || shares.blogger > row.bloggerShares + 0.0001) {
    message.warning('卖出或转出份额不能超过当前已确认份额')
    return false
  }
  return true
}

function syncMyOperationAmount(): void {
  tradeForm.amounts.mine =
    ratio.value.blogger > 0 ? Number((tradeForm.amounts.blogger / ratio.value.blogger).toFixed(2)) : 0
}

function syncMyOperationShare(): void {
  const row = store.holdings.find((holding) => holding.fundCode === tradeForm.fundCode)
  if (!row || row.bloggerShares <= 0) {
    tradeForm.shares.mine = 0
    return
  }
  tradeForm.shares.mine = Number(((row.myShares * tradeForm.shares.blogger) / row.bloggerShares).toFixed(2))
}

function setOperationAmountByRatio(owner: InvestorSide, amountRatio: number): void {
  const row = store.holdings.find((holding) => holding.fundCode === tradeForm.fundCode)
  if (!row) return
  if (owner === 'blogger') {
    tradeForm.shares.blogger = Number((row.bloggerShares * amountRatio).toFixed(2))
    tradeForm.shares.mine = Number((row.myShares * amountRatio).toFixed(2))
    return
  }
  tradeForm.shares.mine = Number((row.myShares * amountRatio).toFixed(2))
}

async function saveTrade(): Promise<void> {
  const row = store.holdings.find((holding) => holding.fundCode === tradeForm.fundCode)
  if (!row) return
  if (!validateFund(tradeForm.fundCode, tradeForm.fundName)) {
    return
  }

  try {
    if (tradeForm.type === 'buy') {
      if (!hasAnyValue(tradeForm.amounts)) {
        message.warning('请填写博主金额或我的金额')
        return
      }
      store.addTrade({
        type: 'buy',
        fundCode: tradeForm.fundCode,
        fundName: tradeForm.fundName,
        tradeDate: operationDate(),
        amounts: { ...tradeForm.amounts },
      })
    } else if (tradeForm.type === 'sell') {
      if (!hasAnyValue(tradeForm.shares) || !validateKnownShares(row, tradeForm.shares)) return
      store.addTrade({
        type: 'sell',
        fundCode: tradeForm.fundCode,
        fundName: tradeForm.fundName,
        tradeDate: operationDate(),
        sharesBySide: { ...tradeForm.shares },
      })
    } else {
      if (!validateFund(tradeForm.targetFundCode, tradeForm.targetFundName)) return
      if (!hasAnyValue(tradeForm.shares) || !validateKnownShares(row, tradeForm.shares)) return
      store.addTrade({
        type: 'convert',
        fundCode: tradeForm.fundCode,
        fundName: tradeForm.fundName,
        targetFundCode: tradeForm.targetFundCode,
        targetFundName: tradeForm.targetFundName,
        tradeDate: operationDate(),
        outSharesBySide: { ...tradeForm.shares },
      })
    }

    isTradeOpen.value = false
    message.success('操作已记录，待净值结算后自动流转')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '操作保存失败')
  }
}

async function handleAiUploadChange(payload: UploadChangeParam): Promise<void> {
  aiFiles.value = payload.fileList
  const activeIds = new Set(payload.fileList.map((file) => file.uid))
  const nextUrls = Object.fromEntries(
    Object.entries(aiImageDataUrls.value).filter(([uid]) => activeIds.has(uid)),
  )
  preparingUploads.value = true
  try {
    await Promise.all(
      payload.fileList.map(async (file) => {
        if (!file.originFileObj || nextUrls[file.uid]) return
        nextUrls[file.uid] = await readImageDataUrl(file.originFileObj)
      }),
    )
    aiImageDataUrls.value = nextUrls
  } finally {
    preparingUploads.value = false
  }
}

async function completeRecognizedCodes(rows: RecognizedHolding[]): Promise<RecognizedHolding[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (FUND_CODE_PATTERN.test(row.fundCode.trim())) return row
      const fund = await searchFundByName(row.fundName)
      return fund ? { ...row, fundCode: fund.code, fundName: row.fundName || fund.name } : row
    }),
  )
}

async function runAiRecognition(): Promise<void> {
  const images = aiFiles.value
    .map((file) => aiImageDataUrls.value[file.uid])
    .filter((url): url is string => Boolean(url))
  if (images.length === 0) {
    message.warning('请先上传截图')
    return
  }
  recognizing.value = true
  try {
    const { recognizeHoldingImages } = await import('@/services/ai')
    recognizedRows.value = await completeRecognizedCodes(
      await recognizeHoldingImages(store.settings, images),
    )
    const missingCodeCount = recognizedRows.value.filter(
      (row) => !FUND_CODE_PATTERN.test(row.fundCode.trim()),
    ).length
    message.success(
      `已识别 ${recognizedRows.value.length} 条持仓${missingCodeCount ? `，其中 ${missingCodeCount} 条暂未匹配代码` : ''}`,
    )
  } catch (error) {
    message.error(error instanceof Error ? error.message : '截图识别失败')
  } finally {
    recognizing.value = false
  }
}

async function applyRecognizedSnapshots(): Promise<void> {
  const snapshotDate = formatDateKey()
  const validRows = recognizedRows.value.filter(
    (row) => FUND_CODE_PATTERN.test(row.fundCode.trim()) && row.fundName.trim(),
  )
  if (validRows.length === 0) {
    message.warning('没有可写入的有效识别结果')
    return
  }

  validRows.forEach((row) => {
    store.addSnapshot({
      fundCode: row.fundCode.trim(),
      fundName: row.fundName.trim(),
      side: aiSide.value,
      tradeDate: snapshotDate,
      amount: roundMoney(row.amount),
      profit: roundMoney(row.profit),
      source: 'screenshot',
    })
  })

  isAiRecognitionOpen.value = false
  aiFiles.value = []
  aiImageDataUrls.value = {}
  recognizedRows.value = []
  message.success(`已写入 ${validRows.length} 条真实快照事件`)

  void syncNavForFunds(
    validRows.map((row) => row.fundCode),
    true,
  )
    .catch((error) => {
      message.warning(error instanceof Error ? error.message : '快照已写入，净值同步失败')
    })
}

async function sendChatMessage(question: string): Promise<void> {
  if (chatStreaming.value) return
  const userMessage: AiChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: question,
    createdAt: new Date().toISOString(),
  }
  const assistantMessage: AiChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
  }
  chatMessages.value = [...chatMessages.value, userMessage, assistantMessage]
  chatStreaming.value = true
  try {
    const { streamPortfolioChat } = await import('@/services/ai')
    await streamPortfolioChat({
      settings: store.settings,
      messages: chatMessages.value.filter((item) => item.id !== assistantMessage.id),
      holdings: store.holdings,
      totals: store.totals,
      onDelta: (delta) => {
        assistantMessage.content += delta
        chatMessages.value = chatMessages.value.map((item) =>
          item.id === assistantMessage.id ? { ...assistantMessage } : item,
        )
      },
    })
  } catch (error) {
    assistantMessage.content = error instanceof Error ? error.message : 'AI 对话失败'
    chatMessages.value = chatMessages.value.map((item) =>
      item.id === assistantMessage.id ? { ...assistantMessage } : item,
    )
  } finally {
    chatStreaming.value = false
  }
}

function exportJson(): void {
  downloadText(`yjgt-new-source-${Date.now()}.json`, store.exportJson(), 'application/json;charset=utf-8')
}

function exportCsv(): void {
  const header = [
    '基金名称',
    '基金代码',
    '最新净值日期',
    '我的真实投入',
    '我的持有份额',
    '我的持有金额',
    '我的持有收益',
    '博主真实投入',
    '博主持有份额',
    '博主持有金额',
    '博主持有收益',
  ]
  const rows = store.holdings.map((holding) =>
    [
      holding.fundName,
      holding.fundCode,
      holding.latestNavDate,
      holding.myCost,
      holding.myShares,
      holding.myAmount,
      holding.myProfit,
      holding.bloggerCost,
      holding.bloggerShares,
      holding.bloggerAmount,
      holding.bloggerProfit,
    ].map(csvEscape),
  )
  downloadText(`yjgt-new-holdings-${Date.now()}.csv`, [header, ...rows].map((row) => row.join(',')).join('\n'), 'text/csv;charset=utf-8')
}

function exportData(key: 'json' | 'csv'): void {
  if (key === 'json') exportJson()
  else exportCsv()
}

function removeCurrentHolding(row: HoldingRow): void {
  Modal.confirm({
    title: '清空当前持仓',
    content: `会写入一条 0 金额快照，让 ${row.fundName} 从当前列表移除；历史事件仍会保留。`,
    okText: '确认',
    cancelText: '取消',
    onOk: () => {
      store.removeCurrentHolding(row.fundCode)
      message.success('当前持仓已清空')
    },
  })
}

function removeOperationEvent(id: string): void {
  const event = selectedOperationEvents.value.find((item) => item.id === id)
  const isSettled = event?.status === 'settled'
  Modal.confirm({
    title: '删除操作记录',
    content: isSettled
      ? '这条操作已结算并参与当前持仓，删除后会重新计算持仓。确认删除吗？'
      : '这条待结算操作尚未影响当前持仓，删除后仅移除这条待执行记录。确认删除吗？',
    okText: '确认',
    cancelText: '取消',
    onOk: () => {
      store.removeEvent(id)
      selectedOperationEvents.value = selectedOperationEvents.value.filter((event) => event.id !== id)
      message.success('操作记录已删除')
    },
  })
}

onMounted(() => {
  store.hydrate()
  void syncCurrentHoldingNavs().catch((error) => {
    message.warning(error instanceof Error ? error.message : '净值同步失败')
  })
})

watch(
  chatMessages,
  (messages) => {
    saveAiChatMessages(messages)
  },
  { deep: true },
)
</script>

<template>
  <a-config-provider :theme="antThemeConfig">
    <a-layout class="app-shell">
      <a-layout-header class="page-header">
        <a-row align="middle" justify="space-between" :wrap="false">
          <a-col>
            <a-space align="center" :size="12">
              <span class="brand-icon"><BarChartOutlined /></span>
              <span class="brand-title">跟投助手 New</span>
            </a-space>
          </a-col>
          <a-col>
            <a-button type="text" @click="openSettings">
              <SettingOutlined />
              偏好设置
            </a-button>
          </a-col>
        </a-row>
      </a-layout-header>

      <a-layout-content>
        <div class="page-stack main-stack">
          <OverviewPanel
            :my-budget="store.settings.myBudget"
            :blogger-budget="store.settings.bloggerBudget"
            :my-cost="store.totals.myCost"
            :blogger-cost="store.totals.bloggerCost"
            :my-budget-usage="budgetUsage.mine"
            :blogger-budget-usage="budgetUsage.blogger"
            :follow-ratio-text="followRatioText"
            :should-invest="shouldInvest"
            :format-money="formatMoney"
            @update:my-budget="patchSettings('myBudget', $event)"
            @update:blogger-budget="patchSettings('bloggerBudget', $event)"
          />

          <a-row :gutter="[12, 12]" align="stretch" class="content-row">
            <a-col :xs="24" :xl="18">
              <PortfolioTable
                :rows="store.holdings"
                :my-today-profit="store.totals.myTodayProfit"
                :blogger-today-profit="store.totals.bloggerTodayProfit"
                :my-today-profit-rate="myTodayProfitRate"
                :blogger-today-profit-rate="bloggerTodayProfitRate"
                :my-total-profit="store.totals.myProfit"
                :blogger-total-profit="store.totals.bloggerProfit"
                :my-total-profit-rate="store.totals.myProfitRate"
                :blogger-total-profit-rate="store.totals.bloggerProfitRate"
                :format-money="formatMoney"
                :format-number="formatNumber"
                :format-percent="formatPercent"
                :format-plain-percent="formatPlainPercent"
                @snapshot="openSnapshotModal"
                @open-ai="isAiRecognitionOpen = true"
                @export="exportData"
                @detail="openDetail"
                @operation-detail="openOperationDetail"
                @trade="openTradeModal"
                @remove="removeCurrentHolding"
              />
            </a-col>
            <a-col :xs="24" :xl="6">
              <div class="side-stack">
                <HistoryCard :history="store.history" />
                <AiChatPanel
                  :messages="chatMessages"
                  :is-streaming="chatStreaming"
                  @send="sendChatMessage"
                  @clear="chatMessages = []"
                />
              </div>
            </a-col>
          </a-row>
        </div>
      </a-layout-content>

      <SnapshotModal
        :open="isSnapshotOpen"
        :form="snapshotForm"
        :loading-fund-info="loadingFundInfo"
        @update:open="isSnapshotOpen = $event"
        @update:form="patchSnapshotForm"
        @save="saveSnapshot"
        @fill-name="fillSnapshotFundName"
      />

      <SettingsModal
        :open="isSettingsOpen"
        :form="settingsForm"
        @update:open="isSettingsOpen = $event"
        @update:form="patchSettingsForm"
        @save="saveSettings"
      />

      <AiRecognitionModal
        :open="isAiRecognitionOpen"
        :side="aiSide"
        :file-list="aiFiles"
        :rows="recognizedRows"
        :recognizing="recognizing"
        :preparing="preparingUploads"
        @update:open="isAiRecognitionOpen = $event"
        @update:side="aiSide = $event"
        @upload-change="handleAiUploadChange"
        @recognize="runAiRecognition"
        @apply="applyRecognizedSnapshots"
      />

      <TradeModal
        :open="isTradeOpen"
        :form="tradeForm"
        :title="tradeTitle"
        :loading-target-fund="loadingTargetFund"
        :current-holding="currentTradeHolding"
        :format-number="formatNumber"
        @update:open="isTradeOpen = $event"
        @update:form="patchTradeForm"
        @save="saveTrade"
        @sync-my-amount="syncMyOperationAmount"
        @sync-my-share="syncMyOperationShare"
        @set-ratio="setOperationAmountByRatio"
        @fill-target-name="fillTargetFundName"
      />

      <DetailModal
        :open="isDetailOpen"
        :holding="selectedHolding"
        :nav-points="selectedNavPoints"
        :events="store.allEvents.filter((event) => event.kind === 'trade')"
        @update:open="isDetailOpen = $event"
      />

      <OperationDetailModal
        :open="isOperationDetailOpen"
        :events="selectedOperationEvents"
        :format-money="formatMoney"
        :format-number="formatNumber"
        @update:open="isOperationDetailOpen = $event"
        @remove="removeOperationEvent"
      />
    </a-layout>
  </a-config-provider>
</template>
