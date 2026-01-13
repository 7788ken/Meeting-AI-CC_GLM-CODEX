import * as crypto from 'crypto'

export function extractGlmTextContent(content: unknown): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim()
    return trimmed ? trimmed : null
  }

  if (!Array.isArray(content)) {
    return null
  }

  const parts: string[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      if (item.trim()) parts.push(item)
      continue
    }
    if (item && typeof item === 'object') {
      const maybeText = (item as any).text
      if (typeof maybeText === 'string' && maybeText.trim()) {
        parts.push(maybeText)
      }
    }
  }

  const joined = parts.join('\n').trim()
  return joined ? joined : null
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
