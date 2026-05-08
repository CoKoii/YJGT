import {
  DEFAULT_AI_SIDE,
  DEFAULT_SETTINGS_SECTION,
  EMPTY_HOLDING_DRAFT,
  FUND_CODE_PATTERN,
} from '@/constants/portfolio'
import { recognizeHoldingImage, streamPortfolioChat } from '@/services/ai'
import { fetchFundInfo, fetchFundNetWorthTrend, searchFundByName } from '@/services/fund'
import { loadAiChatMessages, saveAiChatMessages } from '@/services/storage'
import { usePortfolioStore } from '@/stores/portfolio'
import type {
  AiChatMessage,
  Holding,
  HoldingFormModel,
  HoldingOperation,
  HoldingRow,
  InvestorSide,
  OperationFormModel,
  RecognizedHolding,
  SettingsSection,
  UploadedFileItem,
  UploadedFileMeta,
} from '@/types'
import {
  actualInvested,
  buildOperationFundCodes,
  clampPercent,
  csvEscape,
  followRatio,
  profitRate,
} from '@/utils/calculations'
import { formatDateKey } from '@/utils/date'
import { downloadText, readImageDataUrl } from '@/utils/file'
import { syncPortfolioLedger } from '@/utils/portfolioLedger'
import { message, Modal } from 'ant-design-vue'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'

function createOperationForm(): OperationFormModel {
  return {
    type: 'buy',
    fundCode: '',
    fundName: '',
    amounts: {
      mine: 0,
      blogger: 0,
    },
    shares: {
      mine: 0,
      blogger: 0,
    },
    targetFund: {
      code: '',
      name: '',
    },
  }
}

export function usePortfolioDashboard() {
  const store = usePortfolioStore()

  const isHoldingModalOpen = ref(false)
  const isAiModalOpen = ref(false)
  const isBudgetModalOpen = ref(false)
  const isDetailModalOpen = ref(false)
  const isOperationModalOpen = ref(false)
  const isOperationDetailOpen = ref(false)
  const selectedHoldingId = ref<string | null>(null)
  const selectedOperations = ref<HoldingOperation[]>([])
  const selectedOperationHolding = ref<HoldingRow | null>(null)
  const settingsSection = ref<SettingsSection>(DEFAULT_SETTINGS_SECTION)
  const isRecognizing = ref(false)
  const isPreparingUploads = ref(false)
  const isChatStreaming = ref(false)
  const isFundInfoLoading = ref(false)
  const isSyncingNetWorth = ref(false)
  const uploadedFiles = ref<UploadedFileMeta[]>([])
  const uploadedImageDataUrls = ref<Record<string, string>>({})
  const recognizedRows = ref<RecognizedHolding[]>([])
  const aiChatMessages = ref<AiChatMessage[]>(loadAiChatMessages())
  const aiSide = ref<InvestorSide>(DEFAULT_AI_SIDE)

  const holdingForm = reactive<HoldingFormModel>({ ...EMPTY_HOLDING_DRAFT })
  const operationForm = reactive<OperationFormModel>(createOperationForm())
  const budgetForm = reactive({ ...store.budget })
  const aiConfigForm = reactive({ ...store.aiConfig })

  const selectedHolding = computed(() => {
    return (
      store.holdings.find((item) => item.id === selectedHoldingId.value) ??
      store.holdings[0] ??
      null
    )
  })

  const ratio = computed(() => followRatio(store.budget))
  const shouldInvest = computed(
    () => store.totals.bloggerInvested / Math.max(ratio.value.blogger, 1),
  )
  const budgetUsage = computed(() => ({
    mine:
      store.budget.myBudget > 0
        ? clampPercent((store.totals.myInvested / store.budget.myBudget) * 100)
        : 0,
    blogger:
      store.budget.bloggerBudget > 0
        ? clampPercent((store.totals.bloggerInvested / store.budget.bloggerBudget) * 100)
        : 0,
  }))

  const pendingOperationsByFundCode = computed(() => {
    const operationsByFundCode = new Map<string, HoldingOperation[]>()

    store.operations
      .filter((operation) => operation.status === 'pending')
      .forEach((operation) => {
        buildOperationFundCodes(operation).forEach((fundCode) => {
          const list = operationsByFundCode.get(fundCode) ?? []
          list.push(operation)
          operationsByFundCode.set(fundCode, list)
        })
      })

    return operationsByFundCode
  })

  const latestNavDates = computed(() => {
    return store.holdings.reduce(
      (summary, holding) => ({
        mine:
          holding.myNavDate && holding.myNavDate > summary.mine ? holding.myNavDate : summary.mine,
        blogger:
          holding.bloggerNavDate && holding.bloggerNavDate > summary.blogger
            ? holding.bloggerNavDate
            : summary.blogger,
      }),
      { mine: '', blogger: '' },
    )
  })

  const holdingRows = computed<HoldingRow[]>(() =>
    store.holdings.map((holding) => {
      const myInvested = actualInvested(holding.myAmount, holding.myProfit)
      const bloggerInvested = actualInvested(holding.bloggerAmount, holding.bloggerProfit)
      const targetInvested = ratio.value.blogger > 0 ? bloggerInvested / ratio.value.blogger : 0
      const myDailyProfit =
        holding.myNavDate && holding.myNavDate === latestNavDates.value.mine
          ? holding.myYesterdayProfit
          : null
      const bloggerDailyProfit =
        holding.bloggerNavDate && holding.bloggerNavDate === latestNavDates.value.blogger
          ? holding.bloggerYesterdayProfit
          : null

      return {
        ...holding,
        myInvested,
        bloggerInvested,
        targetInvested,
        myRate: profitRate(holding.myAmount, holding.myProfit),
        bloggerRate: profitRate(holding.bloggerAmount, holding.bloggerProfit),
        myPositionRate:
          store.totals.myInvested > 0 ? (myInvested / store.totals.myInvested) * 100 : 0,
        bloggerPositionRate:
          store.totals.bloggerInvested > 0
            ? (bloggerInvested / store.totals.bloggerInvested) * 100
            : 0,
        myDailyProfit,
        bloggerDailyProfit,
        latestNavDate: holding.myNavDate || holding.bloggerNavDate,
        pendingOperations: pendingOperationsByFundCode.value.get(holding.fundCode) ?? [],
      }
    }),
  )

  const todayProfit = computed(() =>
    holdingRows.value.reduce(
      (summary, row) => {
        if (row.myDailyProfit !== null) {
          summary.mine = (summary.mine ?? 0) + row.myDailyProfit
        }
        if (row.bloggerDailyProfit !== null) {
          summary.blogger = (summary.blogger ?? 0) + row.bloggerDailyProfit
        }
        return summary
      },
      { mine: null as number | null, blogger: null as number | null },
    ),
  )

  const recognizedSummary = computed(() =>
    recognizedRows.value.reduce(
      (summary, row) => ({
        amount: summary.amount + (Number.isFinite(row.amount) ? row.amount : 0),
        profit: summary.profit + (Number.isFinite(row.profit) ? row.profit : 0),
      }),
      { amount: 0, profit: 0 },
    ),
  )

  async function syncPortfolioWithNetWorth(showResult = false) {
    if (!store.isHydrated) return

    const fundCodes = [
      ...new Set(
        store.operations
          .flatMap(buildOperationFundCodes)
          .concat(store.holdings.map((item) => item.fundCode)),
      ),
    ].filter((fundCode) => FUND_CODE_PATTERN.test(fundCode))

    if (fundCodes.length === 0 || isSyncingNetWorth.value) return

    isSyncingNetWorth.value = true
    try {
      const trendList = await Promise.all(
        fundCodes.map((fundCode) => fetchFundNetWorthTrend(fundCode)),
      )
      const trends = new Map<string, Awaited<ReturnType<typeof fetchFundNetWorthTrend>>>(
        fundCodes.map((fundCode, index) => [fundCode, trendList[index] ?? []]),
      )
      const { holdings, operations } = syncPortfolioLedger(store.holdings, store.operations, trends)

      const nextSerialized = JSON.stringify({ holdings, operations })
      const currentSerialized = JSON.stringify({
        holdings: store.holdings,
        operations: store.operations,
      })
      if (nextSerialized !== currentSerialized) {
        const settledCount =
          operations.filter((item) => item.status === 'settled').length -
          store.operations.filter((item) => item.status === 'settled').length
        store.setSyncedPortfolio(holdings, operations)
        if (showResult && settledCount > 0) {
          message.success(`已按最新净值结算 ${settledCount} 条操作`)
        }
      }
    } catch (error) {
      if (showResult) {
        message.error(error instanceof Error ? error.message : '净值同步失败')
      }
    } finally {
      isSyncingNetWorth.value = false
    }
  }

  function openBudgetModal() {
    Object.assign(budgetForm, store.budget)
    Object.assign(aiConfigForm, store.aiConfig)
    settingsSection.value = DEFAULT_SETTINGS_SECTION
    isBudgetModalOpen.value = true
  }

  function saveSettings() {
    store.setBudget({ ...budgetForm })
    store.setAiConfig({ ...aiConfigForm })
    isBudgetModalOpen.value = false
    message.success('设置已保存')
  }

  function openCreateModal() {
    Object.assign(holdingForm, EMPTY_HOLDING_DRAFT)
    isHoldingModalOpen.value = true
  }

  function openEditModal(record: Holding) {
    Object.assign(holdingForm, record)
    isHoldingModalOpen.value = true
  }

  async function saveHolding() {
    if (!holdingForm.fundName.trim() || !FUND_CODE_PATTERN.test(holdingForm.fundCode.trim())) {
      message.warning('请填写基金名称和 6 位基金代码')
      return
    }

    store.upsertHolding({
      ...holdingForm,
      fundName: holdingForm.fundName.trim(),
      fundCode: holdingForm.fundCode.trim(),
      myCost: 0,
      myShares: 0,
      myNav: 0,
      myNavDate: '',
      bloggerCost: 0,
      bloggerShares: 0,
      bloggerNav: 0,
      bloggerNavDate: '',
    })
    isHoldingModalOpen.value = false
    await syncPortfolioWithNetWorth()
    message.success('持仓已更新')
  }

  async function fillFundNameByCode() {
    const code = holdingForm.fundCode.trim()
    if (!FUND_CODE_PATTERN.test(code)) return

    isFundInfoLoading.value = true
    try {
      const fundInfo = await fetchFundInfo(code)
      if (!fundInfo) {
        message.warning('未找到基金信息，请检查代码或手动填写名称')
        return
      }

      holdingForm.fundCode = fundInfo.code
      holdingForm.fundName = fundInfo.name
      message.success('已自动填充基金名称')
    } finally {
      isFundInfoLoading.value = false
    }
  }

  function openOperationModal(record: HoldingRow, type: OperationFormModel['type']) {
    selectedOperationHolding.value = record
    Object.assign(operationForm, createOperationForm(), {
      type,
      fundCode: record.fundCode,
      fundName: record.fundName,
    })
    isOperationModalOpen.value = true
  }

  function openDetailModal(record: Holding) {
    selectedHoldingId.value = record.id
    isDetailModalOpen.value = true
  }

  function syncMyOperationAmount() {
    operationForm.amounts.mine =
      ratio.value.blogger > 0
        ? Number((operationForm.amounts.blogger / ratio.value.blogger).toFixed(2))
        : 0
  }

  function syncMyOperationShare() {
    const baseHolding = selectedOperationHolding.value
    if (!baseHolding) return

    if (baseHolding.bloggerShares <= 0) {
      operationForm.shares.mine = 0
      return
    }

    const bloggerShareRatio = operationForm.shares.blogger / baseHolding.bloggerShares
    operationForm.shares.mine = Number((baseHolding.myShares * bloggerShareRatio).toFixed(2))
  }

  function setOperationAmountByRatio(owner: InvestorSide, amountRatio: number) {
    const baseHolding = selectedOperationHolding.value
    if (!baseHolding) return

    if (owner === 'blogger') {
      operationForm.shares.blogger = Number((baseHolding.bloggerShares * amountRatio).toFixed(2))
      operationForm.shares.mine = Number((baseHolding.myShares * amountRatio).toFixed(2))
      return
    }

    operationForm.shares.mine = Number((baseHolding.myShares * amountRatio).toFixed(2))
  }

  async function fillOperationTargetFundName() {
    const code = operationForm.targetFund.code.trim()
    if (!FUND_CODE_PATTERN.test(code)) return

    const fundInfo = await fetchFundInfo(code)
    operationForm.targetFund.code = fundInfo?.code ?? code
    operationForm.targetFund.name = fundInfo?.name ?? operationForm.targetFund.name
  }

  async function saveOperation() {
    const values = operationForm.type === 'buy' ? operationForm.amounts : operationForm.shares
    if (values.blogger <= 0 && values.mine <= 0) {
      message.warning(
        operationForm.type === 'buy' ? '请填写博主金额或我的金额' : '请填写博主份额或我的份额',
      )
      return
    }

    if (
      operationForm.type === 'convert' &&
      (!FUND_CODE_PATTERN.test(operationForm.targetFund.code.trim()) ||
        !operationForm.targetFund.name.trim())
    ) {
      message.warning('请填写转入基金代码和名称')
      return
    }

    if (operationForm.type !== 'buy' && selectedOperationHolding.value) {
      if (operationForm.shares.blogger > selectedOperationHolding.value.bloggerShares + 0.01) {
        message.warning('博主操作份额不能超过当前持有份额')
        return
      }
      if (operationForm.shares.mine > selectedOperationHolding.value.myShares + 0.01) {
        message.warning('我的操作份额不能超过当前持有份额')
        return
      }
    }

    if (operationForm.type === 'buy') {
      store.recordOperation({
        type: 'buy',
        fundCode: operationForm.fundCode,
        fundName: operationForm.fundName,
        amounts: { ...operationForm.amounts },
      })
    } else if (operationForm.type === 'sell') {
      store.recordOperation({
        type: 'sell',
        fundCode: operationForm.fundCode,
        fundName: operationForm.fundName,
        shares: { ...operationForm.shares },
      })
    } else {
      store.recordOperation({
        type: 'convert',
        fundCode: operationForm.fundCode,
        fundName: operationForm.fundName,
        shares: { ...operationForm.shares },
        targetFund: {
          code: operationForm.targetFund.code.trim(),
          name: operationForm.targetFund.name.trim(),
        },
      })
    }

    isOperationModalOpen.value = false
    await syncPortfolioWithNetWorth(true)
    message.success('操作已保存')
  }

  function openOperationDetail(operations: HoldingOperation[]) {
    selectedOperations.value = operations
    isOperationDetailOpen.value = operations.length > 0
  }

  function revokeSelectedOperations(id: string) {
    Modal.confirm({
      title: '删除操作记录',
      content: '确认删除这条操作记录吗？删除后将无法恢复。',
      okText: '删除',
      cancelText: '再想想',
      onOk: () => {
        store.removeOperation(id)
        selectedOperations.value = selectedOperations.value.filter((item) => item.id !== id)
        isOperationDetailOpen.value = selectedOperations.value.length > 0
        message.success('操作记录已删除')
      },
    })
  }

  function removeHolding(record: Holding) {
    Modal.confirm({
      title: '删除持仓',
      content: `确认删除 ${record.fundName} 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '再想想',
      onOk: () => {
        store.removeHolding(record.id)
        if (selectedHoldingId.value === record.id) {
          selectedHoldingId.value = store.holdings[0]?.id ?? null
        }
        message.success('已删除')
      },
    })
  }

  async function handleUploadChange({ fileList }: { fileList: UploadedFileItem[] }) {
    uploadedFiles.value = fileList.map((file) => ({ uid: file.uid, name: file.name }))
    const activeIds = new Set(fileList.map((file) => file.uid))
    const nextImageDataUrls = Object.fromEntries(
      Object.entries(uploadedImageDataUrls.value).filter(([uid]) => activeIds.has(uid)),
    )

    isPreparingUploads.value = true
    try {
      await Promise.all(
        fileList.map(async (file) => {
          if (!file.originFileObj || nextImageDataUrls[file.uid]) return
          nextImageDataUrls[file.uid] = await readImageDataUrl(file.originFileObj)
        }),
      )
      uploadedImageDataUrls.value = nextImageDataUrls
    } finally {
      isPreparingUploads.value = false
    }
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
        return { ...row, fundCode: fundInfo?.code ?? '' }
      }),
    )
  }

  async function runRecognition() {
    if (isPreparingUploads.value) {
      message.loading({
        content: '截图处理中，请稍候',
        key: 'ai-upload-preparing',
        duration: 1.2,
      })
      return
    }

    const imageDataUrls = uploadedFiles.value
      .map((file) => uploadedImageDataUrls.value[file.uid])
      .filter((item): item is string => Boolean(item))
    if (imageDataUrls.length === 0) {
      message.warning('请先上传截图')
      return
    }

    isRecognizing.value = true
    try {
      message.destroy('ai-upload-preparing')
      recognizedRows.value = await completeRecognizedCodes(
        await recognizeHoldingImage(store.aiConfig, imageDataUrls),
      )
      const missingCodeCount = recognizedRows.value.filter((row) => !row.fundCode).length
      message.success(
        `已识别 ${recognizedRows.value.length} 条持仓${missingCodeCount ? `，其中 ${missingCodeCount} 条暂未匹配代码` : ''}`,
      )
    } catch (error) {
      message.error(error instanceof Error ? error.message : '识别失败')
    } finally {
      isRecognizing.value = false
    }
  }

  async function applyRecognized() {
    const validRows = recognizedRows.value.filter((row) => FUND_CODE_PATTERN.test(row.fundCode))
    if (validRows.length === 0) {
      message.warning('当前没有可写入的有效识别结果')
      return
    }

    store.applyRecognizedHoldings(aiSide.value, validRows)
    resetAiRecognition()
    isAiModalOpen.value = false
    await syncPortfolioWithNetWorth()
    message.success(`已导入 ${validRows.length} 条持仓`)
  }

  async function sendAiChatMessage(input?: string) {
    const question = input?.trim() ?? ''
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

    aiChatMessages.value = [...aiChatMessages.value, userMessage, assistantMessage]
    isChatStreaming.value = true

    try {
      await streamPortfolioChat({
        config: store.aiConfig,
        messages: aiChatMessages.value.filter((item) => item.id !== assistantMessage.id),
        onDelta: (delta) => {
          assistantMessage.content += delta
          aiChatMessages.value = aiChatMessages.value.map((item) =>
            item.id === assistantMessage.id ? { ...assistantMessage } : item,
          )
        },
      })
    } catch (error) {
      assistantMessage.content = error instanceof Error ? error.message : 'AI 对话失败'
      aiChatMessages.value = aiChatMessages.value.map((item) =>
        item.id === assistantMessage.id ? { ...assistantMessage } : item,
      )
    } finally {
      isChatStreaming.value = false
      await nextTick()
    }
  }

  function clearAiChatMessages() {
    aiChatMessages.value = []
  }

  function exportJson() {
    downloadText(`yjgt-${Date.now()}.json`, store.exportJson(), 'application/json;charset=utf-8')
  }

  function exportCsv() {
    const header = [
      '基金名称',
      '基金代码',
      '最新净值日期',
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
        item.latestNavDate,
        item.myAmount,
        item.myProfit,
        item.bloggerAmount,
        item.bloggerProfit,
        item.myRate.toFixed(2),
        item.bloggerRate.toFixed(2),
      ].map(csvEscape),
    )

    downloadText(
      `yjgt-${Date.now()}.csv`,
      [header, ...rows].map((row) => row.join(',')).join('\n'),
      'text/csv',
    )
  }

  watch(
    aiChatMessages,
    (messages) => {
      saveAiChatMessages(messages)
    },
    { deep: true },
  )

  watch(aiSide, resetAiRecognition)

  onMounted(() => {
    if (!selectedHoldingId.value) {
      selectedHoldingId.value = store.holdings[0]?.id ?? null
    }
    void syncPortfolioWithNetWorth()
  })

  return {
    store,
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
    operationForm,
    ratio,
    recognizedRows,
    recognizedSummary,
    selectedHolding,
    selectedHoldingId,
    selectedOperations,
    settingsSection,
    shouldInvest,
    todayProfit,
    uploadedFiles,
    applyRecognized,
    clearAiChatMessages,
    exportCsv,
    exportJson,
    fillFundNameByCode,
    fillOperationTargetFundName,
    handleUploadChange,
    openBudgetModal,
    openCreateModal,
    openDetailModal,
    openEditModal,
    openOperationDetail,
    openOperationModal,
    removeHolding,
    revokeSelectedOperations,
    runRecognition,
    saveHolding,
    saveOperation,
    saveSettings,
    sendAiChatMessage,
    setOperationAmountByRatio,
    syncMyOperationShare,
    syncMyOperationAmount,
  }
}
