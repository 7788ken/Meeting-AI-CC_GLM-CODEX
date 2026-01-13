import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { extractGlmTextContent, getGlmAuthorizationToken } from '../../common/llm/glm'

@Injectable()
export class TranscriptAnalysisGlmClient {
  private readonly logger = new Logger(TranscriptAnalysisGlmClient.name)

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
      temperature: 0.1,
      max_tokens: maxTokens,
    }

    const headers = {
      Authorization: `Bearer ${getGlmAuthorizationToken(apiKey)}`,
      'Content-Type': 'application/json',
    }

    this.logger.debug(`Calling GLM for transcript analysis, model=${model}`)

    try {
      const response = await firstValueFrom(
        this.httpService.post(endpoint, this.withJsonMode(requestBody, useJsonMode), { headers })
      )
      const content = extractGlmTextContent(response.data?.choices?.[0]?.message?.content)
      if (!content) {
        throw new Error('Invalid response format from GLM API')
      }
      return content
    } catch (error) {
      if (!useJsonMode) {
        throw error
      }
      this.logger.error(
        'GLM JSON mode failed, retrying without json mode',
        error instanceof Error ? error.stack : undefined
      )
    }

    const response = await firstValueFrom(this.httpService.post(endpoint, requestBody, { headers }))
    const content = extractGlmTextContent(response.data?.choices?.[0]?.message?.content)
    if (!content) {
      throw new Error('Invalid response format from GLM API')
    }
    return content
  }

  private readModel(): string {
    const raw = (process.env.GLM_TRANSCRIPT_ANALYSIS_MODEL || '').trim()
    return raw || 'glm-4.6v-flash'
  }

  private readMaxTokens(): number {
    const raw = (process.env.GLM_TRANSCRIPT_ANALYSIS_MAX_TOKENS || '').trim()
    const value = Number(raw)
    if (Number.isFinite(value) && value >= 256) return Math.floor(value)
    return 2000
  }

  private shouldUseJsonMode(): boolean {
    const raw = (process.env.GLM_TRANSCRIPT_ANALYSIS_JSON_MODE || '').trim().toLowerCase()
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
}
