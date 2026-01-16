import { Injectable, OnModuleInit } from '@nestjs/common'
import { DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT } from './transcript-analysis.prompt'
import { AppConfigService } from '../app-config/app-config.service'
import { PromptLibraryService } from '../prompt-library/prompt-library.service'
import { type PromptTemplateType } from '../prompt-library/prompt-library.constants'

const SUMMARY_PROMPT_ID_KEY = 'TRANSCRIPT_ANALYSIS_SUMMARY_PROMPT_ID'
const CHUNK_PROMPT_ID_KEY = 'TRANSCRIPT_ANALYSIS_CHUNK_SUMMARY_PROMPT_ID'
const LEGACY_SUMMARY_PROMPT_KEY = 'TRANSCRIPT_ANALYSIS_SUMMARY_SYSTEM_PROMPT'
const LEGACY_CHUNK_PROMPT_KEY = 'TRANSCRIPT_ANALYSIS_CHUNK_SUMMARY_SYSTEM_PROMPT'
const SEGMENT_PROMPT_KEY = 'TRANSCRIPT_ANALYSIS_SEGMENT_SYSTEM_PROMPT'

type PromptDefaults = { summaryPromptId: string; chunkSummaryPromptId: string }

export interface TranscriptAnalysisConfig {
  summaryPromptId: string
  chunkSummaryPromptId: string
  segmentAnalysisSystemPrompt: string
}

@Injectable()
export class TranscriptAnalysisConfigService implements OnModuleInit {
  private config: TranscriptAnalysisConfig = {
    summaryPromptId: '',
    chunkSummaryPromptId: '',
    segmentAnalysisSystemPrompt: DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT,
  }

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly promptLibraryService: PromptLibraryService
  ) {}

  async onModuleInit(): Promise<void> {
    this.config = await this.buildDefaultConfig()
  }

  getConfig(): TranscriptAnalysisConfig {
    return { ...this.config }
  }

  async reloadFromStorage(): Promise<TranscriptAnalysisConfig> {
    await this.appConfigService.refreshCache()
    this.config = await this.buildDefaultConfig()
    return { ...this.config }
  }

  async updateConfig(
    partial: Partial<TranscriptAnalysisConfig>
  ): Promise<TranscriptAnalysisConfig> {
    const defaults = await this.promptLibraryService.ensureDefaults()
    const next = this.normalizeConfig(partial, this.config, defaults)
    this.config = next
    await this.persistConfig(next)
    return { ...next }
  }

  async resetConfig(): Promise<TranscriptAnalysisConfig> {
    this.config = await this.buildEnvConfig()
    await this.persistConfig(this.config)
    return { ...this.config }
  }

  private async buildDefaultConfig(): Promise<TranscriptAnalysisConfig> {
    const defaults = await this.promptLibraryService.ensureDefaults()
    const storedSummaryPromptId = this.appConfigService.getString(SUMMARY_PROMPT_ID_KEY, '')
    const storedChunkPromptId = this.appConfigService.getString(CHUNK_PROMPT_ID_KEY, '')

    const summaryPromptId = await this.resolvePromptId(
      storedSummaryPromptId,
      LEGACY_SUMMARY_PROMPT_KEY,
      'summary',
      defaults.summaryPromptId
    )
    const chunkSummaryPromptId = await this.resolvePromptId(
      storedChunkPromptId,
      LEGACY_CHUNK_PROMPT_KEY,
      'chunk_summary',
      defaults.chunkSummaryPromptId
    )

    const segmentAnalysisSystemPrompt = this.normalizeText(
      this.appConfigService.getString(
        SEGMENT_PROMPT_KEY,
        DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT
      ),
      DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT
    )

    const config: TranscriptAnalysisConfig = {
      summaryPromptId,
      chunkSummaryPromptId,
      segmentAnalysisSystemPrompt,
    }

    await this.maybePersistConfig(config, storedSummaryPromptId, storedChunkPromptId)
    return config
  }

  private async buildEnvConfig(): Promise<TranscriptAnalysisConfig> {
    const defaults = await this.promptLibraryService.ensureDefaults()
    const segmentAnalysisSystemPrompt = this.normalizeText(
      process.env[SEGMENT_PROMPT_KEY],
      DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT
    )

    return {
      summaryPromptId: defaults.summaryPromptId,
      chunkSummaryPromptId: defaults.chunkSummaryPromptId,
      segmentAnalysisSystemPrompt,
    }
  }

  private async resolvePromptId(
    rawId: string,
    legacyKey: string,
    type: PromptTemplateType,
    fallbackId: string
  ): Promise<string> {
    const normalizedId = rawId.trim()
    if (normalizedId && this.promptLibraryService.isPromptIdForType(normalizedId, type)) {
      return normalizedId
    }

    const legacyPrompt = this.appConfigService.getString(legacyKey, '').trim()
    if (legacyPrompt) {
      const migrated = await this.promptLibraryService.findOrCreateByContent(type, legacyPrompt)
      return migrated.id
    }

    return fallbackId
  }

  private normalizeConfig(
    input: Partial<TranscriptAnalysisConfig>,
    base: TranscriptAnalysisConfig,
    defaults: PromptDefaults
  ): TranscriptAnalysisConfig {
    return {
      summaryPromptId: this.normalizePromptId(
        input.summaryPromptId ?? base.summaryPromptId,
        'summary',
        defaults.summaryPromptId
      ),
      chunkSummaryPromptId: this.normalizePromptId(
        input.chunkSummaryPromptId ?? base.chunkSummaryPromptId,
        'chunk_summary',
        defaults.chunkSummaryPromptId
      ),
      segmentAnalysisSystemPrompt: this.normalizeText(
        input.segmentAnalysisSystemPrompt,
        base.segmentAnalysisSystemPrompt
      ),
    }
  }

  private normalizePromptId(
    value: unknown,
    type: PromptTemplateType,
    fallbackId: string
  ): string {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized && this.promptLibraryService.isPromptIdForType(normalized, type)) {
      return normalized
    }
    if (fallbackId && this.promptLibraryService.isPromptIdForType(fallbackId, type)) {
      return fallbackId
    }
    return fallbackId
  }

  private async persistConfig(next: TranscriptAnalysisConfig): Promise<void> {
    await this.appConfigService.setMany({
      [SUMMARY_PROMPT_ID_KEY]: next.summaryPromptId,
      [CHUNK_PROMPT_ID_KEY]: next.chunkSummaryPromptId,
      [SEGMENT_PROMPT_KEY]: next.segmentAnalysisSystemPrompt,
    })
  }

  private async maybePersistConfig(
    config: TranscriptAnalysisConfig,
    storedSummaryPromptId: string,
    storedChunkPromptId: string
  ): Promise<void> {
    const normalizedSummaryId = storedSummaryPromptId.trim()
    const normalizedChunkId = storedChunkPromptId.trim()
    if (
      normalizedSummaryId !== config.summaryPromptId ||
      normalizedChunkId !== config.chunkSummaryPromptId
    ) {
      await this.persistConfig(config)
    }
  }

  private normalizeText(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    return trimmed ? trimmed : fallback
  }
}
