<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { ProfitSnapshot } from '@/types'

const props = defineProps<{
  history: ProfitSnapshot[]
}>()

const range = ref<'month' | 'quarter'>('month')
const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

const chartHistory = computed(() => props.history.slice(range.value === 'month' ? -30 : -90))

function renderChart() {
  if (!chartRef.value) return
  chart ??= echarts.init(chartRef.value)
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { show: false },
    grid: { left: 42, right: 18, top: 18, bottom: 36 },
    xAxis: {
      type: 'category',
      data: chartHistory.value.map((item) => item.date.slice(5)),
      boundaryGap: false,
    },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    series: [
      {
        name: '我的收益率',
        type: 'line',
        smooth: true,
        data: chartHistory.value.map((item) => item.myProfitRate.toFixed(2)),
        color: '#2563ff',
      },
      {
        name: '博主收益率',
        type: 'line',
        smooth: true,
        data: chartHistory.value.map((item) => item.bloggerProfitRate.toFixed(2)),
        color: '#10a37f',
      },
    ],
  })
}

function resizeChart() {
  chart?.resize()
}

watch(chartHistory, () => nextTick(renderChart), { deep: true })
watch(range, renderChart)

onMounted(async () => {
  await nextTick()
  renderChart()
  window.addEventListener('resize', resizeChart)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
})
</script>

<template>
  <a-card title="近一个月收益趋势" size="small" class="trend-card">
    <template #extra>
      <a-select v-model:value="range" size="small" style="width: 78px">
        <a-select-option value="month">近1月</a-select-option>
        <a-select-option value="quarter">近3月</a-select-option>
      </a-select>
    </template>
    <div ref="chartRef" class="chart"></div>
  </a-card>
</template>
