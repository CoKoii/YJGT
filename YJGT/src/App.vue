<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import {
  BarChartOutlined,
  BulbOutlined,
  ClearOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { usePortfolioStore } from '@/stores/portfolio'
import type { FundTrendPoint, Holding, HoldingOperation, InvestorSide, RecognizedHolding } from '@/types'
import {
  actualInvested,
  clampPercent,
  csvEscape,
  formatMoney,
  formatPercent,
  followRatio,
  numberFormatter,
  profitRate,
} from '@/utils/calculations'
import { fetchFundInfo, fetchFundNetWorthTrend, searchFundByName } from '@/services/fundApi'
import { recognizeHoldingImage } from '@/services/aiRecognition'
import { streamPortfolioChat } from '@/services/aiChat'
import { loadAiChatMessages, saveAiChatMessages } from '@/services/storage'
import type { AiChatMessage } from '@/types'

const store = usePortfolioStore()

type TrendRange = 'month' | 'quarter' | 'half' | 'year' | 'ytd' | 'all'
type DetailChartMode = 'performance' | 'netWorth'

const FUND_CODE_PATTERN = /^\d{6}$/
const DETAIL_TREND_OPTIONS: Array<{ label: string; value: TrendRange }> = [
  { label: '近1月', value: 'month' },
  { label: '近3月', value: 'quarter' },
  { label: '近6月', value: 'half' },
  { label: '近1年', value: 'year' },
  { label: '今年来', value: 'ytd' },
  { label: '成立以来', value: 'all' },
]

const isHoldingModalOpen = ref(false)
const isAiModalOpen = ref(false)
const isBudgetModalOpen = ref(false)
const isDetailModalOpen = ref(false)
const isOperationModalOpen = ref(false)
const isOperationDetailOpen = ref(false)
const selectedHoldingId = ref<string | null>(null)
const selectedOperations = ref<HoldingOperation[]>([])
const sideChartRange = ref<'month' | 'quarter'>('month')
const trendRange = ref<TrendRange>('month')
const detailChartMode = ref<DetailChartMode>('performance')
const settingsSection = ref<'budget' | 'ai'>('budget')
const isRecognizing = ref(false)
const isChatStreaming = ref(false)
const isFundInfoLoading = ref(false)
const uploadedFiles = ref<Array<{ uid: string; name: string }>>([])
const uploadedImageDataUrls = ref<Record<string, string>>({})
const recognizedRows = ref<RecognizedHolding[]>([])
const aiChatInput = ref('')
const aiChatMessages = ref<AiChatMessage[]>(loadAiChatMessages())
const detailTrend = ref<FundTrendPoint[]>([])
const isTrendLoading = ref(false)
const holdingChartRef = ref<HTMLDivElement | null>(null)
const detailChartRef = ref<HTMLDivElement | null>(null)
const aiChatBodyRef = ref<HTMLDivElement | null>(null)
let holdingChart: echarts.ECharts | null = null
let detailChart: echarts.ECharts | null = null

const emptyHolding = {
  fundName: '',
  fundCode: '',
  myAmount: 0,
  myProfit: 0,
  myYesterdayProfit: 0,
  bloggerAmount: 0,
  bloggerProfit: 0,
  bloggerYesterdayProfit: 0,
}

const holdingForm = reactive({ ...emptyHolding, id: '' })
const operationForm = reactive({
  type: 'buy' as 'buy' | 'sell' | 'convert',
  bloggerAmount: 0,
  myAmount: 0,
  bloggerShare: 0,
  myShare: 0,
  bloggerTotalShare: 0,
  myTotalShare: 0,
  bloggerInvested: 0,
  myInvested: 0,
  fundCode: '',
  fundName: '',
  toFundCode: '',
  toFundName: '',
})
const budgetForm = reactive({ ...store.budget })
const aiSide = ref<InvestorSide>('mine')

const selectedHolding = computed(() => {
  return store.holdings.find((item) => item.id === selectedHoldingId.value) ?? store.holdings[0]
})

const ratio = computed(() => followRatio(store.budget))
const shouldInvest = computed(() => store.totals.bloggerInvested / Math.max(ratio.value.blogger, 1))
const budgetUsage = computed(() => ({
  mine: store.budget.myBudget > 0 ? clampPercent((store.totals.myInvested / store.budget.myBudget) * 100) : 0,
  blogger: store.budget.bloggerBudget > 0 ? clampPercent((store.totals.bloggerInvested / store.budget.bloggerBudget) * 100) : 0,
}))
const todayProfit = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  const previousSnapshot = [...store.history].reverse().find((item) => item.date < today)

  return {
    mine: previousSnapshot ? store.totals.myProfit - previousSnapshot.myProfit : 0,
    blogger: previousSnapshot ? store.totals.bloggerProfit - previousSnapshot.bloggerProfit : 0,
  }
})

const pendingOperationsByFundCode = computed(() => {
  const operationsByFundCode = new Map<string, HoldingOperation[]>()
  const addOperation = (fundCode: string | undefined, operation: HoldingOperation) => {
    if (!fundCode) return
    const operations = operationsByFundCode.get(fundCode) ?? []
    operations.push(operation)
    operationsByFundCode.set(fundCode, operations)
  }

  store.operations
    .filter((operation) => operation.status === 'pending')
    .forEach((operation) => {
      const fundCodes = new Set([operation.fundCode, operation.fromFundCode, operation.toFundCode])
      fundCodes.forEach((fundCode) => addOperation(fundCode, operation))
    })

  return operationsByFundCode
})

const holdingRows = computed(() =>
  store.holdings.map((item) => {
    const myInvested = actualInvested(item.myAmount, item.myProfit)
    const bloggerInvested = actualInvested(item.bloggerAmount, item.bloggerProfit)
    const targetInvested = ratio.value.blogger > 0 ? bloggerInvested / ratio.value.blogger : 0
    const myPositionRate = store.totals.myInvested > 0 ? (myInvested / store.totals.myInvested) * 100 : 0
    const bloggerPositionRate =
      store.totals.bloggerInvested > 0 ? (bloggerInvested / store.totals.bloggerInvested) * 100 : 0

    return {
      ...item,
      myInvested,
      bloggerInvested,
      targetInvested,
      myRate: profitRate(item.myAmount, item.myProfit),
      bloggerRate: profitRate(item.bloggerAmount, item.bloggerProfit),
      myPositionRate,
      bloggerPositionRate,
      pendingOperations: pendingOperationsByFundCode.value.get(item.fundCode) ?? [],
    }
  }),
)

const selectedOperation = computed(() => selectedOperations.value[0] ?? null)
const selectedOperationsBySide = computed(() => ({
  blogger: selectedOperations.value.find((operation) => operation.side === 'blogger'),
  mine: selectedOperations.value.find((operation) => operation.side === 'mine'),
}))

const recognizedSummary = computed(() =>
  recognizedRows.value.reduce(
    (summary, row) => ({
      amount: summary.amount + (Number.isFinite(row.amount) ? row.amount : 0),
      profit: summary.profit + (Number.isFinite(row.profit) ? row.profit : 0),
    }),
    { amount: 0, profit: 0 },
  ),
)

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatPlainPercent(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${safeValue.toFixed(2)}%`
}

function buildPortfolioContext(): string {
  return JSON.stringify(
    {
      budget: store.budget,
      totals: store.totals,
      followRatio: ratio.value,
      holdings: holdingRows.value.map((item) => ({
        fundName: item.fundName,
        fundCode: item.fundCode,
        my: {
          amount: item.myAmount,
          profit: item.myProfit,
          profitRate: item.myRate,
          invested: item.myInvested,
          positionRate: item.myPositionRate,
          yesterdayProfit: item.myYesterdayProfit,
        },
        blogger: {
          amount: item.bloggerAmount,
          profit: item.bloggerProfit,
          profitRate: item.bloggerRate,
          invested: item.bloggerInvested,
          positionRate: item.bloggerPositionRate,
          yesterdayProfit: item.bloggerYesterdayProfit,
        },
        targetInvested: item.targetInvested,
        updatedAt: item.updatedAt,
      })),
      operations: store.operations.map((item) => ({
        side: item.side,
        type: item.type,
        date: item.date,
        amount: item.amount,
        fundCode: item.fundCode,
        fundName: item.fundName,
        fromFundCode: item.fromFundCode,
        fromFundName: item.fromFundName,
        toFundCode: item.toFundCode,
        toFundName: item.toFundName,
        source: item.source,
      })),
    },
    null,
    2,
  )
}

async function buildFundLookupContext(question: string): Promise<string> {
  const codes = [...new Set(question.match(/\b\d{6}\b/g) ?? [])]
  const results = await Promise.all(codes.map((code) => fetchFundInfo(code)))
  const namedResult = /基金|ETF|联接|混合|指数|债|查|搜/.test(question) ? await searchFundByName(question) : null
  const lookupResults = [...results.filter(Boolean), namedResult].filter(Boolean)

  return lookupResults.length > 0 ? JSON.stringify(lookupResults, null, 2) : ''
}

function scrollAiChatToBottom() {
  void nextTick(() => {
    if (aiChatBodyRef.value) {
      aiChatBodyRef.value.scrollTop = aiChatBodyRef.value.scrollHeight
    }
  })
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

function filterTrendByRange(points: FundTrendPoint[]): FundTrendPoint[] {
  const latestPoint = points.at(-1)
  if (!latestPoint) return []

  if (trendRange.value === 'all') return points

  const latest = parseLocalDate(latestPoint.date)
  const start = new Date(latest)
  if (trendRange.value === 'month') {
    start.setMonth(start.getMonth() - 1)
  } else if (trendRange.value === 'quarter') {
    start.setMonth(start.getMonth() - 3)
  } else if (trendRange.value === 'half') {
    start.setMonth(start.getMonth() - 6)
  } else if (trendRange.value === 'year') {
    start.setFullYear(start.getFullYear() - 1)
  } else {
    start.setMonth(0, 1)
  }

  return points.filter((item) => parseLocalDate(item.date) >= start)
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseHoldingUpdatedDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? formatDateKey(new Date()) : formatDateKey(date)
}

function findNearestTrendPoint(points: FundTrendPoint[], date: string): FundTrendPoint | null {
  if (points.length === 0) return null

  return (
    [...points].reverse().find((item) => item.date <= date) ??
    points.find((item) => item.date >= date) ??
    points.at(-1) ??
    null
  )
}

function toPerformanceTrend(points: FundTrendPoint[]): FundTrendPoint[] {
  const baseValue = points.find((item) => item.value > 0)?.value
  if (!baseValue) return []

  return points.map((item) => ({
    date: item.date,
    value: ((item.value - baseValue) / baseValue) * 100,
  }))
}

function buildRateSeriesData(points: FundTrendPoint[], startDate: string, rate: number): Array<string | null> {
  return points.map((item) => (item.date >= startDate ? rate.toFixed(2) : null))
}

function getOperationLabel(type: 'buy' | 'sell' | 'convert'): string {
  if (type === 'sell') return '卖'
  if (type === 'convert') return '转'
  return '买'
}

function getOperationActionText(type: HoldingOperation['type']): string {
  if (type === 'sell') return '卖出'
  if (type === 'convert') return '转换'
  return '买入'
}

function getInvestorSideText(side: InvestorSide): string {
  return side === 'mine' ? '我的' : '博主'
}

function openOperationDetail(operations: HoldingOperation[]) {
  selectedOperations.value = operations
  isOperationDetailOpen.value = true
}

function revokeSelectedOperations() {
  Modal.confirm({
    title: '撤回操作',
    content: '确认撤回这笔操作记录？撤回后将从确认中记录里移除。',
    okText: '确认',
    cancelText: '取消',
    onOk: () => {
      store.removeOperations(selectedOperations.value.map((operation) => operation.id))
      selectedOperations.value = []
      isOperationDetailOpen.value = false
      message.success('操作已撤回')
    },
  })
}

function getFollowTrendClass(current: number, target: number): string {
  if (current < target) return 'red'
  if (current > target) return 'green'
  return ''
}

function getFollowTrendIcon(current: number, target: number): string {
  if (current < target) return '↑'
  if (current > target) return '↓'
  return ''
}

function openBudgetModal() {
  Object.assign(budgetForm, store.budget)
  isBudgetModalOpen.value = true
}

function saveBudget() {
  store.budget = { ...budgetForm }
  isBudgetModalOpen.value = false
  message.success('预算已更新')
}

function openCreateModal() {
  Object.assign(holdingForm, { ...emptyHolding, id: '' })
  isHoldingModalOpen.value = true
}

function openEditModal(record: Holding) {
  Object.assign(holdingForm, record)
  isHoldingModalOpen.value = true
}

function saveHolding() {
  if (!holdingForm.fundName || !FUND_CODE_PATTERN.test(holdingForm.fundCode)) {
    message.warning('请填写基金名称和 6 位基金代码')
    return
  }

  store.upsertHolding({ ...holdingForm, id: holdingForm.id || undefined })
  isHoldingModalOpen.value = false
  message.success('持仓已保存')
}

function openOperationModal(record: Holding, type: 'buy' | 'sell' | 'convert') {
  const bloggerInvested = actualInvested(record.bloggerAmount, record.bloggerProfit)
  const myInvested = actualInvested(record.myAmount, record.myProfit)
  Object.assign(operationForm, {
    type,
    bloggerAmount: 0,
    myAmount: 0,
    bloggerShare: 0,
    myShare: 0,
    bloggerTotalShare: bloggerInvested,
    myTotalShare: myInvested,
    bloggerInvested,
    myInvested,
    fundCode: record.fundCode,
    fundName: record.fundName,
    toFundCode: '',
    toFundName: '',
  })
  isOperationModalOpen.value = true
}

function getOperationTitle(): string {
  const actionText =
    operationForm.type === 'buy' ? '记录买入' : operationForm.type === 'sell' ? '记录卖出' : '记录转换'
  return `${actionText}：${operationForm.fundName}（${operationForm.fundCode}）`
}

function syncMyOperationAmount() {
  operationForm.myAmount =
    ratio.value.blogger > 0 ? Number((operationForm.bloggerAmount / ratio.value.blogger).toFixed(2)) : 0
}

function setConvertShare(owner: InvestorSide, shareRatio: number) {
  if (owner === 'blogger') {
    operationForm.bloggerShare = Number((operationForm.bloggerTotalShare * shareRatio).toFixed(2))
    operationForm.bloggerAmount = operationForm.bloggerShare
  } else {
    operationForm.myShare = Number((operationForm.myTotalShare * shareRatio).toFixed(2))
    operationForm.myAmount = operationForm.myShare
  }
}

function syncConvertAmount(owner: InvestorSide) {
  if (owner === 'blogger') {
    operationForm.bloggerAmount = operationForm.bloggerShare
  } else {
    operationForm.myAmount = operationForm.myShare
  }
}

async function fillOperationTargetFundName() {
  const code = operationForm.toFundCode.trim()
  if (!FUND_CODE_PATTERN.test(code)) return

  const fundInfo = await fetchFundInfo(code)
  operationForm.toFundCode = fundInfo?.code ?? operationForm.toFundCode
  operationForm.toFundName = fundInfo?.name ?? operationForm.toFundName
}

function saveOperation() {
  if (operationForm.type === 'convert') {
    syncConvertAmount('blogger')
    syncConvertAmount('mine')
  }
  if (operationForm.bloggerAmount <= 0 && operationForm.myAmount <= 0) {
    message.warning('请填写博主金额或我的金额')
    return
  }
  if (operationForm.type === 'convert' && (!FUND_CODE_PATTERN.test(operationForm.toFundCode) || !operationForm.toFundName)) {
    message.warning('请填写转入基金代码和名称')
    return
  }

  store.recordOperations(
    [
      { side: 'blogger' as const, amount: operationForm.bloggerAmount },
      { side: 'mine' as const, amount: operationForm.myAmount },
    ]
      .filter((item) => item.amount > 0)
      .map((item) => ({
        side: item.side,
        type: operationForm.type,
        amount: item.amount,
        share:
          operationForm.type === 'convert'
            ? item.side === 'blogger'
              ? operationForm.bloggerShare
              : operationForm.myShare
            : undefined,
        fundCode: operationForm.type === 'convert' ? undefined : operationForm.fundCode,
        fundName: operationForm.type === 'convert' ? undefined : operationForm.fundName,
        fromFundCode: operationForm.type === 'convert' ? operationForm.fundCode : undefined,
        fromFundName: operationForm.type === 'convert' ? operationForm.fundName : undefined,
        toFundCode: operationForm.type === 'convert' ? operationForm.toFundCode : undefined,
        toFundName: operationForm.type === 'convert' ? operationForm.toFundName : undefined,
      })),
  )
  isOperationModalOpen.value = false
  message.success('操作已记录')
}

function removeHolding(record: Holding) {
  Modal.confirm({
    title: '删除持仓',
    content: `确认删除 ${record.fundName}？`,
    okText: '确认',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      store.removeHolding(record.id)
      if (selectedHoldingId.value === record.id) {
        selectedHoldingId.value = store.holdings[0]?.id ?? null
      }
      message.success('已删除')
    },
  })
}

async function openDetailModal(record: Holding) {
  selectedHoldingId.value = record.id
  isDetailModalOpen.value = true
  await nextTick()
  await loadDetailTrend()
}

function handleDetailOpenChange(open: boolean) {
  if (open) loadDetailTrend()
}

async function fillFundNameByCode() {
  const code = holdingForm.fundCode.trim()
  if (!FUND_CODE_PATTERN.test(code)) return

  isFundInfoLoading.value = true
  try {
    const fundInfo = await fetchFundInfo(code)
    if (fundInfo?.name) {
      holdingForm.fundCode = fundInfo.code
      holdingForm.fundName = fundInfo.name
      message.success('已自动填充基金名称')
    } else {
      message.warning('未找到基金信息，请检查代码或手动填写名称')
    }
  } finally {
    isFundInfoLoading.value = false
  }
}

function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取截图失败'))
    reader.readAsDataURL(file)
  })
}

async function beforeUpload(file: File & { uid?: string }) {
  const uid = file.uid ?? crypto.randomUUID()
  uploadedImageDataUrls.value[uid] = await readImageDataUrl(file)
  return false
}

function handleUploadChange({ fileList }: { fileList: Array<{ uid: string; name: string }> }) {
  uploadedFiles.value = fileList.map((file) => ({ uid: file.uid, name: file.name }))
  const activeUids = new Set(uploadedFiles.value.map((file) => file.uid))
  uploadedImageDataUrls.value = Object.fromEntries(
    Object.entries(uploadedImageDataUrls.value).filter(([uid]) => activeUids.has(uid)),
  )
}

function resetAiRecognition() {
  uploadedFiles.value = []
  uploadedImageDataUrls.value = {}
  recognizedRows.value = []
}

async function completeRecognizedCodes(rows: RecognizedHolding[]): Promise<RecognizedHolding[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (FUND_CODE_PATTERN.test(row.fundCode)) return row

      const fundInfo = await searchFundByName(row.fundName)
      return {
        ...row,
        fundCode: fundInfo?.code ?? '',
      }
    }),
  )
}

async function runRecognition() {
  const imageDataUrls = uploadedFiles.value.map((file) => uploadedImageDataUrls.value[file.uid]).filter(isString)
  if (imageDataUrls.length === 0) {
    message.warning('请先上传截图')
    return
  }

  isRecognizing.value = true
  try {
    recognizedRows.value = await completeRecognizedCodes(await recognizeHoldingImage(store.aiConfig, imageDataUrls))
    const missingCodeCount = recognizedRows.value.filter((row) => !row.fundCode).length
    message.success(`识别到 ${recognizedRows.value.length} 条持仓${missingCodeCount ? `，${missingCodeCount} 条未匹配代码` : ''}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '识别失败')
  } finally {
    isRecognizing.value = false
  }
}

async function sendAiChatMessage() {
  const question = aiChatInput.value.trim()
  if (!question || isChatStreaming.value) return

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

  aiChatInput.value = ''
  aiChatMessages.value = [...aiChatMessages.value, userMessage, assistantMessage]
  isChatStreaming.value = true
  scrollAiChatToBottom()

  try {
    await streamPortfolioChat({
      config: store.aiConfig,
      messages: aiChatMessages.value.filter((message) => message.id !== assistantMessage.id),
      portfolioContext: buildPortfolioContext(),
      fundLookupContext: await buildFundLookupContext(question),
      onDelta: (delta) => {
        assistantMessage.content += delta
        aiChatMessages.value = aiChatMessages.value.map((message) =>
          message.id === assistantMessage.id ? { ...assistantMessage } : message,
        )
        scrollAiChatToBottom()
      },
    })
  } catch (error) {
    assistantMessage.content = error instanceof Error ? error.message : 'AI 对话失败'
    aiChatMessages.value = aiChatMessages.value.map((message) =>
      message.id === assistantMessage.id ? { ...assistantMessage } : message,
    )
  } finally {
    isChatStreaming.value = false
    scrollAiChatToBottom()
  }
}

function clearAiChatMessages() {
  aiChatMessages.value = []
}

function applyRecognized() {
  const rows = recognizedRows.value.filter((row) => FUND_CODE_PATTERN.test(row.fundCode))
  if (rows.length === 0) {
    message.warning('没有可写入的有效识别结果')
    return
  }

  store.applyRecognizedHoldings(aiSide.value, rows)
  resetAiRecognition()
  isAiModalOpen.value = false
  message.success(`已写入 ${rows.length} 条持仓`)
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportJson() {
  download(`yjgt-${Date.now()}.json`, store.exportJson(), 'application/json;charset=utf-8')
}

function exportCsv() {
  const header = [
    '基金名称',
    '基金代码',
    '我的持有金额',
    '我的持有收益',
    '博主持有金额',
    '博主持有收益',
    '我的收益率',
    '博主收益率',
  ]
  const rows = holdingRows.value.map((item) =>
    [
      item.fundName,
      item.fundCode,
      item.myAmount,
      item.myProfit,
      item.bloggerAmount,
      item.bloggerProfit,
      item.myRate.toFixed(2),
      item.bloggerRate.toFixed(2),
    ].map(csvEscape),
  )
  download(`yjgt-${Date.now()}.csv`, [header, ...rows].map((row) => row.join(',')).join('\n'), 'text/csv')
}

function handleExportMenuClick({ key }: { key: string | number }) {
  if (key === 'json') {
    exportJson()
  } else if (key === 'csv') {
    exportCsv()
  }
}

function renderHoldingChart() {
  if (!holdingChartRef.value) return
  holdingChart ??= echarts.init(holdingChartRef.value)
  const chartHistory = store.history.slice(sideChartRange.value === 'month' ? -30 : -90)
  holdingChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: ['我的收益率', '博主收益率'] },
    grid: { left: 42, right: 18, top: 46, bottom: 36 },
    xAxis: {
      type: 'category',
      data: chartHistory.map((item) => item.date.slice(5)),
      boundaryGap: false,
    },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    series: [
      {
        name: '我的收益率',
        type: 'line',
        smooth: true,
        data: chartHistory.map((item) => item.myProfitRate.toFixed(2)),
        color: '#2563ff',
      },
      {
        name: '博主收益率',
        type: 'line',
        smooth: true,
        data: chartHistory.map((item) => item.bloggerProfitRate.toFixed(2)),
        color: '#10a37f',
      },
    ],
  })
}

async function loadDetailTrend() {
  if (!selectedHolding.value || !isDetailModalOpen.value) return
  isTrendLoading.value = true
  detailTrend.value = await fetchFundNetWorthTrend(selectedHolding.value.fundCode)
  isTrendLoading.value = false
  await nextTick()
  renderDetailChart()
}

function renderDetailChart() {
  if (!detailChartRef.value || !selectedHolding.value) return
  detailChart ??= echarts.init(detailChartRef.value)
  const trend = filterTrendByRange(detailTrend.value)
  const holding = selectedHolding.value
  const isPerformanceMode = detailChartMode.value === 'performance'
  const chartPoints = isPerformanceMode ? toPerformanceTrend(trend) : trend
  const myRate = profitRate(holding.myAmount, holding.myProfit)
  const bloggerRate = profitRate(holding.bloggerAmount, holding.bloggerProfit)
  const holdingStartDate = parseHoldingUpdatedDate(holding.updatedAt)
  const relatedOperations = store.operations.filter(
    (item) =>
      item.fundCode === holding.fundCode ||
      item.fromFundCode === holding.fundCode ||
      item.toFundCode === holding.fundCode,
  )
  const myOperationData = relatedOperations
    .filter((item) => item.side === 'mine')
    .map((item) => {
      const point = findNearestTrendPoint(chartPoints, parseHoldingUpdatedDate(item.date))
      return point ? { value: [point.date, Number(myRate.toFixed(2))], label: getOperationLabel(item.type) } : null
    })
    .filter(Boolean)
  const bloggerOperationData = relatedOperations
    .filter((item) => item.side === 'blogger')
    .map((item) => {
      const point = findNearestTrendPoint(chartPoints, parseHoldingUpdatedDate(item.date))
      return point ? { value: [point.date, Number(bloggerRate.toFixed(2))], label: getOperationLabel(item.type) } : null
    })
    .filter(Boolean)
  const operationSeries = isPerformanceMode
    ? [
        {
          name: '我的操作点',
          type: 'scatter',
          yAxisIndex: 0,
          symbolSize: 14,
          silent: true,
          label: {
            show: true,
            formatter: ({ data }: { data?: { label?: string } }) => data?.label ?? '',
            position: 'right',
            color: '#2563ff',
            fontWeight: 700,
          },
          data: myOperationData,
          color: '#2563ff',
        },
        {
          name: '博主操作点',
          type: 'scatter',
          yAxisIndex: 0,
          symbolSize: 14,
          silent: true,
          label: {
            show: true,
            formatter: ({ data }: { data?: { label?: string } }) => data?.label ?? '',
            position: 'right',
            color: '#10a37f',
            fontWeight: 700,
          },
          data: bloggerOperationData,
          color: '#10a37f',
        },
      ]
    : []
  const series = isPerformanceMode
    ? [
        {
          name: '业绩走势',
          type: 'line',
          smooth: true,
          data: chartPoints.map((item) => item.value.toFixed(2)),
          color: '#64748b',
        },
        {
          name: '我的收益率',
          type: 'line',
          smooth: true,
          connectNulls: false,
          data: buildRateSeriesData(chartPoints, holdingStartDate, myRate),
          color: '#2563ff',
        },
        {
          name: '博主收益率',
          type: 'line',
          smooth: true,
          connectNulls: false,
          data: buildRateSeriesData(chartPoints, holdingStartDate, bloggerRate),
          color: '#10a37f',
        },
        ...operationSeries,
      ]
    : [
        {
          name: '基金净值',
          type: 'line',
          smooth: true,
          data: chartPoints.map((item) => item.value.toFixed(4)),
          color: '#64748b',
        },
      ]
  detailChart.setOption({
    title:
      chartPoints.length === 0
        ? {
            text: isPerformanceMode ? '暂无走势数据' : '暂无净值数据',
            left: 'center',
            top: 'middle',
            textStyle: { color: '#94a3b8', fontSize: 14, fontWeight: 400 },
          }
        : undefined,
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params]
        return items
          .filter((item) => {
            const data = item as { seriesName?: string }
            return !data.seriesName?.includes('操作点')
          })
          .map((item) => {
            const data = item as {
              axisValue?: string
              marker?: string
              seriesName?: string
              value?: number | string | Array<number | string>
            }
            const value = Array.isArray(data.value) ? data.value.at(-1) : data.value
            const suffix = data.seriesName?.includes('收益率') || data.seriesName === '业绩走势' ? '%' : ''
            const formattedValue = typeof value === 'number' ? value.toFixed(2) : value
            return `${data.marker ?? ''}${data.seriesName ?? ''}: ${formattedValue ?? ''}${suffix}`
          })
          .join('<br/>')
      },
    },
    legend: {
      top: 0,
      data: isPerformanceMode ? ['业绩走势', '我的收益率', '博主收益率'] : ['基金净值'],
    },
    grid: { left: 48, right: 48, top: 48, bottom: 42, containLabel: true },
    xAxis: {
      type: 'category',
      data: chartPoints.map((item) => item.date),
      boundaryGap: false,
      axisLabel: {
        hideOverlap: true,
        formatter: (value: string) => value.slice(5),
      },
    },
    yAxis: isPerformanceMode
      ? { type: 'value', name: '收益率', axisLabel: { formatter: '{value}%' } }
      : { type: 'value', name: '净值', scale: true },
    series,
  }, true)
}

watch(
  () => store.history,
  () => nextTick(renderHoldingChart),
  { deep: true },
)
watch(selectedHolding, () => {
  if (isDetailModalOpen.value) loadDetailTrend()
})
watch(sideChartRange, renderHoldingChart)
watch(trendRange, renderDetailChart)
watch(detailChartMode, renderDetailChart)
watch(aiSide, resetAiRecognition)
watch(
  aiChatMessages,
  (messages) => {
    saveAiChatMessages(messages)
  },
  { deep: true },
)

function resizeCharts() {
  holdingChart?.resize()
  detailChart?.resize()
}

onMounted(async () => {
  selectedHoldingId.value = store.holdings[0]?.id ?? null
  await nextTick()
  renderHoldingChart()
  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCharts)
  holdingChart?.dispose()
  detailChart?.dispose()
})
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
              <a-button type="text" @click="openBudgetModal"><SettingOutlined />设置</a-button>
            </a-space>
          </a-col>
        </a-row>
      </a-layout-header>

      <a-layout-content>
        <div class="page-stack main-stack">
          <a-card class="overview-panel" :body-style="{ padding: '14px 16px' }">
            <a-row :gutter="[32, 14]">
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">博主总预算（元）</div>
                <a-input-number
                  v-model:value="store.budget.bloggerBudget"
                  class="overview-input"
                  :min="0"
                  :precision="2"
                  :controls="false"
                />
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">当前博主总投入（元）</div>
                <div class="overview-value">{{ formatMoney(store.totals.bloggerInvested) }}</div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">博主仓位占比</div>
                <div class="overview-value">{{ budgetUsage.blogger.toFixed(2) }}%</div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">博主仓位 : 我的仓位</div>
                <div class="overview-value">{{ ratio.blogger || 0 }} : {{ ratio.mine || 0 }}</div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">我的总预算（元）</div>
                <a-input-number
                  v-model:value="store.budget.myBudget"
                  class="overview-input"
                  :min="0"
                  :precision="2"
                  :controls="false"
                />
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">当前我的总投入（元）</div>
                <div class="overview-value">{{ formatMoney(store.totals.myInvested) }}</div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">我的仓位占比</div>
                <div class="overview-value">
                  {{ budgetUsage.mine.toFixed(2) }}%
                  <span
                    v-if="Math.abs(budgetUsage.mine - budgetUsage.blogger) > 0.01"
                    class="trend-mark"
                    :class="budgetUsage.mine > budgetUsage.blogger ? 'red' : 'green'"
                  >
                    {{ budgetUsage.mine > budgetUsage.blogger ? '↑' : '↓' }}
                  </span>
                </div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">我应投入总金额（元）</div>
                <div class="overview-value">{{ formatMoney(shouldInvest) }}</div>
              </a-col>
            </a-row>
          </a-card>

          <a-row :gutter="[12, 12]" align="stretch" class="content-row">
            <a-col :xs="24" :xl="19">
              <section class="portfolio-panel">
                <vxe-toolbar class="portfolio-toolbar" size="medium">
                  <template #buttons>
                    <div class="portfolio-summary">
                      <span class="portfolio-title">持仓列表</span>
                      <span class="summary-label">我的今日收益</span>
                      <span :class="todayProfit.mine >= 0 ? 'red' : 'green'">
                        {{ formatMoney(todayProfit.mine) }}
                      </span>
                      <span class="summary-label">博主今日收益</span>
                      <span :class="todayProfit.blogger >= 0 ? 'red' : 'green'">
                        {{ formatMoney(todayProfit.blogger) }}
                      </span>
                      <span class="summary-label">我的总收益</span>
                      <span :class="store.totals.myProfit >= 0 ? 'red' : 'green'">
                        {{ formatMoney(store.totals.myProfit) }}（{{ formatPercent(store.totals.myProfitRate) }}）
                      </span>
                      <span class="summary-label">博主总收益</span>
                      <span :class="store.totals.bloggerProfit >= 0 ? 'red' : 'green'">
                        {{ formatMoney(store.totals.bloggerProfit) }}（{{ formatPercent(store.totals.bloggerProfitRate) }}）
                      </span>
                    </div>
                  </template>
                  <template #tools>
                    <div class="portfolio-actions">
                      <a-button type="primary" @click="openCreateModal">
                        <template #icon><PlusOutlined /></template>
                        新增持仓
                      </a-button>
                      <a-button @click="isAiModalOpen = true">
                        <template #icon><RobotOutlined /></template>
                        AI 识别
                      </a-button>
                      <a-dropdown>
                        <a-button>
                          <template #icon><DownloadOutlined /></template>
                          导出数据
                          <DownOutlined />
                        </a-button>
                        <template #overlay>
                          <a-menu @click="handleExportMenuClick">
                            <a-menu-item key="json">导出 JSON</a-menu-item>
                            <a-menu-item key="csv">导出 CSV</a-menu-item>
                          </a-menu>
                        </template>
                      </a-dropdown>
                    </div>
                  </template>
                </vxe-toolbar>
                <div class="vxe-wrap">
                  <vxe-table
                    :data="holdingRows"
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
                          <button class="link-button" @click.stop="openDetailModal(row)">
                            <span class="fund-name-text">{{ row.fundName }}</span>
                            <span>{{ row.fundCode }}</span>
                          </button>
                          <button
                            v-if="row.pendingOperations.length > 0"
                            type="button"
                            class="operation-float-tag"
                            @click.stop="openOperationDetail(row.pendingOperations)"
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
                          <div class="target-line" :class="getFollowTrendClass(row.myInvested, row.targetInvested)">
                            <span class="metric-main money-main">{{ formatNumber(row.myInvested) }}</span>
                            <span class="target-arrow">{{ getFollowTrendIcon(row.myInvested, row.targetInvested) }}</span>
                          </div>
                          <span class="target-hint">应投入：{{ formatNumber(row.targetInvested) }}</span>
                        </div>
                      </template>
                    </vxe-column>
                    <vxe-column title="博主占比" align="right">
                      <template #default="{ row }">
                        <span class="metric-main percent-main">{{ formatPlainPercent(row.bloggerPositionRate) }}</span>
                      </template>
                    </vxe-column>
                    <vxe-column title="我的占比" align="right">
                      <template #default="{ row }">
                        <div class="target-line" :class="getFollowTrendClass(row.myPositionRate, row.bloggerPositionRate)">
                          <span class="metric-main percent-main">{{ formatPlainPercent(row.myPositionRate) }}</span>
                          <span class="target-arrow">{{ getFollowTrendIcon(row.myPositionRate, row.bloggerPositionRate) }}</span>
                        </div>
                      </template>
                    </vxe-column>
                    <vxe-column title="博主盈亏金额" align="right">
                      <template #default="{ row }">
                        <div class="metric-stack">
                          <span class="metric-main money-main profit-value" :class="row.bloggerProfit >= 0 ? 'red' : 'green'">
                            {{ formatMoney(row.bloggerProfit) }}
                          </span>
                          <span class="target-hint profit-value" :class="row.bloggerRate >= 0 ? 'red' : 'green'">
                            {{ formatPercent(row.bloggerRate) }}
                          </span>
                        </div>
                      </template>
                    </vxe-column>
                    <vxe-column title="我的盈亏金额" align="right">
                      <template #default="{ row }">
                        <div class="metric-stack">
                          <span class="metric-main money-main profit-value" :class="row.myProfit >= 0 ? 'red' : 'green'">
                            {{ formatMoney(row.myProfit) }}
                          </span>
                          <span class="target-hint profit-value" :class="row.myRate >= 0 ? 'red' : 'green'">
                            {{ formatPercent(row.myRate) }}
                          </span>
                        </div>
                      </template>
                    </vxe-column>
                    <vxe-column title="博主昨日收益" align="right">
                      <template #default="{ row }">
                        <span class="metric-main money-main profit-value" :class="row.bloggerYesterdayProfit >= 0 ? 'red' : 'green'">
                          {{ formatMoney(row.bloggerYesterdayProfit) }}
                        </span>
                      </template>
                    </vxe-column>
                    <vxe-column title="我的昨日收益" align="right">
                      <template #default="{ row }">
                        <span class="metric-main money-main profit-value" :class="row.myYesterdayProfit >= 0 ? 'red' : 'green'">
                          {{ formatMoney(row.myYesterdayProfit) }}
                        </span>
                      </template>
                    </vxe-column>
                    <vxe-column title="操作" fixed="right" align="center">
                      <template #default="{ row }">
                        <a-space :size="2" class="row-actions" @click.stop>
                          <a-button type="link" size="small" @click="openOperationModal(row, 'buy')">买</a-button>
                          <a-button type="link" size="small" @click="openOperationModal(row, 'sell')">卖</a-button>
                          <a-button type="link" size="small" @click="openOperationModal(row, 'convert')">转</a-button>
                          <a-button type="link" size="small" title="编辑" @click="openEditModal(row)">
                            <EditOutlined />
                          </a-button>
                          <a-button type="link" size="small" danger title="删除" @click="removeHolding(row)">
                            <DeleteOutlined />
                          </a-button>
                        </a-space>
                      </template>
                    </vxe-column>
                  </vxe-table>
                </div>
              </section>
            </a-col>

            <a-col :xs="24" :xl="5">
              <div class="page-stack side-stack">
                <a-card title="近一个月收益趋势" size="small">
                  <template #extra>
                    <a-select v-model:value="sideChartRange" size="small" style="width: 78px">
                      <a-select-option value="month">近1月</a-select-option>
                      <a-select-option value="quarter">近3月</a-select-option>
                    </a-select>
                  </template>
                  <div ref="holdingChartRef" class="chart"></div>
                </a-card>
                <a-card title="AI 助手" size="small" class="ai-chat-card">
                  <template #extra>
                    <a-button type="text" size="small" :disabled="aiChatMessages.length === 0 || isChatStreaming" @click="clearAiChatMessages">
                      <template #icon><ClearOutlined /></template>
                    </a-button>
                  </template>
                  <div ref="aiChatBodyRef" class="ai-chat-body">
                    <div v-if="aiChatMessages.length === 0" class="ai-chat-empty">
                      可以询问当前持仓、我的和博主收益、跟投差异，或搜索基金信息。
                    </div>
                    <div
                      v-for="message in aiChatMessages"
                      :key="message.id"
                      class="ai-chat-message"
                      :class="message.role === 'user' ? 'user' : 'assistant'"
                    >
                      <div class="ai-chat-bubble">{{ message.content || '...' }}</div>
                    </div>
                  </div>
                  <div class="ai-chat-input">
                    <a-textarea
                      v-model:value="aiChatInput"
                      :auto-size="{ minRows: 2, maxRows: 4 }"
                      :disabled="isChatStreaming"
                      placeholder="问问当前持仓、收益差异，或输入基金代码/名称查询"
                      @keydown.enter.exact.prevent="sendAiChatMessage"
                    />
                    <a-button type="primary" :loading="isChatStreaming" :disabled="!aiChatInput.trim()" @click="sendAiChatMessage">
                      <template #icon><SendOutlined /></template>
                    </a-button>
                  </div>
                </a-card>
              </div>
            </a-col>
          </a-row>

        </div>
      </a-layout-content>

      <a-modal
        v-model:open="isDetailModalOpen"
        centered
        width="960px"
        :footer="null"
        :title="selectedHolding ? `${selectedHolding.fundName}（${selectedHolding.fundCode}）` : '基金详情'"
        @after-open-change="handleDetailOpenChange"
      >
        <a-row justify="space-between" align="middle" class="detail-head">
          <a-col>
            <a-typography-text type="secondary">基金业绩走势与跟投收益曲线</a-typography-text>
          </a-col>
          <a-col>
            <a-space>
              <a-segmented
                v-model:value="detailChartMode"
                :options="[
                  { label: '业绩走势', value: 'performance' },
                  { label: '净值曲线', value: 'netWorth' },
                ]"
              />
              <a-segmented
                v-model:value="trendRange"
                :options="DETAIL_TREND_OPTIONS"
              />
            </a-space>
          </a-col>
        </a-row>
        <a-spin :spinning="isTrendLoading">
          <div ref="detailChartRef" class="detail-chart"></div>
        </a-spin>
      </a-modal>

      <a-modal
        v-model:open="isBudgetModalOpen"
        centered
        title="设置"
        width="860px"
        wrap-class-name="settings-modal"
        ok-text="确认"
        cancel-text="取消"
        @ok="saveBudget"
      >
        <a-form layout="vertical" autocomplete="off" class="settings-form">
          <div class="settings-page">
            <nav class="settings-sidebar" aria-label="设置分类">
              <button
                type="button"
                class="settings-tab"
                :class="{ active: settingsSection === 'budget' }"
                @click="settingsSection = 'budget'"
              >
                预算
              </button>
              <button
                type="button"
                class="settings-tab"
                :class="{ active: settingsSection === 'ai' }"
                @click="settingsSection = 'ai'"
              >
                AI 识别
              </button>
            </nav>
            <section class="settings-content">
              <div v-if="settingsSection === 'budget'" class="settings-pane">
                <div class="settings-hero">
                  <div>
                    <div class="settings-title">预算</div>
                    <div class="settings-description">用于计算跟投比例、仓位占比和剩余可投入金额。</div>
                  </div>
                  <div class="settings-summary">跟投比例 {{ ratio.blogger.toFixed(2) }} : 1</div>
                </div>
                <div class="settings-list">
                  <div class="settings-row">
                    <div class="settings-row-meta">
                      <div class="settings-item-title">我的总预算</div>
                      <div class="settings-item-description">你计划用于跟投的总资金。</div>
                    </div>
                    <div class="settings-control settings-control-wide">
                      <a-input-number
                        v-model:value="budgetForm.myBudget"
                        :min="0"
                        :precision="2"
                        addon-before="¥"
                      />
                    </div>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-meta">
                      <div class="settings-item-title">博主总预算</div>
                      <div class="settings-item-description">用于换算博主持仓到你的目标持仓。</div>
                    </div>
                    <div class="settings-control settings-control-wide">
                      <a-input-number
                        v-model:value="budgetForm.bloggerBudget"
                        :min="0"
                        :precision="2"
                        addon-before="¥"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="settings-pane">
                <div class="settings-hero">
                  <div>
                    <div class="settings-title">AI 识别</div>
                    <div class="settings-description">配置持仓截图识别使用的模型服务。</div>
                  </div>
                </div>
                <div class="settings-list">
                  <div class="settings-row">
                    <div class="settings-row-meta">
                      <div class="settings-item-title">Base URL</div>
                      <div class="settings-item-description">兼容 OpenAI 接口的服务地址。</div>
                    </div>
                    <div class="settings-control settings-control-wide">
                      <a-input v-model:value="store.aiConfig.baseURL" placeholder="请输入 Base URL" />
                    </div>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-meta">
                      <div class="settings-item-title">模型名称</div>
                      <div class="settings-item-description">用于识别截图内容的视觉模型。</div>
                    </div>
                    <div class="settings-control settings-control-wide">
                      <a-input v-model:value="store.aiConfig.model" placeholder="请输入模型名称" />
                    </div>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-meta">
                      <div class="settings-item-title">API Key</div>
                      <div class="settings-item-description">只保存在本机浏览器，用于调用上面的模型服务。</div>
                    </div>
                    <div class="settings-control settings-control-wide">
                      <a-input-password
                        v-model:value="store.aiConfig.apiKey"
                        autocomplete="new-password"
                        placeholder="sk-..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </a-form>
      </a-modal>

      <a-modal
        v-model:open="isHoldingModalOpen"
        centered
        title="持仓记录"
        width="720px"
        ok-text="确认"
        cancel-text="取消"
        @ok="saveHolding"
      >
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="基金代码">
                <a-input
                  v-model:value="holdingForm.fundCode"
                  :maxlength="6"
                  placeholder="先输入 6 位基金代码"
                  @blur="fillFundNameByCode"
                  @press-enter="fillFundNameByCode"
                />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="基金名称">
                <a-input
                  v-model:value="holdingForm.fundName"
                  placeholder="输入代码后自动填充，可手动修改"
                >
                  <template v-if="isFundInfoLoading" #suffix>
                    <a-spin size="small" />
                  </template>
                </a-input>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="我的持有金额">
                <a-input-number v-model:value="holdingForm.myAmount" :min="0" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="我的持有收益">
                <a-input-number v-model:value="holdingForm.myProfit" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="博主持有金额">
                <a-input-number v-model:value="holdingForm.bloggerAmount" :min="0" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="博主持有收益">
                <a-input-number v-model:value="holdingForm.bloggerProfit" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </a-modal>

      <a-modal
        v-model:open="isOperationModalOpen"
        centered
        :title="getOperationTitle()"
        width="560px"
        ok-text="确认"
        cancel-text="取消"
        @ok="saveOperation"
      >
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col v-if="operationForm.type !== 'convert'" :span="12">
              <a-form-item label="博主金额">
                <a-input-number
                  v-model:value="operationForm.bloggerAmount"
                  :min="0"
                  :precision="2"
                  addon-before="¥"
                  @change="syncMyOperationAmount"
                />
              </a-form-item>
            </a-col>
            <a-col v-if="operationForm.type !== 'convert'" :span="12">
              <a-form-item label="我的金额">
                <a-input-number v-model:value="operationForm.myAmount" :min="0" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <template v-if="operationForm.type === 'convert'">
              <a-col :span="12">
                <a-form-item label="博主转出份额">
                  <div class="operation-estimate">当前总份额：{{ formatNumber(operationForm.bloggerTotalShare) }}</div>
                  <a-space wrap>
                    <a-button @click="setConvertShare('blogger', 1 / 3)">1/3</a-button>
                    <a-button @click="setConvertShare('blogger', 1 / 2)">1/2</a-button>
                    <a-button @click="setConvertShare('blogger', 1)">全部</a-button>
                    <a-input-number
                      v-model:value="operationForm.bloggerShare"
                      :min="0"
                      :max="operationForm.bloggerTotalShare"
                      :precision="2"
                      placeholder="手动份额"
                      style="width: 130px"
                      @change="syncConvertAmount('blogger')"
                    />
                  </a-space>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="我的转出份额">
                  <div class="operation-estimate">当前总份额：{{ formatNumber(operationForm.myTotalShare) }}</div>
                  <a-space wrap>
                    <a-button @click="setConvertShare('mine', 1 / 3)">1/3</a-button>
                    <a-button @click="setConvertShare('mine', 1 / 2)">1/2</a-button>
                    <a-button @click="setConvertShare('mine', 1)">全部</a-button>
                    <a-input-number
                      v-model:value="operationForm.myShare"
                      :min="0"
                      :max="operationForm.myTotalShare"
                      :precision="2"
                      placeholder="手动份额"
                      style="width: 130px"
                      @change="syncConvertAmount('mine')"
                    />
                  </a-space>
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="转入基金代码">
                  <a-input
                    v-model:value="operationForm.toFundCode"
                    :maxlength="6"
                    placeholder="请输入 6 位基金代码"
                    @blur="fillOperationTargetFundName"
                    @press-enter="fillOperationTargetFundName"
                  />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="转入基金名称">
                  <a-input v-model:value="operationForm.toFundName" placeholder="输入代码后自动填充，可手动修改" />
                </a-form-item>
              </a-col>
            </template>
          </a-row>
        </a-form>
      </a-modal>

      <a-modal v-model:open="isOperationDetailOpen" centered title="操作详情" :footer="null" width="620px">
        <a-space v-if="selectedOperation" direction="vertical" :size="12" class="full-width">
          <a-descriptions bordered size="small" :column="1">
            <a-descriptions-item label="状态">
              {{ selectedOperation.status === 'pending' ? '确认中' : '已确认' }}
            </a-descriptions-item>
            <a-descriptions-item label="操作">{{ getOperationActionText(selectedOperation.type) }}</a-descriptions-item>
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
              v-for="side in (['blogger', 'mine'] as InvestorSide[])"
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
              <div v-else class="operation-side-empty">未记录</div>
            </div>
          </div>
          <a-button block danger @click="revokeSelectedOperations">撤回操作</a-button>
        </a-space>
      </a-modal>

      <a-modal
        v-model:open="isAiModalOpen"
        centered
        title="AI 识别持仓截图"
        width="1040px"
        wrap-class-name="ai-recognition-modal"
        ok-text="确认"
        cancel-text="取消"
        @ok="applyRecognized"
      >
        <a-row :gutter="[20, 20]" class="ai-recognition-layout">
          <a-col :xs="24" :md="8">
            <a-card size="small" class="ai-control-card">
              <div class="ai-control-stack">
                <div class="ai-control-section">
                  <div class="ai-card-title">选择截图类型</div>
                  <a-radio-group v-model:value="aiSide" button-style="solid" class="ai-side-tabs">
                    <a-radio-button value="mine">我的截图</a-radio-button>
                    <a-radio-button value="blogger">博主截图</a-radio-button>
                  </a-radio-group>
                </div>
                <a-upload-dragger
                  v-model:file-list="uploadedFiles"
                  accept="image/*"
                  multiple
                  :before-upload="beforeUpload"
                  :max-count="20"
                  class="upload-box"
                  @change="handleUploadChange"
                >
                  <div class="upload-content">
                    <p class="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p class="ant-upload-text">上传持仓截图</p>
                    <p class="ant-upload-hint">支持多张连续截图，自动匹配基金代码、金额、收益</p>
                  </div>
                </a-upload-dragger>
                <a-button type="primary" :loading="isRecognizing" block class="ai-recognize-button" @click="runRecognition">
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
                      <span class="ai-result-stat">总金额 {{ formatMoney(recognizedSummary.amount) }}</span>
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
              <a-table
                :data-source="recognizedRows"
                :locale="{ emptyText: '暂无数据' }"
                :pagination="false"
                :scroll="{ y: 390 }"
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
            </a-card>
          </a-col>
        </a-row>
      </a-modal>
    </a-layout>
  </a-config-provider>
</template>
