import { fetchFundInfo, fetchFundNetWorthTrend, searchFundByName } from '@/services/fund'
import type { AiChatMessage, AiConfig, FundTrendPoint } from '@/types'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { createAiModel, readAiTextContent } from './shared'

const FUND_TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'get_fund_by_code',
      description: '根据 6 位基金代码查询基金基础信息，返回基金代码和基金名称。',
      parameters: {
        type: 'object',
        properties: {
          fundCode: { type: 'string', description: '6 位基金代码，例如 161725。' },
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
          fundName: { type: 'string', description: '基金名称，例如 招商中证白酒指数C。' },
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
          fundCode: { type: 'string', description: '6 位基金代码，例如 161725。' },
          startDate: { type: 'string', description: '开始日期，格式 YYYY-MM-DD。' },
          endDate: { type: 'string', description: '结束日期，格式 YYYY-MM-DD。' },
          limit: { type: 'number', description: '最多返回多少个净值点，默认 180。' },
        },
        required: ['fundCode'],
      },
    },
  },
]

function isValidDateInput(value: any) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function filterTrendPoints(
  points: FundTrendPoint[],
  args: { startDate?: string; endDate?: string; limit?: number },
) {
  const filtered = points.filter((point) => {
    const rawStartDate = args.startDate
    const rawEndDate = args.endDate
    const startDate =
      typeof rawStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawStartDate.trim())
        ? rawStartDate.trim()
        : ''
    const endDate =
      typeof rawEndDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawEndDate.trim())
        ? rawEndDate.trim()
        : ''

    if (startDate && point.date < startDate) return false
    if (endDate && point.date > endDate) return false

    return true
  })

  if (typeof args.limit === 'number' && args.limit > 0) {
    return filtered.slice(-Math.min(Math.floor(args.limit), 1000))
  }

  return filtered.slice(-180)
}

async function runFundToolCall(toolCall: any) {
  const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : (toolCall.args ?? {})

  try {
    if (toolCall.name === 'get_fund_by_code') {
      const fund = await fetchFundInfo(String(args.fundCode ?? '').trim())
      return JSON.stringify(
        fund
          ? { ok: true, tool: toolCall.name, fund }
          : { ok: false, tool: toolCall.name, error: '未找到基金信息' },
        null,
        2,
      )
    }

    if (toolCall.name === 'search_fund_by_name') {
      const fund = await searchFundByName(String(args.fundName ?? '').trim())
      return JSON.stringify(
        fund
          ? { ok: true, tool: toolCall.name, fund }
          : { ok: false, tool: toolCall.name, error: '未找到匹配基金' },
        null,
        2,
      )
    }

    if (toolCall.name === 'get_fund_net_worth_history') {
      const fundCode = String(args.fundCode ?? '').trim()
      const query = {
        startDate: isValidDateInput(args.startDate) ? args.startDate.trim() : undefined,
        endDate: isValidDateInput(args.endDate) ? args.endDate.trim() : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      }
      const [fund, trend] = await Promise.all([
        fetchFundInfo(fundCode),
        fetchFundNetWorthTrend(fundCode),
      ])
      const points = filterTrendPoints(trend, query)

      return JSON.stringify(
        {
          ok: points.length > 0,
          tool: toolCall.name,
          fund: fund ?? { code: fundCode, name: '' },
          query: {
            startDate: query.startDate ?? null,
            endDate: query.endDate ?? null,
            limit: query.limit ?? 180,
          },
          totalPoints: trend.length,
          returnedPoints: points.length,
          firstPoint: points[0] ?? null,
          lastPoint: points[points.length - 1] ?? null,
          points,
        },
        null,
        2,
      )
    }

    return JSON.stringify({ ok: false, tool: toolCall.name, error: '不支持的工具调用' }, null, 2)
  } catch (error) {
    return JSON.stringify(
      {
        ok: false,
        tool: toolCall.name,
        error: error instanceof Error ? error.message : '工具调用失败',
      },
      null,
      2,
    )
  }
}

async function resolveToolMessages(config: AiConfig, messages: any[]) {
  const model = createAiModel(config, 0.2).bindTools(FUND_TOOLS, { tool_choice: 'auto' } as any)
  const nextMessages = [...messages]

  for (let index = 0; index < 6; index += 1) {
    const assistantMessage: any = await model.invoke(nextMessages)
    nextMessages.push(assistantMessage)

    if (!assistantMessage.tool_calls?.length) return nextMessages

    const toolMessages = await Promise.all(
      assistantMessage.tool_calls.map(
        async (toolCall: any) =>
          new ToolMessage({
            tool_call_id: toolCall.id,
            content: await runFundToolCall(toolCall),
          }),
      ),
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
}) {
  const baseMessages = [
    new SystemMessage(
      '你是一个基金跟投分析助手。回答要基于用户当前持仓、预算、收益、操作点和你通过工具拿到的基金数据。' +
        '当用户提到基金代码、基金名称、历史净值、净值走势、区间表现时，优先调用工具核实后再回答。' +
        '如果数据不足，要明确说明，不要编造买入、卖出、转换记录。金额和比例要尽量引用上下文中的具体数值。',
    ),
    new SystemMessage(`当前组合上下文：\n${portfolioContext}`),
    ...messages.map((message) =>
      message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content),
    ),
  ]

  const resolvedMessages = await resolveToolMessages(config, baseMessages)
  const stream = await createAiModel(config, 0.2).stream(resolvedMessages)

  for await (const chunk of stream) {
    const text = readAiTextContent(chunk.content)
    if (text) onDelta(text)
  }
}
