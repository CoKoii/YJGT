import type { AiChatMessage, AiConfig } from '@/types'

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: { content?: string }
  }>
}

function getChatCompletionsUrl(baseURL: string): string {
  const trimmedBaseURL = baseURL.trim().replace(/\/$/, '')
  if (!trimmedBaseURL) return 'https://api.openai.com/v1/chat/completions'
  if (trimmedBaseURL.endsWith('/chat/completions')) return trimmedBaseURL
  return `${trimmedBaseURL}/chat/completions`
}

function decodeChunk(buffer: string, onDelta: (delta: string) => void): string {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''

  lines.forEach((line) => {
    const trimmedLine = line.trim()
    if (!trimmedLine.startsWith('data:')) return

    const payload = trimmedLine.slice(5).trim()
    if (!payload || payload === '[DONE]') return

    const chunk = JSON.parse(payload) as ChatCompletionChunk
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) onDelta(delta)
  })

  return rest
}

export async function streamPortfolioChat({
  config,
  messages,
  portfolioContext,
  fundLookupContext,
  onDelta,
}: {
  config: AiConfig
  messages: AiChatMessage[]
  portfolioContext: string
  fundLookupContext: string
  onDelta: (delta: string) => void
}): Promise<void> {
  if (!config.apiKey || !config.model) {
    throw new Error('请先在设置中填写 AI API Key 和模型名称')
  }

  const response = await fetch(getChatCompletionsUrl(config.baseURL), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是一个基金跟投分析助手。回答要基于用户当前持仓、预算、收益、操作点和基金查询结果。' +
            '如果数据不足，要明确说明，不要编造买入、卖出、转换记录。金额和比例要尽量引用上下文中的具体数值。',
        },
        { role: 'system', content: `当前组合上下文：\n${portfolioContext}` },
        ...(fundLookupContext ? [{ role: 'system', content: `基金接口查询结果：\n${fundLookupContext}` }] : []),
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`AI 对话请求失败：${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer = decodeChunk(buffer + decoder.decode(value, { stream: true }), onDelta)
  }

  decodeChunk(`${buffer}\n`, onDelta)
}
