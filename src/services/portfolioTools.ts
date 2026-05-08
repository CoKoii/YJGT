import type {
  Holding,
  HoldingOperation,
  HoldingProfitSnapshot,
  PortfolioState,
  ProfitSnapshot,
} from '@/types'
import { projectPortfolio } from '@/domain/portfolio'
import { loadPortfolio } from '@/services/storage'
import {
  actualInvested,
  buildOperationFundCodes,
  followRatio,
  getOperationSideValue,
  getOperationTargetFund,
  getOperationValueLabel,
  profitRate,
} from '@/utils/calculations'

type PortfolioHoldingView = {
  fundName: string
  fundCode: string
  navDate: string
  targetInvested: number
  pendingOperations: number
  raw: Holding
  derived: {
    myInvested: number
    bloggerInvested: number
    myRate: number
    bloggerRate: number
    myPositionRate: number
    bloggerPositionRate: number
  }
}

type PortfolioQuerySnapshot = {
  budget: PortfolioState['budget']
  totals: ReturnType<typeof projectPortfolio>['totals']
  latestNavDates: {
    mine: string
    blogger: string
  }
  followRatio: {
    blogger: number
    mine: number
  }
  holdings: PortfolioHoldingView[]
  operations: HoldingOperation[]
  history: ProfitSnapshot[]
  holdingHistory: HoldingProfitSnapshot[]
}

function findLatestNavDate(items: Holding[], field: 'myNavDate' | 'bloggerNavDate'): string {
  return items.reduce((latest, item) => {
    const date = item[field]
    if (!date) return latest
    return date > latest ? date : latest
  }, '')
}

function buildPendingOperationsByFundCode(operations: HoldingOperation[]) {
  const operationsByFundCode = new Map<string, HoldingOperation[]>()

  operations
    .filter((operation) => operation.status === 'pending')
    .forEach((operation) => {
      buildOperationFundCodes(operation).forEach((fundCode) => {
        const list = operationsByFundCode.get(fundCode) ?? []
        list.push(operation)
        operationsByFundCode.set(fundCode, list)
      })
    })

  return operationsByFundCode
}

function buildHoldingsView(
  budget: PortfolioState['budget'],
  holdings: Holding[],
  operations: HoldingOperation[],
  totals: ReturnType<typeof projectPortfolio>['totals'],
): PortfolioHoldingView[] {
  const ratio = followRatio(budget)
  const pendingOperationsByFundCode = buildPendingOperationsByFundCode(operations)

  return holdings.map((holding) => {
    const myInvested = actualInvested(holding.myAmount, holding.myProfit)
    const bloggerInvested = actualInvested(holding.bloggerAmount, holding.bloggerProfit)
    const targetInvested = ratio.blogger > 0 ? bloggerInvested / ratio.blogger : 0

    return {
      fundName: holding.fundName,
      fundCode: holding.fundCode,
      navDate: holding.myNavDate || holding.bloggerNavDate,
      targetInvested,
      pendingOperations: pendingOperationsByFundCode.get(holding.fundCode)?.length ?? 0,
      raw: holding,
      derived: {
        myInvested,
        bloggerInvested,
        myRate: profitRate(holding.myAmount, holding.myProfit),
        bloggerRate: profitRate(holding.bloggerAmount, holding.bloggerProfit),
        myPositionRate: totals.myInvested > 0 ? (myInvested / totals.myInvested) * 100 : 0,
        bloggerPositionRate:
          totals.bloggerInvested > 0 ? (bloggerInvested / totals.bloggerInvested) * 100 : 0,
      },
    }
  })
}

function formatOperationForAi(operation: HoldingOperation) {
  const valueKind = operation.type === 'buy' ? 'amount' : 'shares'
  const valueLabel = getOperationValueLabel(operation.type)
  const valueUnit = operation.type === 'buy' ? 'CNY' : 'share'
  const targetFund = getOperationTargetFund(operation)
  const myValue = getOperationSideValue(operation, 'mine')
  const bloggerValue = getOperationSideValue(operation, 'blogger')

  return {
    id: operation.id,
    type: operation.type,
    status: operation.status,
    source: operation.source,
    fundCode: operation.fundCode,
    fundName: operation.fundName,
    targetFund,
    submittedAt: operation.submittedAt,
    tradeDate: operation.tradeDate,
    settledAt: operation.settledAt ?? null,
    settledFundNav: operation.settledFundNav ?? null,
    settledTargetNav: operation.settledTargetNav ?? null,
    valueKind,
    valueLabel,
    valueUnit,
    my: {
      value: myValue,
      [valueKind]: myValue,
    },
    blogger: {
      value: bloggerValue,
      [valueKind]: bloggerValue,
    },
  }
}

function normalizeLimit(value: unknown, fallback: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), max)
}

function getHoldingSortValue(holding: PortfolioHoldingView, sortBy: string) {
  switch (sortBy) {
    case 'bloggerAmount':
      return holding.raw.bloggerAmount
    case 'myProfit':
      return holding.raw.myProfit
    case 'bloggerProfit':
      return holding.raw.bloggerProfit
    case 'myRate':
      return holding.derived.myRate
    case 'bloggerRate':
      return holding.derived.bloggerRate
    case 'myAmount':
    default:
      return holding.raw.myAmount
  }
}

function pickHolding(snapshot: PortfolioQuerySnapshot, args: { fundCode?: unknown; fundName?: unknown }) {
  const fundCode = typeof args.fundCode === 'string' ? args.fundCode.trim() : ''
  const fundName = typeof args.fundName === 'string' ? args.fundName.trim() : ''

  if (fundCode) {
    return snapshot.holdings.find((item) => item.fundCode === fundCode) ?? null
  }

  if (fundName) {
    return (
      snapshot.holdings.find(
        (item) => item.fundName === fundName || item.fundName.includes(fundName),
      ) ?? null
    )
  }

  return null
}

async function loadPortfolioSnapshot(): Promise<PortfolioQuerySnapshot> {
  const state = await loadPortfolio()
  const projection = projectPortfolio(state)
  const totals = projection.totals
  const holdings = projection.holdings
  const operations = projection.operations
  const latestNavDates = {
    mine: findLatestNavDate(holdings, 'myNavDate'),
    blogger: findLatestNavDate(holdings, 'bloggerNavDate'),
  }

  return {
    budget: state.budget,
    totals,
    latestNavDates,
    followRatio: followRatio(state.budget),
    holdings: buildHoldingsView(state.budget, holdings, operations, totals),
    operations: operations.map((item) => ({ ...item })),
    history: projection.history,
    holdingHistory: projection.holdingHistory,
  }
}

export async function getPortfolioSummaryTool() {
  const snapshot = await loadPortfolioSnapshot()
  return {
    ok: true,
    tool: 'get_portfolio_summary',
    budget: snapshot.budget,
    totals: snapshot.totals,
    latestNavDates: snapshot.latestNavDates,
    latestDailyProfit: {
      mine: {
        amount:
          snapshot.holdings.some(
            (item) =>
              item.raw.myNavDate === snapshot.latestNavDates.mine &&
              item.raw.myYesterdayProfitAvailable,
          )
            ? snapshot.totals.myYesterdayProfit
            : null,
        navDate: snapshot.latestNavDates.mine || null,
      },
      blogger: {
        amount:
          snapshot.holdings.some(
            (item) =>
              item.raw.bloggerNavDate === snapshot.latestNavDates.blogger &&
              item.raw.bloggerYesterdayProfitAvailable,
          )
            ? snapshot.totals.bloggerYesterdayProfit
            : null,
        navDate: snapshot.latestNavDates.blogger || null,
      },
    },
    followRatio: snapshot.followRatio,
    holdingCount: snapshot.holdings.length,
    pendingOperationCount: snapshot.operations.filter((item) => item.status === 'pending').length,
    settledOperationCount: snapshot.operations.filter((item) => item.status === 'settled').length,
  }
}

export async function listPortfolioHoldingsTool(args: {
  sortBy?: unknown
  order?: unknown
  limit?: unknown
}) {
  const snapshot = await loadPortfolioSnapshot()
  const sortBy = typeof args.sortBy === 'string' ? args.sortBy : 'myAmount'
  const order = args.order === 'asc' ? 'asc' : 'desc'
  const limit = normalizeLimit(args.limit, snapshot.holdings.length || 20, 100)
  const sorted = [...snapshot.holdings].sort((left, right) => {
    const leftValue = getHoldingSortValue(left, sortBy)
    const rightValue = getHoldingSortValue(right, sortBy)
    return order === 'asc' ? leftValue - rightValue : rightValue - leftValue
  })

  return {
    ok: true,
    tool: 'list_portfolio_holdings',
    total: snapshot.holdings.length,
    returned: Math.min(limit, sorted.length),
    holdings: sorted.slice(0, limit).map((item) => ({
      fundName: item.fundName,
      fundCode: item.fundCode,
      navDate: item.navDate,
      pendingOperations: item.pendingOperations,
      targetInvested: item.targetInvested,
      my: {
        amount: item.raw.myAmount,
        profit: item.raw.myProfit,
        profitRate: item.derived.myRate,
        invested: item.derived.myInvested,
        positionRate: item.derived.myPositionRate,
        shares: item.raw.myShares,
        cost: item.raw.myCost,
        nav: item.raw.myNav,
        navDate: item.raw.myNavDate,
        yesterdayProfit: item.raw.myYesterdayProfit,
      },
      blogger: {
        amount: item.raw.bloggerAmount,
        profit: item.raw.bloggerProfit,
        profitRate: item.derived.bloggerRate,
        invested: item.derived.bloggerInvested,
        positionRate: item.derived.bloggerPositionRate,
        shares: item.raw.bloggerShares,
        cost: item.raw.bloggerCost,
        nav: item.raw.bloggerNav,
        navDate: item.raw.bloggerNavDate,
        yesterdayProfit: item.raw.bloggerYesterdayProfit,
      },
    })),
  }
}

export async function getHoldingDetailTool(args: { fundCode?: unknown; fundName?: unknown }) {
  const snapshot = await loadPortfolioSnapshot()
  const holding = pickHolding(snapshot, args)
  if (!holding) {
    return { ok: false, tool: 'get_holding_detail', error: '未找到对应持仓' }
  }

  const relatedOperations = snapshot.operations
    .filter(
      (item) =>
        item.fundCode === holding.fundCode || getOperationTargetFund(item)?.code === holding.fundCode,
    )
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))

  return {
    ok: true,
    tool: 'get_holding_detail',
    holding: {
      fundName: holding.fundName,
      fundCode: holding.fundCode,
      navDate: holding.navDate,
      targetInvested: holding.targetInvested,
      pendingOperations: holding.pendingOperations,
      my: {
        amount: holding.raw.myAmount,
        profit: holding.raw.myProfit,
        profitRate: holding.derived.myRate,
        invested: holding.derived.myInvested,
        positionRate: holding.derived.myPositionRate,
        shares: holding.raw.myShares,
        cost: holding.raw.myCost,
        nav: holding.raw.myNav,
        navDate: holding.raw.myNavDate,
        yesterdayProfit: holding.raw.myYesterdayProfit,
      },
      blogger: {
        amount: holding.raw.bloggerAmount,
        profit: holding.raw.bloggerProfit,
        profitRate: holding.derived.bloggerRate,
        invested: holding.derived.bloggerInvested,
        positionRate: holding.derived.bloggerPositionRate,
        shares: holding.raw.bloggerShares,
        cost: holding.raw.bloggerCost,
        nav: holding.raw.bloggerNav,
        navDate: holding.raw.bloggerNavDate,
        yesterdayProfit: holding.raw.bloggerYesterdayProfit,
      },
    },
    relatedOperations: relatedOperations.map(formatOperationForAi),
  }
}

export async function listPortfolioOperationsTool(args: {
  fundCode?: unknown
  status?: unknown
  type?: unknown
  limit?: unknown
}) {
  const snapshot = await loadPortfolioSnapshot()
  const fundCode = typeof args.fundCode === 'string' ? args.fundCode.trim() : ''
  const status = args.status === 'pending' || args.status === 'settled' ? args.status : ''
  const type = args.type === 'buy' || args.type === 'sell' || args.type === 'convert' ? args.type : ''
  const limit = normalizeLimit(args.limit, 50, 200)

  const operations = snapshot.operations
    .filter((item) =>
      fundCode ? item.fundCode === fundCode || getOperationTargetFund(item)?.code === fundCode : true,
    )
    .filter((item) => (status ? item.status === status : true))
    .filter((item) => (type ? item.type === type : true))
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))

  return {
    ok: true,
    tool: 'list_portfolio_operations',
    total: operations.length,
    returned: Math.min(limit, operations.length),
    operations: operations.slice(0, limit).map(formatOperationForAi),
  }
}
