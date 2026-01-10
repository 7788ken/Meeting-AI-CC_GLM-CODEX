/**
 * UUID 生成工具
 * 使用 Web Crypto API 生成符合 RFC 4122 标准的 UUID v4
 */

/**
 * 生成标准的 UUID v4
 * 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // 降级方案
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 生成不带连字符的 UUID（32位十六进制字符串）
 */
export function uuidCompact(): string {
  return uuid().replace(/-/g, '')
}

/**
 * 生成短 UUID（取标准 UUID 的前 16 位）
 * 注意：短 UUID 不能保证唯一性，仅用于非关键场景
 */
export function uuidShort(): string {
  return uuidCompact().slice(0, 16)
}

/**
 * 生成命名 UUID（基于命名空间和名称）
 * 使用简单的哈希算法，不是标准的 UUID v5
 */
export function uuidNamed(namespace: string, name: string): string {
  const combined = `${namespace}:${name}`
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }

  // 转换为十六进制并填充到 32 位
  const hex = Math.abs(hash).toString(16).padStart(8, '0')
  // 重复以生成 32 位
  const hash32 = (hex + hex + hex + hex).slice(0, 32)

  // 格式化为 UUID 格式
  return [
    hash32.slice(0, 8),
    hash32.slice(8, 12),
    '4' + hash32.slice(12, 15), // 版本 4
    '8' + hash32.slice(15, 18), // 变体
    hash32.slice(18, 32),
  ].join('-')
}

/**
 * 验证 UUID 格式是否有效
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(value)
}

/**
 * UUID 工具对象
 */
export const UUID = {
  /** 生成标准 UUID */
  v4: uuid,
  /** 生成紧凑 UUID */
  compact: uuidCompact,
  /** 生成短 UUID */
  short: uuidShort,
  /** 生成命名 UUID */
  named: uuidNamed,
  /** 验证 UUID */
  isValid: isValidUUID,
} as const
