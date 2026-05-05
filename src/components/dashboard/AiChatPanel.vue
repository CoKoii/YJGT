<script setup lang="ts">
import { ClearOutlined, SendOutlined } from '@ant-design/icons-vue'
import { nextTick, ref, watch } from 'vue'
import type { AiChatMessage } from '@/types'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  messages: AiChatMessage[]
  isStreaming: boolean
}>()

const emit = defineEmits<{
  (event: 'send', value: string): void
  (event: 'clear'): void
}>()

const bodyRef = ref<HTMLDivElement | null>(null)
const draftInput = ref('')
const ignoredEchoValue = ref<string | null>(null)

function handleInputChange(value: string) {
  if (ignoredEchoValue.value !== null && value === ignoredEchoValue.value) {
    ignoredEchoValue.value = null
    return
  }

  ignoredEchoValue.value = null
  draftInput.value = value
}

function submitInput(value = draftInput.value) {
  const normalizedValue = value.trim()
  if (!normalizedValue || props.isStreaming) return

  ignoredEchoValue.value = value
  draftInput.value = ''
  emit('send', normalizedValue)
}

function handlePressEnter(event: KeyboardEvent) {
  event.preventDefault()
  const inputValue = (event.target as HTMLInputElement | null)?.value ?? draftInput.value
  submitInput(inputValue)
}

function scrollToBottom() {
  void nextTick(() => {
    if (bodyRef.value) {
      bodyRef.value.scrollTop = bodyRef.value.scrollHeight
    }
  })
}

watch([() => props.messages, () => props.isStreaming], scrollToBottom, {
  deep: true,
  flush: 'post',
  immediate: true,
})
</script>

<template>
  <a-card title="智能助手" size="small" class="ai-chat-card">
    <template #extra>
      <a-button
        type="text"
        size="small"
        :disabled="messages.length === 0 || isStreaming"
        @click="$emit('clear')"
      >
        <template #icon><ClearOutlined /></template>
      </a-button>
    </template>
    <div ref="bodyRef" class="ai-chat-body">
      <div v-if="messages.length === 0" class="ai-chat-empty">
        可以直接问持仓情况、收益对比、跟投偏差，也可以查询基金信息。
      </div>
      <div
        v-for="message in messages"
        :key="message.id"
        class="ai-chat-message"
        :class="message.role === 'user' ? 'user' : 'assistant'"
      >
        <div
          class="ai-chat-bubble markdown-body"
          v-html="renderMarkdown(message.content || '...')"
        ></div>
      </div>
    </div>
    <div class="ai-chat-input">
      <a-input
        :value="draftInput"
        class="ai-chat-textarea"
        :disabled="isStreaming"
        placeholder="比如：我现在和博主的仓位差多少？"
        @update:value="handleInputChange"
        @press-enter="handlePressEnter"
      />
      <a-button
        type="primary"
        class="ai-chat-send"
        :loading="isStreaming"
        :disabled="!draftInput.trim()"
        @click="submitInput"
      >
        <template #icon><SendOutlined /></template>
      </a-button>
    </div>
  </a-card>
</template>
