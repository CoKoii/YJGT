<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import {
  BarChartOutlined,
  BulbOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { usePortfolioStore } from '@/stores/portfolio'
import type { FundTrendPoint, Holding, InvestorSide, RecognizedHolding } from '@/types'
import {
  actualInvested,
  clampPercent,
  csvEscape,
  formatMoney,
  formatPercent,
  followRatio,
  holdingRatio,
  profitRate,
} from '@/utils/calculations'
import { fetchFundNetWorthTrend } from '@/services/fundApi'
import { recognizeHoldingImage } from '@/services/aiRecognition'

const store = usePortfolioStore()

const isHoldingModalOpen = ref(false)
const isAiModalOpen = ref(false)
const isBudgetModalOpen = ref(false)
const isDetailModalOpen = ref(false)
const selectedHoldingId = ref<string | null>(null)
const selectedRange = ref<'day' | 'month'>('day')
const trendRange = ref<'month' | 'quarter' | 'half'>('month')
const isRecognizing = ref(false)
const imageDataUrl = ref('')
const recognizedRows = ref<RecognizedHolding[]>([])
const detailTrend = ref<FundTrendPoint[]>([])
const isTrendLoading = ref(false)
const holdingChartRef = ref<HTMLDivElement | null>(null)
const detailChartRef = ref<HTMLDivElement | null>(null)
let holdingChart: echarts.ECharts | null = null
let detailChart: echarts.ECharts | null = null

const emptyHolding = {
  fundName: '',
  fundCode: '',
  myAmount: 0,
  myProfit: 0,
  myYesterdayProfit: 0,
  bloggerAmount: 0,
  bloggerProfit: 0,
  bloggerYesterdayProfit: 0,
}

const holdingForm = reactive({ ...emptyHolding, id: '' })
const budgetForm = reactive({ ...store.budget })
const aiSide = ref<InvestorSide>('mine')

const selectedHolding = computed(() => {
  return store.holdings.find((item) => item.id === selectedHoldingId.value) ?? store.holdings[0]
})

const ratio = computed(() => followRatio(store.budget))
const shouldInvest = computed(() => store.totals.bloggerInvested / Math.max(ratio.value.blogger, 1))
const remainingInvest = computed(() => Math.max(shouldInvest.value - store.totals.myInvested, 0))
const budgetUsage = computed(() => ({
  mine: clampPercent((store.totals.myInvested / store.budget.myBudget) * 100),
  blogger: clampPercent((store.totals.bloggerInvested / store.budget.bloggerBudget) * 100),
}))
const followProgress = computed(() => clampPercent((store.totals.myInvested / shouldInvest.value) * 100))

const holdingRows = computed(() =>
  store.holdings.map((item) => ({
    ...item,
    myInvested: actualInvested(item.myAmount, item.myProfit),
    bloggerInvested: actualInvested(item.bloggerAmount, item.bloggerProfit),
    myRate: profitRate(item.myAmount, item.myProfit),
    bloggerRate: profitRate(item.bloggerAmount, item.bloggerProfit),
    ratio: holdingRatio(item),
  })),
)

function openBudgetModal() {
  Object.assign(budgetForm, store.budget)
  isBudgetModalOpen.value = true
}

function saveBudget() {
  store.budget = { ...budgetForm }
  isBudgetModalOpen.value = false
  message.success('预算已更新')
}

function openCreateModal() {
  Object.assign(holdingForm, { ...emptyHolding, id: '' })
  isHoldingModalOpen.value = true
}

function openEditModal(record: Holding) {
  Object.assign(holdingForm, record)
  isHoldingModalOpen.value = true
}

function saveHolding() {
  if (!holdingForm.fundName || !/^\d{6}$/.test(holdingForm.fundCode)) {
    message.warning('请填写基金名称和 6 位基金代码')
    return
  }

  store.upsertHolding({ ...holdingForm, id: holdingForm.id || undefined })
  isHoldingModalOpen.value = false
  message.success('持仓已保存')
}

function removeHolding(record: Holding) {
  Modal.confirm({
    title: '删除持仓',
    content: `确认删除 ${record.fundName}？`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      store.removeHolding(record.id)
      if (selectedHoldingId.value === record.id) {
        selectedHoldingId.value = store.holdings[0]?.id ?? null
      }
      message.success('已删除')
    },
  })
}

async function openDetailModal(record: Holding) {
  selectedHoldingId.value = record.id
  isDetailModalOpen.value = true
  await nextTick()
  await loadDetailTrend()
}

function handleDetailOpenChange(open: boolean) {
  if (open) loadDetailTrend()
}

function beforeUpload(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    imageDataUrl.value = String(reader.result)
  }
  reader.readAsDataURL(file)
  return false
}

async function runRecognition() {
  if (!imageDataUrl.value) {
    message.warning('请先上传截图')
    return
  }

  isRecognizing.value = true
  try {
    recognizedRows.value = await recognizeHoldingImage(store.aiConfig, imageDataUrl.value)
    message.success(`识别到 ${recognizedRows.value.length} 条持仓`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '识别失败')
  } finally {
    isRecognizing.value = false
  }
}

function applyRecognized() {
  recognizedRows.value.forEach((row) => store.applyRecognizedHolding(aiSide.value, row))
  isAiModalOpen.value = false
  message.success('识别结果已写入持仓')
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportJson() {
  download(`yjgt-${Date.now()}.json`, store.exportJson(), 'application/json;charset=utf-8')
}

function exportCsv() {
  const header = [
    '基金名称',
    '基金代码',
    '我的持有金额',
    '我的持有收益',
    '博主持有金额',
    '博主持有收益',
    '我的收益率',
    '博主收益率',
  ]
  const rows = holdingRows.value.map((item) =>
    [
      item.fundName,
      item.fundCode,
      item.myAmount,
      item.myProfit,
      item.bloggerAmount,
      item.bloggerProfit,
      item.myRate.toFixed(2),
      item.bloggerRate.toFixed(2),
    ].map(csvEscape),
  )
  download(`yjgt-${Date.now()}.csv`, [header, ...rows].map((row) => row.join(',')).join('\n'), 'text/csv')
}

function renderHoldingChart() {
  if (!holdingChartRef.value) return
  holdingChart ??= echarts.init(holdingChartRef.value)
  holdingChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: ['我的收益率', '博主收益率'] },
    grid: { left: 42, right: 18, top: 46, bottom: 36 },
    xAxis: {
      type: 'category',
      data: store.history.slice(-10).map((item) => item.date.slice(5)),
      boundaryGap: false,
    },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
    series: [
      {
        name: '我的收益率',
        type: 'line',
        smooth: true,
        data: store.history.slice(-10).map((item) => item.myProfitRate.toFixed(2)),
        color: '#2563ff',
      },
      {
        name: '博主收益率',
        type: 'line',
        smooth: true,
        data: store.history.slice(-10).map((item) => item.bloggerProfitRate.toFixed(2)),
        color: '#10a37f',
      },
    ],
  })
}

async function loadDetailTrend() {
  if (!selectedHolding.value || !isDetailModalOpen.value) return
  isTrendLoading.value = true
  detailTrend.value = await fetchFundNetWorthTrend(selectedHolding.value.fundCode)
  if (detailTrend.value.length === 0) {
    detailTrend.value = store.history.map((item, index) => ({
      date: item.date,
      value: 1 + index * 0.008 + Math.sin(index / 2.8) * 0.025,
    }))
  }
  isTrendLoading.value = false
  await nextTick()
  renderDetailChart()
}

function renderDetailChart() {
  if (!detailChartRef.value || !selectedHolding.value) return
  detailChart ??= echarts.init(detailChartRef.value)
  const trend = detailTrend.value.slice(trendRange.value === 'month' ? -30 : trendRange.value === 'quarter' ? -90 : -180)
  const holding = selectedHolding.value
  detailChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: ['基金净值', '我的收益率', '博主收益率'] },
    grid: { left: 48, right: 24, top: 48, bottom: 38 },
    xAxis: {
      type: 'category',
      data: trend.map((item) => item.date.slice(5)),
      boundaryGap: false,
    },
    yAxis: [
      { type: 'value', name: '净值', scale: true },
      { type: 'value', name: '收益率', axisLabel: { formatter: '{value}%' } },
    ],
    series: [
      {
        name: '基金净值',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: trend.map((item) => item.value),
        color: '#64748b',
      },
      {
        name: '我的收益率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: trend.map((_, index) =>
          (profitRate(holding.myAmount, holding.myProfit) * ((index + 1) / trend.length)).toFixed(2),
        ),
        color: '#2563ff',
      },
      {
        name: '博主收益率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: trend.map((_, index) =>
          (profitRate(holding.bloggerAmount, holding.bloggerProfit) * ((index + 1) / trend.length)).toFixed(2),
        ),
        color: '#10a37f',
      },
    ],
  })
}

watch(
  () => store.history,
  () => nextTick(renderHoldingChart),
  { deep: true },
)
watch(selectedHolding, () => {
  if (isDetailModalOpen.value) loadDetailTrend()
})
watch(trendRange, renderDetailChart)

onMounted(async () => {
  selectedHoldingId.value = store.holdings[0]?.id ?? null
  await nextTick()
  renderHoldingChart()
  window.addEventListener('resize', () => {
    holdingChart?.resize()
    detailChart?.resize()
  })
})
</script>

<template>
  <a-config-provider
    :theme="{
      token: {
        colorPrimary: '#2563ff',
        borderRadius: 8,
        colorText: '#172554',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif',
      },
    }"
  >
    <a-layout class="app-shell" style="background: #f7f9fc">
      <a-layout-header class="page-header" style="background: transparent">
        <a-row align="middle" justify="space-between" :wrap="false">
          <a-col>
            <a-space align="center" :size="12">
              <span class="brand-icon"><BarChartOutlined /></span>
              <span class="brand-title">跟投助手</span>
            </a-space>
          </a-col>
          <a-col>
            <a-space>
              <a-button type="text" shape="circle"><BulbOutlined /></a-button>
              <a-button type="text" @click="openBudgetModal"><SettingOutlined />设置</a-button>
            </a-space>
          </a-col>
        </a-row>
      </a-layout-header>

      <a-layout-content>
        <a-space direction="vertical" :size="12" class="page-stack main-stack">
          <a-card class="overview-panel" :body-style="{ padding: '14px 16px' }">
            <a-row :gutter="[32, 14]">
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">博主总预算（元）</div>
                <a-input-number
                  v-model:value="store.budget.bloggerBudget"
                  class="overview-input"
                  :min="0"
                  :precision="2"
                  :controls="false"
                />
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">当前博主总投入（元）</div>
                <div class="overview-value">{{ formatMoney(store.totals.bloggerInvested) }}</div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">博主仓位占比</div>
                <div class="overview-value">{{ budgetUsage.blogger.toFixed(2) }}%</div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">博主仓位 : 我的仓位</div>
                <div class="overview-value">{{ ratio.blogger || 0 }} : {{ ratio.mine || 0 }}</div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">我的总预算（元）</div>
                <a-input-number
                  v-model:value="store.budget.myBudget"
                  class="overview-input"
                  :min="0"
                  :precision="2"
                  :controls="false"
                />
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">当前我的总投入（元）</div>
                <div class="overview-value">{{ formatMoney(store.totals.myInvested) }}</div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">我的仓位占比</div>
                <div class="overview-value">
                  {{ budgetUsage.mine.toFixed(2) }}%
                  <span
                    v-if="Math.abs(budgetUsage.mine - budgetUsage.blogger) > 0.01"
                    class="trend-mark"
                    :class="budgetUsage.mine > budgetUsage.blogger ? 'red' : 'green'"
                  >
                    {{ budgetUsage.mine > budgetUsage.blogger ? '↑' : '↓' }}
                  </span>
                </div>
              </a-col>
              <a-col :xs="24" :md="12" :xl="6">
                <div class="overview-label">我应投入总金额（元）</div>
                <div class="overview-value">{{ formatMoney(shouldInvest) }}</div>
              </a-col>
            </a-row>
          </a-card>

          <a-row :gutter="[12, 12]" align="stretch" class="content-row">
            <a-col :xs="24" :xl="19">
              <section class="portfolio-panel">
                <a-row class="portfolio-toolbar" align="middle" justify="space-between" :gutter="[12, 8]">
                  <a-col>
                    <a-space :size="16" wrap>
                    <span>持仓列表</span>
                    <a-typography-text type="secondary">总资产（按我的投入）</a-typography-text>
                    <a-typography-text strong>{{ formatMoney(store.totals.myAmount) }}</a-typography-text>
                    <a-typography-text type="secondary">总盈亏</a-typography-text>
                    <a-typography-text strong :class="store.totals.myProfit >= 0 ? 'red' : 'green'">
                      {{ formatMoney(store.totals.myProfit) }}（{{ formatPercent(store.totals.myProfitRate) }}）
                    </a-typography-text>
                  </a-space>
                  </a-col>
                  <a-col>
                  <a-space wrap>
                    <a-button type="primary" @click="openCreateModal"><PlusOutlined />新增持仓</a-button>
                    <a-button @click="isAiModalOpen = true"><RobotOutlined />AI 识别</a-button>
                    <a-button @click="selectedHolding && openDetailModal(selectedHolding)">
                      <BarChartOutlined />收益分析
                    </a-button>
                    <a-dropdown>
                      <a-button><DownloadOutlined />导出数据</a-button>
                      <template #overlay>
                        <a-menu>
                          <a-menu-item @click="exportJson">导出 JSON</a-menu-item>
                          <a-menu-item @click="exportCsv">导出 CSV</a-menu-item>
                        </a-menu>
                      </template>
                    </a-dropdown>
                  </a-space>
                  </a-col>
                </a-row>
                <div class="vxe-wrap">
                  <vxe-table
                    :data="holdingRows"
                    :column-config="{ resizable: true }"
                    :row-config="{ isHover: true }"
                    auto-resize
                    border="inner"
                    height="100%"
                    show-overflow
                  >
                    <vxe-column title="基金名称" field="fundName" min-width="180" fixed="left">
                      <template #default="{ row }">
                        <button class="link-button" @click.stop="openDetailModal(row)">
                          <strong>{{ row.fundName }}</strong>
                          <span>{{ row.fundCode }}</span>
                        </button>
                      </template>
                    </vxe-column>
                    <vxe-column title="仓位对比（我 : 博主）" min-width="170" align="center">
                      <template #default="{ row }">
                        <a-tag color="blue">1 : {{ row.ratio.blogger }}</a-tag>
                      </template>
                    </vxe-column>
                    <vxe-column title="我的投入" min-width="130" align="right">
                      <template #default="{ row }">{{ formatMoney(row.myInvested) }}</template>
                    </vxe-column>
                    <vxe-column title="博主投入" min-width="130" align="right">
                      <template #default="{ row }">{{ formatMoney(row.bloggerInvested) }}</template>
                    </vxe-column>
                    <vxe-column title="我的盈亏" min-width="130" align="right">
                      <template #default="{ row }">
                        <span :class="row.myProfit >= 0 ? 'red' : 'green'">{{ formatMoney(row.myProfit) }}</span>
                      </template>
                    </vxe-column>
                    <vxe-column title="我的收益率" min-width="120" align="right">
                      <template #default="{ row }">
                        <span :class="row.myRate >= 0 ? 'red' : 'green'">{{ formatPercent(row.myRate) }}</span>
                      </template>
                    </vxe-column>
                    <vxe-column title="博主盈亏" min-width="130" align="right">
                      <template #default="{ row }">
                        <span :class="row.bloggerProfit >= 0 ? 'red' : 'green'">
                          {{ formatMoney(row.bloggerProfit) }}
                        </span>
                      </template>
                    </vxe-column>
                    <vxe-column title="博主收益率" min-width="120" align="right">
                      <template #default="{ row }">
                        <span :class="row.bloggerRate >= 0 ? 'red' : 'green'">{{ formatPercent(row.bloggerRate) }}</span>
                      </template>
                    </vxe-column>
                    <vxe-column title="昨日收益" min-width="120" align="right">
                      <template #default="{ row }">
                        <span :class="row.myYesterdayProfit >= 0 ? 'red' : 'green'">
                          {{ formatMoney(row.myYesterdayProfit) }}
                        </span>
                      </template>
                    </vxe-column>
                    <vxe-column title="操作" fixed="right" width="96" align="center">
                      <template #default="{ row }">
                        <a-space @click.stop>
                          <a-button type="link" size="small" @click="openEditModal(row)"><EditOutlined /></a-button>
                          <a-button type="link" danger size="small" @click="removeHolding(row)"><DeleteOutlined /></a-button>
                        </a-space>
                      </template>
                    </vxe-column>
                  </vxe-table>
                </div>
                <a-row justify="space-between" align="middle" class="table-footer">
                  <a-col><a-typography-text type="secondary">共 {{ store.holdings.length }} 只基金</a-typography-text></a-col>
                  <a-col><a-button type="link" @click="store.resetDemo">恢复示例数据</a-button></a-col>
                </a-row>
              </section>
            </a-col>

            <a-col :xs="24" :xl="5">
              <a-space direction="vertical" :size="12" class="page-stack side-stack">
                <a-card title="今日收益对比" size="small">
                  <template #extra>
                    <a-select v-model:value="selectedRange" size="small" style="width: 78px">
                      <a-select-option value="day">今日</a-select-option>
                      <a-select-option value="month">本月</a-select-option>
                    </a-select>
                  </template>
                  <a-space direction="vertical" class="page-stack">
                    <a-row justify="space-between" align="middle">
                      <a-col>
                        <a-space><a-badge color="#2563ff" />我的收益</a-space>
                      </a-col>
                      <a-col>
                        <strong :class="store.totals.myYesterdayProfit >= 0 ? 'red' : 'green'">
                          {{ formatMoney(store.totals.myYesterdayProfit) }}
                        </strong>
                      </a-col>
                    </a-row>
                    <a-row justify="space-between" align="middle">
                      <a-col>
                        <a-space><a-badge color="#10a37f" />博主收益</a-space>
                      </a-col>
                      <a-col>
                        <strong :class="store.totals.bloggerYesterdayProfit >= 0 ? 'red' : 'green'">
                          {{ formatMoney(store.totals.bloggerYesterdayProfit) }}
                        </strong>
                      </a-col>
                    </a-row>
                  </a-space>
                </a-card>

                <a-card title="近一个月收益趋势" size="small">
                  <template #extra>
                    <a-select v-model:value="trendRange" size="small" style="width: 78px">
                      <a-select-option value="month">近1月</a-select-option>
                      <a-select-option value="quarter">近3月</a-select-option>
                    </a-select>
                  </template>
                  <div ref="holdingChartRef" class="chart"></div>
                </a-card>
              </a-space>
            </a-col>
          </a-row>

        </a-space>
      </a-layout-content>

      <a-modal
        v-model:open="isDetailModalOpen"
        width="960px"
        :footer="null"
        :title="selectedHolding ? `${selectedHolding.fundName}（${selectedHolding.fundCode}）` : '基金详情'"
        @after-open-change="handleDetailOpenChange"
      >
        <a-row justify="space-between" align="middle" class="detail-head">
          <a-col>
            <a-typography-text type="secondary">基金净值与跟投收益曲线</a-typography-text>
          </a-col>
          <a-col>
            <a-segmented
              v-model:value="trendRange"
              :options="[
                { label: '近1月', value: 'month' },
                { label: '近3月', value: 'quarter' },
                { label: '近半年', value: 'half' },
              ]"
            />
          </a-col>
        </a-row>
        <a-spin :spinning="isTrendLoading">
          <div ref="detailChartRef" class="detail-chart"></div>
        </a-spin>
      </a-modal>

      <a-modal v-model:open="isBudgetModalOpen" title="预算与 AI 设置" width="720px" @ok="saveBudget">
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="我的总预算">
                <a-input-number v-model:value="budgetForm.myBudget" :min="0" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="博主总预算">
                <a-input-number v-model:value="budgetForm.bloggerBudget" :min="0" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="AI Base URL">
                <a-input v-model:value="store.aiConfig.baseURL" placeholder="https://api.openai.com/v1" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="模型名称">
                <a-input v-model:value="store.aiConfig.model" placeholder="gpt-4.1-mini" />
              </a-form-item>
            </a-col>
            <a-col :span="24">
              <a-form-item label="API Key">
                <a-input-password v-model:value="store.aiConfig.apiKey" placeholder="sk-..." />
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </a-modal>

      <a-modal v-model:open="isHoldingModalOpen" title="持仓记录" width="720px" @ok="saveHolding">
        <a-form layout="vertical">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="基金名称">
                <a-input v-model:value="holdingForm.fundName" placeholder="易方达中小盘混合" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="基金代码">
                <a-input v-model:value="holdingForm.fundCode" maxlength="6" placeholder="110011" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="我的持有金额">
                <a-input-number v-model:value="holdingForm.myAmount" :min="0" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="我的持有收益">
                <a-input-number v-model:value="holdingForm.myProfit" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="我的昨日收益">
                <a-input-number v-model:value="holdingForm.myYesterdayProfit" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="博主持有金额">
                <a-input-number v-model:value="holdingForm.bloggerAmount" :min="0" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="博主持有收益">
                <a-input-number v-model:value="holdingForm.bloggerProfit" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="博主昨日收益">
                <a-input-number v-model:value="holdingForm.bloggerYesterdayProfit" :precision="2" addon-before="¥" />
              </a-form-item>
            </a-col>
          </a-row>
        </a-form>
      </a-modal>

      <a-modal v-model:open="isAiModalOpen" title="AI 识别持仓截图" width="780px" @ok="applyRecognized">
        <a-row :gutter="20">
          <a-col :span="8">
            <a-radio-group v-model:value="aiSide" button-style="solid">
              <a-radio-button value="mine">我的截图</a-radio-button>
              <a-radio-button value="blogger">博主截图</a-radio-button>
            </a-radio-group>
            <a-upload-dragger accept="image/*" :before-upload="beforeUpload" :max-count="1" class="upload-box">
              <p class="ant-upload-drag-icon"><RobotOutlined /></p>
              <p class="ant-upload-text">上传持仓截图</p>
            </a-upload-dragger>
            <a-button type="primary" :loading="isRecognizing" block @click="runRecognition">
              <RobotOutlined />开始识别
            </a-button>
          </a-col>
          <a-col :span="16">
            <a-table :data-source="recognizedRows" :pagination="false" size="small" row-key="fundCode">
              <a-table-column title="基金" data-index="fundName" />
              <a-table-column title="代码" data-index="fundCode" :width="88" />
              <a-table-column title="金额" :width="110">
                <template #default="{ record }">{{ formatMoney(record.amount) }}</template>
              </a-table-column>
              <a-table-column title="收益" :width="110">
                <template #default="{ record }">
                  <span :class="record.profit >= 0 ? 'red' : 'green'">{{ formatMoney(record.profit) }}</span>
                </template>
              </a-table-column>
            </a-table>
          </a-col>
        </a-row>
      </a-modal>
    </a-layout>
  </a-config-provider>
</template>
