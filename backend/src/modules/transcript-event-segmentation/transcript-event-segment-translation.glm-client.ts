import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { extractGlmTextContent, getGlmAuthorizationToken } from '../../common/llm/glm'
import { GlmRateLimiter } from '../../common/llm/glm-rate-limiter'
import { AppConfigService } from '../app-config/app-config.service'
import { buildTranscriptEventSegmentTranslationPrompt } from './transcript-event-segment-translation.prompt'

@Injectable()
export class TranscriptEventSegmentTranslationGlmClient {
  private readonly logger = new Logger(TranscriptEventSegmentTranslationGlmClient.name)
  private readonly defaultMaxTokens = 800

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly httpService: HttpService,
    private readonly glmRateLimiter: GlmRateLimiter
  ) {}

  getModelName(): string {
    const configured =
      this.appConfigService.getString('GLM_TRANSCRIPT_SEGMENT_TRANSLATION_MODEL', '').trim()
    if (configured) return configured
    const fallback = this.appConfigService.getString('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL', '').trim()
    if (!fallback) {
      throw new Error('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL not configured')
    }
    return fallback
  }

  async translate(text: string, targetLanguage: string): Promise<{ translatedText: string; model: string }> {
    const apiKey = this.appConfigService.getString('GLM_API_KEY', '').trim()
    if (!apiKey) {
      throw new Error('GLM_API_KEY not configured')
    }
    const endpoint =
      this.appConfigService.getString('GLM_ENDPOINT', '').trim() ||
      'https://open.bigmodel.cn/api/paas/v4/chat/completions'

    const normalizedText = typeof text === 'string' ? text.trim() : ''
    if (!normalizedText) {
      return { translatedText: '', model: this.getModelName() }
    }

    const model = this.getModelName()
    const prompt = buildTranscriptEventSegmentTranslationPrompt({
      text: normalizedText,
      targetLanguage,
    })

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: [{ type: 'text', text: prompt.system }] },
        { role: 'user', content: [{ type: 'text', text: prompt.user }] },
      ],
      temperature: 0.2,
      max_tokens: this.defaultMaxTokens,
      thinking: { type: 'disabled' },
    }

    const headers = {
      Authorization: `Bearer ${getGlmAuthorizationToken(apiKey)}`,
      'Content-Type': 'application/json',
    }

    this.logger.debug(`Calling GLM for segment translation, model=${model}`)

    const response = await this.postWithRetry({ endpoint, headers, requestBody })
    const extracted = this.extractTextFromGlmResponse(response.data)
    if (!extracted) {
      throw this.buildInvalidResponseError(response)
    }

    return { translatedText: extracted, model }
  }

  private async postWithRetry(input: {
    endpoint: string
    headers: Record<string, string>
    requestBody: Record<string, unknown>
  }): Promise<{ data?: unknown; status?: unknown }> {
    const delays = [500, 1500, 4500]
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        return await this.glmRateLimiter.schedule(() =>
          firstValueFrom(
            this.httpService.post(input.endpoint, input.requestBody, { headers: input.headers })
          )
        )
      } catch (error) {
        const status = this.extractStatusCode(error)
        if (status !== 429 || attempt >= delays.length) {
          throw error
        }
        const delayMs = delays[attempt]!
        this.logger.warn(`GLM rate limited (429), retrying in ${delayMs}ms (attempt ${attempt + 1}/${delays.length})`)
        this.glmRateLimiter.onRateLimit(delayMs)
        await this.sleep(delayMs)
      }
    }
    throw new Error('GLM request failed')
  }

  private extractStatusCode(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null
    const source = error as { response?: { status?: unknown }; glmStatus?: unknown }
    const status = source.response?.status ?? source.glmStatus
    return typeof status === 'number' && Number.isFinite(status) ? status : null
  }

  private extractTextFromGlmResponse(responseBody: unknown): string | null {
    if (!responseBody || typeof responseBody !== 'object') return null
    const root = responseBody as { choices?: unknown }
    if (!Array.isArray(root.choices) || !root.choices.length) return null
    const first = root.choices[0] as any
    const content = first?.message?.content ?? first?.delta?.content
    return extractGlmTextContent(content)
  }

  private buildInvalidResponseError(response: { data?: unknown; status?: unknown }): Error {
    const status = response.status != null ? String(response.status) : 'unknown'
    const error = new Error(`Invalid response from GLM API (status=${status})`)
    ;(error as any).glmStatus = response.status
    ;(error as any).glmResponse = response.data
    return error
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
