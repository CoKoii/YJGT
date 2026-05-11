<script setup lang="ts">
import { ClearOutlined, SendOutlined } from '@ant-design/icons-vue'
import { nextTick, ref, watch } from 'vue'
import type { AiChatMessage } from '@/types/portfolio'
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

function submitInput(): void {
  const question = draftInput.value.trim()
  if (!question || props.isStreaming) return
  draftInput.value = ''
  emit('send', question)
}

function scrollToBottom(): void {
  void nextTick(() => {
    if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
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
        可以直接问持仓、收益、仓位偏差和跟投建议。
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
        v-model:value="draftInput"
        class="ai-chat-textarea"
        :disabled="isStreaming"
        placeholder="比如：我和博主的仓位差多少？"
        @press-enter="submitInput"
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
