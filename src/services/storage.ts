import { STORAGE_KEY } from '@/constants/portfolio'
import { createEmptyPortfolioState, normalizePortfolioState } from '@/domain/portfolio'
import type { AiChatMessage, PortfolioState } from '@/types/portfolio'

const AI_CHAT_STORAGE_KEY = 'yjgt-new:ai-chat'

export function loadPortfolio(): PortfolioState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return createEmptyPortfolioState()

  try {
    return normalizePortfolioState(JSON.parse(raw) as PortfolioState)
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return createEmptyPortfolioState()
  }
}

export function savePortfolio(state: PortfolioState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function clearPortfolio(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function loadAiChatMessages(): AiChatMessage[] {
  const raw = localStorage.getItem(AI_CHAT_STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as AiChatMessage[]
  } catch {
    localStorage.removeItem(AI_CHAT_STORAGE_KEY)
    return []
  }
}

export function saveAiChatMessages(messages: AiChatMessage[]): void {
  localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-50)))
}
