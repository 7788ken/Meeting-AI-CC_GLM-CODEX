import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Analysis, AnalysisDocument } from './schemas/analysis.schema'
import { AnalysisDto, GenerateAnalysisDto } from './dto/analysis.dto'
import { AIModel, AnalysisType } from './dto/analysis.enum'
import { ModelManagerService, AIModelType } from './model-manager.service'
import { SpeechService } from '../speech/speech.service'

/**
 * AI 分析服务 (B1026)
 * 使用 Mongoose 实现分析结果的持久化
 * 通过 ModelManager 统一管理多个 AI 模型
 */
@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name)

  constructor(
    @InjectModel(Analysis.name) private analysisModel: Model<AnalysisDocument>,
    private readonly modelManager: ModelManagerService,
    private readonly speechService: SpeechService
  ) {}

  /**
   * 生成 AI 分析并持久化
   */
  async generate(dto: GenerateAnalysisDto): Promise<AnalysisDto> {
    const startTime = Date.now()

    // 确定使用的模型
    const modelType = dto.model ? this.parseModelType(dto.model) : undefined

    // 创建分析记录（初始状态为 processing）
    const analysis = new this.analysisModel({
      sessionId: dto.sessionId,
      analysisType: dto.analysisType || AnalysisType.SUMMARY,
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
        dto.analysisType || AnalysisType.SUMMARY,
        dto.sessionId,
        dto.speechIds,
        modelType
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
   * 获取或生成缓存的分析结果
   */
  async getOrCreate(dto: GenerateAnalysisDto): Promise<AnalysisDto> {
    const modelType = dto.model
      ? this.parseModelType(dto.model)
      : this.modelManager.getDefaultModel()

    // 查找是否已有缓存的分析
    const existing = await this.analysisModel
      .findOne({
        sessionId: dto.sessionId,
        analysisType: dto.analysisType || AnalysisType.SUMMARY,
        modelUsed: modelType,
        status: 'completed',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 24小时内
      })
      .sort({ createdAt: -1 })

    if (existing) {
      // 标记为缓存
      existing.isCached = true
      existing.cachedAt = new Date()
      await existing.save()

      this.logger.log(`Using cached analysis for session ${dto.sessionId}`)
      return this.toDto(existing)
    }

    // 生成新的分析
    return this.generate(dto)
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
    analysisType: AnalysisType,
    sessionId: string,
    speechIds: string[],
    modelType?: AIModelType
  ): Promise<{ result: string; modelUsed: string }> {
    // 获取发言记录内容
    const speeches = await this.getSpeechesForAnalysis(speechIds)

    return this.modelManager.generateAnalysis({
      analysisType,
      speeches,
      sessionId,
      modelType,
    })
  }

  /**
   * 解析模型类型
   */
  private parseModelType(model: string): AIModelType {
    if (Object.values(AIModelType).includes(model as AIModelType)) {
      return model as AIModelType
    }
    // 兼容旧的模型名称
    if (model === 'glm-4' || model === AIModel.GLM) {
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
}
