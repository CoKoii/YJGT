<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { PortfolioHistoryPoint } from '@/types/portfolio'
import { parseLocalDate } from '@/utils/date'

const props = defineProps<{
  history: PortfolioHistoryPoint[]
}>()

type RangeKey = '1m' | '1y'

const chartRef = ref<HTMLDivElement | null>(null)
const range = ref<RangeKey>('1m')
let chart: echarts.ECharts | null = null

function color(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function hasBookValue(point: PortfolioHistoryPoint): boolean {
  return (
    Math.abs(point.myAmount) > 0.01 ||
    Math.abs(point.bloggerAmount) > 0.01 ||
    Math.abs(point.myProfit) > 0.01 ||
    Math.abs(point.bloggerProfit) > 0.01
  )
}

function rangeStartDate(points: PortfolioHistoryPoint[], rangeKey: RangeKey): Date | null {
  const latest = points.at(-1)
  if (!latest) return null
  const start = parseLocalDate(latest.date)
  if (rangeKey === '1m') {
    start.setMonth(start.getMonth() - 1)
  } else {
    start.setFullYear(start.getFullYear() - 1)
  }
  return start
}

const chartHistory = computed(() => {
  const points = props.history.filter(hasBookValue)
  const start = rangeStartDate(points, range.value)
  if (!start) return []
  return points.filter((point) => parseLocalDate(point.date) >= start)
})

function renderChart(): void {
  if (!chartRef.value) return
  chart ??= echarts.init(chartRef.value)
  const history = chartHistory.value
  chart.setOption(
    {
      title:
        history.length === 0
          ? {
              text: '暂无账本历史',
              left: 'center',
              top: 'middle',
              textStyle: { color: color('--text-subtle'), fontSize: 13, fontWeight: 400 },
            }
          : undefined,
      tooltip: { trigger: 'axis' },
      legend: { show: false },
      grid: { left: 10, right: 14, top: 12, bottom: 10, containLabel: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: history.map((item) => item.date),
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: color('--border-soft') } },
      },
      series: [
        {
          name: '我的收益率',
          type: 'line',
          smooth: true,
          data: history.map((item) => item.myProfitRate.toFixed(2)),
          color: color('--brand'),
        },
        {
          name: '博主收益率',
          type: 'line',
          smooth: true,
          data: history.map((item) => item.bloggerProfitRate.toFixed(2)),
          color: '#10a37f',
        },
      ],
    },
    true,
  )
  chart.resize()
}

watch(
  () => [chartHistory.value, range.value],
  async () => {
    await nextTick()
    renderChart()
  },
  { deep: true, immediate: true },
)

onBeforeUnmount(() => {
  chart?.dispose()
})
</script>

<template>
  <a-card title="账本收益曲线" size="small" class="trend-card">
    <template #extra>
      <a-segmented
        v-model:value="range"
        size="small"
        :options="[
          { label: '近一月', value: '1m' },
          { label: '近一年', value: '1y' },
        ]"
      />
    </template>
    <div ref="chartRef" class="chart"></div>
  </a-card>
</template>
