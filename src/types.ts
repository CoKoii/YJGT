export type InvestorSide = 'mine' | 'blogger'
export type OperationType = 'buy' | 'sell' | 'convert'
export type OperationStatus = 'pending' | 'confirmed'
export type OperationSource = 'manual' | 'ai'
export type TrendRange = 'month' | 'quarter' | 'half' | 'year' | 'ytd' | 'all'
export type DetailChartMode = 'performance' | 'netWorth'
export type SettingsSection = 'budget' | 'ai'

export interface BudgetConfig {
  myBudget: number
  bloggerBudget: number
}

export interface AiConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface Holding {
  id: string
  fundName: string
  fundCode: string
  myAmount: number
  myProfit: number
  myYesterdayProfit: number
  bloggerAmount: number
  bloggerProfit: number
  bloggerYesterdayProfit: number
  updatedAt: string
}

export type HoldingDraft = Omit<Holding, 'updatedAt'>

export type HoldingFormModel = HoldingDraft

export interface HoldingOperation {
  id: string
  side: InvestorSide
  type: OperationType
  date: string
  amount: number
  source: OperationSource
  status: OperationStatus
  share?: number
  fundCode?: string
  fundName?: string
  fromFundCode?: string
  fromFundName?: string
  toFundCode?: string
  toFundName?: string
}

export interface HoldingOperationDraft {
  side: InvestorSide
  type: OperationType
  amount: number
  share?: number
  fundCode?: string
  fundName?: string
  fromFundCode?: string
  fromFundName?: string
  toFundCode?: string
  toFundName?: string
}

export interface OperationFormModel {
  type: OperationType
  bloggerAmount: number
  myAmount: number
  bloggerShare: number
  myShare: number
  bloggerTotalShare: number
  myTotalShare: number
  bloggerInvested: number
  myInvested: number
  fundCode: string
  fundName: string
  toFundCode: string
  toFundName: string
}

export interface ProfitSnapshot {
  date: string
  myProfit: number
  bloggerProfit: number
  myProfitRate: number
  bloggerProfitRate: number
}

export interface FundTrendPoint {
  date: string
  value: number
}

export interface FundInfo {
  code: string
  name: string
}

export interface RecognizedHolding {
  fundName: string
  fundCode: string
  amount: number
  profit: number
}

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface UploadedFileMeta {
  uid: string
  name: string
}

export interface UploadedFileItem extends UploadedFileMeta {
  originFileObj?: File
}

export interface PortfolioState {
  budget: BudgetConfig
  aiConfig: AiConfig
  holdings: Holding[]
  operations: HoldingOperation[]
  history: ProfitSnapshot[]
  updatedAt: string
}

export interface PortfolioTotals {
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

export interface HoldingRow extends Holding {
  myInvested: number
  bloggerInvested: number
  targetInvested: number
  myRate: number
  bloggerRate: number
  myPositionRate: number
  bloggerPositionRate: number
  pendingOperations: HoldingOperation[]
}
