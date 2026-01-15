import * as crypto from 'crypto'

export function extractGlmTextContent(
  content: unknown,
  options?: { trim?: boolean }
): string | null {
  const shouldTrim = options?.trim !== false
  const normalize = (value: string): string => (shouldTrim ? value.trim() : value)
  const hasText = (value: string): boolean => (shouldTrim ? value.trim().length > 0 : value.length > 0)

  if (typeof content === 'string') {
    return hasText(content) ? normalize(content) : null
  }

  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const maybeText = (content as any).text
    if (typeof maybeText === 'string') {
      return hasText(maybeText) ? normalize(maybeText) : null
    }
  }

  if (!Array.isArray(content)) {
    return null
  }

  const parts: string[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      if (hasText(item)) parts.push(shouldTrim ? item.trim() : item)
      continue
    }
    if (item && typeof item === 'object') {
      const maybeText = (item as any).text
      if (typeof maybeText === 'string' && hasText(maybeText)) {
        parts.push(shouldTrim ? maybeText.trim() : maybeText)
      }
    }
  }

  if (parts.length === 0) return null
  const joined = shouldTrim ? parts.join('\n').trim() : parts.join('')
  return joined.length > 0 ? joined : null
}

export function getGlmAuthorizationToken(rawApiKey: string): string {
  const rawKey = (rawApiKey ?? '').trim()
  const parts = rawKey.split('.')

  if (parts.length === 2) {
    const [apiKey, apiSecret] = parts
    return signJwt(apiKey, apiSecret)
  }

  return rawKey
}

function signJwt(apiKey: string, apiSecret: string): string {
  const header = { alg: 'HS256', sign_type: 'SIGN' }
  const timestamp = Date.now()
  const payload = {
    api_key: apiKey,
    exp: timestamp + 60 * 60 * 1000,
    timestamp,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const data = `${encodedHeader}.${encodedPayload}`
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${data}.${signature}`
}

function base64UrlEncode(content: string): string {
  return Buffer.from(content)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}
