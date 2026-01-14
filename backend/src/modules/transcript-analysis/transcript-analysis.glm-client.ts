import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { extractGlmTextContent, getGlmAuthorizationToken } from '../../common/llm/glm'
import { GlmRateLimiter } from '../../common/llm/glm-rate-limiter'

export type TranscriptSummaryStreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'done' }

@Injectable()
export class TranscriptAnalysisGlmClient {
  private readonly logger = new Logger(TranscriptAnalysisGlmClient.name)
  private readonly defaultMaxTokens = 2500
  private readonly defaultRetryMax = 3
  private readonly defaultRetryBaseMs = 500
  private readonly defaultRetryMaxMs = 8000

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly glmRateLimiter: GlmRateLimiter
  ) {}

  getModelName(): string {
    const preferred = (this.configService.get<string>('GLM_TRANSCRIPT_SUMMARY_MODEL') || '').trim()
    const fallback = (
      this.configService.get<string>('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL') || ''
    ).trim()
    const model = preferred || fallback
    if (!model) {
      throw new Error('GLM_TRANSCRIPT_SUMMARY_MODEL not configured')
    }
    return model
  }

  readMaxTokens(): number {
    const raw =
      this.configService.get<string>('GLM_TRANSCRIPT_SUMMARY_MAX_TOKENS') ||
      process.env.GLM_TRANSCRIPT_SUMMARY_MAX_TOKENS
    const value = Number(raw)
    if (Number.isFinite(value)) {
      const rounded = Math.floor(value)
      if (rounded >= 256 && rounded <= 8192) return rounded
    }
    return this.defaultMaxTokens
  }

  private shouldEnableThinking(): boolean {
    const raw =
      this.configService.get<string>('GLM_TRANSCRIPT_SUMMARY_THINKING') ||
      process.env.GLM_TRANSCRIPT_SUMMARY_THINKING
    if (raw == null || raw === '') return true
    const normalized = String(raw).trim().toLowerCase()
    if (normalized === '0' || normalized === 'false') return false
    if (normalized === '1' || normalized === 'true') return true
    return true
  }

  async generateMarkdown(params: {
    system: string
    user: string
  }): Promise<{ markdown: string; model: string }> {
    const apiKey = (this.configService.get<string>('GLM_API_KEY') || '').trim()
    if (!apiKey) {
      throw new Error('GLM_API_KEY not configured')
    }

    const endpoint =
      (this.configService.get<string>('GLM_ENDPOINT') || '').trim() ||
      'https://open.bigmodel.cn/api/paas/v4/chat/completions'

    const model = this.getModelName()
    const maxTokens = this.readMaxTokens()
    const enableThinking = this.shouldEnableThinking()

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: [{ type: 'text', text: params.system }] },
        { role: 'user', content: [{ type: 'text', text: params.user }] },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
      thinking: { type: enableThinking ? 'enabled' : 'disabled' },
    }

    const headers = {
      Authorization: `Bearer ${getGlmAuthorizationToken(apiKey)}`,
      'Content-Type': 'application/json',
    }

    this.logger.debug(`Calling GLM for transcript summary, model=${model}`)

    const response = await this.postWithRetry({
      endpoint,
      headers,
      requestBody,
    })

    const extracted = this.extractTextFromGlmResponse(response.data)
    if (!extracted.text) {
      throw this.buildInvalidResponseError(response, extracted.finishReason)
    }

    return { markdown: extracted.text, model }
  }

  async *generateMarkdownStream(params: {
    system: string
    user: string
  }): AsyncIterable<TranscriptSummaryStreamChunk> {
    const apiKey = (this.configService.get<string>('GLM_API_KEY') || '').trim()
    if (!apiKey) {
      throw new Error('GLM_API_KEY not configured')
    }

    const endpoint =
      (this.configService.get<string>('GLM_ENDPOINT') || '').trim() ||
      'https://open.bigmodel.cn/api/paas/v4/chat/completions'

    const model = this.getModelName()
    const maxTokens = this.readMaxTokens()
    const enableThinking = this.shouldEnableThinking()

    const requestBody: Record<string, unknown> = {
      model,
      stream: true,
      messages: [
        { role: 'system', content: [{ type: 'text', text: params.system }] },
        { role: 'user', content: [{ type: 'text', text: params.user }] },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
      thinking: { type: enableThinking ? 'enabled' : 'disabled' },
    }

    const headers = {
      Authorization: `Bearer ${getGlmAuthorizationToken(apiKey)}`,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    }

    this.logger.debug(`Calling GLM for transcript summary stream, model=${model}`)

    const response = await this.postStreamWithRetry({
      endpoint,
      headers,
      requestBody,
    })

    if (response.status === 429) {
      this.glmRateLimiter.onRateLimit(this.readRetryAfterMsFromHeaders(response.headers))
    }

    if (response.status >= 400) {
      const errorText = await this.readStreamAsText(response.data)
      const detail = errorText ? ` ${errorText}` : ''
      throw new Error(`GLM summary HTTP error: status=${response.status}${detail}`)
    }

    for await (const payloadText of this.parseEventStream(response.data)) {
      if (!payloadText) continue
      if (payloadText === '[DONE]') {
        yield { type: 'done' }
        return
      }

      let payload: unknown = payloadText
      try {
        payload = JSON.parse(payloadText)
      } catch {
        continue
      }

      const delta = this.extractDeltaText(payload)
      if (delta) {
        yield { type: 'delta', text: delta }
      }
    }

    yield { type: 'done' }
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
        return await this.glmRateLimiter.schedule(() =>
          firstValueFrom(
            this.httpService.post(input.endpoint, input.requestBody, { headers: input.headers })
          )
        )
      } catch (error) {
        const status = this.extractStatusCode(error)
        if (status !== 429) {
          throw error
        }

        const retryAfterMs = this.readRetryAfterMs(error)
        const delayMs = this.resolveRetryDelayMs(error, attempt)
        this.glmRateLimiter.onRateLimit(retryAfterMs ?? delayMs)
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

  private async postStreamWithRetry(input: {
    endpoint: string
    headers: Record<string, string>
    requestBody: Record<string, unknown>
  }): Promise<{ data: NodeJS.ReadableStream; status: number; headers: Record<string, any> }> {
    const maxRetries = this.readRetryMax()
    let attempt = 0
    while (true) {
      try {
        return await this.glmRateLimiter.schedule(() =>
          firstValueFrom(
            this.httpService.post(input.endpoint, input.requestBody, {
              headers: input.headers,
              responseType: 'stream',
              validateStatus: () => true,
            })
          )
        )
      } catch (error) {
        const status = this.extractStatusCode(error)
        if (status !== 429) {
          throw error
        }

        const retryAfterMs = this.readRetryAfterMs(error)
        const delayMs = this.resolveRetryDelayMs(error, attempt)
        this.glmRateLimiter.onRateLimit(retryAfterMs ?? delayMs)
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

  private async *parseEventStream(stream: NodeJS.ReadableStream): AsyncIterable<string> {
    let buffer = ''
    let eventLines: string[] = []

    for await (const chunk of stream) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line) {
          const data = eventLines.join('\n').trim()
          eventLines = []
          if (data) yield data
          continue
        }

        if (line.startsWith('data:')) {
          eventLines.push(line.slice(5).trimStart())
        }
      }
    }

    if (eventLines.length > 0) {
      const data = eventLines.join('\n').trim()
      if (data) yield data
    }
  }

  private extractDeltaText(payload: unknown): string | null {
    const choice = (payload as any)?.choices?.[0]
    const delta = choice?.delta
    const content = extractGlmTextContent(delta?.content)
    if (content) return content
    return null
  }

  private async readStreamAsText(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
    }
    return chunks.join('')
  }

  private readRetryAfterMsFromHeaders(headers?: Record<string, unknown>): number | null {
    if (!headers) return null
    const raw = (headers as any)['retry-after'] ?? (headers as any)['Retry-After']
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
        const deltaMs = asDate - Date.now()
        return Math.max(0, Math.floor(deltaMs))
      }
    }
    return null
  }

  private extractTextFromGlmResponse(data: unknown): {
    text: string | null
    finishReason?: string
  } {
    const choice = (data as any)?.choices?.[0]
    const finishReason =
      typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined
    const message = choice?.message
    const content = extractGlmTextContent(message?.content)
    if (content) return { text: content, finishReason }
    return { text: null, finishReason }
  }

  private buildInvalidResponseError(
    response: { data?: unknown; status?: unknown },
    finishReason?: string
  ): Error {
    const suffix = finishReason ? ` (finish_reason=${finishReason})` : ''
    const error = new Error(`Invalid response format from GLM API${suffix}`)
    const target = error as { glmResponse?: unknown; glmStatus?: unknown }
    target.glmResponse = response.data
    if (response.status != null) {
      target.glmStatus = response.status
    }
    return error
  }

  private extractStatusCode(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null
    const source = error as { response?: { status?: unknown }; glmStatus?: unknown }
    const status = source.response?.status ?? source.glmStatus
    return typeof status === 'number' && Number.isFinite(status) ? status : null
  }

  private readRetryMax(): number {
    const raw =
      this.configService.get<string>('GLM_TRANSCRIPT_SUMMARY_RETRY_MAX') ||
      process.env.GLM_TRANSCRIPT_SUMMARY_RETRY_MAX
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 0 && value <= 10) {
      return Math.floor(value)
    }
    return this.defaultRetryMax
  }

  private readRetryBaseMs(): number {
    const raw =
      this.configService.get<string>('GLM_TRANSCRIPT_SUMMARY_RETRY_BASE_MS') ||
      process.env.GLM_TRANSCRIPT_SUMMARY_RETRY_BASE_MS
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 0 && value <= 60000) {
      return Math.floor(value)
    }
    return this.defaultRetryBaseMs
  }

  private readRetryMaxMs(): number {
    const raw =
      this.configService.get<string>('GLM_TRANSCRIPT_SUMMARY_RETRY_MAX_MS') ||
      process.env.GLM_TRANSCRIPT_SUMMARY_RETRY_MAX_MS
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 0 && value <= 120000) {
      return Math.floor(value)
    }
    return this.defaultRetryMaxMs
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

  private async sleep(ms: number): Promise<void> {
    if (!ms || ms <= 0) {
      await Promise.resolve()
      return
    }
    await new Promise(resolve => setTimeout(resolve, ms))
  }
}
