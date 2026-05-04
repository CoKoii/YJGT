import type { AiConfig, RecognizedHolding } from '@/types'

function extractJson(text: string): RecognizedHolding[] {
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
  if (!match) {
    throw new Error('模型未返回 JSON')
  }

  const parsed = JSON.parse(match[0]) as RecognizedHolding | RecognizedHolding[]
  return Array.isArray(parsed) ? parsed : [parsed]
}

export async function recognizeHoldingImage(
  config: AiConfig,
  imageDataUrls: string[],
): Promise<RecognizedHolding[]> {
  if (!config.apiKey || !config.model) {
    throw new Error('请先填写 AI API Key 和模型名称')
  }
  if (imageDataUrls.length === 0) {
    throw new Error('请先上传截图')
  }

  const [{ HumanMessage }, { ChatOpenAI }] = await Promise.all([
    import('@langchain/core/messages'),
    import('@langchain/openai'),
  ])

  const model = new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    temperature: 0,
    configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
  })

  const response = await model.invoke([
    new HumanMessage({
      content: [
        {
          type: 'text',
          text:
            '你会收到一张或多张同一账户的基金持仓列表截图，可能是连续滚动截图。' +
            '你的任务是逐张识别所有基金持仓行，并合并为一个 JSON 数组返回。' +
            '只识别基金持仓行，忽略顶部标题、分类筛选、广告、市场解读、提示语、底部导航、空白区域和所有非持仓内容。' +
            '每行通常包含：基金名称、持有金额、持有收益/率。' +
            '输出必须是合法 JSON 数组，不要解释，不要 markdown，不要额外文本。' +
            '每个对象字段固定为：fundName, fundCode, amount, profit。' +
            'fundName 必须严格保留截图中的完整基金名称，不允许按常见基金名自动补全、纠错、替换或改写。' +
            '基金名称末尾的 A、B、C、D、E、I、Y、LOF、ETF、QDII 等份额/类型标识必须严格按截图原文保留。' +
            '如果截图显示“联接C”，fundName 必须以“联接C”结尾，不能写成“联接A”。' +
            '如果无法确认份额字母，只保留截图中可见文本，不要猜测。' +
            'fundCode 只有截图中明确出现 6 位数字代码时才填写，否则返回空字符串。' +
            'amount 取持有金额或金额列中的金额部分。' +
            'profit 取“持有收益/率”这一列中的持有收益，忽略百分比收益率。' +
            'amount、profit 必须使用数字类型，不要带货币符号、百分号、中文单位或千分位逗号。' +
            '负数必须保留负号。' +
            '如果某个字段无法识别，fundName 和 fundCode 返回空字符串，amount、profit 返回 null。' +
            '多张截图中同一基金重复出现时，以 fundName 为唯一标识，只保留一条。' +
            '返回格式示例：[{"fundName":"基金名称","fundCode":"","amount":1000.01,"profit":-12.34}]',
        },
        ...imageDataUrls.map((url) => ({
          type: 'image_url',
          image_url: { url },
        })),
      ],
    }),
  ])

  const content = Array.isArray(response.content)
    ? response.content.map((item) => (typeof item === 'string' ? item : item.text)).join('\n')
    : response.content

  return extractJson(content)
}
