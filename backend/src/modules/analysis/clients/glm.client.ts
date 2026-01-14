import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { extractGlmTextContent, getGlmAuthorizationToken } from '../../../common/llm/glm'

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
    if (!this.getModelName()) {
      this.logger.warn('GLM_ANALYSIS_MODEL not configured')
    }
  }

  async generateAnalysis(params: {
    analysisType: string
    speeches: Array<{ content: string; speakerName: string }>
    sessionId: string
    prompt?: string
  }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GLM_API_KEY not configured')
    }

    const prompt = this.buildPrompt(params.analysisType, params.speeches, params.prompt)

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
    speeches: Array<{ content: string; speakerName: string }>,
    promptOverride?: string
  ): string {
    const speechesText = speeches.map(s => `${s.speakerName}: ${s.content}`).join('\n')

    const custom = typeof promptOverride === 'string' ? promptOverride.trim() : ''
    if (custom) {
      if (custom.includes('{{speeches}}')) {
        return custom.replace(/{{\s*speeches\s*}}/g, speechesText)
      }
      return `${custom}\n\n会议发言：\n${speechesText}`
    }

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
    const model = this.requireModelName()
    const requestBody = {
      model,
      messages: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: '你是一个专业的会议助手，擅长分析会议内容并生成结构化的报告。',
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
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

    if (extractGlmTextContent(response.data?.choices?.[0]?.message?.content)) {
      this.logger.log('GLM API call successful')
      return response.data
    }

    throw new Error('Invalid response format from GLM API')
  }

  private parseResponse(response: any): string {
    const text = extractGlmTextContent(response?.choices?.[0]?.message?.content)
    return text || '无法解析 AI 响应'
  }

  private getAuthorizationToken(): string {
    return getGlmAuthorizationToken(this.apiKey)
  }

  private getModelName(): string {
    return (this.configService.get<string>('GLM_ANALYSIS_MODEL') || '').trim()
  }

  private requireModelName(): string {
    const model = this.getModelName()
    if (!model) {
      throw new Error('GLM_ANALYSIS_MODEL not configured')
    }
    return model
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      return false
    }
    const model = this.getModelName()
    if (!model) {
      return false
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.baseURL,
          {
            model,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
            temperature: 0,
            max_tokens: 16,
          },
          {
            headers: { Authorization: `Bearer ${this.getAuthorizationToken()}` },
            timeout: 5000,
          }
        )
      )
      return !!extractGlmTextContent(response.data?.choices?.[0]?.message?.content)
    } catch {
      return false
    }
  }
}
