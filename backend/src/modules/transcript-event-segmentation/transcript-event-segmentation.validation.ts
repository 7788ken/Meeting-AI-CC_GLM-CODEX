export type ParsedTranscriptEventSegment = {
  nextSentence?: string
  content?: string
}

export function parseTranscriptEventSegmentJson(text: string): { nextSentence: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('LLM 输出不是合法 JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM 输出不是有效对象')
  }

  const rawNext =
    typeof (parsed as any).nextSentence === 'string'
      ? (parsed as any).nextSentence
      : (parsed as any).content

  if (typeof rawNext !== 'string') {
    throw new Error('LLM 输出缺少 nextSentence')
  }

  const nextSentence = rawNext.trim()
  if (!nextSentence) {
    throw new Error('nextSentence 为空')
  }

  return { nextSentence }
}
