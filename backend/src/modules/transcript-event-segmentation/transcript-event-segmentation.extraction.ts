import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

const SENTENCE_END_PUNCTUATIONS = ['。', '！', '？', '!', '?', '；', ';'] as const

function isPlaceholderPreviousSentence(value: string): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return true
  return /^[.。…·\s]+$/u.test(trimmed)
}

function buildWindowText(events: TranscriptEventDTO[]): string {
  return (events || [])
    .map(event => (typeof event?.content === 'string' ? event.content : ''))
    .join('')
}

function findQuestionLeadInIndex(text: string): number {
  const patterns: RegExp[] = [
    /对\s*第\s*[一二三四五六七八九十0-9]+\s*(?:个\s*)?(?:问题|问)/u,
    /(?:那么|接下来|然后|下面|好)\s*第\s*[一二三四五六七八九十0-9]+\s*(?:个\s*)?(?:问题|问)/u,
    /第\s*[一二三四五六七八九十0-9]+\s*(?:个\s*)?(?:问题|问)/u,
  ]

  let best = -1
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (!match) continue
    const index = match.index
    if (index < 0) continue
    if (best < 0 || index < best) best = index
  }

  return best
}

function findFirstSentenceEndIndex(text: string): number {
  let best = -1
  for (const punctuation of SENTENCE_END_PUNCTUATIONS) {
    const index = text.indexOf(punctuation)
    if (index < 0) continue
    if (best < 0 || index < best) best = index
  }
  return best
}

export function extractRawNextSegment(input: {
  previousSentence: string
  events: TranscriptEventDTO[]
}): { windowText: string; rawSegment: string; startOffset: number; endOffset: number } {
  const windowText = buildWindowText(input.events)
  const previousSentence = typeof input.previousSentence === 'string' ? input.previousSentence.trim() : ''

  const previousSentenceFoundAt =
    !isPlaceholderPreviousSentence(previousSentence) && previousSentence
      ? windowText.lastIndexOf(previousSentence)
      : -1

  const startOffset =
    previousSentenceFoundAt >= 0 ? previousSentenceFoundAt + previousSentence.length : 0
  const tail = windowText.slice(startOffset)

  const leadInIndex = findQuestionLeadInIndex(tail)
  const sentenceEndIndex = findFirstSentenceEndIndex(tail)

  const endCandidates = [leadInIndex, sentenceEndIndex >= 0 ? sentenceEndIndex + 1 : -1].filter(
    value => value > 0
  )
  const relativeEnd = endCandidates.length ? Math.min(...endCandidates) : tail.length
  const endOffset = startOffset + relativeEnd

  const rawSegment = windowText.slice(startOffset, endOffset).trim()
  return { windowText, rawSegment, startOffset, endOffset }
}

export function normalizeForPunctuationOnlyCompare(text: string): string {
  const value = typeof text === 'string' ? text : ''
  return value.replace(/[^\p{L}\p{N}]+/gu, '')
}

