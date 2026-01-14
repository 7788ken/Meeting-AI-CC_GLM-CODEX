import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

/**
 * 豆包（字节跳动）AI 模型客户端
 * 集成豆包 API 进行会议分析
 *
 * API 文档：https://www.volcengine.com/docs/82379/1263482
 */
@Injectable()
export class DoubaoClient {
  private readonly logger = new Logger(DoubaoClient.name)
  private readonly apiKey: string
  private readonly baseURL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
  private readonly endpointId: string

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.apiKey = this.configService.get<string>('DOUBAO_API_KEY') || ''
    this.endpointId = this.configService.get<string>('DOUBAO_ENDPOINT_ID') || ''

    if (!this.apiKey) {
      this.logger.warn('DOUBAO_API_KEY not configured')
    }
    if (!this.endpointId) {
      this.logger.warn('DOUBAO_ENDPOINT_ID not configured')
    }
  }

  async generateAnalysis(params: {
    analysisType: string
    speeches: Array<{ content: string; speakerName: string }>
    sessionId: string
    prompt?: string
  }): Promise<string> {
    if (!this.apiKey || !this.endpointId) {
      throw new Error('DOUBAO_API_KEY or DOUBAO_ENDPOINT_ID not configured')
    }

    const prompt = this.buildPrompt(params.analysisType, params.speeches, params.prompt)

    try {
      const response = await this.callDoubaoAPI(prompt)
      return this.parseResponse(response)
    } catch (error) {
      this.logger.error('Failed to call Doubao API', error)
      throw new Error(
        `Doubao API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      summary: `请根据以下会议发言内容，生成一份简洁的会议摘要：

${speechesText}

要求：
1. 提取核心讨论内容
2. 总结主要结论
3. 使用 Markdown 格式`,

      'action-items': `请从以下会议发言中提取行动项：

${speechesText}

要求：
1. 列出所有需要执行的任务
2. 标注负责人（如果有）
3. 使用 Markdown 列表格式`,

      sentiment: `请分析以下会议发言的情感倾向：

${speechesText}

要求：
1. 分析整体情感氛围
2. 识别积极/消极/中性观点
3. 使用 Markdown 格式`,

      keywords: `请从以下会议发言中提取关键词：

${speechesText}

要求：
1. 提取重要关键词
2. 按重要程度排序
3. 使用 Markdown 列表格式`,

      topics: `请分析以下会议发言的议题分布：

${speechesText}

要求：
1. 识别主要讨论议题
2. 分析各议题的讨论深度
3. 使用 Markdown 格式`,

      'full-report': `请根据以下会议发言，生成完整的会议报告：

${speechesText}

要求：
1. 包含会议摘要、主要议题、行动项
2. 结构清晰，层次分明
3. 使用 Markdown 格式`,
    }

    return prompts[analysisType] || prompts.summary
  }

  private async callDoubaoAPI(prompt: string): Promise<any> {
    const requestBody = {
      model: this.endpointId,
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
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }

    this.logger.debug('Calling Doubao API...')

    const response = await firstValueFrom(
      this.httpService.post(this.baseURL, requestBody, { headers })
    )

    if (response.data?.choices?.[0]?.message?.content) {
      this.logger.log('Doubao API call successful')
      return response.data
    }

    throw new Error('Invalid response format from Doubao API')
  }

  private parseResponse(response: any): string {
    return response?.choices?.[0]?.message?.content || '无法解析 AI 响应'
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey || !this.endpointId) {
      return false
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.baseURL,
          {
            model: this.endpointId,
            messages: [{ role: 'user', content: 'Hi' }],
          },
          {
            headers: { Authorization: `Bearer ${this.apiKey}` },
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
