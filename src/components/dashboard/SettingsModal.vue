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
    title="设置"
    width="860px"
    wrap-class-name="settings-modal"
    ok-text="确认"
    cancel-text="取消"
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
            AI 识别
          </button>
        </nav>
        <section class="settings-content">
          <div v-if="section === 'budget'" class="settings-pane">
            <div class="settings-hero">
              <div>
                <div class="settings-title">预算</div>
                <div class="settings-description">用于计算跟投比例、仓位占比和剩余可投入金额。</div>
              </div>
              <div class="settings-summary">跟投比例 {{ editingRatio.blogger.toFixed(2) }} : 1</div>
            </div>
            <div class="settings-list">
              <div class="settings-row">
                <div class="settings-row-meta">
                  <div class="settings-item-title">我的总预算</div>
                  <div class="settings-item-description">你计划用于跟投的总资金。</div>
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
                  <div class="settings-item-description">用于换算博主持仓到你的目标持仓。</div>
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
                <div class="settings-title">AI 识别</div>
                <div class="settings-description">配置持仓截图识别使用的模型服务。</div>
              </div>
            </div>
            <div class="settings-list">
              <div class="settings-row">
                <div class="settings-row-meta">
                  <div class="settings-item-title">Base URL</div>
                  <div class="settings-item-description">
                    必填，AI 聊天与识图都只会使用这里配置的服务地址。
                  </div>
                </div>
                <div class="settings-control settings-control-wide">
                  <a-input
                    :value="aiConfig.baseURL"
                    placeholder="请输入 Base URL"
                    @update:value="updateAiField('baseURL', $event)"
                  />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row-meta">
                  <div class="settings-item-title">模型名称</div>
                  <div class="settings-item-description">用于识别截图内容的视觉模型。</div>
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
                  <div class="settings-item-description">
                    只保存在本机浏览器，用于调用上面的模型服务。
                  </div>
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
