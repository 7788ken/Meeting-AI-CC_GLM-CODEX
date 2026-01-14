import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  TranscriptStreamService,
  type TranscriptEventDTO,
} from '../transcript-stream/transcript-stream.service'
import { TranscriptAnalysisGlmClient } from './transcript-analysis.glm-client'
import {
  buildTranscriptSummaryUserPrompt,
  DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
} from './transcript-analysis.prompt'
import {
  TranscriptAnalysisSummary,
  type TranscriptAnalysisSummaryDocument,
} from './schemas/transcript-analysis-summary.schema'

export type TranscriptSummaryDTO = {
  sessionId: string
  markdown: string
  model: string
  generatedAt: string
  sourceRevision: number
  sourceEventCount: number
  mode: 'single' | 'chunked'
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
    private readonly transcriptStreamService: TranscriptStreamService,
    private readonly glmClient: TranscriptAnalysisGlmClient
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
        system: DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
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
        system: DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
        user: buildTranscriptSummaryUserPrompt({
          sessionId,
          revision: snapshot.revision,
          eventsText: chunkText,
        }),
      })
      partials.push(markdown.trim())
    }

    const reduced = await this.reduceBulletLists(partials)
    const combinedPartials = reduced.map((md, idx) => `材料${idx + 1}：\n${md}`).join('\n\n')

    const { markdown, model } = await this.glmClient.generateMarkdown({
      system: DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
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
        system: DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
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
        system: DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
        user: buildTranscriptSummaryUserPrompt({
          sessionId,
          revision: snapshot.revision,
          eventsText: chunkText,
        }),
      })
      partials.push(markdown.trim())
    }

    yield { type: 'progress', data: '正在合并要点…' }
    const reduced = await this.reduceBulletLists(partials)
    const combinedPartials = reduced.map((md, idx) => `材料${idx + 1}：\n${md}`).join('\n\n')

    yield { type: 'progress', data: '正在生成最终结构化总结…' }
    for await (const chunk of this.glmClient.generateMarkdownStream({
      system: DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
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

  private async reduceBulletLists(partials: string[]): Promise<string[]> {
    let materials = partials.filter(Boolean)
    if (materials.length <= this.reduceBatchSize) return materials

    while (materials.length > this.reduceBatchSize) {
      const next: string[] = []
      for (let i = 0; i < materials.length; i += this.reduceBatchSize) {
        const group = materials.slice(i, i + this.reduceBatchSize)
        const mergedInput = group.map((md, idx) => `材料${idx + 1}：\n${md}`).join('\n\n')
        const { markdown } = await this.glmClient.generateMarkdown({
          system: DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
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
}
