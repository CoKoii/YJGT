<script setup lang="ts">
import type { AiConfig, BudgetConfig, SettingsSection } from '@/types'
import { followRatio } from '@/utils/calculations'
import { computed } from 'vue'

const props = defineProps<{
  open: boolean
  budget: BudgetConfig
  aiConfig: AiConfig
  section: SettingsSection
}>()

const editingRatio = computed(() => followRatio(props.budget))

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:section', value: SettingsSection): void
  (event: 'save'): void
  (event: 'update:budget', value: BudgetConfig): void
  (event: 'update:aiConfig', value: AiConfig): void
}>()

function updateBudgetField(field: keyof BudgetConfig, value: number | null) {
  emit('update:budget', { ...props.budget, [field]: Number(value ?? 0) })
}

function updateAiField(field: keyof AiConfig, value: string) {
  emit('update:aiConfig', { ...props.aiConfig, [field]: value })
}
</script>

<template>
  <a-modal
    :open="open"
    centered
    title="偏好设置"
    width="860px"
    wrap-class-name="settings-modal"
    ok-text="保存设置"
    cancel-text="暂不保存"
    @update:open="$emit('update:open', $event)"
    @ok="$emit('save')"
  >
    <a-form layout="vertical" autocomplete="off" class="settings-form">
      <div class="settings-page">
        <nav class="settings-sidebar" aria-label="设置分类">
          <button
            type="button"
            class="settings-tab"
            :class="{ active: section === 'budget' }"
            @click="$emit('update:section', 'budget')"
          >
            预算
          </button>
          <button
            type="button"
            class="settings-tab"
            :class="{ active: section === 'ai' }"
            @click="$emit('update:section', 'ai')"
          >
            AI 服务
          </button>
        </nav>
        <section class="settings-content">
          <div v-if="section === 'budget'" class="settings-pane">
            <div class="settings-hero">
              <div>
                <div class="settings-title">预算</div>
                <div class="settings-description">填写这套组合的预算信息</div>
              </div>
              <div class="settings-summary">跟投比例 {{ editingRatio.blogger.toFixed(2) }} : 1</div>
            </div>
            <div class="settings-list">
              <div class="settings-row">
                <div class="settings-row-meta">
                  <div class="settings-item-title">我的总预算</div>
                  <div class="settings-item-description">你计划投入的总金额</div>
                </div>
                <div class="settings-control settings-control-wide">
                  <a-input-number
                    :value="budget.myBudget"
                    :min="0"
                    :precision="2"
                    addon-before="¥"
                    @update:value="updateBudgetField('myBudget', $event)"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row-meta">
                  <div class="settings-item-title">博主总预算</div>
                  <div class="settings-item-description">博主计划投入的总金额</div>
                </div>
                <div class="settings-control settings-control-wide">
                  <a-input-number
                    :value="budget.bloggerBudget"
                    :min="0"
                    :precision="2"
                    addon-before="¥"
                    @update:value="updateBudgetField('bloggerBudget', $event)"
                  />
                </div>
              </div>
            </div>
          </div>
          <div v-else class="settings-pane">
            <div class="settings-hero">
              <div>
                <div class="settings-title">AI 服务</div>
                <div class="settings-description">填写模型服务信息，用于聊天和截图识别</div>
              </div>
            </div>
            <div class="settings-list">
              <div class="settings-row">
                <div class="settings-row-meta">
                  <div class="settings-item-title">Base URL</div>
                  <div class="settings-item-description">模型服务地址</div>
                </div>
                <div class="settings-control settings-control-wide">
                  <a-input
                    :value="aiConfig.baseURL"
                    placeholder="请输入服务地址"
                    @update:value="updateAiField('baseURL', $event)"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row-meta">
                  <div class="settings-item-title">模型名称</div>
                  <div class="settings-item-description">要使用的模型</div>
                </div>
                <div class="settings-control settings-control-wide">
                  <a-input
                    :value="aiConfig.model"
                    placeholder="请输入模型名称"
                    @update:value="updateAiField('model', $event)"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row-meta">
                  <div class="settings-item-title">API Key</div>
                  <div class="settings-item-description">接口密钥</div>
                </div>
                <div class="settings-control settings-control-wide">
                  <a-input-password
                    :value="aiConfig.apiKey"
                    autocomplete="new-password"
                    placeholder="sk-..."
                    @update:value="updateAiField('apiKey', $event)"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </a-form>
  </a-modal>
</template>
