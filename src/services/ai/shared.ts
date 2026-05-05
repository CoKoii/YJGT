/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatOpenAI } from '@langchain/openai'
import type { AiConfig } from '@/types'

export function normalizeAiBaseUrl(baseURL: string): string {
  return baseURL
    .trim()
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/$/, '')
}

export function assertAiConfig(config: AiConfig) {
  if (!config.baseURL.trim() || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error('请先在设置中完整填写 AI Base URL、API Key 和模型名称')
  }
}

export function createAiModel(config: AiConfig, temperature = 0) {
  assertAiConfig(config)

  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    temperature,
    configuration: { baseURL: normalizeAiBaseUrl(config.baseURL) },
  })
}

export function readAiTextContent(content: any): string {
  if (Array.isArray(content)) {
    return content.map((item) => (typeof item === 'string' ? item : (item?.text ?? ''))).join('')
  }

  return typeof content === 'string' ? content : String(content ?? '')
}
