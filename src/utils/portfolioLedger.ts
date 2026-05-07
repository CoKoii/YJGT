import type {
  FundTrendPoint,
  Holding,
  HoldingOperation,
  InvestorSide,
  OperationSideValues,
} from '@/types'
import { formatDateKey } from '@/utils/date'
import { getOperationSideValue, getOperationTargetFund, profitRate } from './calculations'

type PositionKeys = {
  cost: 'myCost' | 'bloggerCost'
  shares: 'myShares' | 'bloggerShares'
  nav: 'myNav' | 'bloggerNav'
  navDate: 'myNavDate' | 'bloggerNavDate'
  amount: 'myAmount' | 'bloggerAmount'
  profit: 'myProfit' | 'bloggerProfit'
  yesterdayProfit: 'myYesterdayProfit' | 'bloggerYesterdayProfit'
}

type TrendMap = Map<string, FundTrendPoint[]>

function getPositionKeys(side: InvestorSide): PositionKeys {
  return side === 'mine'
    ? {
        cost: 'myCost',
        shares: 'myShares',
        nav: 'myNav',
        navDate: 'myNavDate',
        amount: 'myAmount',
        profit: 'myProfit',
        yesterdayProfit: 'myYesterdayProfit',
      }
    : {
        cost: 'bloggerCost',
        shares: 'bloggerShares',
        nav: 'bloggerNav',
        navDate: 'bloggerNavDate',
        amount: 'bloggerAmount',
        profit: 'bloggerProfit',
        yesterdayProfit: 'bloggerYesterdayProfit',
      }
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2))
}

function findTrendPoint(points: FundTrendPoint[], date: string): FundTrendPoint | undefined {
  return points.find((item) => item.date === date)
}

function listDatesAfter(
  points: FundTrendPoint[],
  currentDate: string,
  targetDate?: string,
): string[] {
  return points
    .map((item) => item.date)
    .filter((date) => date > currentDate && (!targetDate || date <= targetDate))
}

function latestTrendPoint(points: FundTrendPoint[]): FundTrendPoint | null {
  return points.at(-1) ?? null
}

function previousTrendPoint(points: FundTrendPoint[], date: string): FundTrendPoint | null {
  return [...points].reverse().find((item) => item.date < date) ?? null
}

type HoldingSideState = {
  shares: number
  cost: number
}

type HoldingPerformancePoint = {
  date: string
  rate: number | null
}

export function createTradeDate(now = new Date()): string {
  return formatDateKey(now)
}

export function ensureHoldingPositionFromSnapshot(
  holding: Holding,
  side: InvestorSide,
  trend: FundTrendPoint[],
): Holding {
  const keys = getPositionKeys(side)
  const shares = holding[keys.shares]
  const amount = holding[keys.amount]
  const profit = holding[keys.profit]
  if (shares > 0 || amount <= 0) return holding

  const latestPoint = latestTrendPoint(trend)
  if (!latestPoint || latestPoint.value <= 0) return holding

  const inferredShares = amount / latestPoint.value
  const inferredCost = amount - profit
  const previousPoint = previousTrendPoint(trend, latestPoint.date)
  const yesterdayProfit = previousPoint
    ? roundMoney(inferredShares * (latestPoint.value - previousPoint.value))
    : 0

  return {
    ...holding,
    [keys.shares]: inferredShares,
    [keys.cost]: roundMoney(inferredCost),
    [keys.nav]: latestPoint.value,
    [keys.navDate]: latestPoint.date,
    [keys.amount]: roundMoney(inferredShares * latestPoint.value),
    [keys.profit]: roundMoney(inferredShares * latestPoint.value - inferredCost),
    [keys.yesterdayProfit]: yesterdayProfit,
  }
}

export function advanceHoldingPosition(
  holding: Holding,
  side: InvestorSide,
  trend: FundTrendPoint[],
  targetDate?: string,
): Holding {
  const keys = getPositionKeys(side)
  const currentDate = holding[keys.navDate]
  if (!currentDate || trend.length === 0)
    return ensureHoldingPositionFromSnapshot(holding, side, trend)

  const nextDates = listDatesAfter(trend, currentDate, targetDate)
  if (nextDates.length === 0) return holding

  const nextHolding = { ...holding }

  nextDates.forEach((date) => {
    const point = findTrendPoint(trend, date)
    if (!point) return
    const previousNav = nextHolding[keys.nav]
    const startShares = nextHolding[keys.shares]
    nextHolding[keys.yesterdayProfit] = roundMoney(startShares * (point.value - previousNav))
    nextHolding[keys.nav] = point.value
    nextHolding[keys.navDate] = point.date
    nextHolding[keys.amount] = roundMoney(startShares * point.value)
    nextHolding[keys.profit] = roundMoney(nextHolding[keys.amount] - nextHolding[keys.cost])
  })

  return nextHolding
}

function applyBuy(holding: Holding, side: InvestorSide, amount: number, nav: number): Holding {
  const keys = getPositionKeys(side)
  const nextHolding = { ...holding }
  const sharesAdded = amount / nav
  nextHolding[keys.shares] += sharesAdded
  nextHolding[keys.cost] = roundMoney(nextHolding[keys.cost] + amount)
  nextHolding[keys.amount] = roundMoney(nextHolding[keys.shares] * nav)
  nextHolding[keys.profit] = roundMoney(nextHolding[keys.amount] - nextHolding[keys.cost])
  return nextHolding
}

function applyBuyValues(holding: Holding, amounts: OperationSideValues, nav: number) {
  let nextHolding = holding
  if (amounts.blogger > 0) {
    nextHolding = applyBuy(nextHolding, 'blogger', amounts.blogger, nav)
  }
  if (amounts.mine > 0) {
    nextHolding = applyBuy(nextHolding, 'mine', amounts.mine, nav)
  }
  return nextHolding
}

function applySellLike(
  holding: Holding,
  side: InvestorSide,
  sharesToReduce: number,
  nav: number,
): Holding {
  const keys = getPositionKeys(side)
  const nextHolding = { ...holding }
  const currentShares = nextHolding[keys.shares]
  if (currentShares <= 0 || nav <= 0) return nextHolding

  const reducedShares = Math.min(currentShares, sharesToReduce)
  const costToReduce =
    currentShares > 0 ? (nextHolding[keys.cost] * reducedShares) / currentShares : 0

  nextHolding[keys.shares] = Math.max(0, currentShares - reducedShares)
  nextHolding[keys.cost] = roundMoney(Math.max(0, nextHolding[keys.cost] - costToReduce))
  nextHolding[keys.amount] = roundMoney(nextHolding[keys.shares] * nav)
  nextHolding[keys.profit] = roundMoney(nextHolding[keys.amount] - nextHolding[keys.cost])

  if (nextHolding[keys.shares] === 0) {
    nextHolding[keys.yesterdayProfit] = 0
  }

  return nextHolding
}

function ensureTargetHolding(
  holdingsByFundCode: Map<string, Holding>,
  fundCode: string,
  fundName: string,
): Holding {
  const existing = holdingsByFundCode.get(fundCode)
  if (existing) return existing

  const emptyHolding: Holding = {
    id: crypto.randomUUID(),
    fundCode,
    fundName,
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

  holdingsByFundCode.set(fundCode, emptyHolding)
  return emptyHolding
}

function canSettleOperation(operation: HoldingOperation, trends: TrendMap): boolean {
  const sourceTrend = trends.get(operation.fundCode) ?? []
  if (!findTrendPoint(sourceTrend, operation.tradeDate)) return false
  if (operation.type !== 'convert') return true

  const targetTrend = trends.get(operation.targetFund.code) ?? []
  return Boolean(findTrendPoint(targetTrend, operation.tradeDate))
}

export function syncPortfolioLedger(
  holdings: Holding[],
  operations: HoldingOperation[],
  trends: TrendMap,
): { holdings: Holding[]; operations: HoldingOperation[] } {
  const holdingsByFundCode = new Map(holdings.map((item) => [item.fundCode, { ...item }]))

  holdingsByFundCode.forEach((holding, fundCode) => {
    const trend = trends.get(fundCode) ?? []
    let nextHolding = ensureHoldingPositionFromSnapshot(holding, 'mine', trend)
    nextHolding = ensureHoldingPositionFromSnapshot(nextHolding, 'blogger', trend)
    holdingsByFundCode.set(fundCode, nextHolding)
  })

  const sortedOperations = [...operations].sort((left, right) => {
    if (left.tradeDate === right.tradeDate) return left.submittedAt.localeCompare(right.submittedAt)
    return left.tradeDate.localeCompare(right.tradeDate)
  })

  const nextOperations = sortedOperations.map((operation) => {
    if (operation.status === 'settled' || !canSettleOperation(operation, trends)) return operation

    const sourceTrend = trends.get(operation.fundCode) ?? []
    const targetFund = getOperationTargetFund(operation)
    const targetTrend = targetFund ? (trends.get(targetFund.code) ?? []) : []
    const sourceNav = findTrendPoint(sourceTrend, operation.tradeDate)?.value ?? 0
    const targetNav = findTrendPoint(targetTrend, operation.tradeDate)?.value ?? 0
    let sourceHolding = holdingsByFundCode.get(operation.fundCode)
    if (!sourceHolding) return operation

    sourceHolding = advanceHoldingPosition(sourceHolding, 'mine', sourceTrend, operation.tradeDate)
    sourceHolding = advanceHoldingPosition(
      sourceHolding,
      'blogger',
      sourceTrend,
      operation.tradeDate,
    )

    if (operation.type === 'buy') {
      sourceHolding = applyBuyValues(sourceHolding, operation.amounts, sourceNav)
    } else {
      const convertedAmounts = {
        blogger: roundMoney(operation.shares.blogger * sourceNav),
        mine: roundMoney(operation.shares.mine * sourceNav),
      }

      if (operation.shares.blogger > 0) {
        sourceHolding = applySellLike(sourceHolding, 'blogger', operation.shares.blogger, sourceNav)
      }

      if (operation.shares.mine > 0) {
        sourceHolding = applySellLike(sourceHolding, 'mine', operation.shares.mine, sourceNav)
      }

      holdingsByFundCode.set(operation.fundCode, {
        ...sourceHolding,
        updatedAt: new Date().toISOString(),
      })

      if (operation.type === 'convert') {
        let targetHolding = ensureTargetHolding(
          holdingsByFundCode,
          operation.targetFund.code,
          operation.targetFund.name,
        )
        targetHolding = advanceHoldingPosition(
          targetHolding,
          'mine',
          targetTrend,
          operation.tradeDate,
        )
        targetHolding = advanceHoldingPosition(
          targetHolding,
          'blogger',
          targetTrend,
          operation.tradeDate,
        )
        targetHolding = applyBuyValues(targetHolding, convertedAmounts, targetNav)

        holdingsByFundCode.set(operation.targetFund.code, {
          ...targetHolding,
          updatedAt: new Date().toISOString(),
        })
      }

      return {
        ...operation,
        status: 'settled' as const,
        settledAt: new Date().toISOString(),
        settledFundNav: sourceNav,
        settledTargetNav: operation.type === 'convert' ? targetNav : undefined,
      }
    }

    holdingsByFundCode.set(operation.fundCode, {
      ...sourceHolding,
      updatedAt: new Date().toISOString(),
    })

    return {
      ...operation,
      status: 'settled' as const,
      settledAt: new Date().toISOString(),
      settledFundNav: sourceNav,
    }
  })

  holdingsByFundCode.forEach((holding, fundCode) => {
    const trend = trends.get(fundCode) ?? []
    let nextHolding = advanceHoldingPosition(holding, 'mine', trend)
    nextHolding = advanceHoldingPosition(nextHolding, 'blogger', trend)
    holdingsByFundCode.set(fundCode, nextHolding)
  })

  return {
    holdings: [...holdingsByFundCode.values()].filter(
      (item) =>
        item.myAmount > 0 || item.bloggerAmount > 0 || item.myShares > 0 || item.bloggerShares > 0,
    ),
    operations: nextOperations,
  }
}

function getHoldingSideState(holding: Holding, side: InvestorSide): HoldingSideState {
  const keys = getPositionKeys(side)
  return {
    shares: holding[keys.shares],
    cost: holding[keys.cost],
  }
}

function roundRate(value: number): number {
  return Number(value.toFixed(2))
}

function buildRateFromState(state: HoldingSideState, nav: number): number | null {
  if (state.shares <= 0 || state.cost <= 0 || nav <= 0) return null
  return roundRate(profitRate(state.shares * nav, state.shares * nav - state.cost))
}

function subtractBuyFromState(state: HoldingSideState, amount: number, nav: number): HoldingSideState {
  if (amount <= 0 || nav <= 0) return state

  const sharesToRemove = amount / nav
  return {
    shares: Math.max(0, state.shares - sharesToRemove),
    cost: roundMoney(Math.max(0, state.cost - amount)),
  }
}

function addSellBackToState(state: HoldingSideState, sharesToAdd: number): HoldingSideState | null {
  if (sharesToAdd <= 0) return state
  if (state.shares <= 0 || state.cost < 0) return null

  const averageCost = state.shares > 0 ? state.cost / state.shares : 0
  return {
    shares: state.shares + sharesToAdd,
    cost: roundMoney(state.cost + averageCost * sharesToAdd),
  }
}

function reverseOperationFromSource(
  state: HoldingSideState,
  operation: HoldingOperation,
  side: InvestorSide,
  sourceNav: number,
): HoldingSideState | null {
  if (operation.type === 'buy') {
    return subtractBuyFromState(state, getOperationSideValue(operation, side), sourceNav)
  }

  return addSellBackToState(state, getOperationSideValue(operation, side))
}

function reverseOperationFromTarget(
  state: HoldingSideState,
  operation: HoldingOperation,
  side: InvestorSide,
  sourceNav: number,
  targetNav: number,
): HoldingSideState | null {
  if (operation.type !== 'convert' || sourceNav <= 0 || targetNav <= 0) return state

  const convertedAmount = roundMoney(getOperationSideValue(operation, side) * sourceNav)
  return subtractBuyFromState(state, convertedAmount, targetNav)
}

export function buildHoldingPerformanceHistory(
  holding: Holding,
  operations: HoldingOperation[],
  trend: FundTrendPoint[],
  side: InvestorSide,
): HoldingPerformancePoint[] {
  if (trend.length === 0) return []

  const keys = getPositionKeys(side)
  const latestDate = holding[keys.navDate]
  if (!latestDate) {
    return trend.map((item) => ({ date: item.date, rate: null }))
  }

  const latestIndex = trend.findIndex((item) => item.date === latestDate)
  if (latestIndex < 0) {
    return trend.map((item) => ({ date: item.date, rate: null }))
  }

  const relevantOperations = operations
    .filter((operation) => {
      if (operation.status !== 'settled') return false
      if (operation.fundCode === holding.fundCode) return true
      return getOperationTargetFund(operation)?.code === holding.fundCode
    })
    .sort((left, right) => {
      if (left.tradeDate === right.tradeDate) {
        return right.submittedAt.localeCompare(left.submittedAt)
      }
      return right.tradeDate.localeCompare(left.tradeDate)
    })

  const operationsByDate = new Map<string, HoldingOperation[]>()
  relevantOperations.forEach((operation) => {
    const items = operationsByDate.get(operation.tradeDate) ?? []
    items.push(operation)
    operationsByDate.set(operation.tradeDate, items)
  })

  let state = getHoldingSideState(holding, side)
  let reconstructable = true
  const rateByDate = new Map<string, number | null>()

  for (let index = latestIndex; index >= 0; index -= 1) {
    const point = trend[index]
    if (!point) continue
    rateByDate.set(point.date, reconstructable ? buildRateFromState(state, point.value) : null)

    const operationsOnDate = operationsByDate.get(point.date) ?? []
    for (const operation of operationsOnDate) {
      const sourceNav = operation.settledFundNav ?? findTrendPoint(trend, operation.tradeDate)?.value ?? 0
      const targetNav =
        operation.type === 'convert'
          ? operation.settledTargetNav ?? findTrendPoint(trend, operation.tradeDate)?.value ?? 0
          : 0

      const nextState =
        operation.fundCode === holding.fundCode
          ? reverseOperationFromSource(state, operation, side, sourceNav)
          : reverseOperationFromTarget(state, operation, side, operation.settledFundNav ?? 0, targetNav)

      if (!nextState) {
        reconstructable = false
        break
      }

      state = nextState
    }
  }

  return trend.map((item, index) => ({
    date: item.date,
    rate: index > latestIndex ? null : (rateByDate.get(item.date) ?? null),
  }))
}
