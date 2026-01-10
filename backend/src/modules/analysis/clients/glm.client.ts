import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as crypto from 'crypto'

/**
 * GLM (智谱AI) 模型客户端
 * 集成 BigModel Chat Completions API 进行会议分析
 */
@Injectable()
export class GlmClient {
  private readonly logger = new Logger(GlmClient.name)
  private readonly apiKey: string
  private readonly baseURL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.apiKey = this.configService.get<string>('GLM_API_KEY') || ''
    if (!this.apiKey) {
      this.logger.warn('GLM_API_KEY not configured')
    }
  }

  async generateAnalysis(params: {
    analysisType: string
    speeches: Array<{ content: string; speakerName: string }>
    sessionId: string
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GLM_API_KEY not configured')
    }

    const prompt = this.buildPrompt(params.analysisType, params.speeches)

    try {
      const response = await this.callGlmAPI(prompt)
      return this.parseResponse(response)
    } catch (error) {
      this.logger.error('Failed to call GLM API', error)
      throw new Error(
        `GLM API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private buildPrompt(
    analysisType: string,
    speeches: Array<{ content: string; speakerName: string }>
  ): string {
    const speechesText = speeches.map(s => `${s.speakerName}: ${s.content}`).join('\n')

    const prompts: Record<string, string> = {
      summary: `请根据以下会议发言内容，生成一份简洁的会议摘要：\n\n${speechesText}\n\n要求：\n1. 提取核心讨论内容\n2. 总结主要结论\n3. 使用 Markdown 格式`,

      'action-items': `请从以下会议发言中提取行动项：\n\n${speechesText}\n\n要求：\n1. 列出所有需要执行的任务\n2. 标注负责人（如果有）\n3. 使用 Markdown 列表格式`,

      sentiment: `请分析以下会议发言的情感倾向：\n\n${speechesText}\n\n要求：\n1. 分析整体情感氛围\n2. 识别积极/消极/中性观点\n3. 使用 Markdown 格式`,

      keywords: `请从以下会议发言中提取关键词：\n\n${speechesText}\n\n要求：\n1. 提取重要关键词\n2. 按重要程度排序\n3. 使用 Markdown 列表格式`,

      topics: `请分析以下会议发言的议题分布：\n\n${speechesText}\n\n要求：\n1. 识别主要讨论议题\n2. 分析各议题的讨论深度\n3. 使用 Markdown 格式`,

      'full-report': `请根据以下会议发言，生成完整的会议报告：\n\n${speechesText}\n\n要求：\n1. 包含会议摘要、主要议题、行动项\n2. 结构清晰，层次分明\n3. 使用 Markdown 格式`,
    }

    return prompts[analysisType] || prompts.summary
  }

  private async callGlmAPI(prompt: string): Promise<any> {
    const requestBody = {
      model: 'glm-4',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的会议助手，擅长分析会议内容并生成结构化的报告。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }

    const headers = {
      Authorization: `Bearer ${this.getAuthorizationToken()}`,
      'Content-Type': 'application/json',
    }

    this.logger.debug('Calling GLM API...')

    const response = await firstValueFrom(
      this.httpService.post(this.baseURL, requestBody, { headers })
    )

    if (response.data?.choices?.[0]?.message?.content) {
      this.logger.log('GLM API call successful')
      return response.data
    }

    throw new Error('Invalid response format from GLM API')
  }

  private parseResponse(response: any): string {
    return response?.choices?.[0]?.message?.content || '无法解析 AI 响应'
  }

  private getAuthorizationToken(): string {
    const rawKey = this.apiKey.trim()
    const parts = rawKey.split('.')

    if (parts.length === 2) {
      const [apiKey, apiSecret] = parts
      return this.signJwt(apiKey, apiSecret)
    }

    return rawKey
  }

  private signJwt(apiKey: string, apiSecret: string): string {
    const header = { alg: 'HS256', sign_type: 'SIGN' }
    const timestamp = Date.now()
    const payload = {
      api_key: apiKey,
      exp: timestamp + 60 * 60 * 1000,
      timestamp,
    }

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header))
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload))
    const data = `${encodedHeader}.${encodedPayload}`
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    return `${data}.${signature}`
  }

  private base64UrlEncode(content: string): string {
    return Buffer.from(content)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      return false
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.baseURL,
          {
            model: 'glm-4',
            messages: [{ role: 'user', content: 'Hi' }],
          },
          {
            headers: { Authorization: `Bearer ${this.getAuthorizationToken()}` },
            timeout: 5000,
          }
        )
      )
      return !!response.data?.choices?.[0]?.message?.content
    } catch {
      return false
    }
  }
}
