import { AI_CHAT_STORAGE_KEY, DEFAULT_AI_CONFIG, DEFAULT_BUDGET, PORTFOLIO_SCHEMA_VERSION, STORAGE_KEY } from '@/constants/portfolio'
import type { AiChatMessage, PortfolioState } from '@/types'

interface PersistedPortfolio {
  version: number
  payload: PortfolioState
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

export function createEmptyPortfolioState(): PortfolioState {
  return {
    budget: { ...DEFAULT_BUDGET },
    aiConfig: { ...DEFAULT_AI_CONFIG },
    holdings: [],
    operations: [],
    history: [],
    updatedAt: '',
  }
}

export function loadPortfolio(): PortfolioState {
  const persisted = parseStorageItem<PersistedPortfolio>(STORAGE_KEY)

  if (persisted?.version === PORTFOLIO_SCHEMA_VERSION) {
    return persisted.payload
  }

  return createEmptyPortfolioState()
}

export function savePortfolio(data: PortfolioState): void {
  const payload: PersistedPortfolio = {
    version: PORTFOLIO_SCHEMA_VERSION,
    payload: data,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function loadAiChatMessages(): AiChatMessage[] {
  return parseStorageItem<AiChatMessage[]>(AI_CHAT_STORAGE_KEY) ?? []
}

export function saveAiChatMessages(messages: AiChatMessage[]): void {
  localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages))
}
