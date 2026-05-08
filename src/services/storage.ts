import {
  AI_CHAT_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  DEFAULT_BUDGET,
  PORTFOLIO_SCHEMA_VERSION,
  STORAGE_KEY,
} from '@/constants/portfolio'
import { normalizePortfolioState } from '@/domain/portfolio'
import type { AiChatMessage, PortfolioState } from '@/types'

const PORTFOLIO_DB_NAME = 'yjgt-db'
const PORTFOLIO_STORE_NAME = 'app_state'
const PORTFOLIO_RECORD_KEY = 'portfolio'

function parseStorageItem<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

export function createEmptyPortfolioState(): PortfolioState {
  return {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    budget: { ...DEFAULT_BUDGET },
    aiConfig: { ...DEFAULT_AI_CONFIG },
    funds: [],
    positions: [],
    operations: [],
    navHistory: [],
    updatedAt: '',
  }
}

function openPortfolioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PORTFOLIO_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PORTFOLIO_STORE_NAME)) {
        db.createObjectStore(PORTFOLIO_STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('打开 IndexedDB 失败'))
  })
}

function runPortfolioTransaction<T>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void,
): Promise<T> {
  return openPortfolioDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(PORTFOLIO_STORE_NAME, mode)
        const store = transaction.objectStore(PORTFOLIO_STORE_NAME)
        const rejectWithError = (error: Error) => reject(error)

        transaction.oncomplete = () => db.close()
        transaction.onabort = () => {
          db.close()
          reject(transaction.error ?? new Error('IndexedDB 事务中止'))
        }
        transaction.onerror = () => {
          db.close()
          reject(transaction.error ?? new Error('IndexedDB 事务失败'))
        }

        executor(store, resolve, rejectWithError)
      }),
  )
}

export async function loadPortfolio(): Promise<PortfolioState> {
  try {
    const stored = await runPortfolioTransaction<PortfolioState | null>('readonly', (store, resolve, reject) => {
      const request = store.get(PORTFOLIO_RECORD_KEY)
      request.onsuccess = () => resolve((request.result as PortfolioState | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error('读取组合数据失败'))
    })

    return normalizePortfolioState(stored ?? createEmptyPortfolioState())
  } catch {
    return createEmptyPortfolioState()
  }
}

export function savePortfolio(data: PortfolioState): Promise<void> {
  return runPortfolioTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(data, PORTFOLIO_RECORD_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('保存组合数据失败'))
  })
}

export function clearLegacyPortfolioStorage(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function loadAiChatMessages(): AiChatMessage[] {
  return parseStorageItem<AiChatMessage[]>(AI_CHAT_STORAGE_KEY) ?? []
}

export function saveAiChatMessages(messages: AiChatMessage[]): void {
  localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages))
}
