import { fetchFundInfo, fetchFundNetWorthTrend, searchFundByName } from '@/services/fund'
import type { AiChatMessage, AiConfig, FundTrendPoint, Holding, HoldingOperation, PortfolioTotals } from '@/types'
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
            enum: ['myAmount', 'bloggerAmount', 'myProfit', 'bloggerProfit', 'myRate', 'bloggerRate'],
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
      description: '查询组合内的买入、卖出、转换记录，可按基金、状态、类型筛选。',
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

type PortfolioAiSnapshot = {
  budget: {
    myBudget: number
    bloggerBudget: number
  }
  totals: PortfolioTotals
  followRatio: {
    blogger: number
    mine: number
  }
  holdings: Array<{
    fundName: string
    fundCode: string
    navDate: string
    targetInvested: number
    pendingOperations: number
    raw: Holding
    derived: {
      myInvested: number
      bloggerInvested: number
      myRate: number
      bloggerRate: number
      myPositionRate: number
      bloggerPositionRate: number
    }
  }>
  operations: HoldingOperation[]
}

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

function normalizeLimit(value: unknown, fallback: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), max)
}

function getHoldingSortValue(
  holding: PortfolioAiSnapshot['holdings'][number],
  sortBy: string,
) {
  switch (sortBy) {
    case 'bloggerAmount':
      return holding.raw.bloggerAmount
    case 'myProfit':
      return holding.raw.myProfit
    case 'bloggerProfit':
      return holding.raw.bloggerProfit
    case 'myRate':
      return holding.derived.myRate
    case 'bloggerRate':
      return holding.derived.bloggerRate
    case 'myAmount':
    default:
      return holding.raw.myAmount
  }
}

function pickHolding(snapshot: PortfolioAiSnapshot, args: { fundCode?: unknown; fundName?: unknown }) {
  const fundCode = typeof args.fundCode === 'string' ? args.fundCode.trim() : ''
  const fundName = typeof args.fundName === 'string' ? args.fundName.trim() : ''

  if (fundCode) {
    return snapshot.holdings.find((item) => item.fundCode === fundCode) ?? null
  }

  if (fundName) {
    return snapshot.holdings.find(
      (item) => item.fundName === fundName || item.fundName.includes(fundName),
    ) ?? null
  }

  return null
}

async function runPortfolioToolCall(toolCall: any, snapshot: PortfolioAiSnapshot) {
  const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : (toolCall.args ?? {})

  try {
    if (toolCall.name === 'get_portfolio_summary') {
      return JSON.stringify(
        {
          ok: true,
          tool: toolCall.name,
          budget: snapshot.budget,
          totals: snapshot.totals,
          followRatio: snapshot.followRatio,
          holdingCount: snapshot.holdings.length,
          pendingOperationCount: snapshot.operations.filter((item) => item.status === 'pending').length,
          settledOperationCount: snapshot.operations.filter((item) => item.status === 'settled').length,
        },
        null,
        2,
      )
    }

    if (toolCall.name === 'list_portfolio_holdings') {
      const sortBy = typeof args.sortBy === 'string' ? args.sortBy : 'myAmount'
      const order = args.order === 'asc' ? 'asc' : 'desc'
      const limit = normalizeLimit(args.limit, snapshot.holdings.length || 20, 100)
      const sorted = [...snapshot.holdings].sort((left, right) => {
        const leftValue = getHoldingSortValue(left, sortBy)
        const rightValue = getHoldingSortValue(right, sortBy)
        return order === 'asc' ? leftValue - rightValue : rightValue - leftValue
      })

      return JSON.stringify(
        {
          ok: true,
          tool: toolCall.name,
          total: snapshot.holdings.length,
          returned: Math.min(limit, sorted.length),
          holdings: sorted.slice(0, limit).map((item) => ({
            fundName: item.fundName,
            fundCode: item.fundCode,
            navDate: item.navDate,
            pendingOperations: item.pendingOperations,
            targetInvested: item.targetInvested,
            my: {
              amount: item.raw.myAmount,
              profit: item.raw.myProfit,
              profitRate: item.derived.myRate,
              invested: item.derived.myInvested,
              positionRate: item.derived.myPositionRate,
              shares: item.raw.myShares,
              cost: item.raw.myCost,
              nav: item.raw.myNav,
              yesterdayProfit: item.raw.myYesterdayProfit,
            },
            blogger: {
              amount: item.raw.bloggerAmount,
              profit: item.raw.bloggerProfit,
              profitRate: item.derived.bloggerRate,
              invested: item.derived.bloggerInvested,
              positionRate: item.derived.bloggerPositionRate,
              shares: item.raw.bloggerShares,
              cost: item.raw.bloggerCost,
              nav: item.raw.bloggerNav,
              yesterdayProfit: item.raw.bloggerYesterdayProfit,
            },
          })),
        },
        null,
        2,
      )
    }

    if (toolCall.name === 'get_holding_detail') {
      const holding = pickHolding(snapshot, args)
      if (!holding) {
        return JSON.stringify({ ok: false, tool: toolCall.name, error: '未找到对应持仓' }, null, 2)
      }

      const relatedOperations = snapshot.operations
        .filter((item) => item.fundCode === holding.fundCode || item.toFundCode === holding.fundCode)
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))

      return JSON.stringify(
        {
          ok: true,
          tool: toolCall.name,
          holding: {
            fundName: holding.fundName,
            fundCode: holding.fundCode,
            navDate: holding.navDate,
            targetInvested: holding.targetInvested,
            pendingOperations: holding.pendingOperations,
            my: {
              amount: holding.raw.myAmount,
              profit: holding.raw.myProfit,
              profitRate: holding.derived.myRate,
              invested: holding.derived.myInvested,
              positionRate: holding.derived.myPositionRate,
              shares: holding.raw.myShares,
              cost: holding.raw.myCost,
              nav: holding.raw.myNav,
              yesterdayProfit: holding.raw.myYesterdayProfit,
            },
            blogger: {
              amount: holding.raw.bloggerAmount,
              profit: holding.raw.bloggerProfit,
              profitRate: holding.derived.bloggerRate,
              invested: holding.derived.bloggerInvested,
              positionRate: holding.derived.bloggerPositionRate,
              shares: holding.raw.bloggerShares,
              cost: holding.raw.bloggerCost,
              nav: holding.raw.bloggerNav,
              yesterdayProfit: holding.raw.bloggerYesterdayProfit,
            },
          },
          relatedOperations,
        },
        null,
        2,
      )
    }

    if (toolCall.name === 'list_portfolio_operations') {
      const fundCode = typeof args.fundCode === 'string' ? args.fundCode.trim() : ''
      const status = args.status === 'pending' || args.status === 'settled' ? args.status : ''
      const type =
        args.type === 'buy' || args.type === 'sell' || args.type === 'convert' ? args.type : ''
      const limit = normalizeLimit(args.limit, 50, 200)

      const operations = snapshot.operations
        .filter((item) => (fundCode ? item.fundCode === fundCode || item.toFundCode === fundCode : true))
        .filter((item) => (status ? item.status === status : true))
        .filter((item) => (type ? item.type === type : true))
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))

      return JSON.stringify(
        {
          ok: true,
          tool: toolCall.name,
          total: operations.length,
          returned: Math.min(limit, operations.length),
          operations: operations.slice(0, limit),
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

async function resolveToolMessages(config: AiConfig, messages: any[], snapshot: PortfolioAiSnapshot) {
  const model = createAiModel(config, 0.2).bindTools([...FUND_TOOLS, ...PORTFOLIO_TOOLS], {
    tool_choice: 'auto',
  } as any)
  const nextMessages = [...messages]

  for (let index = 0; index < 6; index += 1) {
    const assistantMessage: any = await model.invoke(nextMessages)
    nextMessages.push(assistantMessage)

    if (!assistantMessage.tool_calls?.length) return nextMessages

    const toolMessages = await Promise.all(
      assistantMessage.tool_calls.map(
        async (toolCall: any) => {
          const content = PORTFOLIO_TOOLS.some((item) => item.function.name === toolCall.name)
            ? await runPortfolioToolCall(toolCall, snapshot)
            : await runFundToolCall(toolCall)

          return new ToolMessage({
            tool_call_id: toolCall.id,
            content,
          })
        },
      ),
    )

    nextMessages.push(...toolMessages)
  }

  return nextMessages
}

export async function streamPortfolioChat({
  config,
  messages,
  portfolioSnapshot,
  onDelta,
}: {
  config: AiConfig
  messages: AiChatMessage[]
  portfolioSnapshot: PortfolioAiSnapshot
  onDelta: (delta: string) => void
}) {
  const baseMessages = [
    new SystemMessage(
      '你是一个基金跟投分析助手。关于用户自己的组合数据，不要依赖臆测，也不要假设系统消息里带了完整上下文；需要时主动调用组合工具查询。' +
        '当用户提到基金代码、基金名称、历史净值、净值走势、区间表现时，优先调用工具核实后再回答。' +
        '如果数据不足，要明确说明，不要编造买入、卖出、转换记录。金额、比例、日期、份额、成本、待结算状态尽量引用工具返回的具体数值。',
    ),
    ...messages.map((message) =>
      message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content),
    ),
  ]

  const resolvedMessages = await resolveToolMessages(config, baseMessages, portfolioSnapshot)
  const stream = await createAiModel(config, 0.2).stream(resolvedMessages)

  for await (const chunk of stream) {
    const text = readAiTextContent(chunk.content)
    if (text) onDelta(text)
  }
}
