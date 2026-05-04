import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { AiConfig, BudgetConfig, Holding, HoldingOperation, InvestorSide, ProfitSnapshot } from '@/types'
import { actualInvested, profitRate } from '@/utils/calculations'
import { loadPortfolio, savePortfolio } from '@/services/storage'

const DEFAULT_BUDGET: BudgetConfig = { myBudget: 0, bloggerBudget: 0 }
const DEFAULT_AI_CONFIG: AiConfig = {
  baseURL: '',
  apiKey: '',
  model: '',
}

type RecognizedHoldingInput = { fundName: string; fundCode: string; amount: number; profit: number }

export const usePortfolioStore = defineStore('portfolio', () => {
  const persisted = loadPortfolio()
  const budget = ref<BudgetConfig>(persisted?.budget ?? { ...DEFAULT_BUDGET })
  const aiConfig = ref<AiConfig>(persisted?.aiConfig ?? { ...DEFAULT_AI_CONFIG })
  const holdings = ref<Holding[]>(persisted?.holdings ?? [])
  const operations = ref<HoldingOperation[]>(persisted?.operations ?? [])
  const history = ref<ProfitSnapshot[]>(compactHistory(persisted?.history ?? []))
  const updatedAt = ref(persisted?.updatedAt ?? '')

  const totals = computed(() => {
    const total = {
      myAmount: 0,
      bloggerAmount: 0,
      myProfit: 0,
      bloggerProfit: 0,
      myInvested: 0,
      bloggerInvested: 0,
      myYesterdayProfit: 0,
      bloggerYesterdayProfit: 0,
    }

    for (const item of holdings.value) {
      total.myAmount += item.myAmount
      total.bloggerAmount += item.bloggerAmount
      total.myProfit += item.myProfit
      total.bloggerProfit += item.bloggerProfit
      total.myInvested += actualInvested(item.myAmount, item.myProfit)
      total.bloggerInvested += actualInvested(item.bloggerAmount, item.bloggerProfit)
      total.myYesterdayProfit += item.myYesterdayProfit
      total.bloggerYesterdayProfit += item.bloggerYesterdayProfit
    }

    return {
      ...total,
      myProfitRate: profitRate(total.myAmount, total.myProfit),
      bloggerProfitRate: profitRate(total.bloggerAmount, total.bloggerProfit),
    }
  })

  function touch() {
    updatedAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
    recordSnapshot(aggregateSnapshot())
  }

  function compactHistory(items: ProfitSnapshot[]): ProfitSnapshot[] {
    const latestByDate = new Map<string, ProfitSnapshot>()
    items.forEach((item) => latestByDate.set(item.date, item))
    return [...latestByDate.values()].slice(-90)
  }

  function recordSnapshot(snapshot: ProfitSnapshot) {
    history.value = [...history.value.filter((item) => item.date !== snapshot.date), snapshot].slice(-90)
  }

  function aggregateSnapshot(): ProfitSnapshot {
    return {
      date: new Date().toISOString().slice(0, 10),
      myProfit: totals.value.myProfit,
      bloggerProfit: totals.value.bloggerProfit,
      myProfitRate: totals.value.myProfitRate,
      bloggerProfitRate: totals.value.bloggerProfitRate,
    }
  }

  function upsertHolding(payload: Omit<Holding, 'id' | 'updatedAt'> & { id?: string }) {
    const existingIndex = holdings.value.findIndex((item) => item.id === payload.id)
    const next: Holding = {
      ...payload,
      id: payload.id ?? crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    }

    if (existingIndex >= 0) {
      holdings.value.splice(existingIndex, 1, next)
    } else {
      holdings.value.unshift(next)
    }
    touch()
  }

  function recordOperation(payload: Omit<HoldingOperation, 'id' | 'date' | 'source' | 'status'>) {
    recordOperations([payload])
  }

  function recordOperations(payloads: Array<Omit<HoldingOperation, 'id' | 'date' | 'source' | 'status'>>) {
    const now = new Date().toISOString()
    const nextOperations: HoldingOperation[] = payloads.map((payload) => ({
      ...payload,
      id: crypto.randomUUID(),
      date: now,
      source: 'manual',
      status: 'pending',
    }))
    operations.value = [...operations.value, ...nextOperations].slice(-500)
    touch()
  }

  function removeHolding(id: string) {
    holdings.value = holdings.value.filter((item) => item.id !== id)
    touch()
  }

  function removeOperations(ids: string[]) {
    const idSet = new Set(ids)
    operations.value = operations.value.filter((item) => !idSet.has(item.id))
    touch()
  }

  function buildRecognizedHolding(side: InvestorSide, data: RecognizedHoldingInput): Holding {
    const existing = holdings.value.find((item) => item.fundCode === data.fundCode)
    const base = existing ?? {
      id: crypto.randomUUID(),
      fundName: data.fundName,
      fundCode: data.fundCode,
      myAmount: 0,
      myProfit: 0,
      myYesterdayProfit: 0,
      bloggerAmount: 0,
      bloggerProfit: 0,
      bloggerYesterdayProfit: 0,
      updatedAt: new Date().toISOString(),
    }

    return side === 'mine'
      ? {
          ...base,
          fundName: data.fundName,
          myAmount: data.amount,
          myProfit: data.profit,
        }
      : {
          ...base,
          fundName: data.fundName,
          bloggerAmount: data.amount,
          bloggerProfit: data.profit,
        }
  }

  function applyRecognizedHolding(side: InvestorSide, data: RecognizedHoldingInput) {
    upsertHolding(buildRecognizedHolding(side, data))
  }

  function applyRecognizedHoldings(side: InvestorSide, rows: RecognizedHoldingInput[]) {
    rows.forEach((row) => {
      const next = {
        ...buildRecognizedHolding(side, row),
        updatedAt: new Date().toISOString(),
      }
      const existingIndex = holdings.value.findIndex((item) => item.id === next.id)

      if (existingIndex >= 0) {
        holdings.value.splice(existingIndex, 1, next)
      } else {
        holdings.value.unshift(next)
      }
    })
    touch()
  }

  function exportJson(): string {
    return JSON.stringify(
      { budget: budget.value, holdings: holdings.value, operations: operations.value, history: history.value },
      null,
      2,
    )
  }

  watch(
    [budget, aiConfig, holdings, operations, history, updatedAt],
    () => {
      savePortfolio({
        budget: budget.value,
        aiConfig: aiConfig.value,
        holdings: holdings.value,
        operations: operations.value,
        history: history.value,
        updatedAt: updatedAt.value,
      })
    },
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
    upsertHolding,
    removeHolding,
    removeOperations,
    recordOperation,
    recordOperations,
    applyRecognizedHolding,
    applyRecognizedHoldings,
    exportJson,
  }
})
