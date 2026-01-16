export const PROMPT_LIBRARY_CONFIG_KEY = 'PROMPT_LIBRARY_JSON_V1'

export const PROMPT_TEMPLATE_TYPES = ['summary', 'chunk_summary'] as const

export type PromptTemplateType = typeof PROMPT_TEMPLATE_TYPES[number]

export const PROMPT_TEMPLATE_TYPE_LABELS: Record<PromptTemplateType, string> = {
  summary: '会议总结',
  chunk_summary: '分片总结',
}
