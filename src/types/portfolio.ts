export type InvestorSide = 'mine' | 'blogger'

export type TradeType = 'buy' | 'sell' | 'convert'

export type TradeStatus = 'pending' | 'settled'

export type CashFlowDirection = 'out' | 'in'

export type Fund = {
  code: string
  name: string
  archivedAt?: string
}

export type SideValues = Record<InvestorSide, number>

export type Settings = {
  myBudget: number
  bloggerBudget: number
  aiBaseURL: string
  aiApiKey: string
  aiModel: string
}

export type HoldingSnapshot = {
  id: string
  kind: 'holding_snapshot'
  fundCode: string
  fundName: string
  side: InvestorSide
  recordedAt: string
  tradeDate: string
  amount: number
  profit: number
  shares?: number
  nav?: number
  source: 'manual' | 'screenshot'
}

export type BuyTrade = {
  id: string
  kind: 'trade'
  type: 'buy'
  status?: TradeStatus
  fundCode: string
  fundName: string
  tradeDate: string
  recordedAt: string
  amounts: SideValues
  navBySide?: SideValues
  sharesBySide?: SideValues
  feeBySide?: SideValues
  settledAt?: string
}

export type SellTrade = {
  id: string
  kind: 'trade'
  type: 'sell'
  status?: TradeStatus
  fundCode: string
  fundName: string
  tradeDate: string
  recordedAt: string
  sharesBySide: SideValues
  navBySide?: SideValues
  amountBySide?: SideValues
  feeBySide?: SideValues
  settledAt?: string
}

export type ConvertTrade = {
  id: string
  kind: 'trade'
  type: 'convert'
  status?: TradeStatus
  fundCode: string
  fundName: string
  targetFundCode: string
  targetFundName: string
  tradeDate: string
  recordedAt: string
  outSharesBySide: SideValues
  outNavBySide?: SideValues
  inSharesBySide?: SideValues
  inNavBySide?: SideValues
  feeBySide?: SideValues
  settledAt?: string
}

export type Trade = BuyTrade | SellTrade | ConvertTrade

export type PortfolioEvent = HoldingSnapshot | Trade

export type FundNavPoint = {
  date: string
  nav: number
}

export type FundNavHistory = {
  fundCode: string
  points: FundNavPoint[]
  updatedAt: string
}

export type PortfolioState = {
  schemaVersion: number
  settings: Settings
  funds: Fund[]
  events: PortfolioEvent[]
  navHistory: FundNavHistory[]
  updatedAt: string
}

export type SidePosition = {
  shares: number
  cost: number
  unknownAmount: number
  unknownCost: number
  unknownProfit: number
  realizedProfit: number
  lastSnapshotAmount: number
  lastSnapshotProfit: number
  lastSnapshotDate: string
}

export type HoldingRow = {
  id: string
  fundCode: string
  fundName: string
  myAmount: number
  myCost: number
  myShares: number
  myProfit: number
  myProfitRate: number
  myTodayProfit: number | null
  bloggerAmount: number
  bloggerCost: number
  bloggerShares: number
  bloggerProfit: number
  bloggerProfitRate: number
  bloggerTodayProfit: number | null
  myInvested: number
  bloggerInvested: number
  targetInvested: number
  myPositionRate: number
  bloggerPositionRate: number
  latestNav: number | null
  latestNavDate: string
  lastSnapshotDate: string
  pendingEvents: Trade[]
  eventCount: number
}

export type PortfolioTotals = {
  myAmount: number
  bloggerAmount: number
  myCost: number
  bloggerCost: number
  myProfit: number
  bloggerProfit: number
  myProfitRate: number
  bloggerProfitRate: number
  myTodayProfit: number | null
  bloggerTodayProfit: number | null
}

export type PortfolioHistoryPoint = {
  date: string
  myAmount: number
  bloggerAmount: number
  myProfit: number
  bloggerProfit: number
  myProfitRate: number
  bloggerProfitRate: number
}

export type PortfolioProjection = {
  holdings: HoldingRow[]
  totals: PortfolioTotals
  history: PortfolioHistoryPoint[]
  events: PortfolioEvent[]
  allEvents: PortfolioEvent[]
  funds: Fund[]
}

export type HoldingSnapshotDraft = {
  fundCode: string
  fundName: string
  side: InvestorSide
  tradeDate: string
  amount: number
  profit: number
  shares?: number
  nav?: number
  source: HoldingSnapshot['source']
}

export type BuyTradeDraft = {
  type: 'buy'
  fundCode: string
  fundName: string
  tradeDate: string
  amounts: SideValues
  navBySide?: SideValues
  sharesBySide?: SideValues
  feeBySide?: SideValues
}

export type SellTradeDraft = {
  type: 'sell'
  fundCode: string
  fundName: string
  tradeDate: string
  sharesBySide: SideValues
  navBySide?: SideValues
  amountBySide?: SideValues
  feeBySide?: SideValues
}

export type ConvertTradeDraft = {
  type: 'convert'
  fundCode: string
  fundName: string
  targetFundCode: string
  targetFundName: string
  tradeDate: string
  outSharesBySide: SideValues
  outNavBySide?: SideValues
  inSharesBySide?: SideValues
  inNavBySide?: SideValues
  feeBySide?: SideValues
}

export type TradeDraft = BuyTradeDraft | SellTradeDraft | ConvertTradeDraft

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
