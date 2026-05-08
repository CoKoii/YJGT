import { PORTFOLIO_SCHEMA_VERSION } from '@/constants/portfolio'
import type {
  BudgetConfig,
  FundNavHistory,
  FundNavPoint,
  FundRecord,
  Holding,
  HoldingOperation,
  HoldingProfitSnapshot,
  InvestorSide,
  PortfolioState,
  PortfolioTotals,
  PositionRecord,
  ProfitSnapshot,
} from '@/types'
import { actualInvested, profitRate } from '@/utils/calculations'
import { formatDateKey } from '@/utils/date'

type SideState = {
  shares: number
  cost: number
  startedAt: string
}

type LedgerFundState = {
  fund: FundRecord
  mine: SideState
  blogger: SideState
}

type LegacyPortfolioState = Omit<PortfolioState, 'funds' | 'positions' | 'navHistory'> & {
  funds?: FundRecord[]
  positions?: PositionRecord[]
  navHistory?: FundNavHistory[]
  snapshots?: ProfitSnapshot[]
  holdingSnapshots?: HoldingProfitSnapshot[]
  holdings?: Holding[]
  history?: ProfitSnapshot[]
  holdingHistory?: HoldingProfitSnapshot[]
}

export type PortfolioProjection = {
  holdings: Holding[]
  operations: HoldingOperation[]
  history: ProfitSnapshot[]
  holdingHistory: HoldingProfitSnapshot[]
  totals: PortfolioTotals
}

const SIDES: InvestorSide[] = ['mine', 'blogger']

function roundMoney(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2))
}

function roundShares(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(4))
}

function emptyTotals(): PortfolioTotals {
  return {
    myAmount: 0,
    bloggerAmount: 0,
    myProfit: 0,
    bloggerProfit: 0,
    myInvested: 0,
    bloggerInvested: 0,
    myYesterdayProfit: 0,
    bloggerYesterdayProfit: 0,
    myProfitRate: 0,
    bloggerProfitRate: 0,
  }
}

function uniqueByCode(funds: FundRecord[]): FundRecord[] {
  const byCode = new Map<string, FundRecord>()
  funds.forEach((fund) => {
    if (!fund.code) return
    byCode.set(fund.code, { code: fund.code, name: fund.name })
  })
  return [...byCode.values()]
}

function compactNavPoints(points: FundNavPoint[]): FundNavPoint[] {
  const byDate = new Map<string, FundNavPoint>()
  points
    .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0)
    .forEach((point) => byDate.set(point.date, { date: point.date, value: point.value }))
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

function latestPoint(points: FundNavPoint[]): FundNavPoint | null {
  return points.at(-1) ?? null
}

function previousPoint(points: FundNavPoint[], date: string): FundNavPoint | null {
  return [...points].reverse().find((point) => point.date < date) ?? null
}

function findPoint(points: FundNavPoint[], date: string): FundNavPoint | null {
  return points.find((point) => point.date === date) ?? null
}

function toDateKey(value: string | undefined): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : formatDateKey(date)
}

function stateFromRecordedPosition(
  seed: { amount: number; profit: number; nav?: number; navDate?: string; startedAt?: string },
  latestNav: number,
): SideState {
  const nav = seed.nav && seed.nav > 0 ? seed.nav : latestNav
  if (seed.amount <= 0 || nav <= 0) return { shares: 0, cost: 0, startedAt: '' }
  return {
    shares: seed.amount / nav,
    cost: Math.max(seed.amount - seed.profit, 0),
    startedAt: toDateKey(seed.startedAt) || toDateKey(seed.navDate),
  }
}

function applyBuy(state: SideState, amount: number, nav: number): SideState {
  if (amount <= 0 || nav <= 0) return state
  return {
    shares: state.shares + amount / nav,
    cost: state.cost + amount,
    startedAt: state.startedAt,
  }
}

function applySell(state: SideState, shares: number): SideState {
  if (shares <= 0 || state.shares <= 0) return state
  const reducedShares = Math.min(state.shares, shares)
  const costToReduce = (state.cost * reducedShares) / state.shares
  return {
    shares: Math.max(0, state.shares - reducedShares),
    cost: Math.max(0, state.cost - costToReduce),
    startedAt: state.startedAt,
  }
}

function ensureLedgerFund(states: Map<string, LedgerFundState>, code: string, name: string) {
  const existing = states.get(code)
  if (existing) {
    if (name && !existing.fund.name) existing.fund.name = name
    return existing
  }

  const state: LedgerFundState = {
    fund: { code, name },
    mine: { shares: 0, cost: 0, startedAt: '' },
    blogger: { shares: 0, cost: 0, startedAt: '' },
  }
  states.set(code, state)
  return state
}

function buildNavMap(navHistory: FundNavHistory[]): Map<string, FundNavPoint[]> {
  return new Map(navHistory.map((item) => [item.fundCode, compactNavPoints(item.points)]))
}

function compactSnapshots(items: ProfitSnapshot[]): ProfitSnapshot[] {
  const byDate = new Map<string, ProfitSnapshot>()
  items
    .filter((item) => toDateKey(item.date))
    .forEach((item) => byDate.set(item.date, { ...item, date: toDateKey(item.date) }))
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-365)
}

function compactHoldingSnapshots(items: HoldingProfitSnapshot[]): HoldingProfitSnapshot[] {
  const byFundDate = new Map<string, HoldingProfitSnapshot>()
  items
    .filter((item) => item.fundCode && toDateKey(item.date))
    .forEach((item) => {
      const date = toDateKey(item.date)
      byFundDate.set(`${item.fundCode}:${date}`, { ...item, date })
    })
  return [...byFundDate.values()].sort((left, right) => {
    if (left.date === right.date) return left.fundCode.localeCompare(right.fundCode)
    return left.date.localeCompare(right.date)
  })
}

function seedLedgerState(state: PortfolioState, navByFund: Map<string, FundNavPoint[]>) {
  const fundsByCode = new Map(state.funds.map((fund) => [fund.code, fund]))
  const ledger = new Map<string, LedgerFundState>()

  state.positions.forEach((position) => {
    const fund = fundsByCode.get(position.fundCode) ?? { code: position.fundCode, name: '' }
    const nav = latestPoint(navByFund.get(position.fundCode) ?? [])?.value ?? 0
    ledger.set(position.fundCode, {
      fund,
      mine: stateFromRecordedPosition(position.mine, nav),
      blogger: stateFromRecordedPosition(position.blogger, nav),
    })
  })

  state.funds.forEach((fund) => ensureLedgerFund(ledger, fund.code, fund.name))
  return ledger
}

function canSettle(operation: HoldingOperation, navByFund: Map<string, FundNavPoint[]>): boolean {
  if (!findPoint(navByFund.get(operation.fundCode) ?? [], operation.tradeDate)) return false
  if (operation.type !== 'convert') return true
  return Boolean(findPoint(navByFund.get(operation.targetFund.code) ?? [], operation.tradeDate))
}

function buildLedgerProjection(state: PortfolioState) {
  const navByFund = buildNavMap(state.navHistory)
  const ledger = seedLedgerState(state, navByFund)
  const sortedOperations = [...state.operations].sort((left, right) => {
    if (left.tradeDate === right.tradeDate) return left.submittedAt.localeCompare(right.submittedAt)
    return left.tradeDate.localeCompare(right.tradeDate)
  })

  const operations = sortedOperations.map((operation) => {
    if (operation.status === 'settled' || !canSettle(operation, navByFund)) return operation

    const sourceNav = findPoint(navByFund.get(operation.fundCode) ?? [], operation.tradeDate)?.value ?? 0
    const source = ensureLedgerFund(ledger, operation.fundCode, operation.fundName)

    if (operation.type === 'buy') {
      SIDES.forEach((side) => {
        const nextState = applyBuy(source[side], operation.amounts[side], sourceNav)
        source[side] = {
          ...nextState,
          startedAt: nextState.startedAt || operation.tradeDate,
        }
      })
      return {
        ...operation,
        status: 'settled' as const,
        settledAt: new Date().toISOString(),
        settledFundNav: sourceNav,
      }
    }

    SIDES.forEach((side) => {
      source[side] = applySell(source[side], operation.shares[side])
    })

    if (operation.type === 'convert') {
      const targetNav =
        findPoint(navByFund.get(operation.targetFund.code) ?? [], operation.tradeDate)?.value ?? 0
      const target = ensureLedgerFund(ledger, operation.targetFund.code, operation.targetFund.name)
      SIDES.forEach((side) => {
        const nextState = applyBuy(target[side], operation.shares[side] * sourceNav, targetNav)
        target[side] = {
          ...nextState,
          startedAt: nextState.startedAt || operation.tradeDate,
        }
      })
      return {
        ...operation,
        status: 'settled' as const,
        settledAt: new Date().toISOString(),
        settledFundNav: sourceNav,
        settledTargetNav: targetNav,
      }
    }

    return {
      ...operation,
      status: 'settled' as const,
      settledAt: new Date().toISOString(),
      settledFundNav: sourceNav,
    }
  })

  return { ledger, navByFund, operations }
}

function toHolding(state: LedgerFundState, navPoints: FundNavPoint[]): Holding {
  const latest = latestPoint(navPoints)
  const previous = latest ? previousPoint(navPoints, latest.date) : null
  const nav = latest?.value ?? 0
  const navDate = latest?.date ?? ''
  const myPreviousNav =
    previous && (!state.mine.startedAt || state.mine.startedAt <= previous.date) ? previous.value : nav
  const bloggerPreviousNav =
    previous && (!state.blogger.startedAt || state.blogger.startedAt <= previous.date)
      ? previous.value
      : nav
  const myAmount = roundMoney(state.mine.shares * nav)
  const bloggerAmount = roundMoney(state.blogger.shares * nav)

  return {
    id: state.fund.code,
    fundName: state.fund.name,
    fundCode: state.fund.code,
    myCost: roundMoney(state.mine.cost),
    myShares: roundShares(state.mine.shares),
    myNav: nav,
    myNavDate: navDate,
    myAmount,
    myProfit: roundMoney(myAmount - state.mine.cost),
    myYesterdayProfit: roundMoney(state.mine.shares * (nav - myPreviousNav)),
    bloggerCost: roundMoney(state.blogger.cost),
    bloggerShares: roundShares(state.blogger.shares),
    bloggerNav: nav,
    bloggerNavDate: navDate,
    bloggerAmount,
    bloggerProfit: roundMoney(bloggerAmount - state.blogger.cost),
    bloggerYesterdayProfit: roundMoney(state.blogger.shares * (nav - bloggerPreviousNav)),
    updatedAt: new Date().toISOString(),
  }
}

export function computeTotals(holdings: Holding[]): PortfolioTotals {
  const totals = emptyTotals()
  const latestMyDate = holdings.reduce((latest, item) => (item.myNavDate > latest ? item.myNavDate : latest), '')
  const latestBloggerDate = holdings.reduce(
    (latest, item) => (item.bloggerNavDate > latest ? item.bloggerNavDate : latest),
    '',
  )

  holdings.forEach((holding) => {
    totals.myAmount += holding.myAmount
    totals.bloggerAmount += holding.bloggerAmount
    totals.myProfit += holding.myProfit
    totals.bloggerProfit += holding.bloggerProfit
    totals.myInvested += actualInvested(holding.myAmount, holding.myProfit)
    totals.bloggerInvested += actualInvested(holding.bloggerAmount, holding.bloggerProfit)
    if (holding.myNavDate === latestMyDate) totals.myYesterdayProfit += holding.myYesterdayProfit
    if (holding.bloggerNavDate === latestBloggerDate) {
      totals.bloggerYesterdayProfit += holding.bloggerYesterdayProfit
    }
  })

  totals.myProfitRate = profitRate(totals.myAmount, totals.myProfit)
  totals.bloggerProfitRate = profitRate(totals.bloggerAmount, totals.bloggerProfit)
  return totals
}

export function projectPortfolio(state: PortfolioState): PortfolioProjection {
  const { ledger, navByFund, operations } = buildLedgerProjection(state)
  const holdings = [...ledger.values()]
    .map((item) => toHolding(item, navByFund.get(item.fund.code) ?? []))
    .filter(
      (item) =>
        item.myAmount > 0 || item.bloggerAmount > 0 || item.myShares > 0 || item.bloggerShares > 0,
    )
  const history = compactSnapshots(state.snapshots)
  const holdingHistory = compactHoldingSnapshots(state.holdingSnapshots)

  return {
    holdings,
    operations,
    history,
    holdingHistory,
    totals: computeTotals(holdings),
  }
}

export function normalizePortfolioState(input: LegacyPortfolioState | null | undefined): PortfolioState {
  const now = new Date().toISOString()
  const funds = uniqueByCode([
    ...(input?.funds ?? []),
    ...(input?.holdings ?? []).map((holding) => ({
      code: holding.fundCode,
      name: holding.fundName,
    })),
  ])
  const positionByFund = new Map<string, PositionRecord>()

  ;(input?.positions ?? []).forEach((position) => {
    positionByFund.set(position.fundCode, {
      fundCode: position.fundCode,
      mine: { ...position.mine },
      blogger: { ...position.blogger },
      updatedAt: position.updatedAt || now,
    })
  })
  ;(input?.holdings ?? []).forEach((holding) => {
    if (positionByFund.has(holding.fundCode)) return
    positionByFund.set(holding.fundCode, {
      fundCode: holding.fundCode,
      mine: {
        amount: holding.myAmount,
        profit: holding.myProfit,
        nav: holding.myNav,
        navDate: holding.myNavDate,
        startedAt: holding.myNavDate || toDateKey(holding.updatedAt),
      },
      blogger: {
        amount: holding.bloggerAmount,
        profit: holding.bloggerProfit,
        nav: holding.bloggerNav,
        navDate: holding.bloggerNavDate,
        startedAt: holding.bloggerNavDate || toDateKey(holding.updatedAt),
      },
      updatedAt: holding.updatedAt || now,
    })
  })

  const navHistory = (input?.navHistory ?? []).map((item) => ({
    fundCode: item.fundCode,
    points: compactNavPoints(item.points),
    updatedAt: item.updatedAt || now,
  }))

  ;(input?.holdings ?? []).forEach((holding) => {
    const points = compactNavPoints([
      ...(navHistory.find((item) => item.fundCode === holding.fundCode)?.points ?? []),
      ...(holding.myNavDate && holding.myNav > 0
        ? [{ date: holding.myNavDate, value: holding.myNav }]
        : []),
      ...(holding.bloggerNavDate && holding.bloggerNav > 0
        ? [{ date: holding.bloggerNavDate, value: holding.bloggerNav }]
        : []),
    ])
    if (points.length === 0) return
    const existing = navHistory.find((item) => item.fundCode === holding.fundCode)
    if (existing) existing.points = points
    else navHistory.push({ fundCode: holding.fundCode, points, updatedAt: now })
  })

  return {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    budget: input?.budget ?? { myBudget: 0, bloggerBudget: 0 },
    aiConfig: input?.aiConfig ?? { baseURL: '', apiKey: '', model: '' },
    funds,
    positions: [...positionByFund.values()],
    operations: input?.operations ?? [],
    navHistory,
    snapshots: compactSnapshots(input?.snapshots ?? input?.history ?? []),
    holdingSnapshots: compactHoldingSnapshots(input?.holdingSnapshots ?? input?.holdingHistory ?? []),
    updatedAt: input?.updatedAt ?? formatDateKey(new Date()),
  }
}

export function mergeNavHistory(
  current: FundNavHistory[],
  updates: Array<{ fundCode: string; points: FundNavPoint[] }>,
): FundNavHistory[] {
  const byFund = new Map(current.map((item) => [item.fundCode, { ...item, points: [...item.points] }]))
  const now = new Date().toISOString()

  updates.forEach((update) => {
    const existing = byFund.get(update.fundCode)
    byFund.set(update.fundCode, {
      fundCode: update.fundCode,
      points: compactNavPoints([...(existing?.points ?? []), ...update.points]),
      updatedAt: now,
    })
  })

  return [...byFund.values()]
}
