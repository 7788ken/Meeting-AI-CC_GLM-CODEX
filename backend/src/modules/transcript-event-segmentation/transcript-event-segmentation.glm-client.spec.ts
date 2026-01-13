import { TranscriptEventSegmentationGlmClient } from './transcript-event-segmentation.glm-client'
import { of } from 'rxjs'
import type { ConfigService } from '@nestjs/config'
import type { HttpService } from '@nestjs/axios'

describe('TranscriptEventSegmentationGlmClient', () => {
  const originalEnv = process.env
  const defaultBumpMaxTokensTo = 4096

  let configService: jest.Mocked<ConfigService>
  let httpService: jest.Mocked<HttpService>

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE
    delete process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'GLM_API_KEY') return 'test-key'
        if (key === 'GLM_ENDPOINT') return ''
        return null
      }),
    } as any

    httpService = {
      post: jest.fn(),
    } as any
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  it('返回 message.content 的 JSON 文本', async () => {
    httpService.post.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          choices: [
            {
              finish_reason: 'stop',
              message: { content: ' { "nextSentence": "你好" } ' },
            },
          ],
        },
      } as any)
    )

    const client = new TranscriptEventSegmentationGlmClient(configService, httpService)
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "你好" }')
    expect(httpService.post).toHaveBeenCalledTimes(1)
  })

  it('在 content 为空时，从 reasoning_content 提取 JSON', async () => {
    httpService.post.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: '',
                reasoning_content: '{ "nextSentence": "下一句" }',
              },
            },
          ],
        },
      } as any)
    )

    const client = new TranscriptEventSegmentationGlmClient(configService, httpService)
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "下一句" }')
    expect(httpService.post).toHaveBeenCalledTimes(1)
  })

  it('finish_reason=length 且 max_tokens 太小时，自动提升 max_tokens 重试', async () => {
    process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS = '512'

    httpService.post
      .mockReturnValueOnce(
        of({
          status: 200,
          data: {
            choices: [
              {
                finish_reason: 'length',
                message: { content: '', reasoning_content: '...' },
              },
            ],
          },
        } as any)
      )
      .mockReturnValueOnce(
        of({
          status: 200,
          data: {
            choices: [
              {
                finish_reason: 'stop',
                message: { content: '{ "nextSentence": "ok" }' },
              },
            ],
          },
        } as any)
      )

    const client = new TranscriptEventSegmentationGlmClient(configService, httpService)
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "ok" }')
    expect(httpService.post).toHaveBeenCalledTimes(2)

    const secondBody = (httpService.post.mock.calls[1] as any)[1]
    expect(secondBody.max_tokens).toBe(defaultBumpMaxTokensTo)
  })

  it('finish_reason=length 但 content 已是完整 JSON 时，直接返回不重试', async () => {
    httpService.post.mockReturnValueOnce(
      of({
        status: 200,
        data: {
          choices: [
            {
              finish_reason: 'length',
              message: { content: '{ "nextSentence": "ok" }' },
            },
          ],
        },
      } as any)
    )

    const client = new TranscriptEventSegmentationGlmClient(configService, httpService)
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "ok" }')
    expect(httpService.post).toHaveBeenCalledTimes(1)
  })

  it('默认 max_tokens=2000 时，finish_reason=length 会提升到 bump 上限再重试', async () => {
    httpService.post
      .mockReturnValueOnce(
        of({
          status: 200,
          data: {
            choices: [
              {
                finish_reason: 'length',
                message: { content: '', reasoning_content: '...' },
              },
            ],
          },
        } as any)
      )
      .mockReturnValueOnce(
        of({
          status: 200,
          data: {
            choices: [
              {
                finish_reason: 'stop',
                message: { content: '{ "nextSentence": "ok" }' },
              },
            ],
          },
        } as any)
      )

    const client = new TranscriptEventSegmentationGlmClient(configService, httpService)
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "ok" }')
    expect(httpService.post).toHaveBeenCalledTimes(2)

    const secondBody = (httpService.post.mock.calls[1] as any)[1]
    expect(secondBody.max_tokens).toBe(defaultBumpMaxTokensTo)
  })
})
