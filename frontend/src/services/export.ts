import type { AIAnalysis, Speech, Session } from '@/services/api'

/**
 * 导出格式类型
 */
export type ExportFormat = 'txt' | 'md' | 'json'

/**
 * 导出配置选项
 */
export interface ExportOptions {
  format: ExportFormat
  includeTimestamp?: boolean
  includeMetadata?: boolean
  filename?: string
}

/**
 * 生成文件名（带时间戳）
 */
function generateFilename(base: string, extension: string): string {
  const now = new Date()
  const timestamp = now
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, -5)
  return `${base}_${timestamp}.${extension}`
}

/**
 * 导出为纯文本格式
 */
function exportToTxt(
  analysis: AIAnalysis,
  session?: Session,
  speeches?: Speech[],
): string {
  const lines: string[] = []

  // 标题
  lines.push('='.repeat(50))
  lines.push('AI 会议助手 - 分析报告')
  lines.push('='.repeat(50))
  lines.push('')

  // 会话信息
  if (session) {
    lines.push('会话信息:')
    lines.push(`  标题: ${session.title || '未命名'}`)
    if (session.description) {
      lines.push(`  描述: ${session.description}`)
    }
    lines.push(`  开始时间: ${new Date(session.startedAt).toLocaleString('zh-CN')}`)
    if (session.endedAt) {
      lines.push(`  结束时间: ${new Date(session.endedAt).toLocaleString('zh-CN')}`)
    }
    if (session.duration) {
      lines.push(`  时长: ${Math.floor(session.duration / 60)} 分钟`)
    }
    lines.push('')
  }

  // 分析元数据
  lines.push('分析信息:')
  lines.push(`  类型: ${getAnalysisTypeName(analysis.analysisType)}`)
  lines.push(`  模型: ${analysis.modelUsed}`)
  lines.push(`  生成时间: ${new Date(analysis.createdAt).toLocaleString('zh-CN')}`)
  if (analysis.processingTime) {
    lines.push(`  处理耗时: ${analysis.processingTime}ms`)
  }
  lines.push('')

  // 分析结果
  lines.push('-'.repeat(50))
  lines.push('分析结果:')
  lines.push('-'.repeat(50))
  lines.push('')
  lines.push(analysis.result)
  lines.push('')

  // 相关发言记录（可选）
  if (speeches && speeches.length > 0) {
    lines.push('-'.repeat(50))
    lines.push('相关发言记录:')
    lines.push('-'.repeat(50))
    lines.push('')
    speeches.forEach((speech, index) => {
      lines.push(`${index + 1}. [${speech.speakerName}] ${new Date(speech.startTime).toLocaleTimeString('zh-CN')}`)
      lines.push(`   ${speech.content}`)
      lines.push('')
    })
  }

  return lines.join('\n')
}

/**
 * 导出为 Markdown 格式
 */
function exportToMarkdown(
  analysis: AIAnalysis,
  session?: Session,
  speeches?: Speech[],
): string {
  const lines: string[] = []

  // 标题
  lines.push('# AI 会议助手 - 分析报告')
  lines.push('')

  // 会话信息
  if (session) {
    lines.push('## 会话信息')
    lines.push('')
    lines.push(`- **标题**: ${session.title || '未命名'}`)
    if (session.description) {
      lines.push(`- **描述**: ${session.description}`)
    }
    lines.push(`- **开始时间**: ${new Date(session.startedAt).toLocaleString('zh-CN')}`)
    if (session.endedAt) {
      lines.push(`- **结束时间**: ${new Date(session.endedAt).toLocaleString('zh-CN')}`)
    }
    if (session.duration) {
      lines.push(`- **时长**: ${Math.floor(session.duration / 60)} 分钟`)
    }
    lines.push('')
  }

  // 分析元数据
  lines.push('## 分析信息')
  lines.push('')
  lines.push(`- **类型**: ${getAnalysisTypeName(analysis.analysisType)}`)
  lines.push(`- **模型**: ${analysis.modelUsed}`)
  lines.push(`- **生成时间**: ${new Date(analysis.createdAt).toLocaleString('zh-CN')}`)
  if (analysis.processingTime) {
    lines.push(`- **处理耗时**: ${analysis.processingTime}ms`)
  }
  lines.push('')

  // 分析结果
  lines.push('## 分析结果')
  lines.push('')
  lines.push(analysis.result)
  lines.push('')

  // 相关发言记录
  if (speeches && speeches.length > 0) {
    lines.push('## 相关发言记录')
    lines.push('')
    speeches.forEach((speech, index) => {
      lines.push(`### ${index + 1}. ${speech.speakerName}`)
      lines.push('')
      lines.push(`**时间**: ${new Date(speech.startTime).toLocaleTimeString('zh-CN')}`)
      lines.push('')
      lines.push(speech.content)
      lines.push('')
    })
  }

  return lines.join('\n')
}

/**
 * 导出为 JSON 格式
 */
function exportToJson(
  analysis: AIAnalysis,
  session?: Session,
  speeches?: Speech[],
): string {
  const data: Record<string, any> = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
  }

  if (session) {
    data.session = {
      id: session.id,
      title: session.title,
      description: session.description,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      duration: session.duration,
      isActive: session.isActive,
    }
  }

  data.analysis = {
    id: analysis.id,
    type: analysis.analysisType,
    typeName: getAnalysisTypeName(analysis.analysisType),
    modelUsed: analysis.modelUsed,
    result: analysis.result,
    status: analysis.status,
    processingTime: analysis.processingTime,
    generatedAt: analysis.generatedAt,
    createdAt: analysis.createdAt,
  }

  if (speeches && speeches.length > 0) {
    data.speeches = speeches.map(speech => ({
      id: speech.id,
      speakerName: speech.speakerName,
      content: speech.content,
      startTime: speech.startTime,
      endTime: speech.endTime,
      duration: speech.duration,
      confidence: speech.confidence,
    }))
  }

  return JSON.stringify(data, null, 2)
}

/**
 * 获取分析类型中文名
 */
function getAnalysisTypeName(type: string): string {
  const typeMap: Record<string, string> = {
    summary: '会议摘要',
    'action-items': '行动项',
    sentiment: '情感分析',
    keywords: '关键词提取',
    topics: '议题分析',
    'full-report': '完整报告',
  }
  return typeMap[type] || type
}

/**
 * 触发浏览器下载
 */
function triggerDownload(content: string, filename: string, mimeType: string): void {
  // 添加 BOM 以支持中文（UTF-8 with BOM）
  const bom = new Uint8Array([0xef, 0xbb, 0xbf])
  const blob = new Blob([bom, content], { type: mimeType })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 导出 AI 分析结果
 *
 * @param analysis 分析数据
 * @param options 导出选项
 * @param session 可选的会话信息
 * @param speeches 可选的发言记录
 */
export function exportAnalysis(
  analysis: AIAnalysis,
  options: ExportOptions,
  session?: Session,
  speeches?: Speech[],
): void {
  const { format, filename } = options

  // 生成内容
  let content: string
  let extension: string
  let mimeType: string

  switch (format) {
    case 'txt':
      content = exportToTxt(analysis, session, speeches)
      extension = 'txt'
      mimeType = 'text/plain;charset=utf-8'
      break
    case 'md':
      content = exportToMarkdown(analysis, session, speeches)
      extension = 'md'
      mimeType = 'text/markdown;charset=utf-8'
      break
    case 'json':
      content = exportToJson(analysis, session, speeches)
      extension = 'json'
      mimeType = 'application/json;charset=utf-8'
      break
    default:
      throw new Error(`不支持的导出格式: ${format}`)
  }

  // 生成文件名
  const defaultFilename = generateFilename(
    `会议分析_${getAnalysisTypeName(analysis.analysisType)}`,
    extension,
  )
  const finalFilename = filename || defaultFilename

  // 触发下载
  triggerDownload(content, finalFilename, mimeType)
}

/**
 * 导出完整会议记录
 *
 * @param session 会话信息
 * @param speeches 发言记录
 * @param analyses 分析结果列表
 * @param options 导出选项
 */
export function exportMeetingRecord(
  session: Session,
  speeches: Speech[],
  analyses: AIAnalysis[],
  options: ExportOptions,
): void {
  const { format } = options

  // 使用摘要分析作为主要分析内容
  const summaryAnalysis = analyses.find(a => a.analysisType === 'summary') || analyses[0]

  if (!summaryAnalysis) {
    // 如果没有分析结果，只导出发言记录
    exportSpeechesOnly(session, speeches, options)
    return
  }

  exportAnalysis(summaryAnalysis, options, session, speeches)
}

/**
 * 仅导出发言记录
 */
function exportSpeechesOnly(session: Session, speeches: Speech[], options: ExportOptions): void {
  const { format } = options

  if (format === 'json') {
    const content = JSON.stringify(
      {
        session,
        speeches: speeches.map(s => ({
          ...s,
          // 不包含敏感信息
        })),
      },
      null,
      2,
    )
    triggerDownload(content, generateFilename('会议发言', 'json'), 'application/json;charset=utf-8')
    return
  }

  // TXT/MD 格式
  const lines: string[] = []
  lines.push(format === 'md' ? '# 会议发言记录' : '会议发言记录')
  lines.push('')
  lines.push(`会话: ${session.title || '未命名'}`)
  lines.push(`时间: ${new Date(session.startedAt).toLocaleString('zh-CN')}`)
  lines.push('')

  speeches.forEach((speech, index) => {
    const marker = format === 'md' ? '###' : `${index + 1}.`
    lines.push(`${marker} [${speech.speakerName}] ${new Date(speech.startTime).toLocaleTimeString('zh-CN')}`)
    lines.push('')
    lines.push(speech.content)
    lines.push('')
  })

  const extension = format === 'md' ? 'md' : 'txt'
  const mimeType = format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
  triggerDownload(lines.join('\n'), generateFilename('会议发言', extension), mimeType)
}
