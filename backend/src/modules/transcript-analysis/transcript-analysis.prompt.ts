import { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

export function buildTranscriptAnalysisPrompt(input: {
  sessionId: string
  startEventIndex: number
  endEventIndex: number
  targetEventIndex: number
  events: TranscriptEventDTO[]
}): { system: string; user: string } {
  const system = [
    '你是“会议语义分段器”。你的任务是：基于窗口上下文判断目标事件是否应与前后合并，输出包含目标事件的对话分段。',
    '',
    '输入说明：',
    '- events: 窗口内事件（包含前后文）',
    '- range: 窗口边界 startEventIndex..endEventIndex',
    '- targetEventIndex: 本次需要重点处理的事件索引',
    '',
    '强约束：',
    '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
    '- 严禁改写、润色、补写原文内容。',
    '',
    '输出 JSON 格式（必须严格匹配）：',
    '{ "dialogues": [ { "speakerId": "...", "speakerName": "...", "startEventIndex": 0, "endEventIndex": 0, "content": "..." } ] }',
    '',
    '分段规则：',
    '- dialogues 必须包含 targetEventIndex 所在的对话分段。',
    '- startEventIndex/endEventIndex 必须准确反映合并范围；必要时可跨越窗口边界。',
    '- 每个对话内必须保持同一 speakerId（同一 speaker 连续发言）。',
    '- speakerId / speakerName 必须来自输入事件（不可编造）。',
    '- content 必须为该段内所有事件 content 的按序拼接（不新增、不删减、不改写）。',
    '- 若无法保证以上规则，请输出 1 个对话仅覆盖 targetEventIndex，speakerId/speakerName 取目标事件。',
  ].join('\n')

  const user = JSON.stringify(
    {
      task: 'transcript_semantic_analysis',
      sessionId: input.sessionId,
      range: { startEventIndex: input.startEventIndex, endEventIndex: input.endEventIndex },
      targetEventIndex: input.targetEventIndex,
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
