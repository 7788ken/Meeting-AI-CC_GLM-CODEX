import { TranscriptEventSegmentationGlmClient } from './transcript-event-segmentation.glm-client'
import { of, throwError } from 'rxjs'
import type { ConfigService } from '@nestjs/config'
import type { HttpService } from '@nestjs/axios'

describe('TranscriptEventSegmentationGlmClient', () => {
  const originalEnv = process.env
  const defaultBumpMaxTokensTo = 4096
  const testModel = 'test-model'

  let configService: jest.Mocked<ConfigService>
  let httpService: jest.Mocked<HttpService>
  let segmentationConfigService: { getConfig: jest.Mock }

  const getRequestBody = (callIndex = 0) => (httpService.post.mock.calls[callIndex] as any)[1]

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE
    delete process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS
    delete process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX
    delete process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_BASE_MS
    delete process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX_MS

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

    segmentationConfigService = {
      getConfig: jest.fn(() => ({
        systemPrompt: 'system',
        strictSystemPrompt: 'strict',
        windowEvents: 120,
        intervalMs: 3000,
        triggerOnEndTurn: true,
        triggerOnStopTranscribe: true,
        model: testModel,
        maxTokens: 2000,
        jsonMode: true,
      })),
    }
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

    const client = new TranscriptEventSegmentationGlmClient(
      configService,
      httpService,
      segmentationConfigService as any
    )
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "你好" }')
    expect(httpService.post).toHaveBeenCalledTimes(1)
    const firstBody = getRequestBody(0)
    expect(firstBody.model).toBe(testModel)
    expect(firstBody.thinking).toEqual({ type: 'disabled' })
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

    const client = new TranscriptEventSegmentationGlmClient(
      configService,
      httpService,
      segmentationConfigService as any
    )
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "下一句" }')
    expect(httpService.post).toHaveBeenCalledTimes(1)
    expect(getRequestBody(0).model).toBe(testModel)
  })

  it('finish_reason=length 且 max_tokens 太小时，自动提升 max_tokens 重试', async () => {
    segmentationConfigService.getConfig.mockReturnValue({
      systemPrompt: 'system',
      strictSystemPrompt: 'strict',
      windowEvents: 120,
      intervalMs: 3000,
      triggerOnEndTurn: true,
      triggerOnStopTranscribe: true,
      model: testModel,
      maxTokens: 512,
      jsonMode: true,
    })

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

    const client = new TranscriptEventSegmentationGlmClient(
      configService,
      httpService,
      segmentationConfigService as any
    )
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "ok" }')
    expect(httpService.post).toHaveBeenCalledTimes(2)

    const secondBody = getRequestBody(1)
    expect(getRequestBody(0).model).toBe(testModel)
    expect(getRequestBody(1).model).toBe(testModel)
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

    const client = new TranscriptEventSegmentationGlmClient(
      configService,
      httpService,
      segmentationConfigService as any
    )
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "ok" }')
    expect(httpService.post).toHaveBeenCalledTimes(1)
    expect(getRequestBody(0).model).toBe(testModel)
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

    const client = new TranscriptEventSegmentationGlmClient(
      configService,
      httpService,
      segmentationConfigService as any
    )
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "ok" }')
    expect(httpService.post).toHaveBeenCalledTimes(2)

    const secondBody = getRequestBody(1)
    expect(getRequestBody(0).model).toBe(testModel)
    expect(getRequestBody(1).model).toBe(testModel)
    expect(secondBody.max_tokens).toBe(defaultBumpMaxTokensTo)
  })

  it('429 时会按配置重试', async () => {
    process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX = '1'
    process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_BASE_MS = '0'
    process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX_MS = '0'

    const rateLimitError = new Error('Request failed with status code 429') as any
    rateLimitError.response = {
      status: 429,
      data: { error: { code: '1305' } },
      headers: { 'retry-after': '0' },
    }

    httpService.post
      .mockReturnValueOnce(throwError(() => rateLimitError))
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

    const client = new TranscriptEventSegmentationGlmClient(
      configService,
      httpService,
      segmentationConfigService as any
    )
    const result = await client.generateStructuredJson({ system: 's', user: 'u' })

    expect(result).toBe('{ "nextSentence": "ok" }')
    expect(httpService.post).toHaveBeenCalledTimes(2)
    expect(getRequestBody(0).model).toBe(testModel)
    expect(getRequestBody(1).model).toBe(testModel)
  })
})
