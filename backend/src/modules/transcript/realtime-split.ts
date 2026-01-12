export function normalizeTranscriptContent(content: string): string {
  return (content ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[。！？!?，、,.;；:：]+$/g, '')
}

export function shouldSplitBySegmentKeyChange(previous: string, next: string): boolean {
  const prev = normalizeTranscriptContent(previous)
  const cur = normalizeTranscriptContent(next)

  if (!prev || !cur) return true
  if (prev === cur) return false

  // 纠错回写/补全常表现为前后缀关系；此时 segmentKey 改变也不应立即切段，避免插入/重复
  if (prev.startsWith(cur) || cur.startsWith(prev)) {
    if (Math.min(prev.length, cur.length) >= 3) {
      return false
    }
  }

  return true
}

export function shouldSplitByContent(previous: string, next: string): boolean {
  const prev = previous?.trim?.() ?? ''
  const cur = next?.trim?.() ?? ''
  if (!prev || !cur) return false
  if (prev === cur) return false

  // 短文本场景更容易出现“纠错回写”，不应仅凭长度回退就切段
  if (prev.length < 12 || cur.length < 6) return false

  // 常见流式 ASR 会在进入下一句/下一段时“重置文本”，用轻量启发式检测
  if (cur.startsWith(prev) || prev.startsWith(cur)) return false

  // 避免轻微改写触发切段：只有在长度明显回退时才切段
  return cur.length <= Math.max(6, Math.floor(prev.length * 0.6))
}
