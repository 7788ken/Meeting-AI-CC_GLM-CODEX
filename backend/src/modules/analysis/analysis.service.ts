import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { AnalysisDto } from './dto/analysis.dto'
import { GenerateAnalysisDto } from './dto/analysis.dto'
import { AIModel } from './dto/analysis.enum'

@Injectable()
export class AnalysisService {
  private analyses: Map<string, AnalysisDto> = new Map()

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {}

  async generate(dto: GenerateAnalysisDto): Promise<AnalysisDto> {
    const model = dto.model || AIModel.QIANWEN
    const speechId = dto.speechIds[0] // 暂时只处理单条发言

    // 调用AI模型生成分析
    const analysisContent = await this.callAIModel(model, speechId)

    const analysis: AnalysisDto = {
      id: this.generateId(),
      speechId,
      sessionId: '', // TODO: 从speech获取
      coreAnalysis: analysisContent.core || '暂无核心要点',
      briefAnswer: analysisContent.brief || '暂无简要回答',
      deepAnswer: analysisContent.deep || '暂无深度分析',
      modelUsed: model,
      generatedAt: new Date(),
    }

    this.analyses.set(analysis.id, analysis)
    return analysis
  }

  async findOne(id: string): Promise<AnalysisDto> {
    const analysis = this.analyses.get(id)
    if (!analysis) {
      throw new NotFoundException(`Analysis ${id} not found`)
    }
    return analysis
  }

  private async callAIModel(model: AIModel, speechId: string) {
    // TODO: 根据不同模型调用对应的API
    // 这里先返回模拟数据
    await this.delay(1000) // 模拟API调用延迟

    return {
      core: '这是核心要点分析',
      brief: '这是简要回答',
      deep: '这是深度分析内容',
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private generateId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
