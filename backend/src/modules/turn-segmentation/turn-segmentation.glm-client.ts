import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { extractGlmTextContent, getGlmAuthorizationToken } from '../../common/llm/glm'

@Injectable()
export class TurnSegmentationGlmClient {
  private readonly logger = new Logger(TurnSegmentationGlmClient.name)

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

    const model = (process.env.GLM_TURN_SEGMENT_MODEL || '').trim() || 'glm-4.6v-flash'

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: [{ type: 'text', text: params.system }] },
        { role: 'user', content: [{ type: 'text', text: params.user }] },
      ],
      temperature: 0.1,
      max_tokens: 1200,
    }

    const headers = {
      Authorization: `Bearer ${getGlmAuthorizationToken(apiKey)}`,
      'Content-Type': 'application/json',
    }

    this.logger.debug(`Calling GLM for turn segmentation, model=${model}`)

    const response = await firstValueFrom(this.httpService.post(endpoint, requestBody, { headers }))
    const content = extractGlmTextContent(response.data?.choices?.[0]?.message?.content)
    if (!content) {
      throw new Error('Invalid response format from GLM API')
    }
    return content
  }
}

