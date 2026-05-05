import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false,
})

export function renderMarkdown(content: string): string {
  const text = content.trim()
  return text ? markdown.render(text) : '<p>...</p>'
}
