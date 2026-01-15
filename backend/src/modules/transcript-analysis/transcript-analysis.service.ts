import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  TranscriptStreamService,
  type TranscriptEventDTO,
} from '../transcript-stream/transcript-stream.service'
import { TranscriptAnalysisGlmClient } from './transcript-analysis.glm-client'
import {
  buildTranscriptSummaryUserPrompt,
  buildTranscriptSegmentAnalysisUserPrompt,
} from './transcript-analysis.prompt'
import {
  TranscriptAnalysisSummary,
  type TranscriptAnalysisSummaryDocument,
} from './schemas/transcript-analysis-summary.schema'
import {
  TranscriptAnalysisSegmentAnalysis,
  type TranscriptAnalysisSegmentAnalysisDocument,
} from './schemas/transcript-analysis-segment.schema'
import {
  TranscriptEventSegment,
  type TranscriptEventSegmentDocument,
} from '../transcript-event-segmentation/schemas/transcript-event-segment.schema'
import { AppConfigService } from '../app-config/app-config.service'
import { TranscriptAnalysisConfigService } from './transcript-analysis-config.service'

export type TranscriptSummaryDTO = {
  sessionId: string
  markdown: string
  model: string
  generatedAt: string
  sourceRevision: number
  sourceEventCount: number
  mode: 'single' | 'chunked'
}

export type TranscriptSegmentAnalysisDTO = {
  sessionId: string
  segmentId: string
  segmentSequence: number
  markdown: string
  model: string
  generatedAt: string
  sourceRevision: number
  sourceStartEventIndex: number
  sourceEndEventIndex: number
}

export type TranscriptSummaryStreamEvent =
  | {
      type: 'meta'
      data: Omit<TranscriptSummaryDTO, 'markdown' | 'generatedAt'>
    }
  | { type: 'progress'; data: string }
  | { type: 'delta'; data: string }
  | { type: 'done'; data: { generatedAt: string } }
  | { type: 'server_error'; data: { message: string } }

@Injectable()
export class TranscriptAnalysisService {
  private readonly logger = new Logger(TranscriptAnalysisService.name)
  private readonly maxEvents = 5000
  private readonly maxChunkChars = 28000
  private readonly reduceBatchSize = 8

  constructor(
    @InjectModel(TranscriptAnalysisSummary.name)
    private readonly summaryModel: Model<TranscriptAnalysisSummaryDocument>,
    @InjectModel(TranscriptAnalysisSegmentAnalysis.name)
    private readonly segmentAnalysisModel: Model<TranscriptAnalysisSegmentAnalysisDocument>,
    @InjectModel(TranscriptEventSegment.name)
    private readonly segmentModel: Model<TranscriptEventSegmentDocument>,
    private readonly transcriptStreamService: TranscriptStreamService,
    private readonly appConfigService: AppConfigService,
    private readonly glmClient: TranscriptAnalysisGlmClient,
    private readonly transcriptAnalysisConfigService: TranscriptAnalysisConfigService
  ) {}

  async getStoredSummary(input: { sessionId: string }): Promise<TranscriptSummaryDTO | null> {
    const sessionId = (input.sessionId || '').trim()
    if (!sessionId) return null

    const doc = await this.summaryModel.findOne({ sessionId }).exec()
    if (!doc) return null

    return {
      sessionId: doc.sessionId,
      markdown: doc.markdown,
      model: doc.model,
      generatedAt: doc.generatedAt,
      sourceRevision: doc.sourceRevision,
      sourceEventCount: doc.sourceEventCount,
      mode: doc.mode,
    }
  }

  async generateSummary(input: { sessionId: string }): Promise<TranscriptSummaryDTO> {
    const sessionId = (input.sessionId || '').trim()
    if (!sessionId) {
      throw new Error('sessionId is required')
    }

    const snapshot = await this.transcriptStreamService.getSnapshot({
      sessionId,
      limit: this.maxEvents,
    })

    const analysisConfig = this.transcriptAnalysisConfigService.getConfig()
    const summarySystemPrompt = this.buildAnalysisSystemPrompt(
      analysisConfig.summarySystemPrompt
    )
    const chunkSummarySystemPrompt = this.buildAnalysisSystemPrompt(
      analysisConfig.chunkSummarySystemPrompt
    )

    const events = snapshot.events.filter(e => (e.content || '').trim())
    if (events.length === 0) {
      const now = new Date().toISOString()
      const dto: TranscriptSummaryDTO = {
        sessionId,
        markdown: `# 会议分析总结\n\n## 一句话结论\n暂无可分析的原文。\n\n## 议题与结论\n- 未明确\n\n## 关键要点\n- 未明确\n\n## 决策\n- 未明确\n\n## 行动项（TODO）\n- 未明确\n\n## 风险与阻塞\n- 未明确\n\n## 待澄清问题\n- 未明确\n\n## 附：原文引用（可选）\n- 无\n`,
        model: this.glmClient.getModelName(),
        generatedAt: now,
        sourceRevision: snapshot.revision,
        sourceEventCount: 0,
        mode: 'single',
      }
      await this.persistSummary(dto)
      return dto
    }

    const totalText = this.buildEventsText(events)
    const chunks = this.chunkTextByEvents(events, this.maxChunkChars)

    if (chunks.length <= 1) {
      const { markdown, model } = await this.glmClient.generateMarkdown({
        system: summarySystemPrompt,
        user: buildTranscriptSummaryUserPrompt({
          sessionId,
          revision: snapshot.revision,
          eventsText: totalText,
        }),
      })
      const dto: TranscriptSummaryDTO = {
        sessionId,
        markdown,
        model,
        generatedAt: new Date().toISOString(),
        sourceRevision: snapshot.revision,
        sourceEventCount: events.length,
        mode: 'single',
      }
      await this.persistSummary(dto)
      return dto
    }

    const partials: string[] = []
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkText = this.buildEventsText(chunks[i])
      const { markdown } = await this.glmClient.generateMarkdown({
        system: chunkSummarySystemPrompt,
        user: buildTranscriptSummaryUserPrompt({
          sessionId,
          revision: snapshot.revision,
          eventsText: chunkText,
        }),
      })
      partials.push(markdown.trim())
    }

    const reduced = await this.reduceBulletLists(partials, chunkSummarySystemPrompt)
    const combinedPartials = reduced.map((md, idx) => `材料${idx + 1}：\n${md}`).join('\n\n')

    const { markdown, model } = await this.glmClient.generateMarkdown({
      system: summarySystemPrompt,
      user: `请基于以下“分片要点”，输出整场会议的最终结构化总结（严格遵循既定标题结构）。\n\n${combinedPartials}`,
    })

    const dto: TranscriptSummaryDTO = {
      sessionId,
      markdown,
      model,
      generatedAt: new Date().toISOString(),
      sourceRevision: snapshot.revision,
      sourceEventCount: events.length,
      mode: 'chunked',
    }
    await this.persistSummary(dto)
    return dto
  }

  async *generateSummaryStream(input: {
    sessionId: string
  }): AsyncIterable<TranscriptSummaryStreamEvent> {
    const sessionId = (input.sessionId || '').trim()
    if (!sessionId) {
      yield { type: 'server_error', data: { message: 'sessionId is required' } }
      return
    }

    yield { type: 'progress', data: '正在读取原文…' }

    const snapshot = await this.transcriptStreamService.getSnapshot({
      sessionId,
      limit: this.maxEvents,
    })

    const analysisConfig = this.transcriptAnalysisConfigService.getConfig()
    const summarySystemPrompt = this.buildAnalysisSystemPrompt(
      analysisConfig.summarySystemPrompt
    )
    const chunkSummarySystemPrompt = this.buildAnalysisSystemPrompt(
      analysisConfig.chunkSummarySystemPrompt
    )

    const events = snapshot.events.filter(e => (e.content || '').trim())
    const model = this.glmClient.getModelName()
    const chunks = this.chunkTextByEvents(events, this.maxChunkChars)
    const mode: TranscriptSummaryDTO['mode'] = chunks.length <= 1 ? 'single' : 'chunked'
    let markdownBuffer = ''

    yield {
      type: 'meta',
      data: {
        sessionId,
        model,
        sourceRevision: snapshot.revision,
        sourceEventCount: events.length,
        mode,
      },
    }

    if (events.length === 0) {
      const markdown =
        `# 会议分析总结\n\n## 一句话结论\n暂无可分析的原文。\n\n## 议题与结论\n- 未明确\n\n## 关键要点\n- 未明确\n\n## 决策\n- 未明确\n\n## 行动项（TODO）\n- 未明确\n\n## 风险与阻塞\n- 未明确\n\n## 待澄清问题\n- 未明确\n\n## 附：原文引用（可选）\n- 无\n`
      markdownBuffer = markdown
      yield { type: 'delta', data: markdown }
      const generatedAt = new Date().toISOString()
      await this.persistSummary({
        sessionId,
        markdown: markdownBuffer,
        model,
        generatedAt,
        sourceRevision: snapshot.revision,
        sourceEventCount: 0,
        mode,
      })
      yield { type: 'done', data: { generatedAt } }
      return
    }

    if (chunks.length <= 1) {
      yield { type: 'progress', data: '正在生成总结…' }
      const totalText = this.buildEventsText(events)
      for await (const chunk of this.glmClient.generateMarkdownStream({
        system: summarySystemPrompt,
        user: buildTranscriptSummaryUserPrompt({
          sessionId,
          revision: snapshot.revision,
          eventsText: totalText,
        }),
      })) {
        if (chunk.type === 'delta') {
          markdownBuffer += chunk.text
          yield { type: 'delta', data: chunk.text }
        }
      }
      const generatedAt = new Date().toISOString()
      await this.persistSummary({
        sessionId,
        markdown: markdownBuffer,
        model,
        generatedAt,
        sourceRevision: snapshot.revision,
        sourceEventCount: events.length,
        mode,
      })
      yield { type: 'done', data: { generatedAt } }
      return
    }

    const partials: string[] = []
    for (let i = 0; i < chunks.length; i += 1) {
      yield { type: 'progress', data: `正在提炼片段要点（${i + 1}/${chunks.length}）…` }
      const chunkText = this.buildEventsText(chunks[i])
      const { markdown } = await this.glmClient.generateMarkdown({
        system: chunkSummarySystemPrompt,
        user: buildTranscriptSummaryUserPrompt({
          sessionId,
          revision: snapshot.revision,
          eventsText: chunkText,
        }),
      })
      partials.push(markdown.trim())
    }

    yield { type: 'progress', data: '正在合并要点…' }
    const reduced = await this.reduceBulletLists(partials, chunkSummarySystemPrompt)
    const combinedPartials = reduced.map((md, idx) => `材料${idx + 1}：\n${md}`).join('\n\n')

    yield { type: 'progress', data: '正在生成最终结构化总结…' }
    for await (const chunk of this.glmClient.generateMarkdownStream({
      system: summarySystemPrompt,
      user: `请基于以下“分片要点”，输出整场会议的最终结构化总结（严格遵循既定标题结构）。\n\n${combinedPartials}`,
    })) {
      if (chunk.type === 'delta') {
        markdownBuffer += chunk.text
        yield { type: 'delta', data: chunk.text }
      }
    }

    const generatedAt = new Date().toISOString()
    await this.persistSummary({
      sessionId,
      markdown: markdownBuffer,
      model,
      generatedAt,
      sourceRevision: snapshot.revision,
      sourceEventCount: events.length,
      mode,
    })
    yield { type: 'done', data: { generatedAt } }
  }

  async getStoredSegmentAnalysis(input: {
    sessionId: string
    segmentId: string
  }): Promise<TranscriptSegmentAnalysisDTO | null> {
    const sessionId = (input.sessionId || '').trim()
    const segmentId = (input.segmentId || '').trim()
    if (!sessionId || !segmentId) return null

    let objectId: Types.ObjectId
    try {
      objectId = new Types.ObjectId(segmentId)
    } catch {
      return null
    }

    const doc = await this.segmentAnalysisModel.findOne({ sessionId, segmentId: objectId }).exec()
    if (!doc) return null

    return {
      sessionId: doc.sessionId,
      segmentId: String(doc.segmentId),
      segmentSequence: doc.segmentSequence,
      markdown: doc.markdown,
      model: doc.model,
      generatedAt: doc.generatedAt,
      sourceRevision: doc.sourceRevision,
      sourceStartEventIndex: doc.sourceStartEventIndex,
      sourceEndEventIndex: doc.sourceEndEventIndex,
    }
  }

  async generateSegmentAnalysis(input: {
    sessionId: string
    segmentId: string
  }): Promise<TranscriptSegmentAnalysisDTO> {
    const sessionId = (input.sessionId || '').trim()
    const segmentId = (input.segmentId || '').trim()
    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    if (!segmentId) {
      throw new Error('segmentId is required')
    }

    let objectId: Types.ObjectId
    try {
      objectId = new Types.ObjectId(segmentId)
    } catch {
      throw new Error('segmentId is invalid')
    }

    const segment = await this.segmentModel.findOne({ _id: objectId, sessionId }).exec()
    if (!segment) {
      throw new Error('segment not found')
    }

    const analysisConfig = this.transcriptAnalysisConfigService.getConfig()
    const segmentSystemPrompt = this.buildAnalysisSystemPrompt(
      analysisConfig.segmentAnalysisSystemPrompt
    )

    const { markdown, model } = await this.glmClient.generateMarkdown({
      system: segmentSystemPrompt,
      user: buildTranscriptSegmentAnalysisUserPrompt({
        sessionId,
        revision: segment.sourceRevision,
        segmentSequence: segment.sequence,
        segmentContent: String(segment.content || '').trim(),
        sourceStartEventIndex: segment.sourceStartEventIndex,
        sourceEndEventIndex: segment.sourceEndEventIndex,
      }),
    })

    const dto: TranscriptSegmentAnalysisDTO = {
      sessionId,
      segmentId: String(segment._id),
      segmentSequence: segment.sequence,
      markdown,
      model,
      generatedAt: new Date().toISOString(),
      sourceRevision: segment.sourceRevision,
      sourceStartEventIndex: segment.sourceStartEventIndex,
      sourceEndEventIndex: segment.sourceEndEventIndex,
    }

    await this.persistSegmentAnalysis(dto)
    return dto
  }

  private buildAnalysisSystemPrompt(basePrompt: string): string {
    const legacyEnabled = this.appConfigService.getBoolean(
      'TRANSCRIPT_ANALYSIS_SIMPLIFIED_CHINESE_ENABLED',
      true
    )
    const enabled = this.appConfigService.getBoolean(
      'TRANSCRIPT_ANALYSIS_LANGUAGE_ENABLED',
      legacyEnabled
    )
    if (!enabled) return basePrompt
    const targetLanguage = this.appConfigService
      .getString('TRANSCRIPT_ANALYSIS_LANGUAGE', '')
      .trim() || '简体中文'
    return `${basePrompt}\n\n输出语言要求：${targetLanguage}。`
  }

  private buildEventsText(events: TranscriptEventDTO[]): string {
    return events.map(e => `[${e.eventIndex}] ${String(e.content || '').trim()}`).join('\n')
  }

  private chunkTextByEvents(
    events: TranscriptEventDTO[],
    maxChars: number
  ): TranscriptEventDTO[][] {
    const limit = Math.max(2000, Math.floor(maxChars))
    const chunks: TranscriptEventDTO[][] = []
    let current: TranscriptEventDTO[] = []
    let currentChars = 0

    for (const event of events) {
      const line = `[${event.eventIndex}] ${String(event.content || '').trim()}\n`
      if (current.length > 0 && currentChars + line.length > limit) {
        chunks.push(current)
        current = []
        currentChars = 0
      }
      current.push(event)
      currentChars += line.length
    }

    if (current.length > 0) {
      chunks.push(current)
    }
    return chunks
  }

  private async reduceBulletLists(
    partials: string[],
    chunkSummarySystemPrompt: string
  ): Promise<string[]> {
    let materials = partials.filter(Boolean)
    if (materials.length <= this.reduceBatchSize) return materials

    while (materials.length > this.reduceBatchSize) {
      const next: string[] = []
      for (let i = 0; i < materials.length; i += this.reduceBatchSize) {
        const group = materials.slice(i, i + this.reduceBatchSize)
        const mergedInput = group.map((md, idx) => `材料${idx + 1}：\n${md}`).join('\n\n')
        const { markdown } = await this.glmClient.generateMarkdown({
          system: chunkSummarySystemPrompt,
          user: `请合并以下要点列表：去重、合并同类项，输出 Markdown 要点列表（不要标题）。\n\n${mergedInput}`,
        })
        next.push(markdown.trim())
      }
      materials = next
    }

    return materials
  }

  private async persistSummary(dto: TranscriptSummaryDTO): Promise<void> {
    try {
      await this.summaryModel
        .findOneAndUpdate(
          { sessionId: dto.sessionId },
          {
            $set: {
              sessionId: dto.sessionId,
              markdown: dto.markdown,
              model: dto.model,
              generatedAt: dto.generatedAt,
              sourceRevision: dto.sourceRevision,
              sourceEventCount: dto.sourceEventCount,
              mode: dto.mode,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        .exec()
    } catch (error) {
      this.logger.error(
        `Persist transcript summary failed, sessionId=${dto.sessionId}`,
        error instanceof Error ? error.stack : String(error)
      )
    }
  }

  private async persistSegmentAnalysis(dto: TranscriptSegmentAnalysisDTO): Promise<void> {
    let objectId: Types.ObjectId
    try {
      objectId = new Types.ObjectId(dto.segmentId)
    } catch {
      this.logger.error(
        `Persist segment analysis failed, invalid segmentId=${dto.segmentId}, sessionId=${dto.sessionId}`
      )
      return
    }

    try {
      await this.segmentAnalysisModel
        .findOneAndUpdate(
          { sessionId: dto.sessionId, segmentId: objectId },
          {
            $set: {
              sessionId: dto.sessionId,
              segmentId: objectId,
              segmentSequence: dto.segmentSequence,
              markdown: dto.markdown,
              model: dto.model,
              generatedAt: dto.generatedAt,
              sourceRevision: dto.sourceRevision,
              sourceStartEventIndex: dto.sourceStartEventIndex,
              sourceEndEventIndex: dto.sourceEndEventIndex,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        .exec()
    } catch (error) {
      this.logger.error(
        `Persist segment analysis failed, sessionId=${dto.sessionId}, segmentId=${dto.segmentId}`,
        error instanceof Error ? error.stack : String(error)
      )
    }
  }
}
