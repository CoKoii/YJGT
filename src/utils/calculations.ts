import type {
  BudgetConfig,
  FundTrendPoint,
  Holding,
  HoldingOperation,
  InvestorSide,
  OperationType,
} from '@/types'
import { formatDateKey, normalizeDateKey, parseLocalDate } from '@/utils/date'

export const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
})

export const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(value: number): string {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatPercent(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${safeValue >= 0 ? '+' : ''}${safeValue.toFixed(2)}%`
}

export function formatPlainPercent(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${safeValue.toFixed(2)}%`
}

export function actualInvested(amount: number, profit: number): number {
  return Math.max(amount - profit, 0)
}

export function profitRate(amount: number, profit: number): number {
  const invested = actualInvested(amount, profit)
  return invested > 0 ? (profit / invested) * 100 : 0
}

export function followRatio(config: BudgetConfig): { blogger: number; mine: number } {
  if (config.myBudget <= 0 || config.bloggerBudget <= 0) {
    return { blogger: 0, mine: 0 }
  }

  return {
    blogger: Math.round((config.bloggerBudget / config.myBudget) * 10) / 10,
    mine: 1,
  }
}

export function holdingRatio(holding: Holding): { blogger: number; mine: number } {
  if (holding.myAmount <= 0 || holding.bloggerAmount <= 0) {
    return { blogger: 0, mine: 0 }
  }

  return {
    blogger: Math.round((holding.bloggerAmount / holding.myAmount) * 10) / 10,
    mine: 1,
  }
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0)
}

export function getOperationLabel(type: OperationType): string {
  if (type === 'sell') return '卖'
  if (type === 'convert') return '转'
  return '买'
}

export function getOperationActionText(type: OperationType): string {
  if (type === 'sell') return '卖出'
  if (type === 'convert') return '转换'
  return '买入'
}

export function getInvestorSideText(side: InvestorSide): string {
  return side === 'mine' ? '我的' : '博主'
}

export function getFollowTrendClass(current: number, target: number): string {
  if (current < target) return 'red'
  if (current > target) return 'green'
  return ''
}

export function getFollowTrendIcon(current: number, target: number): string {
  if (current < target) return '↑'
  if (current > target) return '↓'
  return ''
}

export function filterTrendByRange(points: FundTrendPoint[], range: string): FundTrendPoint[] {
  const latestPoint = points.at(-1)
  if (!latestPoint) return []
  if (range === 'all') return points

  const latest = parseLocalDate(latestPoint.date)
  const start = new Date(latest)

  if (range === 'month') start.setMonth(start.getMonth() - 1)
  else if (range === 'quarter') start.setMonth(start.getMonth() - 3)
  else if (range === 'half') start.setMonth(start.getMonth() - 6)
  else if (range === 'year') start.setFullYear(start.getFullYear() - 1)
  else start.setMonth(0, 1)

  return points.filter((item) => parseLocalDate(item.date) >= start)
}

export function findNearestTrendPoint(
  points: FundTrendPoint[],
  date: string,
): FundTrendPoint | null {
  if (points.length === 0) return null

  return (
    [...points].reverse().find((item) => item.date <= date) ??
    points.find((item) => item.date >= date) ??
    points.at(-1) ??
    null
  )
}

export function toPerformanceTrend(points: FundTrendPoint[]): FundTrendPoint[] {
  const baseValue = points.find((item) => item.value > 0)?.value
  if (!baseValue) return []

  return points.map((item) => ({
    date: item.date,
    value: ((item.value - baseValue) / baseValue) * 100,
  }))
}

export function buildRateSeriesData(
  points: FundTrendPoint[],
  startDate: string,
  rate: number,
): Array<string | null> {
  return points.map((item) => (item.date >= startDate ? rate.toFixed(2) : null))
}

export function parseHoldingUpdatedDate(value: string): string {
  return normalizeDateKey(value)
}

export function createHistoryDateKey() {
  return formatDateKey(new Date())
}

export function buildOperationFundCodes(operation: HoldingOperation): string[] {
  return [operation.fundCode, operation.fromFundCode, operation.toFundCode].filter(
    (fundCode): fundCode is string => Boolean(fundCode),
  )
}
