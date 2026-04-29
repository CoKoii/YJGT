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
  imageDataUrl: string,
): Promise<RecognizedHolding[]> {
  if (!config.apiKey || !config.model) {
    throw new Error('请先填写 AI API Key 和模型名称')
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
            '请从基金持仓截图中识别持仓信息，只返回 JSON。字段为 fundName, fundCode, amount, profit。' +
            '如果有多条持仓，返回数组；金额用数字，不要带货币符号或逗号。',
        },
        {
          type: 'image_url',
          image_url: { url: imageDataUrl },
        },
      ],
    }),
  ])

  const content = Array.isArray(response.content)
    ? response.content.map((item) => (typeof item === 'string' ? item : item.text)).join('\n')
    : response.content

  return extractJson(content)
}
