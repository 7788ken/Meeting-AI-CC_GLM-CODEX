import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { extractGlmTextContent, getGlmAuthorizationToken } from '../../common/llm/glm'
import { GlmRateLimiter } from '../../common/llm/glm-rate-limiter'
import { TranscriptEventSegmentationConfigService } from './transcript-event-segmentation-config.service'
import { AppConfigService } from '../app-config/app-config.service'

@Injectable()
export class TranscriptEventSegmentationGlmClient {
  private readonly logger = new Logger(TranscriptEventSegmentationGlmClient.name)
  private readonly defaultMaxTokens = 2000
  private readonly defaultBumpMaxTokensTo = 4096
  private readonly defaultRetryMax = 5
  private readonly defaultRetryBaseMs = 500
  private readonly defaultRetryMaxMs = 8000

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly httpService: HttpService,
    private readonly segmentationConfigService: TranscriptEventSegmentationConfigService,
    private readonly glmRateLimiter: GlmRateLimiter
  ) {}

  async generateStructuredJson(params: { system: string; user: string }): Promise<string> {
    const apiKey = this.appConfigService.getString('GLM_API_KEY', '').trim()
    if (!apiKey) {
      throw new Error('GLM_API_KEY not configured')
    }

    const endpoint =
      this.appConfigService.getString('GLM_ENDPOINT', '').trim() ||
      'https://open.bigmodel.cn/api/paas/v4/chat/completions'

    const model = this.getModelName()
    const maxTokens = this.readMaxTokens()
    const useJsonMode = this.shouldUseJsonMode()
    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: [{ type: 'text', text: params.system }] },
        { role: 'user', content: [{ type: 'text', text: params.user }] },
      ],
      temperature: useJsonMode ? 0 : 0.2,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
    }

    const headers = {
      Authorization: `Bearer ${getGlmAuthorizationToken(apiKey)}`,
      'Content-Type': 'application/json',
    }

    this.logger.debug(`Calling GLM for transcript event segmentation, model=${model}`)

    const callOnce = (body: Record<string, unknown>) =>
      this.callAndExtractStructuredText({
        endpoint,
        headers,
        requestBody: body,
      })

    if (!useJsonMode) {
      try {
        return await callOnce(requestBody)
      } catch (error) {
        throw this.attachGlmMeta(error)
      }
    }

    const jsonModeBody = this.withJsonMode(requestBody, true)

    let lastError: Error | null = null
    const maxAttempts = 2
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await callOnce(jsonModeBody)
      } catch (error) {
        if (this.isRateLimitedError(error)) {
          throw this.attachGlmMeta(error)
        }

        const normalized = this.attachGlmMeta(error)
        lastError = normalized
        const isInvalidJsonModeResponse = normalized.message.startsWith(
          'Invalid response format from GLM API'
        )
        if (!isInvalidJsonModeResponse) {
          throw normalized
        }

        if (attempt + 1 < maxAttempts) {
          this.logger.warn(
            `GLM JSON mode returned invalid response, retrying in JSON mode, model=${model}`
          )
          continue
        }

        this.logger.error(
          `GLM JSON mode returned invalid response after ${maxAttempts} attempts, giving up, model=${model}`,
          normalized.stack
        )
        throw normalized
      }
    }

    throw lastError ?? new Error('GLM JSON mode failed')
  }

  getModelName(): string {
    const raw = this.segmentationConfigService.getConfig().model.trim()
    if (!raw) {
      throw new Error('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL not configured')
    }
    return raw
  }

  private readMaxTokens(): number {
    const value = this.segmentationConfigService.getConfig().maxTokens
    if (Number.isFinite(value) && value >= 256) return Math.floor(value)
    return this.defaultMaxTokens
  }

  private readBumpMaxTokensTo(): number {
    return this.appConfigService.getNumber(
      'GLM_TRANSCRIPT_EVENT_SEGMENT_BUMP_MAX_TOKENS',
      this.defaultBumpMaxTokensTo,
      value => value >= 256
    )
  }

  private shouldUseJsonMode(): boolean {
    return this.segmentationConfigService.getConfig().jsonMode
  }

  private withJsonMode(
    requestBody: Record<string, unknown>,
    enabled: boolean
  ): Record<string, unknown> {
    if (!enabled) return requestBody
    return { ...requestBody, response_format: { type: 'json_object' } }
  }

  private async callAndExtractStructuredText(input: {
    endpoint: string
    headers: Record<string, string>
    requestBody: Record<string, unknown>
  }): Promise<string> {
    const response = await this.postWithRetry(input)

    const extracted = this.extractStructuredTextFromGlmResponse(response.data)
    const isJsonMode = this.isJsonModeRequest(input.requestBody)

    if (extracted.text) {
      const normalizedJson = this.extractJsonObjectIfValid(extracted.text)
      if (normalizedJson) {
        return normalizedJson
      }
      if (extracted.finishReason !== 'length') {
        return extracted.text
      }
    }

    const currentMaxTokens = this.readRequestMaxTokens(input.requestBody)
    const bumpMaxTokensTo = this.readBumpMaxTokensTo()
    if (
      extracted.finishReason === 'length' &&
      currentMaxTokens != null &&
      currentMaxTokens < bumpMaxTokensTo
    ) {
      this.logger.warn(
        `GLM completion truncated (finish_reason=length), retrying with max_tokens=${bumpMaxTokensTo}`
      )
      const bumpedBody = { ...input.requestBody, max_tokens: bumpMaxTokensTo, temperature: 0 }
      const bumpedResponse = await this.postWithRetry({ ...input, requestBody: bumpedBody })
      const bumpedExtracted = this.extractStructuredTextFromGlmResponse(bumpedResponse.data)

      if (bumpedExtracted.text) {
        const normalizedJson = this.extractJsonObjectIfValid(bumpedExtracted.text)
        if (normalizedJson) {
          return normalizedJson
        }
        if (bumpedExtracted.finishReason !== 'length') {
          return bumpedExtracted.text
        }
      }
      throw this.buildInvalidResponseError(bumpedResponse, bumpedExtracted.finishReason)
    }

    throw this.buildInvalidResponseError(response, extracted.finishReason)
  }

  private async postWithRetry(input: {
    endpoint: string
    headers: Record<string, string>
    requestBody: Record<string, unknown>
  }): Promise<{ data?: unknown; status?: unknown }> {
    const maxRetries = this.readRetryMax()
    let attempt = 0
    while (true) {
      try {
        return await this.glmRateLimiter.schedule(
          () =>
            firstValueFrom(
              this.httpService.post(input.endpoint, input.requestBody, { headers: input.headers })
            ),
          { bucket: 'segmentation', label: 'transcript_event_segmentation' }
        )
      } catch (error) {
        const status = this.extractStatusCode(error)
        if (status !== 429) {
          throw error
        }

        const retryAfterMs = this.readRetryAfterMs(error)
        const delayMs = this.resolveRetryDelayMs(error, attempt)
        this.glmRateLimiter.onRateLimit(retryAfterMs ?? delayMs, 'segmentation')
        if (attempt >= maxRetries) {
          throw error
        }

        this.logger.warn(
          `GLM rate limited (429), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
        )
        await this.sleep(delayMs)
        attempt += 1
      }
    }
  }

  private extractStatusCode(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null
    const source = error as { response?: { status?: unknown }; glmStatus?: unknown }
    const status = source.response?.status ?? source.glmStatus
    return typeof status === 'number' && Number.isFinite(status) ? status : null
  }

  private isRateLimitedError(error: unknown): boolean {
    return this.extractStatusCode(error) === 429
  }

  private resolveRetryDelayMs(error: unknown, attempt: number): number {
    const retryAfterMs = this.readRetryAfterMs(error)
    if (retryAfterMs != null) return retryAfterMs

    const base = this.readRetryBaseMs()
    const max = this.readRetryMaxMs()
    const jitterRange = Math.min(200, base)
    const jitter = jitterRange > 0 ? Math.floor(Math.random() * jitterRange) : 0
    const delay = Math.min(max, base * Math.pow(2, attempt) + jitter)
    return Math.max(0, Math.floor(delay))
  }

  private readRetryAfterMs(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null
    const source = error as { response?: { headers?: Record<string, unknown> } }
    const headers = source.response?.headers
    if (!headers) return null
    const raw = headers['retry-after'] ?? headers['Retry-After']
    if (raw == null) return null
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value * 1000))
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      const asNumber = Number(trimmed)
      if (Number.isFinite(asNumber)) {
        return Math.max(0, Math.floor(asNumber * 1000))
      }
      const asDate = Date.parse(trimmed)
      if (!Number.isNaN(asDate)) {
        const delta = asDate - Date.now()
        return Math.max(0, Math.floor(delta))
      }
    }
    return null
  }

  private readRetryMax(): number {
    const value = this.readNumberFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX')
    if (Number.isFinite(value) && value >= 0 && value <= 10) {
      return Math.floor(value)
    }
    return this.defaultRetryMax
  }

  private readRetryBaseMs(): number {
    const value = this.readNumberFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_BASE_MS')
    if (Number.isFinite(value) && value >= 0 && value <= 60000) {
      return Math.floor(value)
    }
    return this.defaultRetryBaseMs
  }

  private readRetryMaxMs(): number {
    const value = this.readNumberFromConfig('GLM_TRANSCRIPT_EVENT_SEGMENT_RETRY_MAX_MS')
    if (Number.isFinite(value) && value >= 0 && value <= 120000) {
      return Math.floor(value)
    }
    return this.defaultRetryMaxMs
  }

  private readNumberFromConfig(key: string): number | null {
    const value = this.appConfigService.getNumber(key, Number.NaN)
    return Number.isFinite(value) ? value : null
  }

  private async sleep(ms: number): Promise<void> {
    if (!ms || ms <= 0) {
      await Promise.resolve()
      return
    }
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  private extractStructuredTextFromGlmResponse(data: unknown): {
    text: string | null
    finishReason?: string
  } {
    const choice = (data as any)?.choices?.[0]
    const finishReason =
      typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
    const message = choice?.message

    const content = extractGlmTextContent(message?.content)
    if (content) {
      return { text: content, finishReason }
    }

    const reasoning = extractGlmTextContent(message?.reasoning_content)
    const jsonFromReasoning = reasoning ? this.extractJsonObjectIfValid(reasoning) : null
    if (jsonFromReasoning) {
      this.logger.debug('GLM returned empty content, using JSON extracted from reasoning_content')
      return { text: jsonFromReasoning, finishReason }
    }

    return { text: null, finishReason }
  }

  private extractJsonObjectIfValid(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed) return null

    const extracted = this.extractJsonObject(trimmed) ?? trimmed
    try {
      const parsed = JSON.parse(extracted)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return extracted
      }
      return null
    } catch {
      return null
    }
  }

  private extractJsonObject(text: string): string | null {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const extracted = text.slice(start, end + 1).trim()
    return extracted || null
  }

  private readRequestMaxTokens(requestBody: Record<string, unknown>): number | null {
    const value = requestBody.max_tokens
    if (typeof value === 'number' && Number.isFinite(value)) return value
    return null
  }

  private isJsonModeRequest(requestBody: Record<string, unknown>): boolean {
    const format = requestBody.response_format as { type?: unknown } | undefined
    return typeof format?.type === 'string' && format.type === 'json_object'
  }

  private buildInvalidResponseError(
    response: { data?: unknown; status?: unknown },
    finishReason?: string
  ): Error {
    const suffix = finishReason ? ` (finish_reason=${finishReason})` : ''
    const error = new Error(`Invalid response format from GLM API${suffix}`)
    const target = error as { glmResponse?: unknown; glmStatus?: unknown; glmFinishReason?: string }
    target.glmResponse = response.data
    if (response.status != null) {
      target.glmStatus = response.status
    }
    if (finishReason) {
      target.glmFinishReason = finishReason
    }
    return error
  }

  private attachGlmMeta(error: unknown): Error {
    const normalized = error instanceof Error ? error : new Error(String(error))
    const source = error as {
      glmResponse?: unknown
      glmStatus?: unknown
      response?: { data?: unknown; status?: unknown }
    }
    const target = normalized as { glmResponse?: unknown; glmStatus?: unknown }

    if (target.glmResponse == null && source?.glmResponse != null) {
      target.glmResponse = source.glmResponse
    }
    if (target.glmStatus == null && source?.glmStatus != null) {
      target.glmStatus = source.glmStatus
    }
    if (target.glmResponse == null && source?.response?.data != null) {
      target.glmResponse = source.response.data
    }
    if (target.glmStatus == null && source?.response?.status != null) {
      target.glmStatus = source.response.status
    }
    return normalized
  }
}
