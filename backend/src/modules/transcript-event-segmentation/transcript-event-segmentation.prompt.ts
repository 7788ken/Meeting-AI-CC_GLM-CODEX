import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

export function buildTranscriptEventSegmentationPrompt(input: {
  sessionId: string
  previousSentence: string
  startEventIndex: number
  endEventIndex: number
  events: TranscriptEventDTO[]
}): { system: string; user: string } {
  const system = [
    '你是“会议语句拆分器”。你的任务是：基于上一句与当前窗口原文内容，输出当前说话人的下一句内容。',
    '',
    '输入说明：',
    '- previousSentence: 本会话上一句内容（可能为空）',
    '- events: 当前窗口内的原文事件',
    '- range: 窗口边界 startEventIndex..endEventIndex',
    '',
    '强约束：',
    '- 只允许输出 JSON，禁止输出任何 Markdown、解释或多余文本。',
    '- 只输出一句话（不要列表、不要多句、不要对话格式）。',
    '- 语言与语气应与上下文保持一致。',
    '- 不要重复 previousSentence。',
    '- 不要输出说话人名称或角色前缀（例如“张三：”“主持人：”）。',
    '- 仅基于 events 的内容推理，不引入外部事实或新信息。',
    '- 这是“当前说话人下一句”的内容，不是对前一句的回应或回答。',
    '- 保持人称与语气类型一致（问句仍为问句，陈述仍为陈述）。',
    '- 允许对口语、方言、错别字进行规范化，但不得改变语义。',
    '',
    '反例（不要这样）：',
    '- 输入包含“你识唔识周华健的《技术》？”时，不要输出“我认识，那首歌是关于什么的？”。',
    '',
    '示例（应该这样）：',
    '- 输入包含“我想问下你呢 你识唔识周华健的《技术》？”时，输出“我想问下，你认不认识周华健的《技术》？”。',
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
