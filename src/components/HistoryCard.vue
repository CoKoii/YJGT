<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { PortfolioHistoryPoint } from '@/types/portfolio'

const props = defineProps<{
  history: PortfolioHistoryPoint[]
}>()

const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

function color(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function renderChart(): void {
  if (!chartRef.value) return
  chart ??= echarts.init(chartRef.value)
  const history = props.history
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
  () => props.history,
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
    <div ref="chartRef" class="chart"></div>
  </a-card>
</template>
