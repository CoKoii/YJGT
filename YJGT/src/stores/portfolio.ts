import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { AiConfig, BudgetConfig, Holding, InvestorSide, ProfitSnapshot } from '@/types'
import { actualInvested, holdingSnapshot, profitRate } from '@/utils/calculations'
import { loadPortfolio, savePortfolio } from '@/services/storage'

export const usePortfolioStore = defineStore('portfolio', () => {
  const persisted = loadPortfolio()
  const budget = ref<BudgetConfig>(persisted?.budget ?? { myBudget: 100000, bloggerBudget: 1000000 })
  const aiConfig = ref<AiConfig>(
    persisted?.aiConfig ?? {
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4.1-mini',
    },
  )
  const holdings = ref<Holding[]>(persisted?.holdings ?? [])
  const history = ref<ProfitSnapshot[]>(persisted?.history ?? [])
  const updatedAt = ref(persisted?.updatedAt ?? '')

  const totals = computed(() => {
    const myAmount = holdings.value.reduce((sum, item) => sum + item.myAmount, 0)
    const bloggerAmount = holdings.value.reduce((sum, item) => sum + item.bloggerAmount, 0)
    const myProfit = holdings.value.reduce((sum, item) => sum + item.myProfit, 0)
    const bloggerProfit = holdings.value.reduce((sum, item) => sum + item.bloggerProfit, 0)
    const myInvested = holdings.value.reduce(
      (sum, item) => sum + actualInvested(item.myAmount, item.myProfit),
      0,
    )
    const bloggerInvested = holdings.value.reduce(
      (sum, item) => sum + actualInvested(item.bloggerAmount, item.bloggerProfit),
      0,
    )

    return {
      myAmount,
      bloggerAmount,
      myProfit,
      bloggerProfit,
      myInvested,
      bloggerInvested,
      myProfitRate: profitRate(myAmount, myProfit),
      bloggerProfitRate: profitRate(bloggerAmount, bloggerProfit),
      myYesterdayProfit: holdings.value.reduce((sum, item) => sum + item.myYesterdayProfit, 0),
      bloggerYesterdayProfit: holdings.value.reduce(
        (sum, item) => sum + item.bloggerYesterdayProfit,
        0,
      ),
    }
  })

  function touch() {
    updatedAt.value = new Date().toLocaleString('zh-CN', { hour12: false })
    history.value = [...history.value.slice(-29), aggregateSnapshot()]
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

  function removeHolding(id: string) {
    holdings.value = holdings.value.filter((item) => item.id !== id)
    touch()
  }

  function applyRecognizedHolding(
    side: InvestorSide,
    data: { fundName: string; fundCode: string; amount: number; profit: number },
  ) {
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

    const next: Holding =
      side === 'mine'
        ? { ...base, fundName: data.fundName, myAmount: data.amount, myProfit: data.profit }
        : {
            ...base,
            fundName: data.fundName,
            bloggerAmount: data.amount,
            bloggerProfit: data.profit,
          }

    upsertHolding(next)
  }

  function exportJson(): string {
    return JSON.stringify({ budget: budget.value, holdings: holdings.value, history: history.value }, null, 2)
  }

  function resetPortfolio() {
    holdings.value = []
    history.value = []
    touch()
  }

  watch(
    [budget, aiConfig, holdings, history, updatedAt],
    () => {
      savePortfolio({
        budget: budget.value,
        aiConfig: aiConfig.value,
        holdings: holdings.value,
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
    history,
    updatedAt,
    totals,
    holdingSnapshot,
    upsertHolding,
    removeHolding,
    applyRecognizedHolding,
    exportJson,
    resetPortfolio,
  }
})
