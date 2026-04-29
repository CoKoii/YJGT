import type { AiConfig, BudgetConfig, Holding, ProfitSnapshot } from '@/types'

const STORAGE_KEY = 'yjgt:portfolio:v1'

export interface PersistedPortfolio {
  budget: BudgetConfig
  aiConfig: AiConfig
  holdings: Holding[]
  history: ProfitSnapshot[]
  updatedAt: string
}

export function loadPortfolio(): PersistedPortfolio | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as PersistedPortfolio
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function savePortfolio(data: PersistedPortfolio): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
