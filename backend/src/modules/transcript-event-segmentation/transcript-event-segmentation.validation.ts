export type ParsedTranscriptEventSegment = {
  nextSentence?: string
  content?: string
}

export function parseTranscriptEventSegmentJson(text: string): { nextSentence: string } {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  const candidates = buildJsonCandidates(trimmed)

  for (const candidate of candidates) {
    const parsed = safeParseJson(candidate)
    if (!isRecord(parsed)) {
      continue
    }
    const nextSentence = extractNextSentence(parsed)
    if (nextSentence) {
      return { nextSentence }
    }
  }

  if (trimmed) {
    return { nextSentence: trimmed }
  }

  throw new Error('LLM 输出不是合法 JSON')
}

function safeParseJson(candidate: string): unknown | null {
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractNextSentence(parsed: Record<string, unknown>): string | null {
  const rawNext =
    typeof parsed.nextSentence === 'string'
      ? parsed.nextSentence
      : typeof parsed.content === 'string'
        ? parsed.content
        : null
  const normalized = rawNext ? rawNext.trim() : ''
  return normalized ? normalized : null
}

function buildJsonCandidates(text: string): string[] {
  const candidates = new Set<string>()
  if (!text) return []

  candidates.add(text)

  const fenced = stripCodeFence(text)
  if (fenced) {
    candidates.add(fenced)
  }

  const extracted = extractJsonObject(text)
  if (extracted) {
    candidates.add(extracted)
  }

  return Array.from(candidates)
}

function stripCodeFence(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return null
  const withoutStart = trimmed.replace(/^```[a-zA-Z]*\s*/u, '')
  const withoutEnd = withoutStart.replace(/```\s*$/u, '')
  const normalized = withoutEnd.trim()
  return normalized || null
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const extracted = text.slice(start, end + 1).trim()
  return extracted || null
}
