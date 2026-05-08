import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { OPERATION_LIMIT, PORTFOLIO_SCHEMA_VERSION } from '@/constants/portfolio'
import {
  mergeNavHistory,
  normalizePortfolioState,
  projectPortfolio,
} from '@/domain/portfolio'
import { createEmptyPortfolioState, loadPortfolio, savePortfolio } from '@/services/storage'
import type {
  AiConfig,
  BudgetConfig,
  FundNavPoint,
  FundRecord,
  HoldingDraft,
  HoldingOperation,
  HoldingOperationDraft,
  PortfolioState,
  PositionRecord,
  ProfitSnapshot,
  RecognizedHolding,
} from '@/types'
import { createHistoryDateKey, profitRate } from '@/utils/calculations'

function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function nowIso() {
  return new Date().toISOString()
}

function toPersistedState(state: PortfolioState): PortfolioState {
  return JSON.parse(JSON.stringify(state)) as PortfolioState
}

function upsertByCode<T extends { code: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((entry) => entry.code === item.code)
  if (index < 0) return [item, ...items]
  const next = [...items]
  next.splice(index, 1, item)
  return next
}

function createPosition(fundCode: string): PositionRecord {
  return {
    fundCode,
    mine: { amount: 0, profit: 0 },
    blogger: { amount: 0, profit: 0 },
    updatedAt: nowIso(),
  }
}

function latestNavForFund(navHistory: PortfolioState['navHistory'], fundCode: string) {
  return navHistory.find((item) => item.fundCode === fundCode)?.points.at(-1) ?? null
}

function positionsFromProjection(
  holdings: ReturnType<typeof projectPortfolio>['holdings'],
  currentPositions: PositionRecord[],
) {
  const currentByFund = new Map(currentPositions.map((position) => [position.fundCode, position]))
  return holdings.map((holding) => ({
    fundCode: holding.fundCode,
    mine: {
      amount: holding.myAmount,
      profit: holding.myProfit,
      nav: holding.myNav,
      navDate: holding.myNavDate,
      startedAt: currentByFund.get(holding.fundCode)?.mine.startedAt ?? holding.myNavDate,
    },
    blogger: {
      amount: holding.bloggerAmount,
      profit: holding.bloggerProfit,
      nav: holding.bloggerNav,
      navDate: holding.bloggerNavDate,
      startedAt: currentByFund.get(holding.fundCode)?.blogger.startedAt ?? holding.bloggerNavDate,
    },
    updatedAt: nowIso(),
  }))
}

function compactSnapshots(items: ProfitSnapshot[]): ProfitSnapshot[] {
  const byDate = new Map<string, ProfitSnapshot>()
  items.forEach((item) => byDate.set(item.date, item))
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-365)
}

export const usePortfolioStore = defineStore('portfolio', () => {
  const empty = createEmptyPortfolioState()
  const budget = ref<BudgetConfig>(empty.budget)
  const aiConfig = ref<AiConfig>(empty.aiConfig)
  const funds = ref<FundRecord[]>(empty.funds)
  const positions = ref<PositionRecord[]>(empty.positions)
  const operations = ref<HoldingOperation[]>(empty.operations)
  const navHistory = ref(empty.navHistory)
  const snapshots = ref(empty.snapshots)
  const holdingSnapshots = ref(empty.holdingSnapshots)
  const updatedAt = ref(empty.updatedAt)
  const isHydrated = ref(false)

  const sourceState = computed<PortfolioState>(() => ({
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    budget: budget.value,
    aiConfig: aiConfig.value,
    funds: funds.value,
    positions: positions.value,
    operations: operations.value,
    navHistory: navHistory.value,
    snapshots: snapshots.value,
    holdingSnapshots: holdingSnapshots.value,
    updatedAt: updatedAt.value,
  }))
  const projection = computed(() => projectPortfolio(sourceState.value))
  const holdings = computed(() => projection.value.holdings)
  const projectedOperations = computed(() => projection.value.operations)
  const history = computed(() => projection.value.history)
  const holdingHistory = computed(() => projection.value.holdingHistory)
  const totals = computed(() => projection.value.totals)

  function serialize(): PortfolioState {
    return toPersistedState({
      ...sourceState.value,
      operations: projectedOperations.value,
    })
  }

  function touch() {
    updatedAt.value = nowText()
  }

  function recordCurrentSnapshot() {
    const nextProjection = projectPortfolio(sourceState.value)
    const snapshotDate =
      nextProjection.holdings
        .map((holding) => holding.myNavDate || holding.bloggerNavDate)
        .filter(Boolean)
        .sort()
        .at(-1) ?? createHistoryDateKey()

    snapshots.value = compactSnapshots([
      ...snapshots.value.filter((item) => item.date !== snapshotDate),
      {
        date: snapshotDate,
        myProfit: nextProjection.totals.myProfit,
        bloggerProfit: nextProjection.totals.bloggerProfit,
        myProfitRate: nextProjection.totals.myProfitRate,
        bloggerProfitRate: nextProjection.totals.bloggerProfitRate,
      },
    ])

    const nextHoldingSnapshots = nextProjection.holdings.map((holding) => ({
      date: snapshotDate,
      fundCode: holding.fundCode,
      myAmount: holding.myAmount,
      myProfit: holding.myProfit,
      myProfitRate: profitRate(holding.myAmount, holding.myProfit),
      bloggerAmount: holding.bloggerAmount,
      bloggerProfit: holding.bloggerProfit,
      bloggerProfitRate: profitRate(holding.bloggerAmount, holding.bloggerProfit),
    }))
    holdingSnapshots.value = [
      ...holdingSnapshots.value.filter((item) => item.date !== snapshotDate),
      ...nextHoldingSnapshots,
    ]
  }

  function setBudget(nextBudget: BudgetConfig) {
    budget.value = { ...nextBudget }
    touch()
  }

  function setAiConfig(nextAiConfig: AiConfig) {
    aiConfig.value = { ...nextAiConfig }
    touch()
  }

  function upsertFund(fund: FundRecord) {
    funds.value = upsertByCode(funds.value, fund)
  }

  function upsertPosition(position: PositionRecord) {
    const index = positions.value.findIndex((item) => item.fundCode === position.fundCode)
    if (index >= 0) positions.value.splice(index, 1, position)
    else positions.value.unshift(position)
  }

  function upsertHolding(payload: HoldingDraft) {
    const fundCode = payload.fundCode.trim()
    const latestNav = latestNavForFund(navHistory.value, fundCode)
    const startedAt = createHistoryDateKey()
    upsertFund({ code: fundCode, name: payload.fundName.trim() })
    upsertPosition({
      fundCode,
      mine: {
        amount: payload.myAmount,
        profit: payload.myProfit,
        nav: payload.myNav || latestNav?.value,
        navDate: payload.myNavDate || latestNav?.date,
        startedAt: payload.myNavDate || startedAt,
      },
      blogger: {
        amount: payload.bloggerAmount,
        profit: payload.bloggerProfit,
        nav: payload.bloggerNav || latestNav?.value,
        navDate: payload.bloggerNavDate || latestNav?.date,
        startedAt: payload.bloggerNavDate || startedAt,
      },
      updatedAt: nowIso(),
    })
    recordCurrentSnapshot()
    touch()
  }

  function removeHolding(id: string) {
    const holding = holdings.value.find((item) => item.id === id || item.fundCode === id)
    const fundCode = holding?.fundCode ?? id
    funds.value = funds.value.filter((item) => item.code !== fundCode)
    positions.value = positions.value.filter((item) => item.fundCode !== fundCode)
    navHistory.value = navHistory.value.filter((item) => item.fundCode !== fundCode)
    holdingSnapshots.value = holdingSnapshots.value.filter((item) => item.fundCode !== fundCode)
    recordCurrentSnapshot()
    touch()
  }

  function recordOperation(
    payload: HoldingOperationDraft,
    source: HoldingOperation['source'] = 'manual',
  ) {
    const timestamp = nowIso()
    upsertFund({ code: payload.fundCode, name: payload.fundName })
    if (payload.type === 'convert') {
      upsertFund({ code: payload.targetFund.code, name: payload.targetFund.name })
    }
    const nextOperation: HoldingOperation = {
      ...payload,
      id: crypto.randomUUID(),
      submittedAt: timestamp,
      tradeDate: createHistoryDateKey(),
      source,
      status: 'pending',
    } as HoldingOperation

    operations.value = [
      ...projectedOperations.value,
      nextOperation,
    ].slice(-OPERATION_LIMIT)
    commitProjection()
    recordCurrentSnapshot()
    touch()
  }

  function removeOperation(id: string) {
    operations.value = projectedOperations.value.filter((item) => item.id !== id)
    commitProjection()
    recordCurrentSnapshot()
    touch()
  }

  function applyRecognizedHoldings(side: 'mine' | 'blogger', rows: RecognizedHolding[]) {
    rows.forEach((row) => {
      const fundCode = row.fundCode.trim()
      const latestNav = latestNavForFund(navHistory.value, fundCode)
      upsertFund({ code: fundCode, name: row.fundName.trim() })
      const existing = positions.value.find((item) => item.fundCode === fundCode) ?? createPosition(fundCode)
      upsertPosition({
        ...existing,
        [side]: {
          amount: row.amount,
          profit: row.profit,
          nav: latestNav?.value,
          navDate: latestNav?.date,
          startedAt: latestNav?.date || createHistoryDateKey(),
        },
        updatedAt: nowIso(),
      })
    })
    recordCurrentSnapshot()
    touch()
  }

  function commitProjection() {
    const nextProjection = projectPortfolio(sourceState.value)
    operations.value = nextProjection.operations
    positions.value = positionsFromProjection(nextProjection.holdings, positions.value)
  }

  function setFundNavHistory(updates: Array<{ fundCode: string; points: FundNavPoint[] }>) {
    navHistory.value = mergeNavHistory(navHistory.value, updates)
    commitProjection()
    recordCurrentSnapshot()
    touch()
  }

  function resetPortfolio() {
    const nextState = createEmptyPortfolioState()
    budget.value = nextState.budget
    aiConfig.value = nextState.aiConfig
    funds.value = nextState.funds
    positions.value = nextState.positions
    operations.value = nextState.operations
    navHistory.value = nextState.navHistory
    snapshots.value = nextState.snapshots
    holdingSnapshots.value = nextState.holdingSnapshots
    updatedAt.value = nextState.updatedAt
  }

  function exportJson(): string {
    return JSON.stringify(serialize(), null, 2)
  }

  async function hydrate() {
    const persisted = normalizePortfolioState(await loadPortfolio())
    budget.value = persisted.budget
    aiConfig.value = persisted.aiConfig
    funds.value = persisted.funds
    positions.value = persisted.positions
    operations.value = persisted.operations
    navHistory.value = persisted.navHistory
    snapshots.value = persisted.snapshots
    holdingSnapshots.value = persisted.holdingSnapshots
    updatedAt.value = persisted.updatedAt
    isHydrated.value = true
  }

  watch(
    [budget, aiConfig, funds, positions, operations, navHistory, snapshots, holdingSnapshots, updatedAt],
    () => {
      if (!isHydrated.value) return
      void savePortfolio(serialize()).catch((error) => {
        console.error('保存组合数据失败:', error)
      })
    },
    { deep: true },
  )

  return {
    budget,
    aiConfig,
    funds,
    positions,
    operations: projectedOperations,
    navHistory,
    snapshots,
    holdingSnapshots,
    holdings,
    history,
    holdingHistory,
    updatedAt,
    isHydrated,
    totals,
    hydrate,
    setBudget,
    setAiConfig,
    upsertHolding,
    removeHolding,
    recordOperation,
    removeOperation,
    applyRecognizedHoldings,
    setFundNavHistory,
    exportJson,
    resetPortfolio,
  }
})
