import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  createEmptyPortfolioState,
  mergeNavHistory,
  normalizePortfolioState,
  PORTFOLIO_HISTORY_VERSION,
  projectPortfolio,
  projectPortfolioHistory,
} from '@/domain/portfolio'
import { loadPortfolio, savePortfolio } from '@/services/storage'
import type {
  Fund,
  FundNavPoint,
  HoldingSnapshotDraft,
  PortfolioCache,
  PortfolioEvent,
  PortfolioHistoryPoint,
  PortfolioState,
  Settings,
  TradeDraft,
} from '@/types/portfolio'

function nowIso(): string {
  return new Date().toISOString()
}

function createCache(
  sourceRevision: number,
  history: PortfolioHistoryPoint[],
  updatedAt: string,
): PortfolioCache {
  return {
    historyVersion: PORTFOLIO_HISTORY_VERSION,
    sourceRevision,
    history,
    updatedAt,
  }
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function upsertFund(funds: Fund[], fund: Fund): Fund[] {
  const code = fund.code.trim()
  if (!code) return funds
  const index = funds.findIndex((item) => item.code === code)
  const next = { code, name: fund.name.trim() }
  if (index < 0) return [...funds, next]
  return funds.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...next, name: next.name || item.name } : item,
  )
}

function toEvent(draft: HoldingSnapshotDraft | TradeDraft): PortfolioEvent {
  const recordedAt = nowIso()

  if ('source' in draft) {
    return {
      ...draft,
      id: createId('snapshot'),
      kind: 'holding_snapshot',
      recordedAt,
    }
  }

  return {
    ...draft,
    id: createId(draft.type),
    kind: 'trade',
    status: 'pending',
    recordedAt,
  } as PortfolioEvent
}

export const usePortfolioStore = defineStore('portfolio', () => {
  const initial = createEmptyPortfolioState()
  const settings = ref<Settings>(initial.settings)
  const funds = ref<Fund[]>(initial.funds)
  const events = ref<PortfolioEvent[]>(initial.events)
  const navHistory = ref(initial.navHistory)
  const history = ref<PortfolioHistoryPoint[]>(initial.cache.history)
  const sourceRevision = ref(initial.sourceRevision)
  const updatedAt = ref(initial.updatedAt)
  const hydrated = ref(false)
  let historyTaskId: number | null = null
  let historyTaskType: 'idle' | 'timeout' | null = null
  let saveTimer: number | null = null

  const sourceState = computed<PortfolioState>(() => ({
    sourceRevision: sourceRevision.value,
    settings: settings.value,
    funds: funds.value,
    events: events.value,
    navHistory: navHistory.value,
    cache: createCache(sourceRevision.value, [], updatedAt.value),
    updatedAt: updatedAt.value,
  }))

  const projection = computed(() => projectPortfolio(sourceState.value))
  const holdings = computed(() => projection.value.holdings)
  const totals = computed(() => projection.value.totals)
  const sortedEvents = computed(() => projection.value.events)
  const allEvents = computed(() => projection.value.allEvents)

  function touch(): void {
    sourceRevision.value += 1
    updatedAt.value = nowIso()
  }

  function buildPersistedState(): PortfolioState {
    return {
      sourceRevision: sourceRevision.value,
      settings: settings.value,
      funds: funds.value,
      events: events.value,
      navHistory: navHistory.value,
      cache: createCache(sourceRevision.value, history.value, updatedAt.value),
      updatedAt: updatedAt.value,
    }
  }

  function scheduleSave(): void {
    if (!hydrated.value) return
    if (saveTimer !== null) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      savePortfolio(buildPersistedState())
      saveTimer = null
    }, 0)
  }

  function cancelHistoryTask(): void {
    if (historyTaskId === null) return
    if (historyTaskType === 'idle' && 'cancelIdleCallback' in window) {
      ;(window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(
        historyTaskId,
      )
    } else {
      window.clearTimeout(historyTaskId)
    }
    historyTaskId = null
    historyTaskType = null
  }

  function refreshHistorySoon(): void {
    if (!hydrated.value) return
    cancelHistoryTask()
    const run = () => {
      history.value = projectPortfolioHistory(sourceState.value)
      historyTaskId = null
      historyTaskType = null
    }
    if ('requestIdleCallback' in window) {
      historyTaskType = 'idle'
      historyTaskId = (
        window as Window & {
          requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
        }
      ).requestIdleCallback?.(() => run(), { timeout: 250 }) ?? null
      return
    }
    historyTaskType = 'timeout'
    historyTaskId = window.setTimeout(run, 16)
  }

  function hydrate(): void {
    cancelHistoryTask()
    const persisted = normalizePortfolioState(loadPortfolio())
    sourceRevision.value = persisted.sourceRevision
    settings.value = persisted.settings
    funds.value = persisted.funds
    events.value = persisted.events
    navHistory.value = persisted.navHistory
    updatedAt.value = persisted.updatedAt
    history.value = persisted.cache.history
    hydrated.value = true
    if (
      persisted.cache.historyVersion !== PORTFOLIO_HISTORY_VERSION ||
      persisted.cache.sourceRevision !== persisted.sourceRevision
    ) {
      refreshHistorySoon()
    }
  }

  function setSettings(next: Settings): void {
    settings.value = {
      myBudget: Number(next.myBudget || 0),
      bloggerBudget: Number(next.bloggerBudget || 0),
      aiBaseURL: next.aiBaseURL.trim(),
      aiApiKey: next.aiApiKey.trim(),
      aiModel: next.aiModel.trim(),
    }
    touch()
  }

  function addSnapshot(draft: HoldingSnapshotDraft): void {
    const event = toEvent(draft)
    funds.value = upsertFund(funds.value, { code: draft.fundCode, name: draft.fundName })
    events.value = [...events.value, event]
    touch()
  }

  function addTrade(draft: TradeDraft): void {
    const event = toEvent(draft)
    funds.value = upsertFund(funds.value, { code: draft.fundCode, name: draft.fundName })
    if (draft.type === 'convert') {
      funds.value = upsertFund(funds.value, {
        code: draft.targetFundCode,
        name: draft.targetFundName,
      })
    }
    events.value = [...events.value, event]
    touch()
  }

  function removeEvent(id: string): void {
    events.value = events.value.filter((event) => event.id !== id)
    touch()
  }

  function removeCurrentHolding(fundCode: string): void {
    const holding = holdings.value.find((item) => item.fundCode === fundCode)
    if (!holding) return

    const tradeDate = new Date().toISOString().slice(0, 10)
    ;(['mine', 'blogger'] as const).forEach((side) => {
      const amount = side === 'mine' ? holding.myAmount : holding.bloggerAmount
      const shares = side === 'mine' ? holding.myShares : holding.bloggerShares
      if (amount <= 0.01 && shares <= 0.0001) return
      addSnapshot({
        fundCode: holding.fundCode,
        fundName: holding.fundName,
        side,
        tradeDate,
        amount: 0,
        profit: 0,
        source: 'manual',
        shares: 0,
        nav: holding.latestNav ?? undefined,
      })
    })
  }

  function setFundNavHistory(updates: Array<{ fundCode: string; points: FundNavPoint[] }>): void {
    navHistory.value = mergeNavHistory(navHistory.value, updates)
    touch()
  }

  function exportJson(): string {
    return JSON.stringify(normalizePortfolioState(buildPersistedState()), null, 2)
  }

  function reset(): void {
    cancelHistoryTask()
    const empty = createEmptyPortfolioState()
    sourceRevision.value = empty.sourceRevision
    settings.value = empty.settings
    funds.value = empty.funds
    events.value = empty.events
    navHistory.value = empty.navHistory
    history.value = empty.cache.history
    updatedAt.value = empty.updatedAt
    touch()
  }

  watch(
    sourceState,
    () => {
      if (!hydrated.value) return
      scheduleSave()
      refreshHistorySoon()
    },
    { deep: true },
  )

  watch(
    history,
    () => {
      if (!hydrated.value) return
      scheduleSave()
    },
  )

  return {
    settings,
    funds,
    events: sortedEvents,
    allEvents,
    navHistory,
    updatedAt,
    hydrated,
    holdings,
    totals,
    history,
    hydrate,
    setSettings,
    addSnapshot,
    addTrade,
    removeEvent,
    removeCurrentHolding,
    setFundNavHistory,
    exportJson,
    reset,
  }
})
