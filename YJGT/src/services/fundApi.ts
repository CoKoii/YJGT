import type { FundTrendPoint } from '@/types'

declare global {
  interface Window {
    Data_netWorthTrend?: Array<{ x: number; y: number; equityReturn?: number }>
  }
}

export async function fetchFundNetWorthTrend(fundCode: string): Promise<FundTrendPoint[]> {
  const code = fundCode.trim()
  if (!/^\d{6}$/.test(code)) return []

  return new Promise((resolve) => {
    const script = document.createElement('script')
    const previous = window.Data_netWorthTrend
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve([])
    }, 8000)

    function cleanup() {
      window.clearTimeout(timeout)
      script.remove()
      window.Data_netWorthTrend = previous
    }

    script.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`
    script.async = true
    script.onload = () => {
      const list = window.Data_netWorthTrend ?? []
      const data = list.slice(-180).map((item) => ({
        date: new Date(item.x).toISOString().slice(0, 10),
        value: item.y,
        growthRate: item.equityReturn,
      }))
      cleanup()
      resolve(data)
    }
    script.onerror = () => {
      cleanup()
      resolve([])
    }
    document.head.append(script)
  })
}
