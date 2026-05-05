import { fetchFundInfo, fetchFundNetWorthTrend, searchFundByName } from '@/services/fundApi'
import type { AiChatMessage, AiConfig, FundTrendPoint } from '@/types'

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: { content?: string }
  }>
}

interface ChatToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  name?: string
  tool_calls?: ChatToolCall[]
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: ChatToolCall[]
    }
  }>
}

interface FundHistoryToolArgs {
  fundCode?: string
  startDate?: string
  endDate?: string
  limit?: number
}

const FUND_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_fund_by_code',
      description: '根据 6 位基金代码查询基金基础信息，返回基金代码和基金名称。',
      parameters: {
        type: 'object',
        properties: {
          fundCode: {
            type: 'string',
            description: '6 位基金代码，例如 161725。',
          },
        },
        required: ['fundCode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_fund_by_name',
      description: '根据基金名称搜索最匹配的基金，适合用户只提供基金名称时使用。',
      parameters: {
        type: 'object',
        properties: {
          fundName: {
            type: 'string',
            description: '基金名称，例如 招商中证白酒指数C。',
          },
        },
        required: ['fundName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fund_net_worth_history',
      description:
        '查询基金历史净值走势。可按开始日期、结束日期筛选，也可限制返回点数，适合分析最近一段或指定时间范围的历史净值。',
      parameters: {
        type: 'object',
        properties: {
          fundCode: {
            type: 'string',
            description: '6 位基金代码，例如 161725。',
          },
          startDate: {
            type: 'string',
            description: '开始日期，格式 YYYY-MM-DD，可选。',
          },
          endDate: {
            type: 'string',
            description: '结束日期，格式 YYYY-MM-DD，可选。',
          },
          limit: {
            type: 'number',
            description:
              '最多返回多少个净值点，按日期升序保留最后 N 个。可选，默认 180；填 0 或负数表示不过滤数量。',
          },
        },
        required: ['fundCode'],
      },
    },
  },
] as const

function getChatCompletionsUrl(baseURL: string): string {
  const trimmedBaseURL = baseURL.trim().replace(/\/$/, '')
  if (!trimmedBaseURL) {
    throw new Error('请先在设置中填写 AI Base URL')
  }
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

function getBaseHeaders(config: AiConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
}

async function createChatCompletion(
  config: AiConfig,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(getChatCompletionsUrl(config.baseURL), {
    method: 'POST',
    headers: getBaseHeaders(config),
    body: JSON.stringify(body),
  })
}

function parseToolArgs(argumentsText: string): Record<string, unknown> {
  try {
    return JSON.parse(argumentsText) as Record<string, unknown>
  } catch {
    return {}
  }
}

function isValidDateInput(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function filterTrendPoints(
  points: FundTrendPoint[],
  { startDate, endDate, limit }: FundHistoryToolArgs,
): FundTrendPoint[] {
  const filtered = points.filter((point) => {
    if (isValidDateInput(startDate) && point.date < startDate) return false
    if (isValidDateInput(endDate) && point.date > endDate) return false
    return true
  })

  if (typeof limit === 'number' && limit > 0) {
    return filtered.slice(-Math.min(Math.floor(limit), 1000))
  }

  if (typeof limit === 'number' && limit <= 0) return filtered

  return filtered.slice(-180)
}

async function runFundToolCall(toolCall: ChatToolCall): Promise<string> {
  const args = parseToolArgs(toolCall.function.arguments)

  try {
    if (toolCall.function.name === 'get_fund_by_code') {
      const fundCode = typeof args.fundCode === 'string' ? args.fundCode.trim() : ''
      const fund = await fetchFundInfo(fundCode)
      return JSON.stringify(
        fund
          ? { ok: true, tool: toolCall.function.name, fund }
          : { ok: false, tool: toolCall.function.name, error: '未找到基金信息' },
        null,
        2,
      )
    }

    if (toolCall.function.name === 'search_fund_by_name') {
      const fundName = typeof args.fundName === 'string' ? args.fundName.trim() : ''
      const fund = await searchFundByName(fundName)
      return JSON.stringify(
        fund
          ? { ok: true, tool: toolCall.function.name, fund }
          : { ok: false, tool: toolCall.function.name, error: '未找到匹配基金' },
        null,
        2,
      )
    }

    if (toolCall.function.name === 'get_fund_net_worth_history') {
      const toolArgs: FundHistoryToolArgs = {
        fundCode: typeof args.fundCode === 'string' ? args.fundCode.trim() : '',
        startDate: isValidDateInput(args.startDate) ? args.startDate.trim() : undefined,
        endDate: isValidDateInput(args.endDate) ? args.endDate.trim() : undefined,
        limit: typeof args.limit === 'number' && Number.isFinite(args.limit) ? args.limit : undefined,
      }

      const [fund, trend] = await Promise.all([
        fetchFundInfo(toolArgs.fundCode ?? ''),
        fetchFundNetWorthTrend(toolArgs.fundCode ?? ''),
      ])
      const filteredTrend = filterTrendPoints(trend, toolArgs)
      const truncated = filteredTrend.length < trend.length

      return JSON.stringify(
        {
          ok: filteredTrend.length > 0,
          tool: toolCall.function.name,
          fund: fund ?? { code: toolArgs.fundCode ?? '', name: '' },
          query: {
            startDate: toolArgs.startDate ?? null,
            endDate: toolArgs.endDate ?? null,
            limit: toolArgs.limit ?? 180,
          },
          totalPoints: trend.length,
          returnedPoints: filteredTrend.length,
          truncated,
          firstPoint: filteredTrend[0] ?? null,
          lastPoint: filteredTrend[filteredTrend.length - 1] ?? null,
          points: filteredTrend,
          ...(trend.length === 0 ? { error: '未获取到净值走势数据' } : {}),
        },
        null,
        2,
      )
    }

    return JSON.stringify(
      { ok: false, tool: toolCall.function.name, error: '不支持的工具调用' },
      null,
      2,
    )
  } catch (error) {
    return JSON.stringify(
      {
        ok: false,
        tool: toolCall.function.name,
        error: error instanceof Error ? error.message : '工具调用失败',
      },
      null,
      2,
    )
  }
}

async function resolveToolMessages(
  config: AiConfig,
  messages: ChatCompletionMessage[],
): Promise<ChatCompletionMessage[]> {
  const nextMessages = [...messages]

  for (let index = 0; index < 6; index += 1) {
    const response = await createChatCompletion(config, {
      model: config.model,
      stream: false,
      temperature: 0.2,
      tools: FUND_TOOLS,
      tool_choice: 'auto',
      messages: nextMessages,
    })

    if (!response.ok) {
      throw new Error(`AI 对话请求失败：${response.status}`)
    }

    const payload = (await response.json()) as ChatCompletionResponse
    const message = payload.choices?.[0]?.message
    const toolCalls = message?.tool_calls ?? []

    nextMessages.push({
      role: 'assistant',
      content: message?.content ?? '',
      tool_calls: toolCalls,
    })

    if (toolCalls.length === 0) return nextMessages

    const toolMessages = await Promise.all(
      toolCalls.map(async (toolCall) => ({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: await runFundToolCall(toolCall),
      })),
    )

    nextMessages.push(...toolMessages)
  }

  return nextMessages
}

export async function streamPortfolioChat({
  config,
  messages,
  portfolioContext,
  onDelta,
}: {
  config: AiConfig
  messages: AiChatMessage[]
  portfolioContext: string
  onDelta: (delta: string) => void
}): Promise<void> {
  if (!config.baseURL.trim() || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error('请先在设置中完整填写 AI Base URL、API Key 和模型名称')
  }

  const baseMessages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content:
        '你是一个基金跟投分析助手。回答要基于用户当前持仓、预算、收益、操作点和你通过工具拿到的基金数据。' +
        '当用户提到基金代码、基金名称、历史净值、净值走势、区间表现时，优先调用工具核实后再回答。' +
        '如果数据不足，要明确说明，不要编造买入、卖出、转换记录。金额和比例要尽量引用上下文中的具体数值。',
    },
    { role: 'system', content: `当前组合上下文：\n${portfolioContext}` },
    ...messages.map(
      (message) =>
        ({
          role: message.role,
          content: message.content,
        }) satisfies ChatCompletionMessage,
    ),
  ]

  const resolvedMessages = await resolveToolMessages(config, baseMessages)
  const response = await createChatCompletion(config, {
    model: config.model,
    stream: true,
    temperature: 0.2,
    tools: FUND_TOOLS,
    tool_choice: 'none',
    messages: resolvedMessages,
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
