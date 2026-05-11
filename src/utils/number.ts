import type { Settings } from '@/types/portfolio'

export const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
})

export const numberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function roundMoney(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2))
}

export function roundShares(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(4))
}

export function safeNumber(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function profitRate(cost: number, profit: number): number {
  return cost > 0 ? (profit / cost) * 100 : 0
}

export function profitColorClass(value: number | null | undefined): 'red' | 'green' | '' {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return ''
  return value > 0 ? 'red' : 'green'
}

export function formatMoney(value: number): string {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe >= 0 ? '+' : ''}${safe.toFixed(2)}%`
}

export function formatPlainPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe.toFixed(2)}%`
}

export function followRatio(settings: Settings): { mine: number; blogger: number } {
  if (settings.myBudget <= 0 || settings.bloggerBudget <= 0) return { mine: 1, blogger: 0 }
  return {
    mine: 1,
    blogger: Math.round((settings.bloggerBudget / settings.myBudget) * 10) / 10,
  }
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
