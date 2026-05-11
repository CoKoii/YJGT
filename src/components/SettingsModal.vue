<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Settings } from '@/types/portfolio'

const props = defineProps<{
  open: boolean
  form: Settings
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'update:form', value: Settings): void
  (event: 'save'): void
}>()

function patchForm(value: Partial<Settings>): void {
  emit('update:form', { ...props.form, ...value })
}

const section = ref<'budget' | 'ai'>('budget')

watch(
  () => props.open,
  (open) => {
    if (open) section.value = 'budget'
  },
)
</script>

<template>
  <a-modal
    :open="open"
    centered
    title="偏好设置"
    width="760px"
    wrap-class-name="settings-modal"
    ok-text="保存"
    cancel-text="关闭"
    @update:open="$emit('update:open', $event)"
    @ok="$emit('save')"
  >
    <div class="settings-page">
      <div class="settings-sidebar">
        <button
          type="button"
          class="settings-tab"
          :class="{ active: section === 'budget' }"
          @click="section = 'budget'"
        >
          预算设置
        </button>
        <button
          type="button"
          class="settings-tab"
          :class="{ active: section === 'ai' }"
          @click="section = 'ai'"
        >
          AI 设置
        </button>
      </div>

      <a-form layout="vertical" class="settings-content settings-form">
        <div v-if="section === 'budget'" class="settings-pane">
          <div class="settings-hero">
            <div>
              <div class="settings-title">预算设置</div>
              <div class="settings-description">用于计算博主和我的跟投比例、仓位占用和应投入金额。</div>
            </div>
          </div>
          <div class="settings-list">
            <div class="settings-row">
              <div class="settings-row-meta">
                <div class="settings-item-title">我的总预算</div>
                <div class="settings-item-description">你的计划跟投资金上限。</div>
              </div>
              <div class="settings-control">
                <a-input-number
                  :value="form.myBudget"
                  :min="0"
                  :precision="2"
                  addon-before="¥"
                  class="settings-control-wide"
                  @update:value="patchForm({ myBudget: Number($event ?? 0) })"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-meta">
                <div class="settings-item-title">博主总预算</div>
                <div class="settings-item-description">用于推导参考组合的预算比例。</div>
              </div>
              <div class="settings-control">
                <a-input-number
                  :value="form.bloggerBudget"
                  :min="0"
                  :precision="2"
                  addon-before="¥"
                  class="settings-control-wide"
                  @update:value="patchForm({ bloggerBudget: Number($event ?? 0) })"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-else class="settings-pane">
          <div class="settings-hero">
            <div>
              <div class="settings-title">AI 设置</div>
              <div class="settings-description">用于截图识别和组合问答。</div>
            </div>
          </div>
          <div class="settings-list">
            <div class="settings-row">
              <div class="settings-row-meta">
                <div class="settings-item-title">Base URL</div>
                <div class="settings-item-description">兼容 OpenAI Chat Completions 的服务地址。</div>
              </div>
              <div class="settings-control">
                <a-input
                  :value="form.aiBaseURL"
                  placeholder="https://api.openai.com/v1"
                  class="settings-control-wide"
                  @update:value="patchForm({ aiBaseURL: $event })"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-meta">
                <div class="settings-item-title">API Key</div>
                <div class="settings-item-description">仅保存在本地浏览器。</div>
              </div>
              <div class="settings-control">
                <a-input-password
                  :value="form.aiApiKey"
                  placeholder="sk-..."
                  class="settings-control-wide"
                  @update:value="patchForm({ aiApiKey: $event })"
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-meta">
                <div class="settings-item-title">模型名称</div>
                <div class="settings-item-description">用于视觉识别和问答的模型。</div>
              </div>
              <div class="settings-control">
                <a-input
                  :value="form.aiModel"
                  placeholder="gpt-4o-mini"
                  class="settings-control-wide"
                  @update:value="patchForm({ aiModel: $event })"
                />
              </div>
            </div>
          </div>
        </div>
      </a-form>
    </div>
  </a-modal>
</template>
