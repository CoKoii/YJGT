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

export type FundRecord = {
  code: string
  name: string
}

export type PositionSeed = {
  amount: number
  profit: number
  nav?: number
  navDate?: string
  startedAt?: string
}

export type PositionRecord = {
  fundCode: string
  mine: PositionSeed
  blogger: PositionSeed
  updatedAt: string
}

export type FundNavPoint = FundTrendPoint

export type FundNavHistory = {
  fundCode: string
  points: FundNavPoint[]
  updatedAt: string
}

export type OperationSideValues = {
  mine: number
  blogger: number
}

export type OperationTargetFund = {
  code: string
  name: string
}

type HoldingOperationBase = {
  id: string
  type: OperationType
  submittedAt: string
  tradeDate: string
  source: OperationSource
  status: OperationStatus
  fundCode: string
  fundName: string
  settledAt?: string
  settledFundNav?: number
  settledTargetNav?: number
}

export type BuyOperation = HoldingOperationBase & {
  type: 'buy'
  amounts: OperationSideValues
}

export type SellOperation = HoldingOperationBase & {
  type: 'sell'
  shares: OperationSideValues
}

export type ConvertOperation = HoldingOperationBase & {
  type: 'convert'
  shares: OperationSideValues
  targetFund: OperationTargetFund
}

export type HoldingOperation = BuyOperation | SellOperation | ConvertOperation

type HoldingOperationDraftBase = {
  fundCode: string
  fundName: string
}

export type BuyOperationDraft = HoldingOperationDraftBase & {
  type: 'buy'
  amounts: OperationSideValues
}

export type SellOperationDraft = HoldingOperationDraftBase & {
  type: 'sell'
  shares: OperationSideValues
}

export type ConvertOperationDraft = HoldingOperationDraftBase & {
  type: 'convert'
  shares: OperationSideValues
  targetFund: OperationTargetFund
}

export type HoldingOperationDraft = BuyOperationDraft | SellOperationDraft | ConvertOperationDraft

export type OperationFormModel = {
  type: OperationType
  fundCode: string
  fundName: string
  amounts: OperationSideValues
  shares: OperationSideValues
  targetFund: OperationTargetFund
}

export type ProfitSnapshot = {
  date: string
  myProfit: number
  bloggerProfit: number
  myProfitRate: number
  bloggerProfitRate: number
}

export type HoldingProfitSnapshot = {
  date: string
  fundCode: string
  myAmount: number
  myProfit: number
  myProfitRate: number
  bloggerAmount: number
  bloggerProfit: number
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
  schemaVersion?: number
  budget: BudgetConfig
  aiConfig: AiConfig
  funds: FundRecord[]
  positions: PositionRecord[]
  operations: HoldingOperation[]
  navHistory: FundNavHistory[]
  snapshots: ProfitSnapshot[]
  holdingSnapshots: HoldingProfitSnapshot[]
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
