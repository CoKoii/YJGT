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
  growthRate?: number
}

export interface RecognizedHolding {
  fundName: string
  fundCode: string
  amount: number
  profit: number
}
