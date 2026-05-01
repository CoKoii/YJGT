export type InvestorSide = 'mine' | 'blogger'

export interface BudgetConfig {
  myBudget: number
  bloggerBudget: number
}

export interface AiConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
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

export interface HoldingOperation {
  id: string
  side: InvestorSide
  type: 'buy' | 'sell' | 'convert'
  date: string
  amount: number
  fundCode?: string
  fundName?: string
  fromFundCode?: string
  fromFundName?: string
  toFundCode?: string
  toFundName?: string
  source: 'manual' | 'ai'
  status: 'pending' | 'confirmed'
  share?: number
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

export interface RecognizedHolding {
  fundName: string
  fundCode: string
  amount: number
  profit: number
}
