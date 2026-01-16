import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  TranscriptStreamService,
  type TranscriptEventDTO,
} from '../transcript-stream/transcript-stream.service'
import { TranscriptAnalysisGlmClient } from './transcript-analysis.glm-client'
import {
  DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
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
import { PromptLibraryService } from '../prompt-library/prompt-library.service'

export type TranscriptSummaryDTO = {
  sessionId: string
  promptName?: string
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
  promptName?: string
  markdown: string
  model: string
  generatedAt: string
  sourceRevision: number
  sourceStartEventIndex: number
  sourceEndEventIndex: number
}

export type TranscriptSegmentAnalysisStreamEvent =
  | {
      type: 'meta'
      data: Omit<TranscriptSegmentAnalysisDTO, 'markdown' | 'generatedAt'>
    }
  | { type: 'delta'; data: string }
  | { type: 'done'; data: { generatedAt: string } }
  | { type: 'server_error'; data: { message: string } }

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
  private readonly segmentAnalysisInFlight = new Map<
    string,
    Promise<TranscriptSegmentAnalysisDTO>
  >()

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
    private readonly transcriptAnalysisConfigService: TranscriptAnalysisConfigService,
    private readonly promptLibraryService: PromptLibraryService
  ) {}

  async getStoredSummary(input: { sessionId: string }): Promise<TranscriptSummaryDTO | null> {
    const sessionId = (input.sessionId || '').trim()
    if (!sessionId) return null

    const doc = await this.summaryModel.findOne({ sessionId }).exec()
    if (!doc) return null

    const analysisConfig = this.transcriptAnalysisConfigService.getConfig()
    const promptName = this.resolveSummaryPromptName(analysisConfig.summaryPromptId)

    return {
      sessionId: doc.sessionId,
      promptName,
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
    const promptName = this.resolveSummaryPromptName(analysisConfig.summaryPromptId)
    const summarySystemPrompt = this.buildAnalysisSystemPrompt(
      this.promptLibraryService.resolvePromptContent(
        analysisConfig.summaryPromptId,
        'summary',
        DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT
      )
    )
    const chunkSummarySystemPrompt = this.buildAnalysisSystemPrompt(
      this.promptLibraryService.resolvePromptContent(
        analysisConfig.chunkSummaryPromptId,
        'chunk_summary',
        DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT
      )
    )

    const events = snapshot.events.filter(e => (e.content || '').trim())
    if (events.length === 0) {
      const now = new Date().toISOString()
      const dto: TranscriptSummaryDTO = {
        sessionId,
        promptName,
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
        promptName,
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
      promptName,
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
    const promptName = this.resolveSummaryPromptName(analysisConfig.summaryPromptId)
    const summarySystemPrompt = this.buildAnalysisSystemPrompt(
      this.promptLibraryService.resolvePromptContent(
        analysisConfig.summaryPromptId,
        'summary',
        DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT
      )
    )
    const chunkSummarySystemPrompt = this.buildAnalysisSystemPrompt(
      this.promptLibraryService.resolvePromptContent(
        analysisConfig.chunkSummaryPromptId,
        'chunk_summary',
        DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT
      )
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
        promptName,
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
        promptName,
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
        promptName,
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
      promptName,
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

    const analysisConfig = this.transcriptAnalysisConfigService.getConfig()
    const promptName = this.resolveSegmentPromptName(analysisConfig.chunkSummaryPromptId)

    return {
      sessionId: doc.sessionId,
      segmentId: String(doc.segmentId),
      segmentSequence: doc.segmentSequence,
      promptName,
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
    const promptName = this.resolveSegmentPromptName(analysisConfig.chunkSummaryPromptId)
    const segmentSystemPrompt = this.buildAnalysisSystemPrompt(
      this.promptLibraryService.resolvePromptContent(
        analysisConfig.chunkSummaryPromptId,
        'chunk_summary',
        DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT
      )
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
      promptName,
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

  async *generateSegmentAnalysisStream(input: {
    sessionId: string
    segmentId: string
    force?: boolean
  }): AsyncIterable<TranscriptSegmentAnalysisStreamEvent> {
    const sessionId = (input.sessionId || '').trim()
    const segmentId = (input.segmentId || '').trim()
    if (!sessionId) {
      yield { type: 'server_error', data: { message: 'sessionId is required' } }
      return
    }
    if (!segmentId) {
      yield { type: 'server_error', data: { message: 'segmentId is required' } }
      return
    }

    let objectId: Types.ObjectId
    try {
      objectId = new Types.ObjectId(segmentId)
    } catch {
      yield { type: 'server_error', data: { message: 'segmentId is invalid' } }
      return
    }

    const segment = await this.segmentModel.findOne({ _id: objectId, sessionId }).exec()
    if (!segment) {
      yield { type: 'server_error', data: { message: 'segment not found' } }
      return
    }

    const analysisConfig = this.transcriptAnalysisConfigService.getConfig()
    const promptName = this.resolveSegmentPromptName(analysisConfig.chunkSummaryPromptId)
    const inFlightKey = `${sessionId}:${segmentId}`

    if (!input.force) {
      const inFlight = this.segmentAnalysisInFlight.get(inFlightKey)
      if (inFlight) {
        const dto = await inFlight
        yield {
          type: 'meta',
          data: {
            sessionId,
            segmentId: dto.segmentId,
            segmentSequence: dto.segmentSequence,
            promptName,
            model: dto.model,
            sourceRevision: dto.sourceRevision,
            sourceStartEventIndex: dto.sourceStartEventIndex,
            sourceEndEventIndex: dto.sourceEndEventIndex,
          },
        }
        if (dto.markdown) {
          yield { type: 'delta', data: dto.markdown }
        }
        yield { type: 'done', data: { generatedAt: dto.generatedAt } }
        return
      }

      const cached = await this.segmentAnalysisModel
        .findOne({ sessionId, segmentId: objectId })
        .exec()
      if (cached && cached.sourceRevision === segment.sourceRevision) {
        yield {
          type: 'meta',
          data: {
            sessionId,
            segmentId: String(segment._id),
            segmentSequence: segment.sequence,
            promptName,
            model: cached.model,
            sourceRevision: segment.sourceRevision,
            sourceStartEventIndex: segment.sourceStartEventIndex,
            sourceEndEventIndex: segment.sourceEndEventIndex,
          },
        }
        if (cached.markdown) {
          yield { type: 'delta', data: cached.markdown }
        }
        yield { type: 'done', data: { generatedAt: cached.generatedAt } }
        return
      }
    }

    let resolveInFlight: ((dto: TranscriptSegmentAnalysisDTO) => void) | null = null
    let rejectInFlight: ((error: unknown) => void) | null = null
    const pending = new Promise<TranscriptSegmentAnalysisDTO>((resolve, reject) => {
      resolveInFlight = resolve
      rejectInFlight = reject
    })
    this.segmentAnalysisInFlight.set(inFlightKey, pending)

    const segmentSystemPrompt = this.buildAnalysisSystemPrompt(
      this.promptLibraryService.resolvePromptContent(
        analysisConfig.chunkSummaryPromptId,
        'chunk_summary',
        DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT
      )
    )

    const model = this.glmClient.getModelName()
    const segmentSequence = segment.sequence
    const sourceRevision = segment.sourceRevision
    const sourceStartEventIndex = segment.sourceStartEventIndex
    const sourceEndEventIndex = segment.sourceEndEventIndex

    yield {
      type: 'meta',
      data: {
        sessionId,
        segmentId: String(segment._id),
        segmentSequence,
        promptName,
        model,
        sourceRevision,
        sourceStartEventIndex,
        sourceEndEventIndex,
      },
    }

    let markdownBuffer = ''
    try {
      for await (const chunk of this.glmClient.generateMarkdownStream({
        system: segmentSystemPrompt,
        user: buildTranscriptSegmentAnalysisUserPrompt({
          sessionId,
          revision: segment.sourceRevision,
          segmentSequence: segment.sequence,
          segmentContent: String(segment.content || '').trim(),
          sourceStartEventIndex: segment.sourceStartEventIndex,
          sourceEndEventIndex: segment.sourceEndEventIndex,
        }),
      })) {
        if (chunk.type === 'delta') {
          markdownBuffer += chunk.text
          yield { type: 'delta', data: chunk.text }
        }
      }

      const generatedAt = new Date().toISOString()
      const dto: TranscriptSegmentAnalysisDTO = {
        sessionId,
        segmentId: String(segment._id),
        segmentSequence,
        promptName,
        markdown: markdownBuffer,
        model,
        generatedAt,
        sourceRevision,
        sourceStartEventIndex,
        sourceEndEventIndex,
      }

      await this.persistSegmentAnalysis(dto)
      resolveInFlight?.(dto)
      yield { type: 'done', data: { generatedAt } }
    } catch (error) {
      rejectInFlight?.(error)
      throw error
    } finally {
      this.segmentAnalysisInFlight.delete(inFlightKey)
    }
  }

  private resolveSegmentPromptName(preferredId: string): string {
    const fallbackId = this.promptLibraryService.getDefaultPromptId('chunk_summary')
    const preferredName = this.getChunkSummaryPromptName(preferredId)
    if (preferredName) return preferredName
    if (preferredId !== fallbackId) {
      const fallbackName = this.getChunkSummaryPromptName(fallbackId)
      if (fallbackName) return fallbackName
    }
    return ''
  }

  private resolveSummaryPromptName(preferredId: string): string {
    const fallbackId = this.promptLibraryService.getDefaultPromptId('summary')
    const preferredName = this.getSummaryPromptName(preferredId)
    if (preferredName) return preferredName
    if (preferredId !== fallbackId) {
      const fallbackName = this.getSummaryPromptName(fallbackId)
      if (fallbackName) return fallbackName
    }
    return ''
  }

  private getSummaryPromptName(id: string): string {
    const prompt = this.promptLibraryService.getPromptById(id)
    if (prompt && prompt.type === 'summary') {
      return prompt.name
    }
    return ''
  }

  private getChunkSummaryPromptName(id: string): string {
    const prompt = this.promptLibraryService.getPromptById(id)
    if (prompt && prompt.type === 'chunk_summary') {
      return prompt.name
    }
    return ''
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
