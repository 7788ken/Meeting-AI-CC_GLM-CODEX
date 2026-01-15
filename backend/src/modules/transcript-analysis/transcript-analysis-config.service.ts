import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT,
  DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
} from './transcript-analysis.prompt'
import { AppConfigService } from '../app-config/app-config.service'

export interface TranscriptAnalysisConfig {
  summarySystemPrompt: string
  chunkSummarySystemPrompt: string
  segmentAnalysisSystemPrompt: string
}

@Injectable()
export class TranscriptAnalysisConfigService implements OnModuleInit {
  private config: TranscriptAnalysisConfig

  constructor(private readonly appConfigService: AppConfigService) {
    this.config = this.buildDefaultConfig()
  }

  async onModuleInit(): Promise<void> {
    this.config = this.buildDefaultConfig()
  }

  getConfig(): TranscriptAnalysisConfig {
    return { ...this.config }
  }

  async reloadFromStorage(): Promise<TranscriptAnalysisConfig> {
    await this.appConfigService.refreshCache()
    this.config = this.buildDefaultConfig()
    return { ...this.config }
  }

  async updateConfig(
    partial: Partial<TranscriptAnalysisConfig>
  ): Promise<TranscriptAnalysisConfig> {
    const next = this.normalizeConfig(partial, this.config)
    this.config = next
    await this.persistConfig(next)
    return { ...next }
  }

  async resetConfig(): Promise<TranscriptAnalysisConfig> {
    this.config = this.buildEnvConfig()
    await this.persistConfig(this.config)
    return { ...this.config }
  }

  private buildDefaultConfig(): TranscriptAnalysisConfig {
    return {
      summarySystemPrompt: this.normalizeText(
        this.appConfigService.getString(
          'TRANSCRIPT_ANALYSIS_SUMMARY_SYSTEM_PROMPT',
          DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT
        ),
        DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT
      ),
      chunkSummarySystemPrompt: this.normalizeText(
        this.appConfigService.getString(
          'TRANSCRIPT_ANALYSIS_CHUNK_SUMMARY_SYSTEM_PROMPT',
          DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT
        ),
        DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT
      ),
      segmentAnalysisSystemPrompt: this.normalizeText(
        this.appConfigService.getString(
          'TRANSCRIPT_ANALYSIS_SEGMENT_SYSTEM_PROMPT',
          DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT
        ),
        DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT
      ),
    }
  }

  private buildEnvConfig(): TranscriptAnalysisConfig {
    const summarySystemPrompt = (process.env.TRANSCRIPT_ANALYSIS_SUMMARY_SYSTEM_PROMPT || '').trim()
    const chunkSummarySystemPrompt =
      (process.env.TRANSCRIPT_ANALYSIS_CHUNK_SUMMARY_SYSTEM_PROMPT || '').trim()
    const segmentAnalysisSystemPrompt =
      (process.env.TRANSCRIPT_ANALYSIS_SEGMENT_SYSTEM_PROMPT || '').trim()

    return {
      summarySystemPrompt:
        summarySystemPrompt || DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
      chunkSummarySystemPrompt:
        chunkSummarySystemPrompt || DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
      segmentAnalysisSystemPrompt:
        segmentAnalysisSystemPrompt || DEFAULT_TRANSCRIPT_SEGMENT_ANALYSIS_SYSTEM_PROMPT,
    }
  }

  private normalizeConfig(
    input: Partial<TranscriptAnalysisConfig>,
    base: TranscriptAnalysisConfig
  ): TranscriptAnalysisConfig {
    return {
      summarySystemPrompt: this.normalizeText(
        input.summarySystemPrompt,
        base.summarySystemPrompt
      ),
      chunkSummarySystemPrompt: this.normalizeText(
        input.chunkSummarySystemPrompt,
        base.chunkSummarySystemPrompt
      ),
      segmentAnalysisSystemPrompt: this.normalizeText(
        input.segmentAnalysisSystemPrompt,
        base.segmentAnalysisSystemPrompt
      ),
    }
  }

  private async persistConfig(next: TranscriptAnalysisConfig): Promise<void> {
    await this.appConfigService.setMany({
      TRANSCRIPT_ANALYSIS_SUMMARY_SYSTEM_PROMPT: next.summarySystemPrompt,
      TRANSCRIPT_ANALYSIS_CHUNK_SUMMARY_SYSTEM_PROMPT: next.chunkSummarySystemPrompt,
      TRANSCRIPT_ANALYSIS_SEGMENT_SYSTEM_PROMPT: next.segmentAnalysisSystemPrompt,
    })
  }

  private normalizeText(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    return trimmed ? trimmed : fallback
  }
}
