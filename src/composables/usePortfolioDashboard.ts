import {
  DEFAULT_AI_SIDE,
  DEFAULT_SETTINGS_SECTION,
  EMPTY_HOLDING_DRAFT,
  FUND_CODE_PATTERN,
} from '@/constants/portfolio'
import { streamPortfolioChat } from '@/services/aiChat'
import { recognizeHoldingImage } from '@/services/aiRecognition'
import { fetchFundInfo, searchFundByName } from '@/services/fundApi'
import { loadAiChatMessages, saveAiChatMessages } from '@/services/storage'
import { usePortfolioStore } from '@/stores/portfolio'
import type {
  AiChatMessage,
  Holding,
  HoldingFormModel,
  HoldingOperation,
  InvestorSide,
  OperationFormModel,
  RecognizedHolding,
  SettingsSection,
  UploadedFileItem,
  UploadedFileMeta,
} from '@/types'
import {
  actualInvested,
  clampPercent,
  csvEscape,
  followRatio,
  profitRate,
} from '@/utils/calculations'
import { downloadText, readImageDataUrl } from '@/utils/file'
import { message, Modal } from 'ant-design-vue'
import { computed, nextTick, reactive, ref, watch } from 'vue'

function createOperationForm(): OperationFormModel {
  return {
    type: 'buy',
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
  const settingsSection = ref<SettingsSection>(DEFAULT_SETTINGS_SECTION)
  const isRecognizing = ref(false)
  const isPreparingUploads = ref(false)
  const isChatStreaming = ref(false)
  const isFundInfoLoading = ref(false)
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

    store.operations
      .filter((operation) => operation.status === 'pending')
      .forEach((operation) => {
        ;[operation.fundCode, operation.fromFundCode, operation.toFundCode]
          .filter((fundCode): fundCode is string => Boolean(fundCode))
          .forEach((fundCode) => {
            const list = operationsByFundCode.get(fundCode) ?? []
            list.push(operation)
            operationsByFundCode.set(fundCode, list)
          })
      })

    return operationsByFundCode
  })

  const holdingRows = computed(() =>
    store.holdings.map((holding) => {
      const myInvested = actualInvested(holding.myAmount, holding.myProfit)
      const bloggerInvested = actualInvested(holding.bloggerAmount, holding.bloggerProfit)
      const targetInvested = ratio.value.blogger > 0 ? bloggerInvested / ratio.value.blogger : 0

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
        pendingOperations: pendingOperationsByFundCode.value.get(holding.fundCode) ?? [],
      }
    }),
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

  const selectedOperation = computed(() => selectedOperations.value[0] ?? null)
  const selectedOperationsBySide = computed(() => ({
    blogger: selectedOperations.value.find((operation) => operation.side === 'blogger'),
    mine: selectedOperations.value.find((operation) => operation.side === 'mine'),
  }))

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
    message.success('设置已更新')
  }

  function openCreateModal() {
    Object.assign(holdingForm, EMPTY_HOLDING_DRAFT)
    isHoldingModalOpen.value = true
  }

  function openEditModal(record: Holding) {
    Object.assign(holdingForm, record)
    isHoldingModalOpen.value = true
  }

  function saveHolding() {
    if (!holdingForm.fundName.trim() || !FUND_CODE_PATTERN.test(holdingForm.fundCode.trim())) {
      message.warning('请填写基金名称和 6 位基金代码')
      return
    }

    store.upsertHolding({
      ...holdingForm,
      fundName: holdingForm.fundName.trim(),
      fundCode: holdingForm.fundCode.trim(),
    })
    isHoldingModalOpen.value = false
    message.success('持仓已保存')
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

  function openOperationModal(record: Holding, type: OperationFormModel['type']) {
    const bloggerInvested = actualInvested(record.bloggerAmount, record.bloggerProfit)
    const myInvested = actualInvested(record.myAmount, record.myProfit)

    Object.assign(operationForm, createOperationForm(), {
      type,
      bloggerTotalShare: bloggerInvested,
      myTotalShare: myInvested,
      bloggerInvested,
      myInvested,
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
    operationForm.myAmount =
      ratio.value.blogger > 0
        ? Number((operationForm.bloggerAmount / ratio.value.blogger).toFixed(2))
        : 0
  }

  function setConvertShare(owner: InvestorSide, shareRatio: number) {
    if (owner === 'blogger') {
      operationForm.bloggerShare = Number((operationForm.bloggerTotalShare * shareRatio).toFixed(2))
      operationForm.bloggerAmount = operationForm.bloggerShare
      return
    }

    operationForm.myShare = Number((operationForm.myTotalShare * shareRatio).toFixed(2))
    operationForm.myAmount = operationForm.myShare
  }

  function syncConvertAmount(owner: InvestorSide) {
    if (owner === 'blogger') {
      operationForm.bloggerAmount = operationForm.bloggerShare
      return
    }

    operationForm.myAmount = operationForm.myShare
  }

  async function fillOperationTargetFundName() {
    const code = operationForm.toFundCode.trim()
    if (!FUND_CODE_PATTERN.test(code)) return

    const fundInfo = await fetchFundInfo(code)
    operationForm.toFundCode = fundInfo?.code ?? code
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

    if (
      operationForm.type === 'convert' &&
      (!FUND_CODE_PATTERN.test(operationForm.toFundCode.trim()) || !operationForm.toFundName.trim())
    ) {
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
          toFundCode:
            operationForm.type === 'convert' ? operationForm.toFundCode.trim() : undefined,
          toFundName:
            operationForm.type === 'convert' ? operationForm.toFundName.trim() : undefined,
        })),
    )

    isOperationModalOpen.value = false
    message.success('操作已记录')
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

  async function handleUploadChange({
    fileList,
  }: {
    fileList: UploadedFileItem[]
  }) {
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
        `识别到 ${recognizedRows.value.length} 条持仓${missingCodeCount ? `，${missingCodeCount} 条未匹配代码` : ''}`,
      )
    } catch (error) {
      message.error(error instanceof Error ? error.message : '识别失败')
    } finally {
      isRecognizing.value = false
    }
  }

  function applyRecognized() {
    const validRows = recognizedRows.value.filter((row) => FUND_CODE_PATTERN.test(row.fundCode))
    if (validRows.length === 0) {
      message.warning('没有可写入的有效识别结果')
      return
    }

    store.applyRecognizedHoldings(aiSide.value, validRows)
    resetAiRecognition()
    isAiModalOpen.value = false
    message.success(`已写入 ${validRows.length} 条持仓`)
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
        portfolioContext: buildPortfolioContext(),
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

  if (!selectedHoldingId.value) {
    selectedHoldingId.value = store.holdings[0]?.id ?? null
  }

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
    selectedOperation,
    selectedOperations,
    selectedOperationsBySide,
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
    resetAiRecognition,
    revokeSelectedOperations,
    runRecognition,
    saveHolding,
    saveOperation,
    saveSettings,
    sendAiChatMessage,
    setConvertShare,
    syncConvertAmount,
    syncMyOperationAmount,
  }
}
