import type { Settings } from '@/types/portfolio'

export const PORTFOLIO_SCHEMA_VERSION = 1
export const STORAGE_KEY = 'yjgt-new:portfolio'
export const FUND_CODE_PATTERN = /^\d{6}$/

export const INVESTOR_SIDES = ['mine', 'blogger'] as const

export const DEFAULT_SETTINGS: Settings = {
  myBudget: 0,
  bloggerBudget: 0,
  aiBaseURL: '',
  aiApiKey: '',
  aiModel: '',
}
