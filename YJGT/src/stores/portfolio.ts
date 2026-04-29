import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { AiConfig, BudgetConfig, Holding, InvestorSide, ProfitSnapshot } from '@/types'
import { actualInvested, holdingSnapshot, profitRate } from '@/utils/calculations'
import { loadPortfolio, savePortfolio } from '@/services/storage'

const today = new Date('2024-05-13T12:00:00')

const demoHoldings: Holding[] = [
  ['易方达中小盘混合', '110011', 12000, 1234.56, 96.8, 120000, 12345.6, 968],
  ['中欧医疗健康混合A', '003095', 8500, -235.1, -38.6, 85000, -2351, -386],
  ['华夏沪深300ETF', '510330', 15000, 856.3, 112.4, 150000, 8563, 1124],
  ['景顺长城新能源产业', '011328', 9200, 432.2, 58.2, 92000, 4322, 582],
  ['广发科技先锋混合', '008903', 7500, -123.4, -21.3, 75000, -1234, -213],
  ['富国天惠成长混合A', '161005', 13000, 2345.6, 188.6, 130000, 23456, 1886],
  ['招商中证白酒指数', '161725', 6500, -210.3, -18.9, 65000, -2103, -189],
  ['南方消费活力混合', '202025', 3800, 98.6, 13.8, 98000, 986, 138],
  ['兴全合润混合(LOF)', '163406', 4700, 315.2, 25.4, 47000, 3152, 254],
  ['工银瑞信文体产业', '001714', 2600, -56.7, -7.2, 26000, -567, -72],
  ['汇添富价值精选混合', '519069', 1900, 45.3, 5.1, 19000, 453, 51],
  ['鹏华环保产业股票', '000409', 500, -12.2, -2.4, 5000, -122, -24],
].map(([fundName, fundCode, myAmount, myProfit, myYesterdayProfit, bloggerAmount, bloggerProfit, bloggerYesterdayProfit], index) => ({
  id: crypto.randomUUID(),
  fundName: String(fundName),
  fundCode: String(fundCode),
  myAmount: Number(myAmount),
  myProfit: Number(myProfit),
  myYesterdayProfit: Number(myYesterdayProfit),
  bloggerAmount: Number(bloggerAmount),
  bloggerProfit: Number(bloggerProfit),
  bloggerYesterdayProfit: Number(bloggerYesterdayProfit),
  updatedAt: new Date(today.getTime() - index * 3600_000).toISOString(),
}))

function buildDemoHistory(holdings: Holding[]): ProfitSnapshot[] {
  const myProfit = holdings.reduce((sum, item) => sum + item.myProfit, 0)
  const bloggerProfit = holdings.reduce((sum, item) => sum + item.bloggerProfit, 0)
  const myAmount = holdings.reduce((sum, item) => sum + item.myAmount, 0)
  const bloggerAmount = holdings.reduce((sum, item) => sum + item.bloggerAmount, 0)

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (29 - index))
    const wave = Math.sin(index / 2.4) * 0.26 + index / 36
    const myFactor = 0.48 + wave
    const bloggerFactor = 0.42 + wave * 0.92
    return {
      date: date.toISOString().slice(0, 10),
      myProfit: Math.round(myProfit * myFactor * 100) / 100,
      bloggerProfit: Math.round(bloggerProfit * bloggerFactor * 100) / 100,
      myProfitRate: profitRate(myAmount, myProfit * myFactor),
      bloggerProfitRate: profitRate(bloggerAmount, bloggerProfit * bloggerFactor),
    }
  })
}

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
  const holdings = ref<Holding[]>(persisted?.holdings ?? demoHoldings)
  const history = ref<ProfitSnapshot[]>(persisted?.history ?? buildDemoHistory(holdings.value))
  const updatedAt = ref(persisted?.updatedAt ?? '2024-05-13 15:30:00')

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

  function resetDemo() {
    holdings.value = demoHoldings
    history.value = buildDemoHistory(holdings.value)
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
    resetDemo,
  }
})
