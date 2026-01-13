export function parseSegmentKeyOrder(key?: string | null): number | null {
  const raw = (key ?? '').trim()
  if (!raw) return null

  const tail = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw
  const normalized = tail.trim()
  if (!normalized) return null

  const matchIndex = /^u(\d+)$/.exec(normalized)
  if (matchIndex) {
    const value = Number(matchIndex[1])
    return Number.isFinite(value) ? value : null
  }

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function isSegmentKeyRollback(
  activeKey?: string | null,
  incomingKey?: string | null
): boolean {
  if (!activeKey || !incomingKey) return false
  const activeOrder = parseSegmentKeyOrder(activeKey)
  const incomingOrder = parseSegmentKeyOrder(incomingKey)
  if (activeOrder == null || incomingOrder == null) return false
  return incomingOrder < activeOrder
}
