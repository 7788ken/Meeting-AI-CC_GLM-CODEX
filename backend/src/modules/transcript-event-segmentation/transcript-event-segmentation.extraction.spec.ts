import {
  extractRawNextSegment,
  normalizeForPunctuationOnlyCompare,
  resolveEventOffsetRange,
} from './transcript-event-segmentation.extraction'

describe('transcript-event-segmentation.extraction', () => {
  it('从 previousSentence 之后截取到第一个句末标点', () => {
    const { rawSegment } = extractRawNextSegment({
      previousSentence: 'Hello, 大家好，欢迎收听我们的播客。',
      events: [
        { eventIndex: 0, content: '欢迎收听AI会议助手播客节目。' } as any,
        { eventIndex: 1, content: 'Hello, 大家好，欢迎收听我们的播客。' } as any,
        {
          eventIndex: 2,
          content:
            '啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？这个文档呢是我们二零二六年一月九号',
        } as any,
      ],
    })

    expect(rawSegment).toBe(
      '啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？'
    )
  })

  it('从 previousSentence 之后跨事件截取，并在软边界“的啊”处截断', () => {
    const { rawSegment } = extractRawNextSegment({
      previousSentence:
        '啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？',
      events: [
        { eventIndex: 0, content: '欢迎收听AI会议助手播客节目。' } as any,
        { eventIndex: 1, content: 'Hello, 大家好，欢迎收听我们的播客。' } as any,
        {
          eventIndex: 2,
          content:
            '啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？这个文档呢是我们二零二六年一月九号',
        } as any,
        {
          eventIndex: 3,
          content:
            '刚刚创建的啊这个文档呢其实就是把每个模块负责什么啊他们之间怎么分工啊怎么协作啊都讲的特别明白没错这个确实是一个非常实用的话题那我们就开始吧我们要聊的第一部分啊其实是蛮有意思的就是这个AI会议助手的设计原则啊对第一个问题就是为什么我们在设计这个助手的',
        } as any,
      ],
    })

    expect(rawSegment).toBe('这个文档呢是我们二零二六年一月九号刚刚创建的啊')
  })

  it('normalizeForPunctuationOnlyCompare 允许仅插入标点与空格', () => {
    const raw =
      '这个文档呢是我们二零二六年一月九号刚刚创建的啊这个文档呢其实就是把每个模块负责什么啊他们之间怎么分工啊怎么协作啊都讲的特别明白'
    const punctuated =
      '这个文档呢是我们二零二六年一月九号，刚刚创建的啊，这个文档呢其实就是把每个模块负责什么啊，他们之间怎么分工啊，怎么协作啊，都讲的特别明白。'

    expect(normalizeForPunctuationOnlyCompare(punctuated)).toBe(
      normalizeForPunctuationOnlyCompare(raw)
    )
  })

  it('previousSentence 带标点时仍可定位到无标点原文', () => {
    const { rawSegment } = extractRawNextSegment({
      previousSentence: '你好，我们开始吧。',
      events: [{ eventIndex: 0, content: '你好我们开始吧然后继续' } as any],
    })

    expect(rawSegment).toBe('然后继续')
  })

  it('resolveEventOffsetRange 能映射跨事件的偏移范围', () => {
    const events = [
      { eventIndex: 0, content: '你好' } as any,
      { eventIndex: 1, content: '世界和平' } as any,
    ]

    const range = resolveEventOffsetRange(events, 1, 5)

    expect(range).toEqual({
      startEventIndex: 0,
      startEventOffset: 1,
      endEventIndex: 1,
      endEventOffset: 3,
    })
  })
})
