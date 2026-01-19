import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { AppConfigService } from '../app-config/app-config.service'
import {
  DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_INTERVIEW_REPLY_SYSTEM_PROMPT,
  DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT,
} from '../transcript-analysis/transcript-analysis.prompt'
import {
  PROMPT_LIBRARY_CONFIG_KEY,
  PROMPT_TEMPLATE_TYPE_LABELS,
  PROMPT_TEMPLATE_TYPES,
  type PromptTemplateType,
} from './prompt-library.constants'
import type {
  CreatePromptTemplateDto,
  PromptTemplateDto,
  UpdatePromptTemplateDto,
} from './dto/prompt-template.dto'

const SNAPSHOT_VERSION = 1

type PromptTemplate = {
  id: string
  name: string
  alias?: string
  type: PromptTemplateType
  content: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

type PromptLibrarySnapshot = {
  version: number
  prompts: PromptTemplate[]
}

type BuiltInPromptDefinition = {
  alias: string
  name: string
  type: PromptTemplateType
  content: string
}

const BUILTIN_PROMPT_DEFINITIONS: BuiltInPromptDefinition[] = [
  {
    alias: 'builtin:interview-reply-assistant',
    name: '面试回复助手（内置）',
    type: 'chunk_summary',
    content: DEFAULT_INTERVIEW_REPLY_SYSTEM_PROMPT,
  },
]

@Injectable()
export class PromptLibraryService implements OnModuleInit {
  private prompts: PromptTemplate[] = []
  private initialized = false

  constructor(private readonly appConfigService: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialized()
  }

  list(): PromptTemplateDto[] {
    return this.sortPrompts(this.prompts).map(prompt => ({ ...prompt }))
  }

  getDefaultPromptId(type: PromptTemplateType): string {
    return this.getDefaultPrompt(type)?.id ?? ''
  }

  getPromptById(id: string): PromptTemplate | undefined {
    const normalized = id.trim()
    if (!normalized) return undefined
    return this.prompts.find(prompt => prompt.id === normalized)
  }

  isPromptIdForType(id: string, type: PromptTemplateType): boolean {
    const normalized = id.trim()
    if (!normalized) return false
    return this.prompts.some(prompt => prompt.id === normalized && prompt.type === type)
  }

  resolvePromptContent(id: string, type: PromptTemplateType, fallback: string): string {
    const prompt = this.getPromptById(id)
    if (prompt && prompt.type === type) return prompt.content
    const defaultPrompt = this.getDefaultPrompt(type)
    if (defaultPrompt) return defaultPrompt.content
    return fallback
  }

  async ensureDefaults(): Promise<{ summaryPromptId: string; chunkSummaryPromptId: string }> {
    await this.ensureInitialized()
    let next = [...this.prompts]
    let changed = false

    const summaryDefault = this.getDefaultPrompt('summary')
    if (!summaryDefault) {
      const summaryPrompt = this.buildDefaultPrompt('summary')
      next = this.applyDefault(next.concat(summaryPrompt), 'summary', summaryPrompt.id)
      changed = true
    }

    const chunkDefault = this.getDefaultPrompt('chunk_summary')
    if (!chunkDefault) {
      const chunkPrompt = this.buildDefaultPrompt('chunk_summary')
      next = this.applyDefault(next.concat(chunkPrompt), 'chunk_summary', chunkPrompt.id)
      changed = true
    }

    const builtInResult = this.ensureBuiltInPrompts(next)
    next = builtInResult.list
    changed = changed || builtInResult.changed

    if (changed) {
      await this.persistSnapshot(next)
    }

    return {
      summaryPromptId: this.getDefaultPrompt('summary')?.id ?? '',
      chunkSummaryPromptId: this.getDefaultPrompt('chunk_summary')?.id ?? '',
    }
  }

  findByContent(type: PromptTemplateType, content: string): PromptTemplate | undefined {
    const normalized = content.trim()
    if (!normalized) return undefined
    return this.prompts.find(prompt => prompt.type === type && prompt.content.trim() === normalized)
  }

  async findOrCreateByContent(
    type: PromptTemplateType,
    content: string,
    name?: string
  ): Promise<PromptTemplate> {
    await this.ensureInitialized()
    const normalized = this.normalizeText(content)
    if (!normalized) {
      throw new BadRequestException('提示词内容不能为空')
    }
    const existing = this.findByContent(type, normalized)
    if (existing) return existing

    const now = new Date().toISOString()
    const prompt: PromptTemplate = {
      id: randomUUID(),
      name: name?.trim() || `${PROMPT_TEMPLATE_TYPE_LABELS[type]}提示词（迁移）`,
      alias: undefined,
      type,
      content: normalized,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    }

    const next = [...this.prompts, prompt]
    await this.persistSnapshot(next)
    return prompt
  }

  async create(input: CreatePromptTemplateDto): Promise<PromptTemplateDto> {
    await this.ensureInitialized()
    const type = this.normalizeType(input.type)
    if (!type) {
      throw new BadRequestException('提示词类型不合法')
    }

    const name = this.normalizeText(input.name)
    if (!name) {
      throw new BadRequestException('提示词名称不能为空')
    }

    const content = this.normalizeText(input.content)
    if (!content) {
      throw new BadRequestException('提示词内容不能为空')
    }

    const alias = this.normalizeText(input.alias)
    const now = new Date().toISOString()

    let next: PromptTemplate[] = [
      ...this.prompts,
      {
        id: randomUUID(),
        name,
        alias: alias || undefined,
        type,
        content,
        isDefault: input.isDefault === true,
        createdAt: now,
        updatedAt: now,
      },
    ]

    if (input.isDefault === true) {
      next = this.applyDefault(next, type, next[next.length - 1].id)
    } else {
      next = this.ensureDefaultForType(next, type)
    }

    await this.persistSnapshot(next)
    return { ...next[next.length - 1] }
  }

  async update(id: string, input: UpdatePromptTemplateDto): Promise<PromptTemplateDto> {
    await this.ensureInitialized()
    const normalizedId = id.trim()
    if (!normalizedId) {
      throw new BadRequestException('提示词 ID 不能为空')
    }

    const index = this.prompts.findIndex(prompt => prompt.id === normalizedId)
    if (index < 0) {
      throw new NotFoundException('提示词不存在')
    }

    const current = this.prompts[index]
    const nextPrompt: PromptTemplate = { ...current }

    if (input.name !== undefined) {
      const name = this.normalizeText(input.name)
      if (!name) {
        throw new BadRequestException('提示词名称不能为空')
      }
      nextPrompt.name = name
    }

    if (input.alias !== undefined) {
      const alias = this.normalizeText(input.alias)
      nextPrompt.alias = alias || undefined
    }

    if (input.content !== undefined) {
      const content = this.normalizeText(input.content)
      if (!content) {
        throw new BadRequestException('提示词内容不能为空')
      }
      nextPrompt.content = content
    }

    if (input.isDefault !== undefined) {
      nextPrompt.isDefault = input.isDefault === true
    }

    nextPrompt.updatedAt = new Date().toISOString()

    let next = [...this.prompts]
    next[index] = nextPrompt

    if (input.isDefault === true) {
      next = this.applyDefault(next, current.type, current.id)
    } else if (input.isDefault === false && current.isDefault) {
      next = this.ensureDefaultForType(next, current.type)
    }

    await this.persistSnapshot(next)
    return { ...nextPrompt }
  }

  async remove(id: string): Promise<void> {
    await this.ensureInitialized()
    const normalizedId = id.trim()
    if (!normalizedId) {
      throw new BadRequestException('提示词 ID 不能为空')
    }

    const target = this.prompts.find(prompt => prompt.id === normalizedId)
    if (!target) {
      throw new NotFoundException('提示词不存在')
    }

    const sameType = this.prompts.filter(prompt => prompt.type === target.type)
    if (sameType.length <= 1) {
      throw new BadRequestException(`至少保留一个${PROMPT_TEMPLATE_TYPE_LABELS[target.type]}提示词`)
    }

    let next = this.prompts.filter(prompt => prompt.id !== normalizedId)
    if (target.isDefault) {
      const fallback = next.find(prompt => prompt.type === target.type)
      if (fallback) {
        next = this.applyDefault(next, target.type, fallback.id)
      }
    }

    await this.persistSnapshot(next)
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    await this.appConfigService.refreshCache()
    const snapshot = this.loadSnapshot()
    let next = snapshot.prompts
    if (next.length === 0) {
      const defaults = [
        this.buildDefaultPrompt('summary'),
        this.buildDefaultPrompt('chunk_summary'),
      ]
      const seeded = this.applyDefault(defaults, 'summary', defaults[0].id)
      next = this.applyDefault(seeded, 'chunk_summary', defaults[1].id)
    } else {
      next = this.ensureDefaultsForSnapshot(next)
    }
    next = this.ensureBuiltInPrompts(next).list
    await this.persistSnapshot(next)
    this.initialized = true
  }

  private loadSnapshot(): PromptLibrarySnapshot {
    const raw = this.appConfigService.getString(PROMPT_LIBRARY_CONFIG_KEY, '').trim()
    if (!raw) return { version: SNAPSHOT_VERSION, prompts: [] }
    try {
      const parsed = JSON.parse(raw) as PromptLibrarySnapshot
      const prompts = Array.isArray(parsed?.prompts)
        ? parsed.prompts.map(prompt => this.normalizePrompt(prompt)).filter(Boolean)
        : []
      return { version: SNAPSHOT_VERSION, prompts }
    } catch {
      return { version: SNAPSHOT_VERSION, prompts: [] }
    }
  }

  private normalizePrompt(input: unknown): PromptTemplate | null {
    if (!input || typeof input !== 'object') return null
    const record = input as Record<string, unknown>
    const id = this.normalizeText(record.id)
    const name = this.normalizeText(record.name)
    const content = this.normalizeText(record.content)
    const type = this.normalizeType(record.type)
    if (!id || !name || !content || !type) return null
    const alias = this.normalizeText(record.alias)
    const createdAt = this.normalizeText(record.createdAt) || new Date().toISOString()
    const updatedAt = this.normalizeText(record.updatedAt) || createdAt

    return {
      id,
      name,
      alias: alias || undefined,
      type,
      content,
      isDefault: record.isDefault === true,
      createdAt,
      updatedAt,
    }
  }

  private async persistSnapshot(next: PromptTemplate[]): Promise<void> {
    this.prompts = next
    const payload: PromptLibrarySnapshot = { version: SNAPSHOT_VERSION, prompts: next }
    await this.appConfigService.setValue(PROMPT_LIBRARY_CONFIG_KEY, JSON.stringify(payload))
  }

  private normalizeText(value: unknown): string {
    if (typeof value !== 'string') return ''
    return value.trim()
  }

  private normalizeType(value: unknown): PromptTemplateType | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return (PROMPT_TEMPLATE_TYPES as readonly string[]).includes(trimmed)
      ? (trimmed as PromptTemplateType)
      : null
  }

  private getDefaultPrompt(type: PromptTemplateType): PromptTemplate | undefined {
    return this.prompts.find(prompt => prompt.type === type && prompt.isDefault)
  }

  private ensureDefaultsForSnapshot(list: PromptTemplate[]): PromptTemplate[] {
    let next = [...list]
    for (const type of PROMPT_TEMPLATE_TYPES) {
      const defaults = next.filter(prompt => prompt.type === type && prompt.isDefault)
      if (defaults.length > 1) {
        next = this.applyDefault(next, type, defaults[0].id)
        continue
      }
      if (defaults.length === 0) {
        const candidate = next.find(prompt => prompt.type === type)
        if (candidate) {
          next = this.applyDefault(next, type, candidate.id)
        } else {
          const created = this.buildDefaultPrompt(type)
          next = this.applyDefault(next.concat(created), type, created.id)
        }
      }
    }
    return next
  }

  private ensureBuiltInPrompts(list: PromptTemplate[]): {
    list: PromptTemplate[]
    changed: boolean
  } {
    if (BUILTIN_PROMPT_DEFINITIONS.length === 0) {
      return { list, changed: false }
    }

    let next = [...list]
    let changed = false
    const now = new Date().toISOString()

    for (const def of BUILTIN_PROMPT_DEFINITIONS) {
      const normalizedContent = this.normalizeText(def.content) || def.content
      const existingIndex = next.findIndex(
        prompt =>
          prompt.alias === def.alias || (prompt.name === def.name && prompt.type === def.type)
      )

      if (existingIndex < 0) {
        next = next.concat({
          id: randomUUID(),
          name: def.name,
          alias: def.alias,
          type: def.type,
          content: normalizedContent,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        })
        changed = true
        continue
      }

      const current = next[existingIndex]
      const updated = { ...current }
      let updatedFlag = false

      if (current.name !== def.name) {
        updated.name = def.name
        updatedFlag = true
      }
      if (current.alias !== def.alias) {
        updated.alias = def.alias
        updatedFlag = true
      }
      if (current.type !== def.type) {
        updated.type = def.type
        updatedFlag = true
      }
      if (this.normalizeText(current.content) !== this.normalizeText(normalizedContent)) {
        updated.content = normalizedContent
        updatedFlag = true
      }

      if (updatedFlag) {
        updated.updatedAt = now
        next[existingIndex] = updated
        changed = true
      }
    }

    return { list: next, changed }
  }

  private ensureDefaultForType(list: PromptTemplate[], type: PromptTemplateType): PromptTemplate[] {
    if (list.some(prompt => prompt.type === type && prompt.isDefault)) return list
    const candidate = list.find(prompt => prompt.type === type)
    if (!candidate) return list
    return this.applyDefault(list, type, candidate.id)
  }

  private applyDefault(
    list: PromptTemplate[],
    type: PromptTemplateType,
    id: string
  ): PromptTemplate[] {
    return list.map(prompt =>
      prompt.type === type ? { ...prompt, isDefault: prompt.id === id } : prompt
    )
  }

  private buildDefaultPrompt(type: PromptTemplateType): PromptTemplate {
    const now = new Date().toISOString()
    const content =
      type === 'summary'
        ? this.normalizeText(
            this.appConfigService.getString(
              'TRANSCRIPT_ANALYSIS_SUMMARY_SYSTEM_PROMPT',
              DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT
            )
          ) || DEFAULT_TRANSCRIPT_SUMMARY_SYSTEM_PROMPT
        : this.normalizeText(
            this.appConfigService.getString(
              'TRANSCRIPT_ANALYSIS_CHUNK_SUMMARY_SYSTEM_PROMPT',
              DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT
            )
          ) || DEFAULT_TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT

    return {
      id: randomUUID(),
      name: `${PROMPT_TEMPLATE_TYPE_LABELS[type]}（默认）`,
      alias: undefined,
      type,
      content,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    }
  }

  private sortPrompts(list: PromptTemplate[]): PromptTemplate[] {
    const typeOrder: Record<PromptTemplateType, number> = { summary: 0, chunk_summary: 1 }
    return [...list].sort((a, b) => {
      const typeDelta = typeOrder[a.type] - typeOrder[b.type]
      if (typeDelta !== 0) return typeDelta
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  }
}
