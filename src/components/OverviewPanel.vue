<script setup lang="ts">
defineProps<{
  myBudget: number
  bloggerBudget: number
  myCost: number
  bloggerCost: number
  myBudgetUsage: number
  bloggerBudgetUsage: number
  followRatioText: string
  shouldInvest: number
  formatMoney: (value: number) => string
}>()

defineEmits<{
  (event: 'update:myBudget', value: number | null): void
  (event: 'update:bloggerBudget', value: number | null): void
}>()
</script>

<template>
  <a-card class="overview-panel" :body-style="{ padding: '14px 16px' }">
    <a-row :gutter="[28, 14]">
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
        <div class="overview-label">博主真实投入</div>
        <div class="overview-value">{{ formatMoney(bloggerCost) }}</div>
      </a-col>
      <a-col :xs="24" :md="12" :xl="6">
        <div class="overview-label">博主仓位占比</div>
        <div class="overview-value">{{ bloggerBudgetUsage.toFixed(2) }}%</div>
      </a-col>
      <a-col :xs="24" :md="12" :xl="6">
        <div class="overview-label">博主 : 我的预算</div>
        <div class="overview-value">{{ followRatioText }}</div>
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
        <div class="overview-label">我的真实投入</div>
        <div class="overview-value">{{ formatMoney(myCost) }}</div>
      </a-col>
      <a-col :xs="24" :md="12" :xl="6">
        <div class="overview-label">我的仓位占比</div>
        <div class="overview-value">{{ myBudgetUsage.toFixed(2) }}%</div>
      </a-col>
      <a-col :xs="24" :md="12" :xl="6">
        <div class="overview-label">我应投入总金额</div>
        <div class="overview-value">{{ formatMoney(shouldInvest) }}</div>
      </a-col>
    </a-row>
  </a-card>
</template>
