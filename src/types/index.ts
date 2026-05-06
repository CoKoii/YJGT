/* eslint-disable @typescript-eslint/no-explicit-any */
export type InvestorSide = 'mine' | 'blogger'
export type OperationType = 'buy' | 'sell' | 'convert'
export type OperationStatus = 'pending' | 'settled'
export type OperationSource = 'manual' | 'ai'
export type TrendRange = 'month' | 'quarter' | 'half' | 'year' | 'ytd' | 'all'
export type DetailChartMode = 'performance' | 'netWorth'
export type SettingsSection = 'budget' | 'ai'

export type BudgetConfig = {
  myBudget: number
  bloggerBudget: number
}

export type AiConfig = {
  baseURL: string
  apiKey: string
  model: string
}

export type Holding = {
  id: string
  fundName: string
  fundCode: string
  myCost: number
  myShares: number
  myNav: number
  myNavDate: string
  myAmount: number
  myProfit: number
  myYesterdayProfit: number
  bloggerCost: number
  bloggerShares: number
  bloggerNav: number
  bloggerNavDate: string
  bloggerAmount: number
  bloggerProfit: number
  bloggerYesterdayProfit: number
  updatedAt: string
}

export type HoldingDraft = Omit<Holding, 'updatedAt'>
export type HoldingFormModel = HoldingDraft

export type HoldingOperation = {
  id: string
  type: OperationType
  submittedAt: string
  tradeDate: string
  source: OperationSource
  status: OperationStatus
  fundCode: string
  fundName: string
  bloggerAmount: number
  myAmount: number
  toFundCode?: string
  toFundName?: string
  settledAt?: string
  settledFundNav?: number
  settledTargetNav?: number
}

export type HoldingOperationDraft = Omit<
  HoldingOperation,
  'id' | 'submittedAt' | 'tradeDate' | 'source' | 'status'
>

export type OperationFormModel = {
  type: OperationType
  bloggerAmount: number
  myAmount: number
  fundCode: string
  fundName: string
  toFundCode: string
  toFundName: string
}

export type ProfitSnapshot = {
  date: string
  myProfit: number
  bloggerProfit: number
  myProfitRate: number
  bloggerProfitRate: number
}

export type FundTrendPoint = {
  date: string
  value: number
}

export type FundInfo = {
  code: string
  name: string
}

export type RecognizedHolding = {
  fundName: string
  fundCode: string
  amount: number
  profit: number
}

export type AiChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type UploadedFileItem = {
  uid: string
  name: string
  originFileObj?: any
}

export type UploadedFileMeta = Pick<UploadedFileItem, 'uid' | 'name'>

export type PortfolioState = {
  budget: BudgetConfig
  aiConfig: AiConfig
  holdings: Holding[]
  operations: HoldingOperation[]
  history: ProfitSnapshot[]
  updatedAt: string
}

export type PortfolioTotals = {
  myAmount: number
  bloggerAmount: number
  myProfit: number
  bloggerProfit: number
  myInvested: number
  bloggerInvested: number
  myYesterdayProfit: number
  bloggerYesterdayProfit: number
  myProfitRate: number
  bloggerProfitRate: number
}

export type HoldingRow = Holding & {
  myInvested: number
  bloggerInvested: number
  targetInvested: number
  myRate: number
  bloggerRate: number
  myPositionRate: number
  bloggerPositionRate: number
  myDailyProfit: number | null
  bloggerDailyProfit: number | null
  latestNavDate: string
  pendingOperations: HoldingOperation[]
}
