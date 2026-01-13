import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

export function buildTranscriptEventSegmentationPrompt(input: {
  sessionId: string
  previousSentence: string
  startEventIndex: number
  endEventIndex: number
  events: TranscriptEventDTO[]
  extractedText: string
  strictEcho?: boolean
}): { system: string; user: string } {
  const strictEcho = !!input.strictEcho
  const system = [
    strictEcho
      ? '你是“会议语句拆分器”。你的任务是：原样输出 extractedText，不做任何改动。'
      : '你是“会议语句拆分器”。你的任务是：对输入的 extractedText 进行最小化断句与标点补全，输出 nextSentence。',
    '',
    '强约束：',
    '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
    '- 只输出一个字段：{ "nextSentence": "..." }',
    strictEcho
      ? '- nextSentence 必须与 extractedText 完全一致（允许去除首尾空白），不得新增/删除/替换任何字符（包括标点与空格）。'
      : '- nextSentence 只能由 extractedText 的原始字符按顺序组成，允许在字符之间插入少量空格与标点以提升可读性。',
    strictEcho
      ? '- 严禁任何形式的断句、加标点、加空格、改写、翻译、补全或总结。'
      : '- 严禁新增/删除/替换 extractedText 中的任何汉字/字母/数字（包括语气词“啊”“呢”等），严禁改写、翻译、补全或总结。',
    strictEcho
      ? '- 如果你无法做到逐字一致，请直接输出 extractedText（仍需 JSON 包裹）。'
      : '- 如果你无法严格遵守“只加标点不改字”，就直接原样输出 extractedText。',
    strictEcho ? '- 注意：这一轮是纠错重试，务必逐字一致。' : '- 参考句末标点：。！？?!；;',
    '',
    '示例（应该这样）：',
    '- extractedText 是“欢迎收听豆包AI播客节目。”时，nextSentence 直接输出“欢迎收听豆包AI播客节目。”。',
    '- extractedText 是“啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？”时，nextSentence 不得追加后续文本。',
    '',
    '输出 JSON 格式（必须严格匹配）：',
    '{ "nextSentence": "..." }',
  ].join('\n')

  const user = JSON.stringify(
    {
      task: 'transcript_event_segmentation',
      sessionId: input.sessionId,
      previousSentence: input.previousSentence,
      range: { startEventIndex: input.startEventIndex, endEventIndex: input.endEventIndex },
      extractedText: input.extractedText,
      events: input.events.map(event => ({
        eventIndex: event.eventIndex,
        content: event.content,
      })),
    },
    null,
    2
  )

  return { system, user }
}
