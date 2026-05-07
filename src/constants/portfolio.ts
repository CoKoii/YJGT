import type {
  AiConfig,
  BudgetConfig,
  DetailChartMode,
  HoldingDraft,
  InvestorSide,
  SettingsSection,
  TrendRange,
} from '@/types'

export const FUND_CODE_PATTERN = /^\d{6}$/
export const STORAGE_KEY = 'yjgt:portfolio'
export const AI_CHAT_STORAGE_KEY = 'yjgt:ai-chat'
export const PORTFOLIO_SCHEMA_VERSION = 4
export const HISTORY_LIMIT = 90
export const HOLDING_HISTORY_LIMIT = 3650
export const OPERATION_LIMIT = 500

export const DEFAULT_BUDGET: BudgetConfig = {
  myBudget: 0,
  bloggerBudget: 0,
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseURL: '',
  apiKey: '',
  model: '',
}

export const EMPTY_HOLDING_DRAFT: HoldingDraft = {
  id: '',
  fundName: '',
  fundCode: '',
  myCost: 0,
  myShares: 0,
  myNav: 0,
  myNavDate: '',
  myAmount: 0,
  myProfit: 0,
  myYesterdayProfit: 0,
  bloggerCost: 0,
  bloggerShares: 0,
  bloggerNav: 0,
  bloggerNavDate: '',
  bloggerAmount: 0,
  bloggerProfit: 0,
  bloggerYesterdayProfit: 0,
}

export const DEFAULT_AI_SIDE: InvestorSide = 'mine'
export const DEFAULT_TREND_RANGE: TrendRange = 'month'
export const DEFAULT_DETAIL_CHART_MODE: DetailChartMode = 'performance'
export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'budget'

export const DETAIL_TREND_OPTIONS: Array<{ label: string; value: TrendRange }> = [
  { label: '近1月', value: 'month' },
  { label: '近3月', value: 'quarter' },
  { label: '近6月', value: 'half' },
  { label: '近1年', value: 'year' },
  { label: '今年来', value: 'ytd' },
  { label: '成立以来', value: 'all' },
]
