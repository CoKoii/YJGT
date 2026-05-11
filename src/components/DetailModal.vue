<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { FundNavPoint, HoldingRow, Trade } from '@/types/portfolio'
import { parseLocalDate } from '@/utils/date'

const props = defineProps<{
  open: boolean
  holding: HoldingRow | null
  navPoints: FundNavPoint[]
  events: Trade[]
}>()

defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

type ChartMode = 'performance' | 'netWorth'
type TrendRange = 'month' | 'quarter' | 'half' | 'year' | 'ytd' | 'all'

const chartRef = ref<HTMLDivElement | null>(null)
const chartMode = ref<ChartMode>('performance')
const trendRange = ref<TrendRange>('month')
let chart: echarts.ECharts | null = null

const title = computed(() =>
  props.holding ? `${props.holding.fundName}（${props.holding.fundCode}）` : '持仓详情',
)

const trendOptions = [
  { label: '近1月', value: 'month' },
  { label: '近3月', value: 'quarter' },
  { label: '近6月', value: 'half' },
  { label: '近1年', value: 'year' },
  { label: '今年来', value: 'ytd' },
  { label: '成立以来', value: 'all' },
] as const

function color(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function filterTrendByRange(points: FundNavPoint[], range: TrendRange): FundNavPoint[] {
  const latestPoint = points.at(-1)
  if (!latestPoint || range === 'all') return points

  const latest = parseLocalDate(latestPoint.date)
  const start = new Date(latest)

  if (range === 'month') start.setMonth(start.getMonth() - 1)
  else if (range === 'quarter') start.setMonth(start.getMonth() - 3)
  else if (range === 'half') start.setMonth(start.getMonth() - 6)
  else if (range === 'year') start.setFullYear(start.getFullYear() - 1)
  else start.setMonth(0, 1)

  return points.filter((item) => parseLocalDate(item.date) >= start)
}

function toPerformanceTrend(points: FundNavPoint[]): Array<{ date: string; value: number }> {
  const baseNav = points.find((item) => item.nav > 0)?.nav
  if (!baseNav) return []
  return points.map((item) => ({
    date: item.date,
    value: ((item.nav - baseNav) / baseNav) * 100,
  }))
}

function tradeLabel(type: Trade['type']): string {
  if (type === 'buy') return '买'
  if (type === 'sell') return '卖'
  return '转'
}

function nearestChartDate(points: Array<{ date: string; value: number }>, date: string): string | null {
  return points.find((item) => item.date >= date)?.date ?? points.at(-1)?.date ?? null
}

function renderChart(): void {
  if (!chartRef.value) return
  chart ??= echarts.init(chartRef.value)
  const trend = filterTrendByRange(props.navPoints, trendRange.value)
  const isPerformanceMode = chartMode.value === 'performance'
  const chartPoints = isPerformanceMode
    ? toPerformanceTrend(trend)
    : trend.map((item) => ({ date: item.date, value: item.nav }))
  const settledEvents = props.events.filter(
    (event) =>
      props.holding &&
      event.kind === 'trade' &&
      event.status === 'settled' &&
      (event.fundCode === props.holding.fundCode ||
        (event.type === 'convert' && event.targetFundCode === props.holding.fundCode)),
  )
  const operationData = isPerformanceMode
    ? settledEvents.flatMap((event) => {
        const date = nearestChartDate(chartPoints, event.tradeDate)
        if (!date) return []
        return [
          {
            value: [date, props.holding?.myProfitRate.toFixed(2)],
            label: tradeLabel(event.type),
            itemStyle: { color: color('--brand') },
          },
          {
            value: [date, props.holding?.bloggerProfitRate.toFixed(2)],
            label: tradeLabel(event.type),
            itemStyle: { color: '#10a37f' },
          },
        ]
      })
    : []
  chart.setOption(
    {
      title:
        chartPoints.length === 0
          ? {
              text: isPerformanceMode ? '暂无走势数据' : '暂无净值数据',
              left: 'center',
              top: 'middle',
              textStyle: { color: color('--text-subtle'), fontSize: 13, fontWeight: 400 },
            }
          : undefined,
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: unknown) => {
          const numeric = Number(value)
          if (!Number.isFinite(numeric)) return String(value ?? '')
          return isPerformanceMode ? `${numeric.toFixed(2)}%` : numeric.toFixed(4)
        },
      },
      legend: isPerformanceMode
        ? { top: 0, data: ['业绩走势', '我的收益率快照', '博主收益率快照'] }
        : { top: 0, data: ['基金净值'] },
      grid: { left: 48, right: 24, top: 48, bottom: 36, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: chartPoints.map((item) => item.date),
        axisLabel: { color: color('--text-muted'), formatter: (value: string) => value.slice(5) },
        axisLine: { lineStyle: { color: color('--border-base') } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        name: isPerformanceMode ? '收益率' : '净值',
        axisLabel: {
          color: color('--text-muted'),
          formatter: isPerformanceMode ? '{value}%' : '{value}',
        },
        splitLine: { lineStyle: { color: color('--border-soft') } },
      },
      series: isPerformanceMode
        ? [
            {
              name: '业绩走势',
              type: 'line',
              smooth: true,
              data: chartPoints.map((item) => item.value.toFixed(2)),
              color: color('--text-muted'),
            },
            {
              name: '我的收益率快照',
              type: 'scatter',
              symbolSize: 10,
              data: props.holding?.latestNavDate
                ? [[props.holding.latestNavDate, props.holding.myProfitRate.toFixed(2)]]
                : [],
              color: color('--brand'),
            },
            {
              name: '博主收益率快照',
              type: 'scatter',
              symbolSize: 10,
              data: props.holding?.latestNavDate
                ? [[props.holding.latestNavDate, props.holding.bloggerProfitRate.toFixed(2)]]
                : [],
              color: '#10a37f',
            },
            {
              name: '操作点',
              type: 'scatter',
              symbolSize: 14,
              silent: true,
              label: {
                show: true,
                formatter: ({ data }: { data?: { label?: string } }) => data?.label ?? '',
                position: 'right',
                fontWeight: 700,
                color: color('--brand'),
              },
              data: operationData,
            },
          ]
        : [
            {
              name: '基金净值',
              type: 'line',
              smooth: true,
              data: chartPoints.map((item) => item.value.toFixed(4)),
              color: color('--brand'),
            },
          ],
    },
    true,
  )
  chart.resize()
}

function renderChartAfterLayout(): void {
  void nextTick(() => {
    requestAnimationFrame(() => {
      renderChart()
    })
  })
}

watch(
  () => [props.open, props.holding?.fundCode, props.navPoints.length, chartMode.value, trendRange.value],
  ([open]) => {
    if (!open) return
    renderChartAfterLayout()
  },
  { immediate: true },
)

watch(
  () => props.navPoints,
  () => {
    if (props.open) renderChartAfterLayout()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  chart?.dispose()
})
</script>

<template>
  <a-modal
    :open="open"
    centered
    width="940px"
    :footer="null"
    :title="title"
    @update:open="$emit('update:open', $event)"
  >
    <a-row justify="space-between" align="middle" class="detail-head">
      <a-col>
        <a-typography-text type="secondary">基金业绩走势与跟投收益曲线</a-typography-text>
      </a-col>
      <a-col>
        <a-space>
          <a-segmented
            v-model:value="chartMode"
            :options="[
              { label: '业绩走势', value: 'performance' },
              { label: '净值曲线', value: 'netWorth' },
            ]"
          />
          <a-segmented v-model:value="trendRange" :options="trendOptions" />
        </a-space>
      </a-col>
    </a-row>
    <div ref="chartRef" class="detail-chart"></div>
  </a-modal>
</template>
