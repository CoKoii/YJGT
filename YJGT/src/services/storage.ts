import type { AiChatMessage, AiConfig, BudgetConfig, Holding, HoldingOperation, ProfitSnapshot } from '@/types'

const CONFIG_STORAGE_KEY = 'fund-follow-config'
const FUND_DATA_STORAGE_KEY = 'fund-follow-fund-data'
const AI_CHAT_STORAGE_KEY = 'fund-follow-ai-chat'

export interface PersistedAppConfig {
  budget: BudgetConfig
  aiConfig: AiConfig
}

export interface PersistedFundData {
  holdings: Holding[]
  operations: HoldingOperation[]
  history: ProfitSnapshot[]
  updatedAt: string
}

export interface PersistedPortfolio {
  budget: BudgetConfig
  aiConfig: AiConfig
  holdings: Holding[]
  operations: HoldingOperation[]
  history: ProfitSnapshot[]
  updatedAt: string
}

function parseStorageItem<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

export function loadPortfolio(): PersistedPortfolio | null {
  const appConfig = parseStorageItem<PersistedAppConfig>(CONFIG_STORAGE_KEY)
  const fundData = parseStorageItem<PersistedFundData>(FUND_DATA_STORAGE_KEY)
  if (!appConfig && !fundData) return null

  return {
    budget: appConfig?.budget ?? { myBudget: 0, bloggerBudget: 0 },
    aiConfig: appConfig?.aiConfig ?? { baseURL: '', apiKey: '', model: '' },
    holdings: fundData?.holdings ?? [],
    operations: fundData?.operations ?? [],
    history: fundData?.history ?? [],
    updatedAt: fundData?.updatedAt ?? '',
  }
}

export function savePortfolio(data: PersistedPortfolio): void {
  const appConfig: PersistedAppConfig = { budget: data.budget, aiConfig: data.aiConfig }
  const fundData: PersistedFundData = {
    holdings: data.holdings,
    operations: data.operations,
    history: data.history,
    updatedAt: data.updatedAt,
  }

  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(appConfig))
  localStorage.setItem(FUND_DATA_STORAGE_KEY, JSON.stringify(fundData))
}

export function loadAiChatMessages(): AiChatMessage[] {
  return parseStorageItem<AiChatMessage[]>(AI_CHAT_STORAGE_KEY) ?? []
}

export function saveAiChatMessages(messages: AiChatMessage[]): void {
  localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages))
}
