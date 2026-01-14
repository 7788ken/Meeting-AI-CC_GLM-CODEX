import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Analysis, AnalysisDocument } from './schemas/analysis.schema'
import { AnalysisDto, GenerateAnalysisDto } from './dto/analysis.dto'
import { AnalysisType } from './dto/analysis.enum'
import { ModelManagerService, AIModelType } from './model-manager.service'
import { SpeechService } from '../speech/speech.service'
import { GlmClient } from './clients/glm.client'
import { StreamSegmentAnalysisDto } from './dto/segment-analysis.dto'

/**
 * AI 分析服务 (B1026)
 * 使用 Mongoose 实现分析结果的持久化
 * 通过 ModelManager 统一管理多个 AI 模型
 */
@Injectable()
export class AnalysisService {
  constructor(
    @InjectModel(Analysis.name) private analysisModel: Model<AnalysisDocument>,
    private readonly modelManager: ModelManagerService,
    private readonly glmClient: GlmClient,
    private readonly speechService: SpeechService,
    private readonly configService: ConfigService
  ) {}

  /**
   * 生成 AI 分析并持久化
   */
  async generate(dto: GenerateAnalysisDto): Promise<AnalysisDto> {
    const startTime = Date.now()

    // 确定使用的模型
    const modelType = dto.model ? this.parseModelType(dto.model) : undefined
    const analysisType = this.normalizeAnalysisType(dto.analysisType)

    // 创建分析记录（初始状态为 processing）
    const analysis = new this.analysisModel({
      sessionId: dto.sessionId,
      analysisType,
      modelUsed: modelType || this.modelManager.getDefaultModel(),
      modelVersion: 'auto',
      result: '',
      status: 'processing',
      isCached: false,
      relatedSpeeches: dto.speechIds.map(id => new Types.ObjectId(id)),
    })

    await analysis.save()

    try {
      // 调用 AI 模型生成分析
      const { result, modelUsed } = await this.callAIModel(
        analysisType,
        dto.sessionId,
        dto.speechIds,
        modelType,
        dto.prompt
      )

      const processingTime = Date.now() - startTime

      // 更新分析结果
      analysis.result = result
      analysis.modelUsed = modelUsed
      analysis.status = 'completed'
      analysis.processingTime = processingTime
      analysis.generatedAt = new Date()
      await analysis.save()

      return this.toDto(analysis)
    } catch (error) {
      // 标记为失败
      analysis.status = 'failed'
      analysis.errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await analysis.save()

      throw error
    }
  }

  /**
   * 查询单条分析记录
   */
  async findOne(id: string): Promise<AnalysisDto> {
    const analysis = await this.analysisModel.findById(id)
    if (!analysis) {
      throw new NotFoundException(`Analysis ${id} not found`)
    }
    return this.toDto(analysis)
  }

  /**
   * 查询会话的所有分析记录
   */
  async findBySession(sessionId: string): Promise<AnalysisDto[]> {
    const analyses = await this.analysisModel.find({ sessionId }).sort({ createdAt: -1 }).exec()

    return analyses.map(a => this.toDto(a))
  }

  /**
   * 查询会话的特定类型分析
   */
  async findByType(sessionId: string, analysisType: string): Promise<AnalysisDto[]> {
    const analyses = await this.analysisModel
      .find({ sessionId, analysisType })
      .sort({ createdAt: -1 })
      .exec()

    return analyses.map(a => this.toDto(a))
  }

  /**
   * 删除会话的所有分析记录
   */
  async deleteBySession(sessionId: string): Promise<void> {
    await this.analysisModel.deleteMany({ sessionId }).exec()
  }

  /**
   * 调用 AI 模型生成分析
   */
  private async callAIModel(
    analysisType: string,
    sessionId: string,
    speechIds: string[],
    modelType?: AIModelType,
    prompt?: string
  ): Promise<{ result: string; modelUsed: string }> {
    // 获取发言记录内容
    const speeches = await this.getSpeechesForAnalysis(speechIds)

    return this.modelManager.generateAnalysis({
      analysisType,
      speeches,
      sessionId,
      modelType,
      prompt,
    })
  }

  private normalizeAnalysisType(value?: string): string {
    const normalized = typeof value === 'string' ? value.trim() : ''
    return normalized || AnalysisType.SUMMARY
  }

  /**
   * 解析模型类型
   */
  private parseModelType(model: string): AIModelType {
    const normalized = typeof model === 'string' ? model.trim() : ''
    if (Object.values(AIModelType).includes(normalized as AIModelType)) {
      return normalized as AIModelType
    }
    const glmAlias = (this.configService.get<string>('GLM_ANALYSIS_MODEL') || '').trim()
    if (glmAlias && normalized === glmAlias) {
      return AIModelType.GLM
    }
    return AIModelType.GLM
  }

  /**
   * 获取发言记录用于分析
   */
  private async getSpeechesForAnalysis(
    speechIds: string[]
  ): Promise<Array<{ content: string; speakerName: string }>> {
    if (speechIds.length === 0) {
      return []
    }

    try {
      const speeches = await Promise.all(speechIds.map(id => this.speechService.findOne(id)))
      return speeches.map(speech => ({
        content: speech.content ?? '',
        speakerName: speech.speakerName ?? '',
      }))
    } catch (error) {
      if (error instanceof NotFoundException) {
        return []
      }
      throw error
    }
  }

  private toDto(analysis: AnalysisDocument): AnalysisDto {
    return {
      id: analysis._id.toString(),
      sessionId: analysis.sessionId,
      analysisType: analysis.analysisType,
      modelUsed: analysis.modelUsed,
      result: analysis.result,
      status: analysis.status,
      processingTime: analysis.processingTime,
      isCached: analysis.isCached,
      generatedAt: analysis.generatedAt,
      createdAt: analysis.createdAt,
    }
  }

  async streamSegmentAnalysis(
    dto: StreamSegmentAnalysisDto,
    options: { signal?: AbortSignal; onDelta: (delta: string) => void }
  ): Promise<{ fullText: string; modelUsed: string }> {
    const sessionId = (dto.sessionId || '').trim()
    if (!sessionId) {
      throw new Error('sessionId is required')
    }

    const content = typeof dto.content === 'string' ? dto.content : ''
    const safeContent = content.trim()
    if (!safeContent) {
      throw new Error('content is required')
    }

    const sequence =
      typeof dto.sequence === 'number' && Number.isFinite(dto.sequence) ? Math.floor(dto.sequence) : null
    const speakerName = sequence == null ? '片段' : `片段#${sequence}`

    return this.glmClient.streamAnalysis({
      analysisType: (dto.analysisType || 'summary').trim() || 'summary',
      sessionId,
      speeches: [{ speakerName, content: safeContent }],
      prompt: dto.prompt,
      signal: options.signal,
      onDelta: options.onDelta,
    })
  }
}
