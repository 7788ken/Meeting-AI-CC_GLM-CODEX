import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

const SENTENCE_END_PUNCTUATIONS = ['。', '！', '？', '!', '?', '；', ';'] as const

function hasSentenceEndPunctuation(text: string): boolean {
  const value = typeof text === 'string' ? text : ''
  return SENTENCE_END_PUNCTUATIONS.some(p => value.includes(p))
}

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

function buildNormalizedTextIndexMap(value: string): {
  normalized: string
  originalStartOffsets: number[]
  originalEndOffsets: number[]
} {
  const normalizedChars: string[] = []
  const originalStartOffsets: number[] = []
  const originalEndOffsets: number[] = []

  let offset = 0
  for (const char of value) {
    const nextOffset = offset + char.length
    if (/[\p{L}\p{N}]/u.test(char)) {
      normalizedChars.push(char)
      originalStartOffsets.push(offset)
      originalEndOffsets.push(nextOffset)
    }
    offset = nextOffset
  }

  return {
    normalized: normalizedChars.join(''),
    originalStartOffsets,
    originalEndOffsets,
  }
}

function skipNonLetterOrNumber(text: string, startOffset: number): number {
  let offset = startOffset
  while (offset < text.length) {
    const char = text.slice(offset, offset + 2)
    const value = char.length === 2 && /[\uD800-\uDBFF]/u.test(char[0]) ? char : text[offset]
    if (/[\p{L}\p{N}]/u.test(value)) {
      return offset
    }
    offset += value.length
  }
  return offset
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

function findSoftBoundaryIndex(text: string): number {
  const patterns: RegExp[] = [
    /的啊(?=这个|我们|他|她|它|你|我|大家|这|那|咱们|今天|然后|接下来|其实|那么)/u,
    /的啊(?=此|该)/u,
  ]

  let best = -1
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (!match) continue
    const index = match.index + match[0].length
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
}): {
  windowText: string
  rawSegment: string
  startOffset: number
  endOffset: number
  previousSentenceFoundAt: number
  endReason: 'sentence_end' | 'lead_in' | 'soft_boundary' | 'window_end'
  hasSentenceEndPunctuation: boolean
} {
  const windowText = buildWindowText(input.events)
  const previousSentence =
    typeof input.previousSentence === 'string' ? input.previousSentence.trim() : ''

  let previousSentenceFoundAt = -1
  let startOffset = 0

  if (!isPlaceholderPreviousSentence(previousSentence) && previousSentence) {
    const windowMap = buildNormalizedTextIndexMap(windowText)
    const prevMap = buildNormalizedTextIndexMap(previousSentence)
    if (prevMap.normalized) {
      const normalizedIndex = windowMap.normalized.lastIndexOf(prevMap.normalized)
      if (normalizedIndex >= 0) {
        const matchStart = windowMap.originalStartOffsets[normalizedIndex]
        const matchEnd =
          windowMap.originalEndOffsets[normalizedIndex + prevMap.normalized.length - 1]
        if (typeof matchStart === 'number' && typeof matchEnd === 'number') {
          previousSentenceFoundAt = matchStart
          const exactSlice = windowText.slice(matchStart, matchStart + previousSentence.length)
          startOffset =
            exactSlice === previousSentence
              ? matchStart + previousSentence.length
              : skipNonLetterOrNumber(windowText, matchEnd)
        }
      }
    }
  }

  const tail = windowText.slice(startOffset)

  const leadInIndex = findQuestionLeadInIndex(tail)
  const sentenceEndIndex = findFirstSentenceEndIndex(tail)
  const softBoundaryIndex = findSoftBoundaryIndex(tail)

  const candidates: Array<{
    reason: 'sentence_end' | 'lead_in' | 'soft_boundary'
    index: number
  }> = []

  if (leadInIndex > 0) {
    candidates.push({ reason: 'lead_in', index: leadInIndex })
  }
  if (sentenceEndIndex >= 0) {
    candidates.push({ reason: 'sentence_end', index: sentenceEndIndex + 1 })
  }
  if (softBoundaryIndex > 0) {
    candidates.push({ reason: 'soft_boundary', index: softBoundaryIndex })
  }

  let selected: { reason: 'sentence_end' | 'lead_in' | 'soft_boundary'; index: number } | null =
    null
  for (const candidate of candidates) {
    if (!selected || candidate.index < selected.index) {
      selected = candidate
    }
  }

  const relativeEnd = selected ? selected.index : tail.length
  const endOffset = startOffset + relativeEnd

  const rawSegment = windowText.slice(startOffset, endOffset).trim()
  const endReason: 'sentence_end' | 'lead_in' | 'soft_boundary' | 'window_end' =
    selected?.reason ?? 'window_end'

  return {
    windowText,
    rawSegment,
    startOffset,
    endOffset,
    previousSentenceFoundAt,
    endReason,
    hasSentenceEndPunctuation: hasSentenceEndPunctuation(rawSegment),
  }
}

export function normalizeForPunctuationOnlyCompare(text: string): string {
  const value = typeof text === 'string' ? text : ''
  return value.replace(/[^\p{L}\p{N}]+/gu, '')
}

type EventOffsetRange = {
  startEventIndex: number
  startEventOffset: number
  endEventIndex: number
  endEventOffset: number
}

type EventOffsetRangeItem = {
  eventIndex: number
  startOffset: number
  endOffset: number
}

function buildEventOffsetRanges(events: TranscriptEventDTO[]): EventOffsetRangeItem[] {
  const ranges: EventOffsetRangeItem[] = []
  let offset = 0
  for (const event of events || []) {
    const content = typeof event?.content === 'string' ? event.content : ''
    const startOffset = offset
    const endOffset = startOffset + content.length
    ranges.push({ eventIndex: event.eventIndex, startOffset, endOffset })
    offset = endOffset
  }
  return ranges
}

function findEventRangeIndexByOffset(ranges: EventOffsetRangeItem[], offset: number): number {
  for (let i = 0; i < ranges.length; i += 1) {
    if (ranges[i].endOffset > offset) return i
  }
  return ranges.length - 1
}

export function resolveEventOffsetRange(
  events: TranscriptEventDTO[],
  startOffset: number,
  endOffset: number
): EventOffsetRange | null {
  const ranges = buildEventOffsetRanges(events)
  if (!ranges.length) return null
  const totalLength = ranges[ranges.length - 1].endOffset
  const normalizedStart = Math.max(0, Math.min(startOffset, totalLength))
  const normalizedEnd = Math.max(normalizedStart, Math.min(endOffset, totalLength))
  if (normalizedEnd <= normalizedStart) return null

  const startIndex = findEventRangeIndexByOffset(ranges, normalizedStart)
  const lastCharOffset = Math.max(normalizedStart, normalizedEnd - 1)
  const endIndex = findEventRangeIndexByOffset(ranges, lastCharOffset)

  const startRange = ranges[startIndex]
  const endRange = ranges[endIndex]
  if (!startRange || !endRange) return null

  return {
    startEventIndex: startRange.eventIndex,
    startEventOffset: Math.max(0, normalizedStart - startRange.startOffset),
    endEventIndex: endRange.eventIndex,
    endEventOffset: Math.max(0, lastCharOffset - endRange.startOffset + 1),
  }
}
