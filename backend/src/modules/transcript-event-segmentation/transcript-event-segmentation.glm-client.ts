import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { extractGlmTextContent, getGlmAuthorizationToken } from '../../common/llm/glm'

@Injectable()
export class TranscriptEventSegmentationGlmClient {
  private readonly logger = new Logger(TranscriptEventSegmentationGlmClient.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {}

  async generateStructuredJson(params: { system: string; user: string }): Promise<string> {
    const apiKey = (this.configService.get<string>('GLM_API_KEY') || '').trim()
    if (!apiKey) {
      throw new Error('GLM_API_KEY not configured')
    }

    const endpoint =
      (this.configService.get<string>('GLM_ENDPOINT') || '').trim() ||
      'https://open.bigmodel.cn/api/paas/v4/chat/completions'

    const model = this.readModel()
    const maxTokens = this.readMaxTokens()
    const useJsonMode = this.shouldUseJsonMode()
    const requestBody = {
      model,
      messages: [
        { role: 'system', content: [{ type: 'text', text: params.system }] },
        { role: 'user', content: [{ type: 'text', text: params.user }] },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    }

    const headers = {
      Authorization: `Bearer ${getGlmAuthorizationToken(apiKey)}`,
      'Content-Type': 'application/json',
    }

    this.logger.debug(`Calling GLM for transcript event segmentation, model=${model}`)

    try {
      const response = await firstValueFrom(
        this.httpService.post(endpoint, this.withJsonMode(requestBody, useJsonMode), { headers })
      )
      const content = extractGlmTextContent(response.data?.choices?.[0]?.message?.content)
      if (!content) {
        throw this.buildInvalidResponseError(response)
      }
      return content
    } catch (error) {
      if (!useJsonMode) {
        throw this.attachGlmMeta(error)
      }
      this.logger.error(
        'GLM JSON mode failed, retrying without json mode',
        error instanceof Error ? error.stack : undefined
      )
    }

    try {
      const response = await firstValueFrom(this.httpService.post(endpoint, requestBody, { headers }))
      const content = extractGlmTextContent(response.data?.choices?.[0]?.message?.content)
      if (!content) {
        throw this.buildInvalidResponseError(response)
      }
      return content
    } catch (error) {
      throw this.attachGlmMeta(error)
    }
  }

  private readModel(): string {
    const raw = (process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL || '').trim()
    if (raw) return raw
    const fallback = (process.env.GLM_TURN_SEGMENT_MODEL || '').trim()
    return fallback || 'glm-4.6v-flash'
  }

  private readMaxTokens(): number {
    const raw = (process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_MAX_TOKENS || '').trim()
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 128) return Math.floor(value)
    return 512
  }

  private shouldUseJsonMode(): boolean {
    const raw = (process.env.GLM_TRANSCRIPT_EVENT_SEGMENT_JSON_MODE || '').trim().toLowerCase()
    if (!raw) return true
    return raw !== '0' && raw !== 'false'
  }

  private withJsonMode(
    requestBody: Record<string, unknown>,
    enabled: boolean
  ): Record<string, unknown> {
    if (!enabled) return requestBody
    return { ...requestBody, response_format: { type: 'json_object' } }
  }

  private buildInvalidResponseError(response: { data?: unknown; status?: unknown }): Error {
    const error = new Error('Invalid response format from GLM API')
    const target = error as { glmResponse?: unknown; glmStatus?: unknown }
    target.glmResponse = response.data
    if (response.status != null) {
      target.glmStatus = response.status
    }
    return error
  }

  private attachGlmMeta(error: unknown): Error {
    const normalized = error instanceof Error ? error : new Error(String(error))
    const source = error as { glmResponse?: unknown; glmStatus?: unknown; response?: { data?: unknown; status?: unknown } }
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
