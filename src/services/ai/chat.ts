import { fetchFundInfo, fetchFundNetWorthTrend, searchFundByName } from '@/services/fund'
import {
  getHoldingDetailTool,
  getPortfolioSummaryTool,
  listPortfolioHoldingsTool,
  listPortfolioOperationsTool,
} from '@/services/portfolioTools'
import type {
  AiChatMessage,
  AiConfig,
  FundTrendPoint,
} from '@/types'
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

const PORTFOLIO_TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'get_portfolio_summary',
      description: '查询当前组合总览，包括预算、总投入、总收益、最新单日收益、跟投比例等摘要信息。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_portfolio_holdings',
      description: '查询当前全部持仓列表。可按收益率、持仓金额等排序，也可限制返回数量。',
      parameters: {
        type: 'object',
        properties: {
          sortBy: {
            type: 'string',
            enum: [
              'myAmount',
              'bloggerAmount',
              'myProfit',
              'bloggerProfit',
              'myRate',
              'bloggerRate',
            ],
            description: '排序字段。',
          },
          order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: '排序方向，默认 desc。',
          },
          limit: {
            type: 'number',
            description: '最多返回多少条，默认返回全部，最大 100。',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_holding_detail',
      description: '查询单只基金持仓明细，包括成本、份额、净值日期、收益、仓位占比和挂起操作。',
      parameters: {
        type: 'object',
        properties: {
          fundCode: { type: 'string', description: '6 位基金代码，例如 161725。' },
          fundName: { type: 'string', description: '基金名称，可在不知道代码时使用。' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_portfolio_operations',
      description:
        '查询组合内的买入、卖出、转换记录，可按基金、状态、类型筛选。注意：buy 记录中的数值表示金额；sell 和 convert 记录中的数值表示份额。',
      parameters: {
        type: 'object',
        properties: {
          fundCode: { type: 'string', description: '筛选某只基金的操作记录。' },
          status: {
            type: 'string',
            enum: ['pending', 'settled'],
            description: '按待结算或已结算筛选。',
          },
          type: {
            type: 'string',
            enum: ['buy', 'sell', 'convert'],
            description: '按操作类型筛选。',
          },
          limit: {
            type: 'number',
            description: '最多返回多少条，默认 50，最大 200。',
          },
        },
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

async function runPortfolioToolCall(toolCall: any) {
  const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : (toolCall.args ?? {})

  try {
    if (toolCall.name === 'get_portfolio_summary') {
      return JSON.stringify(await getPortfolioSummaryTool(), null, 2)
    }

    if (toolCall.name === 'list_portfolio_holdings') {
      return JSON.stringify(await listPortfolioHoldingsTool(args), null, 2)
    }

    if (toolCall.name === 'get_holding_detail') {
      return JSON.stringify(await getHoldingDetailTool(args), null, 2)
    }

    if (toolCall.name === 'list_portfolio_operations') {
      return JSON.stringify(await listPortfolioOperationsTool(args), null, 2)
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

async function resolveToolMessages(
  config: AiConfig,
  messages: any[],
) {
  const model = createAiModel(config, 0.2).bindTools([...FUND_TOOLS, ...PORTFOLIO_TOOLS], {
    tool_choice: 'auto',
  } as any)
  const nextMessages = [...messages]

  for (let index = 0; index < 6; index += 1) {
    const assistantMessage: any = await model.invoke(nextMessages)
    nextMessages.push(assistantMessage)

    if (!assistantMessage.tool_calls?.length) return nextMessages

    const toolMessages = await Promise.all(
      assistantMessage.tool_calls.map(async (toolCall: any) => {
        const content = PORTFOLIO_TOOLS.some((item) => item.function.name === toolCall.name)
          ? await runPortfolioToolCall(toolCall)
          : await runFundToolCall(toolCall)

        return new ToolMessage({
          tool_call_id: toolCall.id,
          content,
        })
      }),
    )

    nextMessages.push(...toolMessages)
  }

  return nextMessages
}

export async function streamPortfolioChat({
  config,
  messages,
  onDelta,
}: {
  config: AiConfig
  messages: AiChatMessage[]
  onDelta: (delta: string) => void
}) {
  const baseMessages = [
    new SystemMessage(
      '你是一个基金跟投分析助手。关于用户自己的组合数据，不要依赖臆测，也不要假设系统消息里带了完整上下文；需要时主动调用组合工具查询。' +
        '当用户提到基金代码、基金名称、历史净值、净值走势、区间表现时，优先调用工具核实后再回答。' +
        '如果数据不足，要明确说明，不要编造买入、卖出、转换记录。金额、比例、日期、份额、成本、待结算状态尽量引用工具返回的具体数值。' +
        '特别注意：操作记录里 buy 的数值是金额；sell 和 convert 的数值是份额。回答操作记录时必须使用工具返回的 valueLabel，不要把 sell 或 convert 说成金额。' +
        '当用户问“昨天收益”“今天收益”“哪一天更新”“5月8号还有没有更新”这类日期问题时，必须先看工具返回的 navDate、latestNavDates 或 latestDailyProfit.navDate，再用明确日期回答。' +
        '“最新单日收益”只代表最新净值日对应的单日收益，不等于自然日意义上的昨天，除非日期字段明确一致。',
    ),
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
