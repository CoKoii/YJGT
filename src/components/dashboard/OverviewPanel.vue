<script setup lang="ts">
defineProps<{
  bloggerBudget: number
  myBudget: number
  bloggerInvested: number
  myInvested: number
  budgetUsage: { blogger: number; mine: number }
  ratio: { blogger: number; mine: number }
  shouldInvest: number
  formatMoney: (value: number) => string
}>()

defineEmits<{
  (event: 'update:bloggerBudget', value: number | null): void
  (event: 'update:myBudget', value: number | null): void
}>()
</script>

<template>
  <a-card class="overview-panel" :body-style="{ padding: '14px 16px' }">
    <a-row :gutter="[32, 14]">
      <a-col :xs="24" :md="12" :xl="6">
        <div class="overview-label">博主总预算（元）</div>
        <a-input-number
          :value="bloggerBudget"
          class="overview-input"
          :min="0"
          :precision="2"
          :controls="false"
          @update:value="$emit('update:bloggerBudget', $event)"
        />
      </a-col>
      <a-col :xs="24" :md="12" :xl="6">
        <div class="overview-label">当前博主总投入（元）</div>
        <div class="overview-value">{{ formatMoney(bloggerInvested) }}</div>
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
          :value="myBudget"
          class="overview-input"
          :min="0"
          :precision="2"
          :controls="false"
          @update:value="$emit('update:myBudget', $event)"
        />
      </a-col>
      <a-col :xs="24" :md="12" :xl="6">
        <div class="overview-label">当前我的总投入（元）</div>
        <div class="overview-value">{{ formatMoney(myInvested) }}</div>
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
</template>
