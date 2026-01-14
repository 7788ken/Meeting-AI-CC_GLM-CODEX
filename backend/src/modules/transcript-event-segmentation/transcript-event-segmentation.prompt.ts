import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

export const DEFAULT_SEGMENTATION_SYSTEM_PROMPT = [
  '你是“会议语句拆分器”。你的任务是：从 extractedText 的开头截取出“下一句/下一段”（尽量短且语义完整），并可做最小化断句与标点补全。',
  '',
  '强约束：',
  '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
  '- 只输出一个字段：{ "nextSentence": "..." }',
  '- nextSentence 必须对应 extractedText 的一个【前缀】（从开头开始，连续截取）；允许在字符之间插入少量空格与标点以提升可读性。',
  '- 严禁新增/删除/替换 extractedText 中的任何汉字/字母/数字（包括语气词“啊”“呢”等），严禁改写、翻译、补全或总结。',
  '- 如果你无法严格遵守“只加标点不改字”，就直接原样输出 extractedText。',
  '- 参考句末标点：。！？?!；;',
  '',
  '示例（应该这样）：',
  '- extractedText 是“欢迎收听AI会议助手播客节目。”时，nextSentence 直接输出“欢迎收听AI会议助手播客节目。”。',
  '- extractedText 是“啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？”时，nextSentence 不得追加后续文本。',
  '',
  '输出 JSON 格式（必须严格匹配）：',
  '{ "nextSentence": "..." }',
].join('\n')

export const DEFAULT_SEGMENTATION_STRICT_SYSTEM_PROMPT = [
  '你是“会议语句拆分器”。你的任务是：原样输出 extractedText，不做任何改动。',
  '',
  '强约束：',
  '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
  '- 只输出一个字段：{ "nextSentence": "..." }',
  '- nextSentence 必须与 extractedText 完全一致（允许去除首尾空白），不得新增/删除/替换任何字符（包括标点与空格）。',
  '- 严禁任何形式的断句、加标点、加空格、改写、翻译、补全或总结。',
  '- 如果你无法做到逐字一致，请直接输出 extractedText（仍需 JSON 包裹）。',
  '- 注意：这一轮是纠错重试，务必逐字一致。',
  '',
  '示例（应该这样）：',
  '- extractedText 是“欢迎收听AI会议助手播客节目。”时，nextSentence 直接输出“欢迎收听AI会议助手播客节目。”。',
  '- extractedText 是“啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？”时，nextSentence 不得追加后续文本。',
  '',
  '输出 JSON 格式（必须严格匹配）：',
  '{ "nextSentence": "..." }',
].join('\n')

const resolveSystemPrompt = (override: string | undefined, fallback: string): string => {
  if (typeof override !== 'string') return fallback
  const trimmed = override.trim()
  return trimmed ? trimmed : fallback
}

export function buildTranscriptEventSegmentationPrompt(input: {
  sessionId: string
  previousSentence: string
  startEventIndex: number
  endEventIndex: number
  events: TranscriptEventDTO[]
  extractedText: string
  strictEcho?: boolean
  systemPrompt?: string
  strictSystemPrompt?: string
}): { system: string; user: string } {
  const strictEcho = !!input.strictEcho
  const system = strictEcho
    ? resolveSystemPrompt(input.strictSystemPrompt, DEFAULT_SEGMENTATION_STRICT_SYSTEM_PROMPT)
    : resolveSystemPrompt(input.systemPrompt, DEFAULT_SEGMENTATION_SYSTEM_PROMPT)

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
