import { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'
import { TranscriptDialogue } from './schemas/transcript-analysis-chunk.schema'

export type ParsedTranscriptAnalysis = {
  dialogues: Array<{
    speakerId?: string
    speakerName?: string
    startEventIndex?: number
    endEventIndex?: number
    content?: string
    correctedContent?: string // 新增：GLM 纠正后的内容
  }>
}

export function parseTranscriptAnalysisJson(text: string): ParsedTranscriptAnalysis {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('LLM 输出不是合法 JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM 输出不是有效对象')
  }

  const dialogues = (parsed as any).dialogues
  if (!Array.isArray(dialogues)) {
    throw new Error('LLM 输出缺少 dialogues 数组')
  }

  return { dialogues }
}

export function validateAndNormalizeDialogues(input: {
  events: TranscriptEventDTO[]
  dialogues: ParsedTranscriptAnalysis['dialogues']
  targetEventIndex: number
}): TranscriptDialogue[] {
  const eventsByIndex = new Map<number, TranscriptEventDTO>()
  for (const event of input.events) {
    eventsByIndex.set(event.eventIndex, event)
  }

  if (!eventsByIndex.has(input.targetEventIndex)) {
    throw new Error(`目标事件不存在：eventIndex=${input.targetEventIndex}`)
  }

  const normalized: TranscriptDialogue[] = []
  let previousEnd: number | null = null
  let containsTarget = false

  for (const item of input.dialogues) {
    if (!item || typeof item !== 'object') {
      throw new Error('dialogues 中存在非对象元素')
    }

    const segStart = Number(item.startEventIndex)
    const segEnd = Number(item.endEventIndex)
    if (!Number.isFinite(segStart) || !Number.isFinite(segEnd)) {
      throw new Error('dialogue 的 start/end 不是数字')
    }

    const start = Math.max(0, Math.floor(segStart))
    const end = Math.max(start, Math.floor(segEnd))

    if (previousEnd != null && start <= previousEnd) {
      throw new Error(`dialogue 范围重叠或乱序：startEventIndex=${start}`)
    }

    const first = eventsByIndex.get(start)
    if (!first) {
      throw new Error(`dialogue 起点事件不存在：eventIndex=${start}`)
    }

    for (let idx = start; idx <= end; idx += 1) {
      const event = eventsByIndex.get(idx)
      if (!event) {
        throw new Error(`dialogue 覆盖到不存在的事件：eventIndex=${idx}`)
      }
      if (event.speakerId !== first.speakerId) {
        throw new Error(`dialogue 内 speaker 不一致：eventIndex=${idx}`)
      }
    }

    if (input.targetEventIndex >= start && input.targetEventIndex <= end) {
      containsTarget = true
    }

    const content = buildContentByRange(eventsByIndex, start, end)
    const correctedContent =
      typeof item.correctedContent === 'string' && item.correctedContent.trim()
        ? item.correctedContent
        : content

    normalized.push({
      speakerId: first.speakerId,
      speakerName: first.speakerName,
      startEventIndex: start,
      endEventIndex: end,
      content,
      correctedContent,
    })

    previousEnd = end
  }

  if (!normalized.length) {
    throw new Error('dialogues 为空')
  }
  if (!containsTarget) {
    throw new Error(`dialogues 未覆盖目标事件：targetEventIndex=${input.targetEventIndex}`)
  }

  return normalized
}

export function heuristicDialoguesBySpeaker(input: {
  events: TranscriptEventDTO[]
  startEventIndex: number
  endEventIndex: number
}): TranscriptDialogue[] {
  const events = input.events
  if (!events.length) return []

  const dialogues: TranscriptDialogue[] = []
  let current = events[0]
  let segmentStart = current.eventIndex
  let parts: string[] = [current.content]

  for (let i = 1; i < events.length; i += 1) {
    const event = events[i]
    if (event.speakerId === current.speakerId) {
      parts.push(event.content)
      continue
    }

    dialogues.push({
      speakerId: current.speakerId,
      speakerName: current.speakerName,
      startEventIndex: segmentStart,
      endEventIndex: events[i - 1].eventIndex,
      content: parts.join(''),
    })

    current = event
    segmentStart = event.eventIndex
    parts = [event.content]
  }

  dialogues.push({
    speakerId: current.speakerId,
    speakerName: current.speakerName,
    startEventIndex: segmentStart,
    endEventIndex: events[events.length - 1].eventIndex,
    content: parts.join(''),
  })

  return dialogues
}

function buildContentByRange(
  eventsByIndex: Map<number, TranscriptEventDTO>,
  startEventIndex: number,
  endEventIndex: number
): string {
  const parts: string[] = []
  for (let idx = startEventIndex; idx <= endEventIndex; idx += 1) {
    const event = eventsByIndex.get(idx)
    if (event?.content) parts.push(event.content)
  }
  return parts.join('')
}
