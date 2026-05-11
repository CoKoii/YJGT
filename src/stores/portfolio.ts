import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { PORTFOLIO_SCHEMA_VERSION } from '@/constants/portfolio'
import {
  createEmptyPortfolioState,
  mergeNavHistory,
  normalizePortfolioState,
  projectPortfolio,
} from '@/domain/portfolio'
import { loadPortfolio, savePortfolio } from '@/services/storage'
import type {
  Fund,
  FundNavPoint,
  HoldingSnapshotDraft,
  PortfolioEvent,
  PortfolioState,
  Settings,
  TradeDraft,
} from '@/types/portfolio'

function nowIso(): string {
  return new Date().toISOString()
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function upsertFund(funds: Fund[], fund: Fund): Fund[] {
  const code = fund.code.trim()
  if (!code) return funds
  const index = funds.findIndex((item) => item.code === code)
  const next = { code, name: fund.name.trim(), archivedAt: fund.archivedAt }
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
    recordedAt,
  } as PortfolioEvent
}

export const usePortfolioStore = defineStore('portfolio', () => {
  const initial = createEmptyPortfolioState()
  const settings = ref<Settings>(initial.settings)
  const funds = ref<Fund[]>(initial.funds)
  const events = ref<PortfolioEvent[]>(initial.events)
  const navHistory = ref(initial.navHistory)
  const updatedAt = ref(initial.updatedAt)
  const hydrated = ref(false)

  const state = computed<PortfolioState>(() => ({
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    settings: settings.value,
    funds: funds.value,
    events: events.value,
    navHistory: navHistory.value,
    updatedAt: updatedAt.value,
  }))

  const projection = computed(() => projectPortfolio(state.value))
  const holdings = computed(() => projection.value.holdings)
  const totals = computed(() => projection.value.totals)
  const history = computed(() => projection.value.history)
  const sortedEvents = computed(() => projection.value.events)
  const allEvents = computed(() => projection.value.allEvents)

  function touch(): void {
    updatedAt.value = nowIso()
  }

  function hydrate(): void {
    const persisted = normalizePortfolioState(loadPortfolio())
    settings.value = persisted.settings
    funds.value = persisted.funds
    events.value = persisted.events
    navHistory.value = persisted.navHistory
    updatedAt.value = persisted.updatedAt
    hydrated.value = true
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
    return JSON.stringify(normalizePortfolioState(state.value), null, 2)
  }

  function reset(): void {
    const empty = createEmptyPortfolioState()
    settings.value = empty.settings
    funds.value = empty.funds
    events.value = empty.events
    navHistory.value = empty.navHistory
    updatedAt.value = empty.updatedAt
    touch()
  }

  watch(
    state,
    (nextState) => {
      if (!hydrated.value) return
      savePortfolio(nextState)
    },
    { deep: true },
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
