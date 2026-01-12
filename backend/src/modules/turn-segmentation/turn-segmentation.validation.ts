import { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'
import { TurnSegmentRange } from './schemas/turn-segments.schema'

export type ParsedTurnSegments = {
  segments: Array<{
    speakerId: string
    speakerName: string
    startEventIndex: number
    endEventIndex: number
  }>
}

export function extractFirstJson(text: string): string | null {
  const raw = (text ?? '').trim()
  if (!raw) return null

  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(raw)
  if (fenced?.[1]) {
    const inside = fenced[1].trim()
    if (inside.startsWith('{') && inside.endsWith('}')) return inside
  }

  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first < 0 || last < 0 || last <= first) return null
  return raw.slice(first, last + 1)
}

export function parseTurnSegmentsJson(text: string): ParsedTurnSegments {
  const jsonText = extractFirstJson(text)
  if (!jsonText) {
    throw new Error('GLM 响应中未找到 JSON')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('GLM 输出不是合法 JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('GLM 输出 JSON 不是对象')
  }

  const segments = (parsed as any).segments
  if (!Array.isArray(segments)) {
    throw new Error('GLM 输出缺少 segments 数组')
  }

  return { segments }
}

export function validateAndNormalizeSegments(input: {
  events: TranscriptEventDTO[]
  startEventIndex: number
  endEventIndex: number
  segments: ParsedTurnSegments['segments']
}): TurnSegmentRange[] {
  const start = Math.max(0, Math.floor(input.startEventIndex))
  const end = Math.max(start, Math.floor(input.endEventIndex))

  const eventByIndex = new Map<number, TranscriptEventDTO>()
  for (const e of input.events) {
    eventByIndex.set(e.eventIndex, e)
  }

  for (let idx = start; idx <= end; idx += 1) {
    if (!eventByIndex.has(idx)) {
      throw new Error(`事件缺失：eventIndex=${idx}`)
    }
  }

  const normalized: TurnSegmentRange[] = []
  for (const item of input.segments) {
    if (!item || typeof item !== 'object') {
      throw new Error('segments 中存在非对象元素')
    }
    const rawStart = Number((item as any).startEventIndex)
    const rawEnd = Number((item as any).endEventIndex)
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
      throw new Error('segment 的 start/end 不是数字')
    }
    const segStart = Math.floor(rawStart)
    const segEnd = Math.floor(rawEnd)
    if (segStart < start || segEnd > end || segStart > segEnd) {
      throw new Error(`segment 范围非法：${segStart}..${segEnd}（期望 ${start}..${end}）`)
    }

    const firstEvent = eventByIndex.get(segStart)
    if (!firstEvent) {
      throw new Error(`segment 起点事件不存在：${segStart}`)
    }

    for (let idx = segStart; idx <= segEnd; idx += 1) {
      const ev = eventByIndex.get(idx)
      if (!ev) {
        throw new Error(`segment 覆盖到不存在的事件：eventIndex=${idx}`)
      }
      if (ev.speakerId !== firstEvent.speakerId) {
        throw new Error(
          `segment 内 speakerId 不连续：eventIndex=${idx} speakerId=${ev.speakerId} expected=${firstEvent.speakerId}`
        )
      }
    }

    normalized.push({
      speakerId: firstEvent.speakerId,
      speakerName: firstEvent.speakerName,
      startEventIndex: segStart,
      endEventIndex: segEnd,
    })
  }

  normalized.sort((a, b) => a.startEventIndex - b.startEventIndex)

  if (normalized.length === 0) {
    throw new Error('segments 为空')
  }
  if (normalized[0].startEventIndex !== start) {
    throw new Error(`segments 未覆盖起点：start=${start}`)
  }
  if (normalized[normalized.length - 1].endEventIndex !== end) {
    throw new Error(`segments 未覆盖终点：end=${end}`)
  }

  for (let i = 1; i < normalized.length; i += 1) {
    const prev = normalized[i - 1]
    const cur = normalized[i]
    if (cur.startEventIndex !== prev.endEventIndex + 1) {
      throw new Error(`segments 存在缺口或重叠：prev=${prev.endEventIndex} cur=${cur.startEventIndex}`)
    }
    if (cur.speakerId === prev.speakerId) {
      throw new Error('segments 未合并同 speaker 的连续轮次')
    }
  }

  return normalized
}

export function heuristicSegmentBySpeaker(input: {
  events: TranscriptEventDTO[]
  startEventIndex: number
  endEventIndex: number
}): TurnSegmentRange[] {
  const start = Math.max(0, Math.floor(input.startEventIndex))
  const end = Math.max(start, Math.floor(input.endEventIndex))
  const byIndex = new Map<number, TranscriptEventDTO>()
  for (const e of input.events) byIndex.set(e.eventIndex, e)

  let current: TurnSegmentRange | null = null
  const segments: TurnSegmentRange[] = []

  for (let idx = start; idx <= end; idx += 1) {
    const ev = byIndex.get(idx)
    if (!ev) {
      throw new Error(`事件缺失：eventIndex=${idx}`)
    }

    if (!current) {
      current = {
        speakerId: ev.speakerId,
        speakerName: ev.speakerName,
        startEventIndex: idx,
        endEventIndex: idx,
      }
      continue
    }

    if (ev.speakerId === current.speakerId) {
      current.endEventIndex = idx
      continue
    }

    segments.push(current)
    current = {
      speakerId: ev.speakerId,
      speakerName: ev.speakerName,
      startEventIndex: idx,
      endEventIndex: idx,
    }
  }

  if (current) segments.push(current)
  return segments
}

