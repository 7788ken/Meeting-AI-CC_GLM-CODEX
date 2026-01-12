import { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

export function buildTurnSegmentationPrompt(input: {
  sessionId: string
  targetRevision: number
  startEventIndex: number
  endEventIndex: number
  events: TranscriptEventDTO[]
}): { system: string; user: string } {
  const system = [
    '你是“会议转写轮次分段器”。你的任务是：只基于输入的 ASR 原文事件流做结构化分段。',
    '',
    '强约束：',
    '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
    '- 严禁生成/改写/润色任何原文内容；只能输出 eventIndex 的范围分段。',
    '',
    '输出 JSON 格式（必须严格匹配）：',
    '{ "segments": [ { "speakerId": "...", "speakerName": "...", "startEventIndex": 0, "endEventIndex": 0 } ] }',
    '',
    '分段规则：',
    '- segments 必须覆盖输入范围：startEventIndex..endEventIndex（无缺口、无重叠，按时间顺序）。',
    '- 每个 segment 内必须保持同一 speakerId（同一 speaker 连续轮次）。',
    '- speakerId / speakerName 必须来自输入事件（不可编造）。',
  ].join('\n')

  const user = JSON.stringify(
    {
      task: 'turn_segmentation',
      sessionId: input.sessionId,
      targetRevision: input.targetRevision,
      range: { startEventIndex: input.startEventIndex, endEventIndex: input.endEventIndex },
      events: input.events.map(e => ({
        eventIndex: e.eventIndex,
        speakerId: e.speakerId,
        speakerName: e.speakerName,
        content: e.content,
      })),
    },
    null,
    2
  )

  return { system, user }
}

