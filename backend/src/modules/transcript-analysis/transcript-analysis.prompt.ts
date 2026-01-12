import { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

export function buildTranscriptAnalysisPrompt(input: {
  sessionId: string
  startEventIndex: number
  endEventIndex: number
  events: TranscriptEventDTO[]
}): { system: string; user: string } {
  const system = [
    '你是“会议语义分段器”。你的任务是：仅基于输入的转写事件，输出结构化对话分段。',
    '',
    '强约束：',
    '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
    '- 严禁改写、润色、补写原文内容。',
    '',
    '输出 JSON 格式（必须严格匹配）：',
    '{ "dialogues": [ { "speakerId": "...", "speakerName": "...", "startEventIndex": 0, "endEventIndex": 0, "content": "..." } ] }',
    '',
    '分段规则：',
    '- dialogues 必须覆盖输入范围：startEventIndex..endEventIndex（无缺口、无重叠，按时间顺序）。',
    '- 相邻对话必须连续：后一段 startEventIndex = 前一段 endEventIndex + 1。',
    '- 每个对话内必须保持同一 speakerId（同一 speaker 连续发言）。',
    '- speakerId / speakerName 必须来自输入事件（不可编造）。',
    '- content 必须为该段内所有事件 content 的按序拼接（不新增、不删减、不改写）。',
    '- 若无法保证以上规则，请输出 1 个对话覆盖整个范围，speakerId/speakerName 取输入事件列表的第一条。',
  ].join('\n')

  const user = JSON.stringify(
    {
      task: 'transcript_semantic_analysis',
      sessionId: input.sessionId,
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
