/**
 * 字符串处理工具函数
 */

/**
 * 截断字符串到指定长度，添加省略号
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength - suffix.length) + suffix
}

/**
 * 首字母大写
 */
export function capitalize(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * 每个单词首字母大写（标题格式）
 */
export function titleize(str: string): string {
  if (!str) return str
  return str
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * 转换为 kebab-case (短横线命名)
 */
export function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/**
 * 转换为 snake_case (下划线命名)
 */
export function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

/**
 * 转换为 camelCase (驼峰命名)
 */
export function camelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^[A-Z]/, char => char.toLowerCase())
}

/**
 * 转换为 PascalCase (帕斯卡命名)
 */
export function pascalCase(str: string): string {
  const camel = camelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/**
 * 生成 URL 友好的 slug
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // 移除特殊字符
    .replace(/[\s_-]+/g, '-') // 空格和下划线转为短横线
    .replace(/^-+|-+$/g, '') // 移除首尾短横线
}

/**
 * 移除字符串中的 HTML 标签
 */
export function stripHtml(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

/**
 * 转义 HTML 特殊字符
 */
export function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return str.replace(/[&<>"']/g, char => htmlEntities[char] || char)
}

/**
 * 计算字符串的字节长度（中文算 2 字节）
 */
export function byteLength(str: string): number {
  let len = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code >= 0x4e00 && code <= 0x9fff) {
      len += 2 // 中文字符
    } else {
      len += 1
    }
  }
  return len
}

/**
 * 按字节长度截断字符串
 */
export function truncateByBytes(str: string, maxBytes: number, suffix = '...'): string {
  let byteCount = 0
  let result = ''

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    const charBytes = code >= 0x4e00 && code <= 0x9fff ? 2 : 1

    if (byteCount + charBytes > maxBytes - suffix.length) {
      return result + suffix
    }

    byteCount += charBytes
    result += str[i]
  }

  return result
}

/**
 * 生成随机字符串
 */
export function randomString(length: number, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return result
}

/**
 * 掩码处理（隐藏敏感信息）
 */
export function maskString(str: string, visibleChars = 4, maskChar = '*'): string {
  if (str.length <= visibleChars) {
    return maskChar.repeat(str.length)
  }
  return str.slice(0, visibleChars) + maskChar.repeat(str.length - visibleChars)
}

/**
 * 邮箱掩码处理
 */
export function maskEmail(email: string): string {
  const [username = '', domain] = email.split('@')
  if (!domain) return maskString(email)

  const visibleChars = Math.min(3, username.length)
  return username.slice(0, visibleChars) + '*@' + domain
}

/**
 * 判断字符串是否为空（仅包含空白字符）
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || /^\s*$/.test(str)
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * 高亮匹配关键词
 */
export function highlightKeywords(text: string, keywords: string[], className = 'highlight'): string {
  let result = text
  keywords.forEach(keyword => {
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi')
    result = result.replace(regex, `<span class="${className}">$1</span>`)
  })
  return result
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
