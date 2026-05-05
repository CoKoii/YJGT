<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { DETAIL_TREND_OPTIONS, DEFAULT_DETAIL_CHART_MODE, DEFAULT_TREND_RANGE } from '@/constants/portfolio'
import { fetchFundNetWorthTrend } from '@/services/fundApi'
import type { DetailChartMode, FundTrendPoint, Holding, HoldingOperation, TrendRange } from '@/types'
import {
  buildRateSeriesData,
  filterTrendByRange,
  findNearestTrendPoint,
  getOperationLabel,
  parseHoldingUpdatedDate,
  profitRate,
  toPerformanceTrend,
} from '@/utils/calculations'

const props = defineProps<{
  open: boolean
  holding: Holding | null
  operations: HoldingOperation[]
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

const title = computed(() => (props.holding ? `${props.holding.fundName}（${props.holding.fundCode}）` : '基金详情'))

const relatedOperations = computed(() => {
  if (!props.holding) return []
  return props.operations.filter(
    (item) =>
      item.fundCode === props.holding?.fundCode ||
      item.fromFundCode === props.holding?.fundCode ||
      item.toFundCode === props.holding?.fundCode,
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

  const trend = filterTrendByRange(detailTrend.value, trendRange.value)
  const isPerformanceMode = detailChartMode.value === 'performance'
  const chartPoints = isPerformanceMode ? toPerformanceTrend(trend) : trend
  const myRate = profitRate(props.holding.myAmount, props.holding.myProfit)
  const bloggerRate = profitRate(props.holding.bloggerAmount, props.holding.bloggerProfit)
  const holdingStartDate = parseHoldingUpdatedDate(props.holding.updatedAt)

  const myOperationData = relatedOperations.value
    .filter((item) => item.side === 'mine')
    .map((item) => {
      const point = findNearestTrendPoint(chartPoints, parseHoldingUpdatedDate(item.date))
      return point ? { value: [point.date, Number(myRate.toFixed(2))], label: getOperationLabel(item.type) } : null
    })
    .filter(Boolean)

  const bloggerOperationData = relatedOperations.value
    .filter((item) => item.side === 'blogger')
    .map((item) => {
      const point = findNearestTrendPoint(chartPoints, parseHoldingUpdatedDate(item.date))
      return point ? { value: [point.date, Number(bloggerRate.toFixed(2))], label: getOperationLabel(item.type) } : null
    })
    .filter(Boolean)

  const operationSeries = isPerformanceMode
    ? [
        {
          name: '我的操作点',
          type: 'scatter',
          symbolSize: 14,
          silent: true,
          label: {
            show: true,
            formatter: ({ data }: { data?: { label?: string } }) => data?.label ?? '',
            position: 'right',
            color: '#2563ff',
            fontWeight: 700,
          },
          data: myOperationData,
          color: '#2563ff',
        },
        {
          name: '博主操作点',
          type: 'scatter',
          symbolSize: 14,
          silent: true,
          label: {
            show: true,
            formatter: ({ data }: { data?: { label?: string } }) => data?.label ?? '',
            position: 'right',
            color: '#10a37f',
            fontWeight: 700,
          },
          data: bloggerOperationData,
          color: '#10a37f',
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
          color: '#64748b',
        },
        {
          name: '我的收益率',
          type: 'line',
          smooth: true,
          data: buildRateSeriesData(chartPoints, holdingStartDate, myRate),
          color: '#2563ff',
        },
        {
          name: '博主收益率',
          type: 'line',
          smooth: true,
          data: buildRateSeriesData(chartPoints, holdingStartDate, bloggerRate),
          color: '#10a37f',
        },
        ...operationSeries,
      ]
    : [
        {
          name: '基金净值',
          type: 'line',
          smooth: true,
          data: chartPoints.map((item) => item.value.toFixed(4)),
          color: '#64748b',
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
              textStyle: { color: '#94a3b8', fontSize: 14, fontWeight: 400 },
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
              const suffix = data.seriesName?.includes('收益率') || data.seriesName === '业绩走势' ? '%' : ''
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
        axisLabel: {
          hideOverlap: true,
          formatter: (value: string) => value.slice(5),
        },
      },
      yAxis: isPerformanceMode
        ? { type: 'value', name: '收益率', axisLabel: { formatter: '{value}%' } }
        : { type: 'value', name: '净值', scale: true },
      series,
    },
    true,
  )
  chart.resize()
}

watch(() => props.open, (open) => {
  if (open) void loadDetailTrend()
})
watch(() => props.holding?.id, () => {
  if (props.open) void loadDetailTrend()
})
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
