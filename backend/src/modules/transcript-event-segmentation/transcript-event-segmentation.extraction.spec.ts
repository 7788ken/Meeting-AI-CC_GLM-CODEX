import { extractRawNextSegment, normalizeForPunctuationOnlyCompare } from './transcript-event-segmentation.extraction'

describe('transcript-event-segmentation.extraction', () => {
  it('从 previousSentence 之后截取到第一个句末标点', () => {
    const { rawSegment } = extractRawNextSegment({
      previousSentence: 'Hello, 大家好，欢迎收听我们的播客。',
      events: [
        { eventIndex: 0, content: '欢迎收听豆包AI播客节目。' } as any,
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

  it('从 previousSentence 之后跨事件截取，并在“对第一个问题…”前截断', () => {
    const { rawSegment } = extractRawNextSegment({
      previousSentence:
        '啊今天咱们来聊一聊这个ai会议助手是怎么通过合理的模块设计能够让会议变得更高效？',
      events: [
        { eventIndex: 0, content: '欢迎收听豆包AI播客节目。' } as any,
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

    expect(rawSegment).toBe(
      '这个文档呢是我们二零二六年一月九号刚刚创建的啊这个文档呢其实就是把每个模块负责什么啊他们之间怎么分工啊怎么协作啊都讲的特别明白没错这个确实是一个非常实用的话题那我们就开始吧我们要聊的第一部分啊其实是蛮有意思的就是这个AI会议助手的设计原则啊'
    )
  })

  it('normalizeForPunctuationOnlyCompare 允许仅插入标点与空格', () => {
    const raw =
      '这个文档呢是我们二零二六年一月九号刚刚创建的啊这个文档呢其实就是把每个模块负责什么啊他们之间怎么分工啊怎么协作啊都讲的特别明白'
    const punctuated =
      '这个文档呢是我们二零二六年一月九号，刚刚创建的啊，这个文档呢其实就是把每个模块负责什么啊，他们之间怎么分工啊，怎么协作啊，都讲的特别明白。'

    expect(normalizeForPunctuationOnlyCompare(punctuated)).toBe(normalizeForPunctuationOnlyCompare(raw))
  })
})

