import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import type { AiChatMessage, HoldingRow, PortfolioTotals, RecognizedHolding, Settings } from '@/types/portfolio'

function normalizeAiBaseUrl(baseURL: string): string {
  return baseURL
    .trim()
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/$/, '')
}

function assertAiConfig(settings: Settings): void {
  if (!settings.aiBaseURL.trim() || !settings.aiApiKey.trim() || !settings.aiModel.trim()) {
    throw new Error('请先在 AI 设置中填写 Base URL、API Key 和模型名称')
  }
}

function createModel(settings: Settings, temperature = 0): ChatOpenAI {
  assertAiConfig(settings)
  return new ChatOpenAI({
    apiKey: settings.aiApiKey,
    model: settings.aiModel,
    temperature,
    configuration: { baseURL: normalizeAiBaseUrl(settings.aiBaseURL) },
  })
}

function readAiTextContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item) return String(item.text ?? '')
        return ''
      })
      .join('')
  }

  return typeof content === 'string' ? content : String(content ?? '')
}

function extractJsonArray(text: string): RecognizedHolding[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('模型未返回 JSON 数组')
  return JSON.parse(match[0]) as RecognizedHolding[]
}

export async function recognizeHoldingImages(
  settings: Settings,
  imageDataUrls: string[],
): Promise<RecognizedHolding[]> {
  assertAiConfig(settings)
  if (imageDataUrls.length === 0) throw new Error('请先上传截图')

  const response = await createModel(settings).invoke([
    new HumanMessage({
      content: [
        {
          type: 'text',
          text:
            '你会收到一张或多张同一账户的基金持仓列表截图。只识别基金持仓行，忽略标题、广告、提示、导航和非持仓内容。' +
            '输出必须是合法 JSON 数组，不要解释，不要 markdown，不要额外文本。' +
            '每个对象字段固定为 fundName, fundCode, amount, profit。' +
            'fundName 必须严格保留截图中的完整基金名称，不允许自动补全、纠错或改写。' +
            'fundCode 只有截图中明确出现 6 位数字代码时才填写，否则返回空字符串。' +
            'amount 取持有金额；profit 取持有收益，忽略百分比收益率。' +
            'amount、profit 必须是数字，不带货币符号、百分号或千分位逗号；负数保留负号。' +
            '无法识别的文字字段返回空字符串，数字字段返回 0。' +
            '同一基金重复出现时保留一条。示例：[{"fundName":"基金名称","fundCode":"000001","amount":1000.01,"profit":-12.34}]',
        },
        ...imageDataUrls.map((url) => ({
          type: 'image_url',
          image_url: { url },
        })),
      ],
    }),
  ])

  return extractJsonArray(readAiTextContent(response.content))
}

function buildPortfolioContext({
  holdings,
  totals,
}: {
  holdings: HoldingRow[]
  totals: PortfolioTotals
}): string {
  return JSON.stringify(
    {
      rule:
        '这些组合数据全部由源事件账本投影而来。金额、份额、成本、收益都不得反推编造；没有的字段就说明数据不足。',
      totals,
      holdings: holdings.map((holding) => ({
        fundCode: holding.fundCode,
        fundName: holding.fundName,
        mine: {
          amount: holding.myAmount,
          cost: holding.myCost,
          shares: holding.myShares,
          profit: holding.myProfit,
          profitRate: holding.myProfitRate,
          todayProfit: holding.myTodayProfit,
          positionRate: holding.myPositionRate,
        },
        blogger: {
          amount: holding.bloggerAmount,
          cost: holding.bloggerCost,
          shares: holding.bloggerShares,
          profit: holding.bloggerProfit,
          profitRate: holding.bloggerProfitRate,
          todayProfit: holding.bloggerTodayProfit,
          positionRate: holding.bloggerPositionRate,
        },
        latestNav: holding.latestNav,
        latestNavDate: holding.latestNavDate,
        lastSnapshotDate: holding.lastSnapshotDate,
      })),
    },
    null,
    2,
  )
}

export async function streamPortfolioChat({
  settings,
  messages,
  holdings,
  totals,
  onDelta,
}: {
  settings: Settings
  messages: AiChatMessage[]
  holdings: HoldingRow[]
  totals: PortfolioTotals
  onDelta: (delta: string) => void
}): Promise<void> {
  const model = createModel(settings, 0.2)
  const context = buildPortfolioContext({ holdings, totals })
  const stream = await model.stream([
    new SystemMessage(
      '你是基金跟投分析助手。只能基于用户提供的源账本投影数据分析，不要编造交易记录、份额、成本或收益。' +
        '回答要简洁，金额和日期尽量引用具体数值。遇到截图未提供份额、持仓无法按净值滚动等情况，要直接说明数据不足。',
    ),
    new SystemMessage(`当前组合投影数据：\n${context}`),
    ...messages.map((message) => new HumanMessage(`${message.role}: ${message.content}`)),
  ])

  for await (const chunk of stream) {
    const text = readAiTextContent(chunk.content)
    if (text) onDelta(text)
  }
}
