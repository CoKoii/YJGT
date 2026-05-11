import { INVESTOR_SIDES } from '@/constants/portfolio'
import type {
  Fund,
  FundNavHistory,
  FundNavPoint,
  HoldingRow,
  HoldingSnapshot,
  PortfolioCache,
  PortfolioEvent,
  PortfolioHistoryPoint,
  PortfolioProjection,
  PortfolioState,
  PortfolioTotals,
  SidePosition,
  SideValues,
  Trade,
} from '@/types/portfolio'
import { normalizeDateKey } from '@/utils/date'
import { followRatio, profitRate, roundMoney, roundShares } from '@/utils/number'

type FundBook = {
  fund: Fund
  mine: SidePosition
  blogger: SidePosition
  pendingEvents: Trade[]
  eventCount: number
}

type ProjectionOptions = {
  throughDate?: string
}

const MAX_HISTORY_POINTS = 180
export const PORTFOLIO_HISTORY_VERSION = 1

function nowIso(): string {
  return new Date().toISOString()
}

function createSidePosition(): SidePosition {
  return {
    shares: 0,
    cost: 0,
    unknownAmount: 0,
    unknownCost: 0,
    unknownProfit: 0,
    realizedProfit: 0,
    lastSnapshotAmount: 0,
    lastSnapshotProfit: 0,
    lastSnapshotDate: '',
  }
}

function cloneSidePosition(position: SidePosition): SidePosition {
  return { ...position }
}

function isActivePosition(position: SidePosition): boolean {
  return position.shares > 0.0001 || position.cost > 0.01 || position.unknownAmount > 0.01
}

function emptyTotals(): PortfolioTotals {
  return {
    myAmount: 0,
    bloggerAmount: 0,
    myCost: 0,
    bloggerCost: 0,
    myProfit: 0,
    bloggerProfit: 0,
    myProfitRate: 0,
    bloggerProfitRate: 0,
    myTodayProfit: null,
    bloggerTodayProfit: null,
  }
}

function normalizeFund(fund: Fund): Fund | null {
  const code = fund.code.trim()
  if (!code) return null
  return {
    code,
    name: fund.name.trim(),
  }
}

function createEmptySettings() {
  return {
    myBudget: 0,
    bloggerBudget: 0,
    aiBaseURL: '',
    aiApiKey: '',
    aiModel: '',
  }
}

function createEmptyCache(): PortfolioCache {
  return {
    historyVersion: PORTFOLIO_HISTORY_VERSION,
    sourceRevision: 0,
    history: [],
    updatedAt: '',
  }
}

function uniqueFunds(funds: Fund[]): Fund[] {
  const byCode = new Map<string, Fund>()
  funds.forEach((fund) => {
    const normalized = normalizeFund(fund)
    if (!normalized) return
    const existing = byCode.get(normalized.code)
    byCode.set(normalized.code, {
      ...existing,
      ...normalized,
      name: normalized.name || existing?.name || '',
    })
  })
  return [...byCode.values()].sort((left, right) => left.code.localeCompare(right.code))
}

function compactNavPoints(points: FundNavPoint[]): FundNavPoint[] {
  const byDate = new Map<string, FundNavPoint>()
  points.forEach((point) => {
    const date = normalizeDateKey(point.date)
    if (!date || !Number.isFinite(point.nav) || point.nav <= 0) return
    byDate.set(date, { date, nav: point.nav })
  })
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

export function mergeNavHistory(
  current: FundNavHistory[],
  updates: Array<{ fundCode: string; points: FundNavPoint[] }>,
): FundNavHistory[] {
  const byFund = new Map(
    current.map((item) => [
      item.fundCode,
      {
        fundCode: item.fundCode,
        points: compactNavPoints(item.points),
        updatedAt: item.updatedAt,
      },
    ]),
  )
  const updatedAt = nowIso()

  updates.forEach((update) => {
    const fundCode = update.fundCode.trim()
    if (!fundCode) return
    const existing = byFund.get(fundCode)
    byFund.set(fundCode, {
      fundCode,
      points: compactNavPoints([...(existing?.points ?? []), ...update.points]),
      updatedAt,
    })
  })

  return [...byFund.values()].sort((left, right) => left.fundCode.localeCompare(right.fundCode))
}

function buildNavMap(navHistory: FundNavHistory[]): Map<string, FundNavPoint[]> {
  return new Map(
    navHistory.map((item) => [item.fundCode, compactNavPoints(item.points)] as const),
  )
}

function collectEventNavUpdates(
  events: PortfolioEvent[],
  throughDate?: string,
): Array<{ fundCode: string; points: FundNavPoint[] }> {
  const byFund = new Map<string, FundNavPoint[]>()

  function addPoint(fundCode: string, date: string, nav: number): void {
    if (!fundCode || !date || nav <= 0 || (throughDate && date > throughDate)) return
    const points = byFund.get(fundCode) ?? []
    points.push({ date, nav })
    byFund.set(fundCode, points)
  }

  events.forEach((event) => {
    if (event.kind === 'holding_snapshot') {
      addPoint(event.fundCode, event.tradeDate, event.nav ?? 0)
      return
    }

    if (event.type === 'buy') {
      INVESTOR_SIDES.forEach((side) => addPoint(event.fundCode, event.tradeDate, event.navBySide?.[side] ?? 0))
      return
    }

    if (event.type === 'sell') {
      INVESTOR_SIDES.forEach((side) => addPoint(event.fundCode, event.tradeDate, event.navBySide?.[side] ?? 0))
      return
    }

    INVESTOR_SIDES.forEach((side) => {
      addPoint(event.fundCode, event.tradeDate, event.outNavBySide?.[side] ?? 0)
      addPoint(event.targetFundCode, event.tradeDate, event.inNavBySide?.[side] ?? 0)
    })
  })

  return [...byFund.entries()].map(([fundCode, points]) => ({ fundCode, points }))
}

function buildEffectiveNavMap(
  state: PortfolioState,
  events: PortfolioEvent[],
  throughDate?: string,
): Map<string, FundNavPoint[]> {
  const navHistory = mergeNavHistory(state.navHistory, collectEventNavUpdates(events, throughDate))
  return buildNavMap(navHistory)
}

function latestNav(points: FundNavPoint[], throughDate?: string): FundNavPoint | null {
  const eligible = throughDate ? points.filter((point) => point.date <= throughDate) : points
  return eligible.at(-1) ?? null
}

function previousNav(points: FundNavPoint[], date: string): FundNavPoint | null {
  return [...points].reverse().find((point) => point.date < date) ?? null
}

function navOnDate(points: FundNavPoint[], date: string): FundNavPoint | null {
  return points.find((point) => point.date === date) ?? null
}

function getBook(books: Map<string, FundBook>, code: string, name: string): FundBook {
  const fundCode = code.trim()
  const existing = books.get(fundCode)
  if (existing) {
    if (name.trim()) existing.fund.name = name.trim()
    return existing
  }

  const book: FundBook = {
    fund: { code: fundCode, name: name.trim() },
    mine: createSidePosition(),
    blogger: createSidePosition(),
    pendingEvents: [],
    eventCount: 0,
  }
  books.set(fundCode, book)
  return book
}

function sortEvents(events: PortfolioEvent[]): PortfolioEvent[] {
  return [...events].sort((left, right) => {
    if (left.tradeDate === right.tradeDate) return left.recordedAt.localeCompare(right.recordedAt)
    return left.tradeDate.localeCompare(right.tradeDate)
  })
}

function normalizeSideValues(values: Partial<SideValues> | undefined): SideValues {
  return {
    mine: Number(values?.mine ?? 0),
    blogger: Number(values?.blogger ?? 0),
  }
}

function normalizeSnapshot(event: HoldingSnapshot): HoldingSnapshot | null {
  const fundCode = event.fundCode.trim()
  const tradeDate = normalizeDateKey(event.tradeDate)
  if (!fundCode || !tradeDate) return null
  return {
    ...event,
    fundCode,
    fundName: event.fundName.trim(),
    tradeDate,
    recordedAt: event.recordedAt,
    amount: roundMoney(event.amount),
    profit: roundMoney(event.profit),
    shares:
      typeof event.shares === 'number' && event.shares > 0 ? roundShares(event.shares) : undefined,
    nav: typeof event.nav === 'number' && event.nav > 0 ? event.nav : undefined,
    source: event.source,
  }
}

function normalizeTrade(event: Trade): Trade | null {
  const fundCode = event.fundCode.trim()
  const tradeDate = normalizeDateKey(event.tradeDate)
  if (!fundCode || !tradeDate) return null

  if (event.type === 'buy') {
    return {
      ...event,
      status: event.status,
      fundCode,
      fundName: event.fundName.trim(),
      tradeDate,
      recordedAt: event.recordedAt,
      amounts: normalizeSideValues(event.amounts),
      navBySide: event.navBySide ? normalizeSideValues(event.navBySide) : undefined,
      sharesBySide: event.sharesBySide ? normalizeSideValues(event.sharesBySide) : undefined,
      feeBySide: event.feeBySide ? normalizeSideValues(event.feeBySide) : undefined,
    }
  }

  if (event.type === 'sell') {
    return {
      ...event,
      status: event.status,
      fundCode,
      fundName: event.fundName.trim(),
      tradeDate,
      recordedAt: event.recordedAt,
      sharesBySide: normalizeSideValues(event.sharesBySide),
      navBySide: event.navBySide ? normalizeSideValues(event.navBySide) : undefined,
      amountBySide: event.amountBySide ? normalizeSideValues(event.amountBySide) : undefined,
      feeBySide: event.feeBySide ? normalizeSideValues(event.feeBySide) : undefined,
    }
  }

  return {
    ...event,
    status: event.status,
    fundCode,
    fundName: event.fundName.trim(),
    targetFundCode: event.targetFundCode.trim(),
    targetFundName: event.targetFundName.trim(),
    tradeDate,
    recordedAt: event.recordedAt,
    outSharesBySide: normalizeSideValues(event.outSharesBySide),
    outNavBySide: event.outNavBySide ? normalizeSideValues(event.outNavBySide) : undefined,
    inSharesBySide: event.inSharesBySide ? normalizeSideValues(event.inSharesBySide) : undefined,
    inNavBySide: event.inNavBySide ? normalizeSideValues(event.inNavBySide) : undefined,
    feeBySide: event.feeBySide ? normalizeSideValues(event.feeBySide) : undefined,
  }
}

function normalizeEvent(event: PortfolioEvent): PortfolioEvent | null {
  return event.kind === 'holding_snapshot' ? normalizeSnapshot(event) : normalizeTrade(event)
}

function fundsFromEvent(event: PortfolioEvent): Fund[] {
  if (event.kind === 'holding_snapshot') return [{ code: event.fundCode, name: event.fundName }]
  if (event.type === 'convert') {
    return [
      { code: event.fundCode, name: event.fundName },
      { code: event.targetFundCode, name: event.targetFundName },
    ]
  }
  return [{ code: event.fundCode, name: event.fundName }]
}

function updateSnapshot(position: SidePosition, snapshot: HoldingSnapshot): SidePosition {
  const amount = Math.max(snapshot.amount, 0)
  const cost = Math.max(amount - snapshot.profit, 0)
  const shares = snapshot.shares && snapshot.shares > 0 ? snapshot.shares : 0

  if (amount <= 0.01 && shares <= 0.0001) {
    return {
      ...createSidePosition(),
      realizedProfit: position.realizedProfit,
      lastSnapshotDate: snapshot.tradeDate,
    }
  }

  return {
    shares,
    cost: shares > 0 ? roundMoney(cost) : 0,
    unknownAmount: shares > 0 ? 0 : roundMoney(amount),
    unknownCost: shares > 0 ? 0 : roundMoney(cost),
    unknownProfit: shares > 0 ? 0 : roundMoney(snapshot.profit),
    realizedProfit: position.realizedProfit,
    lastSnapshotAmount: roundMoney(amount),
    lastSnapshotProfit: roundMoney(snapshot.profit),
    lastSnapshotDate: snapshot.tradeDate,
  }
}

function addKnownPosition(
  position: SidePosition,
  shares: number,
  cost: number,
): SidePosition {
  if (shares <= 0.0001 || cost <= 0.01) return position
  return {
    ...position,
    shares: roundShares(position.shares + shares),
    cost: roundMoney(position.cost + cost),
  }
}

function reduceUnknownPosition(
  position: SidePosition,
  cashAmount: number,
  fee: number,
): SidePosition {
  if (position.unknownAmount <= 0.01 || cashAmount <= 0.01) return position

  const reductionRatio = Math.min(cashAmount / position.unknownAmount, 1)
  const reducedAmount = position.unknownAmount * reductionRatio
  const reducedCost = position.unknownCost * reductionRatio
  const reducedProfit = position.unknownProfit * reductionRatio
  const realizedProfit = cashAmount - fee - reducedCost

  return {
    ...position,
    unknownAmount: roundMoney(position.unknownAmount - reducedAmount),
    unknownCost: roundMoney(position.unknownCost - reducedCost),
    unknownProfit: roundMoney(position.unknownProfit - reducedProfit),
    realizedProfit: roundMoney(position.realizedProfit + realizedProfit),
    lastSnapshotAmount: roundMoney(Math.max(position.lastSnapshotAmount - reducedAmount, 0)),
    lastSnapshotProfit: roundMoney(position.lastSnapshotProfit - reducedProfit),
  }
}

function reduceKnownPosition(
  position: SidePosition,
  shares: number,
  cashAmount: number,
  fee: number,
): SidePosition {
  if (shares <= 0.0001) return position

  if (position.shares <= 0.0001) {
    return reduceUnknownPosition(position, cashAmount, fee)
  }

  const outShares = Math.min(shares, position.shares)
  const knownRatio = outShares / shares
  const knownCashAmount = cashAmount * knownRatio
  const knownFee = fee * knownRatio
  const shareRatio = outShares / position.shares
  const reducedCost = position.cost * shareRatio
  const realizedProfit = knownCashAmount - knownFee - reducedCost
  const remainingShares = position.shares - outShares
  const remainingCost = position.cost - reducedCost

  const reducedKnownPosition =
    remainingShares <= 0.0001
      ? {
          ...position,
          shares: 0,
          cost: 0,
          realizedProfit: roundMoney(position.realizedProfit + realizedProfit),
        }
      : {
          ...position,
          shares: roundShares(remainingShares),
          cost: roundMoney(remainingCost),
          realizedProfit: roundMoney(position.realizedProfit + realizedProfit),
        }

  if (outShares >= shares || position.unknownAmount <= 0.01) return reducedKnownPosition

  return reduceUnknownPosition(
    reducedKnownPosition,
    Math.max(cashAmount - knownCashAmount, 0),
    Math.max(fee - knownFee, 0),
  )
}

function applyTradeToSide(position: SidePosition, trade: Trade, side: keyof SideValues) {
  if (trade.type === 'buy') {
    return addKnownPosition(
      position,
      trade.sharesBySide?.[side] ?? 0,
      trade.amounts[side] + (trade.feeBySide?.[side] ?? 0),
    )
  }

  if (trade.type === 'sell') {
    return reduceKnownPosition(
      position,
      trade.sharesBySide[side],
      trade.amountBySide?.[side] ?? 0,
      trade.feeBySide?.[side] ?? 0,
    )
  }

  return reduceKnownPosition(
    position,
    trade.outSharesBySide[side],
    trade.outSharesBySide[side] * (trade.outNavBySide?.[side] ?? 0),
    trade.feeBySide?.[side] ?? 0,
  )
}

function valuesToShares(amounts: SideValues, nav: number): SideValues {
  return {
    mine: nav > 0 ? roundShares(amounts.mine / nav) : 0,
    blogger: nav > 0 ? roundShares(amounts.blogger / nav) : 0,
  }
}

function valuesByShares(shares: SideValues, nav: number): SideValues {
  return {
    mine: roundMoney(shares.mine * nav),
    blogger: roundMoney(shares.blogger * nav),
  }
}

function settleTrade(trade: Trade, navByFund: Map<string, FundNavPoint[]>): Trade | null {
  if (trade.status === 'settled') return trade

  const sourceNav = navOnDate(navByFund.get(trade.fundCode) ?? [], trade.tradeDate)
  if (!sourceNav) return null
  const navBySide = { mine: sourceNav.nav, blogger: sourceNav.nav }
  const settledAt = nowIso()

  if (trade.type === 'buy') {
    return {
      ...trade,
      status: 'settled',
      settledAt,
      navBySide,
      sharesBySide: valuesToShares(trade.amounts, sourceNav.nav),
      feeBySide: trade.feeBySide ?? { mine: 0, blogger: 0 },
    }
  }

  if (trade.type === 'sell') {
    return {
      ...trade,
      status: 'settled',
      settledAt,
      navBySide,
      amountBySide: valuesByShares(trade.sharesBySide, sourceNav.nav),
      feeBySide: trade.feeBySide ?? { mine: 0, blogger: 0 },
    }
  }

  const targetNav = navOnDate(navByFund.get(trade.targetFundCode) ?? [], trade.tradeDate)
  if (!targetNav) return null
  const convertedAmounts = valuesByShares(trade.outSharesBySide, sourceNav.nav)

  return {
    ...trade,
    status: 'settled',
    settledAt,
    outNavBySide: navBySide,
    inNavBySide: { mine: targetNav.nav, blogger: targetNav.nav },
    inSharesBySide: valuesToShares(convertedAmounts, targetNav.nav),
    feeBySide: trade.feeBySide ?? { mine: 0, blogger: 0 },
  }
}

function applyEvent(books: Map<string, FundBook>, event: PortfolioEvent): void {
  if (event.kind === 'holding_snapshot') {
    const book = getBook(books, event.fundCode, event.fundName)
    book[event.side] = updateSnapshot(book[event.side], event)
    book.eventCount += 1
    return
  }

  if (event.status !== 'settled') {
    const sourceBook = getBook(books, event.fundCode, event.fundName)
    sourceBook.pendingEvents.push(event)
    sourceBook.eventCount += 1
    if (event.type === 'convert') {
      const targetBook = getBook(books, event.targetFundCode, event.targetFundName)
      targetBook.pendingEvents.push(event)
      targetBook.eventCount += 1
    }
    return
  }

  const source = getBook(books, event.fundCode, event.fundName)
  INVESTOR_SIDES.forEach((side) => {
    source[side] = applyTradeToSide(source[side], event, side)
  })
  source.eventCount += 1

  if (event.type !== 'convert') return

  const target = getBook(books, event.targetFundCode, event.targetFundName)
  INVESTOR_SIDES.forEach((side) => {
    const inShares = event.inSharesBySide?.[side] ?? 0
    const inNav = event.inNavBySide?.[side] ?? 0
    target[side] = addKnownPosition(target[side], inShares, inShares * inNav)
  })
  target.eventCount += 1
}

function seedBooks(funds: Fund[]): Map<string, FundBook> {
  const books = new Map<string, FundBook>()
  uniqueFunds(funds).forEach((fund) => {
    books.set(fund.code, {
      fund: { ...fund },
      mine: createSidePosition(),
      blogger: createSidePosition(),
      pendingEvents: [],
      eventCount: 0,
    })
  })
  return books
}

function projectBooks(
  state: PortfolioState,
  navByFund: Map<string, FundNavPoint[]>,
  options: ProjectionOptions = {},
) {
  const books = seedBooks(state.funds)
  const events = sortEvents(state.events)
    .map(normalizeEvent)
    .filter((event): event is PortfolioEvent => Boolean(event))
    .filter((event) => !options.throughDate || event.tradeDate <= options.throughDate)
    .map((event) => {
      if (event.kind === 'holding_snapshot') return event
      return settleTrade(event, navByFund) ?? event
    })

  events.forEach((event) => applyEvent(books, event))

  return { books, events }
}

function sideMarketValue(
  position: SidePosition,
  points: FundNavPoint[],
  throughDate?: string,
): {
  amount: number
  cost: number
  profit: number
  profitRate: number
  todayProfit: number | null
  latestNav: number | null
  latestNavDate: string
  shares: number
} {
  const latest = latestNav(points, throughDate)
  const previous = latest ? previousNav(points, latest.date) : null
  const unknownShares =
    latest && position.unknownAmount > 0.01 ? position.unknownAmount / latest.nav : 0
  const activeShares = position.shares + unknownShares
  const hasKnownShares = position.shares > 0.0001
  const fallbackKnownAmount = hasKnownShares ? position.lastSnapshotAmount || position.cost : 0
  const knownAmount = latest && hasKnownShares ? position.shares * latest.nav : fallbackKnownAmount
  const knownProfit = hasKnownShares
    ? latest
      ? knownAmount - position.cost
      : position.lastSnapshotProfit || knownAmount - position.cost
    : 0
  const amount = roundMoney(position.unknownAmount + knownAmount)
  const cost = roundMoney(position.unknownCost + position.cost)
  const profit = roundMoney(position.unknownProfit + knownProfit)
  const todayProfit =
    latest && previous && activeShares > 0.0001
      ? roundMoney(activeShares * (latest.nav - previous.nav))
      : null

  return {
    amount,
    cost,
    profit,
    profitRate: profitRate(cost, profit),
    todayProfit,
    latestNav: latest?.nav ?? null,
    latestNavDate: latest?.date ?? '',
    shares: roundShares(activeShares),
  }
}

function toHoldingRow(
  book: FundBook,
  points: FundNavPoint[],
  totals: Pick<PortfolioTotals, 'myCost' | 'bloggerCost'>,
  targetRatio: number,
  throughDate?: string,
): HoldingRow {
  const mine = sideMarketValue(book.mine, points, throughDate)
  const blogger = sideMarketValue(book.blogger, points, throughDate)
  const latestNavPoint = latestNav(points, throughDate)
  const myInvested = mine.cost
  const bloggerInvested = blogger.cost
  const targetInvested = targetRatio > 0 ? bloggerInvested / targetRatio : 0

  return {
    id: book.fund.code,
    fundCode: book.fund.code,
    fundName: book.fund.name,
    myAmount: mine.amount,
    myCost: mine.cost,
    myShares: mine.shares,
    myProfit: mine.profit,
    myProfitRate: mine.profitRate,
    myTodayProfit: mine.todayProfit,
    bloggerAmount: blogger.amount,
    bloggerCost: blogger.cost,
    bloggerShares: blogger.shares,
    bloggerProfit: blogger.profit,
    bloggerProfitRate: blogger.profitRate,
    bloggerTodayProfit: blogger.todayProfit,
    myInvested,
    bloggerInvested,
    targetInvested,
    myPositionRate: totals.myCost > 0 ? (myInvested / totals.myCost) * 100 : 0,
    bloggerPositionRate:
      totals.bloggerCost > 0 ? (bloggerInvested / totals.bloggerCost) * 100 : 0,
    latestNav: latestNavPoint?.nav ?? mine.latestNav ?? blogger.latestNav,
    latestNavDate: latestNavPoint?.date ?? mine.latestNavDate ?? blogger.latestNavDate,
    lastSnapshotDate: [book.mine.lastSnapshotDate, book.blogger.lastSnapshotDate].sort().at(-1) ?? '',
    pendingEvents: book.pendingEvents,
    eventCount: book.eventCount,
  }
}

function computeTotalsFromBooks(
  books: FundBook[],
  navByFund: Map<string, FundNavPoint[]>,
  throughDate?: string,
): PortfolioTotals {
  const totals = emptyTotals()
  let hasMyTodayProfit = false
  let hasBloggerTodayProfit = false

  books.forEach((book) => {
    const points = navByFund.get(book.fund.code) ?? []
    const mine = sideMarketValue(book.mine, points, throughDate)
    const blogger = sideMarketValue(book.blogger, points, throughDate)
    totals.myAmount += mine.amount
    totals.bloggerAmount += blogger.amount
    totals.myCost += mine.cost
    totals.bloggerCost += blogger.cost
    totals.myProfit += mine.profit
    totals.bloggerProfit += blogger.profit
    if (mine.todayProfit !== null) {
      totals.myTodayProfit = (totals.myTodayProfit ?? 0) + mine.todayProfit
      hasMyTodayProfit = true
    }
    if (blogger.todayProfit !== null) {
      totals.bloggerTodayProfit = (totals.bloggerTodayProfit ?? 0) + blogger.todayProfit
      hasBloggerTodayProfit = true
    }
  })

  totals.myAmount = roundMoney(totals.myAmount)
  totals.bloggerAmount = roundMoney(totals.bloggerAmount)
  totals.myCost = roundMoney(totals.myCost)
  totals.bloggerCost = roundMoney(totals.bloggerCost)
  totals.myProfit = roundMoney(totals.myProfit)
  totals.bloggerProfit = roundMoney(totals.bloggerProfit)
  totals.myProfitRate = profitRate(totals.myCost, totals.myProfit)
  totals.bloggerProfitRate = profitRate(totals.bloggerCost, totals.bloggerProfit)
  totals.myTodayProfit = hasMyTodayProfit ? roundMoney(totals.myTodayProfit ?? 0) : null
  totals.bloggerTodayProfit = hasBloggerTodayProfit
    ? roundMoney(totals.bloggerTodayProfit ?? 0)
    : null

  return totals
}

function activeBooks(books: Map<string, FundBook>): FundBook[] {
  return [...books.values()].filter(
    (book) => isActivePosition(book.mine) || isActivePosition(book.blogger),
  )
}

export function projectPortfolioHistory(state: PortfolioState): PortfolioHistoryPoint[] {
  const normalized = normalizePortfolioState(state)
  const navByFund = buildEffectiveNavMap(normalized, normalized.events)
  const dates = [
    ...new Set([
      ...normalized.events
        .map((event) => normalizeDateKey(event.tradeDate))
        .filter((date): date is string => Boolean(date)),
      ...[...navByFund.values()].flatMap((points) => points.map((point) => point.date)),
    ]),
  ]
    .sort()
    .slice(-MAX_HISTORY_POINTS)

  return dates.map((date) => {
    const initialNavByFund = buildEffectiveNavMap(normalized, [], date)
    const { books, events } = projectBooks(normalized, initialNavByFund, { throughDate: date })
    const effectiveNavByFund = buildEffectiveNavMap(normalized, events, date)
    const totals = computeTotalsFromBooks(activeBooks(books), effectiveNavByFund, date)
    return {
      date,
      myAmount: totals.myAmount,
      bloggerAmount: totals.bloggerAmount,
      myProfit: totals.myProfit,
      bloggerProfit: totals.bloggerProfit,
      myProfitRate: totals.myProfitRate,
      bloggerProfitRate: totals.bloggerProfitRate,
    }
  })
}

export function projectPortfolio(state: PortfolioState): PortfolioProjection {
  const normalized = normalizePortfolioState(state)
  const initialNavByFund = buildEffectiveNavMap(normalized, [])
  const { books, events } = projectBooks(normalized, initialNavByFund)
  const navByFund = buildEffectiveNavMap(normalized, events)
  const booksList = activeBooks(books)
  const totals = computeTotalsFromBooks(booksList, navByFund)
  const ratio = followRatio(normalized.settings)
  const holdings = booksList
    .map((book) => toHoldingRow(book, navByFund.get(book.fund.code) ?? [], totals, ratio.blogger))
    .sort((left, right) => right.bloggerCost + right.myCost - (left.bloggerCost + left.myCost))
  const funds = uniqueFunds([...normalized.funds, ...events.flatMap(fundsFromEvent)])

  return {
    holdings,
    totals,
    events: events.filter((event) => event.kind !== 'trade' || event.status !== 'pending'),
    allEvents: events,
    funds,
  }
}

export function normalizePortfolioState(input: Partial<PortfolioState> | null | undefined): PortfolioState {
  const events = (input?.events ?? [])
    .map((event) => normalizeEvent(event as PortfolioEvent))
    .filter((event): event is PortfolioEvent => Boolean(event))
  const funds = uniqueFunds([...(input?.funds ?? []), ...events.flatMap(fundsFromEvent)])
  const sourceRevision = Number(input?.sourceRevision ?? 0)

  return {
    sourceRevision,
    settings: {
      myBudget: Number(input?.settings?.myBudget ?? 0),
      bloggerBudget: Number(input?.settings?.bloggerBudget ?? 0),
      aiBaseURL: String(input?.settings?.aiBaseURL ?? ''),
      aiApiKey: String(input?.settings?.aiApiKey ?? ''),
      aiModel: String(input?.settings?.aiModel ?? ''),
    },
    funds,
    events,
    navHistory: (input?.navHistory ?? []).map((item) => ({
      fundCode: item.fundCode,
      points: compactNavPoints(item.points),
      updatedAt: item.updatedAt || nowIso(),
    })),
    cache:
      input?.cache &&
      input.cache.historyVersion === PORTFOLIO_HISTORY_VERSION &&
      input.cache.sourceRevision === sourceRevision
        ? {
            historyVersion: PORTFOLIO_HISTORY_VERSION,
            sourceRevision,
            history: (input.cache.history ?? []).filter(
              (point): point is PortfolioHistoryPoint =>
                typeof point?.date === 'string' &&
                Number.isFinite(point?.myAmount) &&
                Number.isFinite(point?.bloggerAmount) &&
                Number.isFinite(point?.myProfit) &&
                Number.isFinite(point?.bloggerProfit) &&
                Number.isFinite(point?.myProfitRate) &&
                Number.isFinite(point?.bloggerProfitRate),
            ),
            updatedAt: input.cache.updatedAt || nowIso(),
          }
        : createEmptyCache(),
    updatedAt: input?.updatedAt || nowIso(),
  }
}

export function getKnownSidePosition(
  state: PortfolioState,
  fundCode: string,
  side: keyof SideValues,
): SidePosition {
  const normalized = normalizePortfolioState(state)
  const navByFund = buildEffectiveNavMap(normalized, [])
  const { books } = projectBooks(normalized, navByFund)
  return cloneSidePosition(books.get(fundCode)?.[side] ?? createSidePosition())
}

export function createEmptyPortfolioState(): PortfolioState {
  return {
    sourceRevision: 0,
    settings: createEmptySettings(),
    funds: [],
    events: [],
    navHistory: [],
    cache: createEmptyCache(),
    updatedAt: '',
  }
}
