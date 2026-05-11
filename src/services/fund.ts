import type { FundNavPoint } from '@/types/portfolio'

declare global {
  interface Window {
    jsonpgz?: (payload: { fundcode?: string; name?: string }) => void
    [key: `fundSearch_${string}`]: ((payload: { Datas?: unknown[] }) => void) | undefined
    Data_netWorthTrend?: Array<{ x: number; y: number }>
    fS_name?: string
    fS_code?: string
  }
}

export type FundInfo = {
  code: string
  name: string
}

type ScoredFundInfo = FundInfo & {
  score: number
}

let queue = Promise.resolve()

function runSequentially<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task)
  queue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function restoreWindowValue(key: string, value: unknown): void {
  ;(window as unknown as Record<string, unknown>)[key] = value
}

function loadScript(src: string, timeoutMs = 8000): Promise<HTMLScriptElement | null> {
  return new Promise((resolve) => {
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => {
      script.remove()
      resolve(null)
    }, timeoutMs)

    script.async = true
    script.src = src
    script.onload = () => {
      window.clearTimeout(timeout)
      resolve(script)
    }
    script.onerror = () => {
      window.clearTimeout(timeout)
      script.remove()
      resolve(null)
    }
    document.head.append(script)
  })
}

function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeFundName(name: string): string {
  return name.replace(/[()\s（）]/g, '').toUpperCase()
}

function getFundShareClass(name: string): string {
  const normalizedName = normalizeFundName(name)
  const match = normalizedName.match(
    /(?:联接|连接|基金|混合|债券|股票|指数|货币|增强|持有期|发起式)?([ABCDEFHIY])$/,
  )
  return match?.[1] ?? ''
}

function stripFundShareClass(name: string): string {
  const normalizedName = normalizeFundName(name)
  const shareClass = getFundShareClass(normalizedName)
  return shareClass ? normalizedName.slice(0, -shareClass.length) : normalizedName
}

function simplifyFundName(name: string): string {
  return stripFundShareClass(name)
    .replace(/证券投资基金|开放式|契约型|发起式|主题|指数型|股票型|混合型|债券型|货币型|基金/g, '')
    .replace(/连接/g, '联接')
}

function charOverlapScore(left: string, right: string): number {
  if (!left || !right) return 0
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const intersection = [...leftSet].filter((char) => rightSet.has(char)).length
  const union = new Set([...leftSet, ...rightSet]).size
  return union > 0 ? intersection / union : 0
}

function scoreFundCandidate(inputName: string, matchedName: string): number {
  const inputClass = getFundShareClass(inputName)
  const matchedClass = getFundShareClass(matchedName)
  if (inputClass && matchedClass && inputClass !== matchedClass) return -Infinity

  const normalizedInput = normalizeFundName(inputName)
  const normalizedMatched = normalizeFundName(matchedName)
  const inputCore = stripFundShareClass(normalizedInput)
  const matchedCore = stripFundShareClass(normalizedMatched)
  const simplifiedInput = simplifyFundName(inputName)
  const simplifiedMatched = simplifyFundName(matchedName)

  let score = 0
  if (normalizedInput === normalizedMatched) score += 100
  if (inputCore === matchedCore) score += 70
  if (simplifiedInput === simplifiedMatched) score += 64
  if (normalizedMatched.includes(normalizedInput) || normalizedInput.includes(normalizedMatched)) {
    score += 42
  }
  if (matchedCore.includes(inputCore) || inputCore.includes(matchedCore)) score += 36
  if (simplifiedMatched.includes(simplifiedInput) || simplifiedInput.includes(simplifiedMatched)) {
    score += 30
  }
  score += charOverlapScore(simplifiedInput, simplifiedMatched) * 32
  if (inputClass && matchedClass === inputClass) score += 24
  if (inputClass && !matchedClass) score -= 8

  return score
}

function toFundInfo(item: unknown): FundInfo | null {
  if (!item || typeof item !== 'object') return null
  const record = item as {
    CODE?: string
    NAME?: string
    FundBaseInfo?: {
      FCODE?: string
      SHORTNAME?: string
    }
  }
  const code = record.CODE ?? record.FundBaseInfo?.FCODE
  const name = record.NAME ?? record.FundBaseInfo?.SHORTNAME
  return code && name ? { code, name } : null
}

function pickBestFund(inputName: string, list: unknown[]): ScoredFundInfo | null {
  return (
    list
      .map(toFundInfo)
      .filter((item): item is FundInfo => Boolean(item))
      .map((item) => ({ ...item, score: scoreFundCandidate(inputName, item.name) }))
      .filter((item) => item.score >= 24)
      .sort((left, right) => right.score - left.score)[0] ?? null
  )
}

async function fetchFundSearchItems(keyword: string): Promise<unknown[]> {
  const key = keyword.trim()
  if (!key) return []

  const callbackName = `fundSearch_${Date.now()}_${Math.random().toString(36).slice(2)}` as const
  const previousCallback = window[callbackName]
  const url =
    'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx' +
    `?callback=${callbackName}&m=9&key=${encodeURIComponent(key)}`

  return runSequentially(
    () =>
      new Promise<unknown[]>((resolve) => {
        const timeout = window.setTimeout(() => {
          restoreWindowValue(callbackName, previousCallback)
          resolve([])
        }, 8000)

        window[callbackName] = (payload) => {
          window.clearTimeout(timeout)
          restoreWindowValue(callbackName, previousCallback)
          resolve(payload.Datas ?? [])
        }

        void loadScript(url).then((script) => {
          script?.remove()
          if (!script) {
            window.clearTimeout(timeout)
            restoreWindowValue(callbackName, previousCallback)
            resolve([])
          }
        })
      }),
  )
}

export async function fetchFundInfo(code: string): Promise<FundInfo | null> {
  const fundCode = code.trim()
  if (!/^\d{6}$/.test(fundCode)) return null

  return runSequentially(
    () =>
      new Promise<FundInfo | null>((resolve) => {
        const previousCallback = window.jsonpgz
        const timeout = window.setTimeout(() => {
          restoreWindowValue('jsonpgz', previousCallback)
          resolve(null)
        }, 8000)

        window.jsonpgz = (payload) => {
          window.clearTimeout(timeout)
          restoreWindowValue('jsonpgz', previousCallback)
          resolve(
            payload.fundcode && payload.name
              ? { code: payload.fundcode, name: payload.name }
              : null,
          )
        }

        void loadScript(`https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`).then(
          (script) => {
            script?.remove()
            if (!script) {
              window.clearTimeout(timeout)
              restoreWindowValue('jsonpgz', previousCallback)
              resolve(null)
            }
          },
        )
      }),
  )
}

export async function searchFundByName(name: string): Promise<FundInfo | null> {
  const fundName = name.trim()
  if (!fundName) return null

  const fullNameBest = pickBestFund(fundName, await fetchFundSearchItems(fundName))
  if (fullNameBest && fullNameBest.score >= 58) return fullNameBest

  const coreName = stripFundShareClass(fundName)
  const coreBest =
    coreName === normalizeFundName(fundName)
      ? null
      : pickBestFund(fundName, await fetchFundSearchItems(coreName))
  const best = [fullNameBest, coreBest]
    .filter((item): item is ScoredFundInfo => Boolean(item))
    .sort((left, right) => right.score - left.score)[0]

  return best && best.score >= 32 ? best : null
}

export async function fetchFundNetWorthTrend(code: string): Promise<FundNavPoint[]> {
  const fundCode = code.trim()
  if (!/^\d{6}$/.test(fundCode)) return []

  return runSequentially(async () => {
    const previousName = window.fS_name
    const previousCode = window.fS_code
    const previousTrend = window.Data_netWorthTrend
    const script = await loadScript(
      `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`,
    )
    const list = window.Data_netWorthTrend ?? []

    script?.remove()
    restoreWindowValue('fS_name', previousName)
    restoreWindowValue('fS_code', previousCode)
    restoreWindowValue('Data_netWorthTrend', previousTrend)

    return list
      .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y) && item.y > 0)
      .map((item) => ({
        date: formatLocalDate(item.x),
        nav: item.y,
      }))
  })
}
