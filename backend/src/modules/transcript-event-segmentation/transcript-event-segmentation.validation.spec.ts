import { parseTranscriptEventSegmentJson } from './transcript-event-segmentation.validation'

describe('transcript-event-segmentation.validation', () => {
  it('解析 nextSentence 字段', () => {
    expect(parseTranscriptEventSegmentJson('{ "nextSentence": "你好" }')).toEqual({
      nextSentence: '你好',
    })
  })

  it('JSON 中 nextSentence 为空时返回空串', () => {
    expect(parseTranscriptEventSegmentJson('{ "nextSentence": "" }')).toEqual({ nextSentence: '' })
  })

  it('空 JSON 对象时返回空串', () => {
    expect(parseTranscriptEventSegmentJson('{}')).toEqual({ nextSentence: '' })
  })

  it('非 JSON 文本时回退为原文', () => {
    expect(parseTranscriptEventSegmentJson('你好')).toEqual({ nextSentence: '你好' })
  })

  it('支持从 code fence 提取 JSON', () => {
    expect(parseTranscriptEventSegmentJson('```json\n{ \"nextSentence\": \"ok\" }\n```')).toEqual({
      nextSentence: 'ok',
    })
  })

  it('空输出时报错', () => {
    expect(() => parseTranscriptEventSegmentJson('')).toThrow('LLM 输出不是合法 JSON')
  })
})
