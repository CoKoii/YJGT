import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { HISTORY_LIMIT, OPERATION_LIMIT } from '@/constants/portfolio'
import { createEmptyPortfolioState, loadPortfolio, savePortfolio } from '@/services/storage'
import type {
  AiConfig,
  BudgetConfig,
  Holding,
  HoldingDraft,
  HoldingOperation,
  HoldingOperationDraft,
  PortfolioState,
  PortfolioTotals,
  ProfitSnapshot,
  RecognizedHolding,
} from '@/types'
import { actualInvested, createHistoryDateKey, profitRate } from '@/utils/calculations'

function findLatestNavDate(
  items: Holding[],
  field: 'myNavDate' | 'bloggerNavDate',
): string {
  return items.reduce((latest, item) => {
    const date = item[field]
    if (!date) return latest
    return date > latest ? date : latest
  }, '')
}

function compactHistory(items: ProfitSnapshot[]): ProfitSnapshot[] {
  const latestByDate = new Map<string, ProfitSnapshot>()
  items.forEach((item) => latestByDate.set(item.date, item))
  return [...latestByDate.values()].slice(-HISTORY_LIMIT)
}

function createHoldingFromRecognition(side: 'mine' | 'blogger', data: RecognizedHolding, existing?: Holding): Holding {
  const base: Holding = existing ?? {
    id: crypto.randomUUID(),
    fundName: data.fundName,
    fundCode: data.fundCode,
    myCost: 0,
    myShares: 0,
    myNav: 0,
    myNavDate: '',
    myAmount: 0,
    myProfit: 0,
    myYesterdayProfit: 0,
    bloggerCost: 0,
    bloggerShares: 0,
    bloggerNav: 0,
    bloggerNavDate: '',
    bloggerAmount: 0,
    bloggerProfit: 0,
    bloggerYesterdayProfit: 0,
    updatedAt: new Date().toISOString(),
  }

  return side === 'mine'
    ? {
        ...base,
        fundName: data.fundName,
        fundCode: data.fundCode,
        myCost: 0,
        myShares: 0,
        myNav: 0,
        myNavDate: '',
        myAmount: data.amount,
        myProfit: data.profit,
        myYesterdayProfit: 0,
      }
    : {
        ...base,
        fundName: data.fundName,
        fundCode: data.fundCode,
        bloggerCost: 0,
        bloggerShares: 0,
        bloggerNav: 0,
        bloggerNavDate: '',
        bloggerAmount: data.amount,
        bloggerProfit: data.profit,
        bloggerYesterdayProfit: 0,
      }
}

export const usePortfolioStore = defineStore('portfolio', () => {
  const persisted = loadPortfolio()
  const budget = ref<BudgetConfig>(persisted.budget)
  const aiConfig = ref<AiConfig>(persisted.aiConfig)
  const holdings = ref<Holding[]>(persisted.holdings)
  const operations = ref<HoldingOperation[]>(persisted.operations)
  const history = ref<ProfitSnapshot[]>(compactHistory(persisted.history))
  const updatedAt = ref(persisted.updatedAt)

  const totals = computed<PortfolioTotals>(() => {
    const latestMyNavDate = findLatestNavDate(holdings.value, 'myNavDate')
    const latestBloggerNavDate = findLatestNavDate(holdings.value, 'bloggerNavDate')
    const aggregate = {
      myAmount: 0,
      bloggerAmount: 0,
      myProfit: 0,
      bloggerProfit: 0,
      myInvested: 0,
      bloggerInvested: 0,
      myYesterdayProfit: 0,
      bloggerYesterdayProfit: 0,
    }

    for (const holding of holdings.value) {
      aggregate.myAmount += holding.myAmount
      aggregate.bloggerAmount += holding.bloggerAmount
      aggregate.myProfit += holding.myProfit
      aggregate.bloggerProfit += holding.bloggerProfit
      aggregate.myInvested += actualInvested(holding.myAmount, holding.myProfit)
      aggregate.bloggerInvested += actualInvested(holding.bloggerAmount, holding.bloggerProfit)
      if (holding.myNavDate === latestMyNavDate) {
        aggregate.myYesterdayProfit += holding.myYesterdayProfit
      }
      if (holding.bloggerNavDate === latestBloggerNavDate) {
        aggregate.bloggerYesterdayProfit += holding.bloggerYesterdayProfit
      }
    }

    return {
      ...aggregate,
      myProfitRate: profitRate(aggregate.myAmount, aggregate.myProfit),
      bloggerProfitRate: profitRate(aggregate.bloggerAmount, aggregate.bloggerProfit),
    }
  })

  function serialize(): PortfolioState {
    return {
      budget: budget.value,
      aiConfig: aiConfig.value,
      holdings: holdings.value,
      operations: operations.value,
      history: history.value,
      updatedAt: updatedAt.value,
    }
  }

  function recordSnapshot() {
    const snapshot: ProfitSnapshot = {
      date: createHistoryDateKey(),
      myProfit: totals.value.myProfit,
      bloggerProfit: totals.value.bloggerProfit,
      myProfitRate: totals.value.myProfitRate,
      bloggerProfitRate: totals.value.bloggerProfitRate,
    }

    history.value = [
      ...history.value.filter((item) => item.date !== snapshot.date),
      snapshot,
    ].slice(-HISTORY_LIMIT)
  }

  function touch() {
    updatedAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
    recordSnapshot()
  }

  function setBudget(nextBudget: BudgetConfig) {
    budget.value = { ...nextBudget }
  }

  function setAiConfig(nextAiConfig: AiConfig) {
    aiConfig.value = { ...nextAiConfig }
  }

  function upsertHolding(payload: HoldingDraft) {
    const nextHolding: Holding = {
      ...payload,
      id: payload.id || crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    }
    const index = holdings.value.findIndex((item) => item.id === nextHolding.id)

    if (index >= 0) holdings.value.splice(index, 1, nextHolding)
    else holdings.value.unshift(nextHolding)

    touch()
  }

  function removeHolding(id: string) {
    holdings.value = holdings.value.filter((item) => item.id !== id)
    touch()
  }

  function recordOperation(
    payload: HoldingOperationDraft,
    source: HoldingOperation['source'] = 'manual',
  ) {
    const timestamp = new Date().toISOString()
    const nextOperation: HoldingOperation = {
      ...payload,
      id: crypto.randomUUID(),
      submittedAt: timestamp,
      tradeDate: createHistoryDateKey(),
      source,
      status: 'pending',
    }

    operations.value = [...operations.value, nextOperation].slice(-OPERATION_LIMIT)
    touch()
  }

  function removeOperation(id: string) {
    operations.value = operations.value.filter((item) => item.id !== id)
    touch()
  }

  function applyRecognizedHoldings(side: 'mine' | 'blogger', rows: RecognizedHolding[]) {
    const nextHoldings = [...holdings.value]

    rows.forEach((row) => {
      const index = nextHoldings.findIndex((item) => item.fundCode === row.fundCode)
      const existing = index >= 0 ? nextHoldings[index] : undefined
      const nextHolding = {
        ...createHoldingFromRecognition(side, row, existing),
        updatedAt: new Date().toISOString(),
      }

      if (index >= 0) nextHoldings.splice(index, 1, nextHolding)
      else nextHoldings.unshift(nextHolding)
    })

    holdings.value = nextHoldings
    touch()
  }

  function setSyncedPortfolio(nextHoldings: Holding[], nextOperations: HoldingOperation[]) {
    holdings.value = nextHoldings
    operations.value = nextOperations
    touch()
  }

  function resetPortfolio() {
    const empty = createEmptyPortfolioState()
    budget.value = empty.budget
    aiConfig.value = empty.aiConfig
    holdings.value = empty.holdings
    operations.value = empty.operations
    history.value = empty.history
    updatedAt.value = empty.updatedAt
  }

  function exportJson(): string {
    return JSON.stringify(serialize(), null, 2)
  }

  watch(
    [budget, aiConfig, holdings, operations, history, updatedAt],
    () => savePortfolio(serialize()),
    { deep: true },
  )

  return {
    budget,
    aiConfig,
    holdings,
    operations,
    history,
    updatedAt,
    totals,
    setBudget,
    setAiConfig,
    upsertHolding,
    removeHolding,
    recordOperation,
    removeOperation,
    applyRecognizedHoldings,
    setSyncedPortfolio,
    exportJson,
    resetPortfolio,
  }
})
