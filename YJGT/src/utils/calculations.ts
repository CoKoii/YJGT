import type { BudgetConfig, Holding, ProfitSnapshot } from '@/types'

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

export function actualInvested(amount: number, profit: number): number {
  return Math.max(amount - profit, 0)
}

export function profitRate(amount: number, profit: number): number {
  const invested = actualInvested(amount, profit)
  if (invested <= 0) return 0
  return (profit / invested) * 100
}

export function followRatio(config: BudgetConfig): { blogger: number; mine: number } {
  if (config.myBudget <= 0 || config.bloggerBudget <= 0) {
    return { blogger: 0, mine: 0 }
  }

  const ratio = config.bloggerBudget / config.myBudget
  return { blogger: Math.round(ratio * 10) / 10, mine: 1 }
}

export function holdingRatio(holding: Holding): { blogger: number; mine: number } {
  if (holding.myAmount <= 0 || holding.bloggerAmount <= 0) {
    return { blogger: 0, mine: 0 }
  }

  return { blogger: Math.round((holding.bloggerAmount / holding.myAmount) * 10) / 10, mine: 1 }
}

export function holdingSnapshot(holding: Holding): ProfitSnapshot {
  return {
    date: new Date().toISOString().slice(0, 10),
    myProfit: holding.myProfit,
    bloggerProfit: holding.bloggerProfit,
    myProfitRate: profitRate(holding.myAmount, holding.myProfit),
    bloggerProfitRate: profitRate(holding.bloggerAmount, holding.bloggerProfit),
  }
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}
