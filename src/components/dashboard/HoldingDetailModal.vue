<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import {
  DETAIL_TREND_OPTIONS,
  DEFAULT_DETAIL_CHART_MODE,
  DEFAULT_TREND_RANGE,
} from '@/constants/portfolio'
import { fetchFundNetWorthTrend } from '@/services/fund'
import { buildHoldingPerformanceHistory } from '@/utils/portfolioLedger'
import type {
  DetailChartMode,
  FundTrendPoint,
  Holding,
  HoldingOperation,
  HoldingProfitSnapshot,
  TrendRange,
} from '@/types'
import {
  filterTrendByRange,
  findNearestTrendPoint,
  getOperationLabel,
  getOperationTargetFund,
  toPerformanceTrend,
} from '@/utils/calculations'

const props = defineProps<{
  open: boolean
  holding: Holding | null
  operations: HoldingOperation[]
  holdingHistory: HoldingProfitSnapshot[]
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

const chartRef = ref<HTMLDivElement | null>(null)
const trendRange = ref<TrendRange>(DEFAULT_TREND_RANGE)
const detailChartMode = ref<DetailChartMode>(DEFAULT_DETAIL_CHART_MODE)
const detailTrend = ref<FundTrendPoint[]>([])
const isTrendLoading = ref(false)
let chart: echarts.ECharts | null = null
const MY_CHART_COLOR = '--brand'
const BLOGGER_COLOR = '#10a37f'

function getChartColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function createRateMap(
  storedHistory: HoldingProfitSnapshot[],
  fallbackHistory: Array<{ date: string; rate: number | null }>,
  key: 'myProfitRate' | 'bloggerProfitRate',
) {
  return new Map(
    (storedHistory.length > 0
      ? storedHistory.map((item) => [item.date, item[key]])
      : fallbackHistory.map((item) => [item.date, item.rate])) as Array<[string, number | null]>,
  )
}

const title = computed(() =>
  props.holding ? `${props.holding.fundName}（${props.holding.fundCode}）` : '基金详情',
)

const relatedOperations = computed(() => {
  if (!props.holding) return []
  return props.operations.filter(
    (item) =>
      item.fundCode === props.holding?.fundCode ||
      getOperationTargetFund(item)?.code === props.holding?.fundCode,
  )
})

async function loadDetailTrend() {
  if (!props.open || !props.holding) return
  isTrendLoading.value = true
  try {
    detailTrend.value = await fetchFundNetWorthTrend(props.holding.fundCode)
  } finally {
    isTrendLoading.value = false
  }
  await nextTick()
  renderChart()
}

function renderChart() {
  if (!chartRef.value || !props.holding) return
  chart ??= echarts.init(chartRef.value)
  const currentHolding = props.holding
  const brandColor = getChartColor(MY_CHART_COLOR)

  const trend = filterTrendByRange(detailTrend.value, trendRange.value)
  const isPerformanceMode = detailChartMode.value === 'performance'
  const chartPoints = isPerformanceMode ? toPerformanceTrend(trend) : trend
  const storedHistory = props.holdingHistory
    .filter((item) => item.fundCode === currentHolding.fundCode)
    .sort((left, right) => left.date.localeCompare(right.date))
  const settledOperations = relatedOperations.value.filter((item) => item.status === 'settled')
  const fallbackMyHistory = buildHoldingPerformanceHistory(
    currentHolding,
    settledOperations,
    trend,
    'mine',
  )
  const fallbackBloggerHistory = buildHoldingPerformanceHistory(
    currentHolding,
    settledOperations,
    trend,
    'blogger',
  )
  const myRateByDate = createRateMap(storedHistory, fallbackMyHistory, 'myProfitRate')
  const bloggerRateByDate = createRateMap(
    storedHistory,
    fallbackBloggerHistory,
    'bloggerProfitRate',
  )
  const mySeriesData = chartPoints.map((item) => myRateByDate.get(item.date) ?? null)
  const bloggerSeriesData = chartPoints.map((item) => bloggerRateByDate.get(item.date) ?? null)

  const operationData = relatedOperations.value
    .flatMap((item) => {
      const point = findNearestTrendPoint(chartPoints, item.tradeDate)
      if (!point) return []

      const points = [
        {
          value: myRateByDate.get(point.date),
          label: `我${getOperationLabel(item.type)}`,
          color: brandColor,
        },
        {
          value: bloggerRateByDate.get(point.date),
          label: `博主${getOperationLabel(item.type)}`,
          color: BLOGGER_COLOR,
        },
      ]

      return points
        .filter((operationPoint) => typeof operationPoint.value === 'number')
        .map((operationPoint) => ({
          value: [point.date, operationPoint.value as number],
          label: operationPoint.label,
          itemStyle: { color: operationPoint.color },
          labelStyle: { color: operationPoint.color },
        }))
    })

  const operationSeries = isPerformanceMode
    ? [
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
            color: brandColor,
          },
          data: operationData,
        },
      ]
    : []

  const series = isPerformanceMode
    ? [
        {
          name: '业绩走势',
          type: 'line',
          smooth: true,
          data: chartPoints.map((item) => item.value.toFixed(2)),
          color: getChartColor('--text-muted'),
        },
        {
          name: '我的收益率',
          type: 'line',
          smooth: true,
          connectNulls: false,
          showSymbol: true,
          data: mySeriesData,
          color: brandColor,
        },
        {
          name: '博主收益率',
          type: 'line',
          smooth: true,
          connectNulls: false,
          showSymbol: true,
          data: bloggerSeriesData,
          color: BLOGGER_COLOR,
        },
        ...operationSeries,
      ]
    : [
        {
          name: '基金净值',
          type: 'line',
          smooth: true,
          data: chartPoints.map((item) => item.value.toFixed(4)),
          color: getChartColor('--text-muted'),
        },
      ]

  chart.setOption(
    {
      title:
        chartPoints.length === 0
          ? {
              text: isPerformanceMode ? '暂无走势数据' : '暂无净值数据',
              left: 'center',
              top: 'middle',
              textStyle: { color: getChartColor('--text-subtle'), fontSize: 14, fontWeight: 400 },
            }
          : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [params]
          return items
            .filter((item) => !(item as { seriesName?: string }).seriesName?.includes('操作点'))
            .map((item) => {
              const data = item as {
                marker?: string
                seriesName?: string
                value?: number | string | Array<number | string>
              }
              const value = Array.isArray(data.value) ? data.value.at(-1) : data.value
              const suffix =
                data.seriesName?.includes('收益率') || data.seriesName === '业绩走势' ? '%' : ''
              const formattedValue = typeof value === 'number' ? value.toFixed(2) : value
              return `${data.marker ?? ''}${data.seriesName ?? ''}: ${formattedValue ?? ''}${suffix}`
            })
            .join('<br/>')
        },
      },
      legend: {
        top: 0,
        data: isPerformanceMode ? ['业绩走势', '我的收益率', '博主收益率'] : ['基金净值'],
      },
      grid: { left: 48, right: 48, top: 48, bottom: 42, containLabel: true },
      xAxis: {
        type: 'category',
        data: chartPoints.map((item) => item.date),
        boundaryGap: false,
        axisLine: { lineStyle: { color: getChartColor('--border-base') } },
        axisLabel: {
          color: getChartColor('--text-muted'),
          hideOverlap: true,
          formatter: (value: string) => value.slice(5),
        },
      },
      yAxis: isPerformanceMode
        ? {
            type: 'value',
            name: '收益率',
            axisLabel: { formatter: '{value}%', color: getChartColor('--text-muted') },
            splitLine: { lineStyle: { color: getChartColor('--border-soft') } },
          }
        : {
            type: 'value',
            name: '净值',
            scale: true,
            axisLabel: { color: getChartColor('--text-muted') },
            splitLine: { lineStyle: { color: getChartColor('--border-soft') } },
          },
      series,
    },
    true,
  )
  chart.resize()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadDetailTrend()
    }
  },
)
watch(
  () => props.holding?.id,
  () => {
    if (props.open) void loadDetailTrend()
  },
)
watch(
  () => [props.holding?.myNavDate, props.holding?.myProfit, props.holding?.myYesterdayProfit],
  renderChart,
)
watch(
  () => [
    props.holding?.bloggerNavDate,
    props.holding?.bloggerProfit,
    props.holding?.bloggerYesterdayProfit,
  ],
  renderChart,
)
watch(relatedOperations, renderChart, { deep: true })
watch([trendRange, detailChartMode], renderChart)

onUnmounted(() => {
  chart?.dispose()
})
</script>

<template>
  <a-modal
    :open="open"
    centered
    width="960px"
    :footer="null"
    :title="title"
    @update:open="emit('update:open', $event)"
  >
    <a-row justify="space-between" align="middle" class="detail-head">
      <a-col>
        <a-typography-text type="secondary">基金业绩走势与跟投收益曲线</a-typography-text>
      </a-col>
      <a-col>
        <a-space>
          <a-segmented
            v-model:value="detailChartMode"
            :options="[
              { label: '业绩走势', value: 'performance' },
              { label: '净值曲线', value: 'netWorth' },
            ]"
          />
          <a-segmented v-model:value="trendRange" :options="DETAIL_TREND_OPTIONS" />
        </a-space>
      </a-col>
    </a-row>
    <a-spin :spinning="isTrendLoading">
      <div ref="chartRef" class="detail-chart"></div>
    </a-spin>
  </a-modal>
</template>
