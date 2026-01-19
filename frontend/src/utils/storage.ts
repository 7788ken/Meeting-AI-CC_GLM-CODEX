/**
 * 本地存储工具类
 * 提供统一的本地存储接口，支持 localStorage 和 sessionStorage
 * 支持数据序列化、过期时间、命名空间等功能
 */

export type StorageType = 'localStorage' | 'sessionStorage'

export interface StorageOptions {
  /** 过期时间（秒），0 表示永不过期 */
  expires?: number
  /** 命名空间前缀 */
  namespace?: string
}

interface StorageData<T = any> {
  value: T
  expires?: number // 过期时间戳
}

/**
 * 本地存储工具类
 */
export class Storage {
  private storage: globalThis.Storage
  private namespace: string

  constructor(type: StorageType = 'localStorage', namespace: string = 'meeting-ai') {
    this.storage = type === 'localStorage' ? window.localStorage : window.sessionStorage
    this.namespace = namespace
  }

  /**
   * 生成完整的键名
   */
  private getKey(key: string): string {
    return `${this.namespace}:${key}`
  }

  /**
   * 设置存储项
   */
  set<T>(key: string, value: T, options: StorageOptions = {}): boolean {
    try {
      const fullKey = this.getKey(key)
      const data: StorageData<T> = {
        value,
      }

      // 设置过期时间
      if (options.expires && options.expires > 0) {
        data.expires = Date.now() + options.expires * 1000
      }

      this.storage.setItem(fullKey, JSON.stringify(data))
      return true
    } catch (error) {
      console.error('Storage set error:', error)
      return false
    }
  }

  /**
   * 获取存储项
   */
  get<T>(key: string): T | null {
    try {
      const fullKey = this.getKey(key)
      const item = this.storage.getItem(fullKey)

      if (!item) {
        return null
      }

      const data: StorageData<T> = JSON.parse(item)

      // 检查是否过期
      if (data.expires && Date.now() > data.expires) {
        this.remove(key)
        return null
      }

      return data.value
    } catch (error) {
      console.error('Storage get error:', error)
      return null
    }
  }

  /**
   * 删除存储项
   */
  remove(key: string): boolean {
    try {
      const fullKey = this.getKey(key)
      this.storage.removeItem(fullKey)
      return true
    } catch (error) {
      console.error('Storage remove error:', error)
      return false
    }
  }

  /**
   * 清空所有存储项（仅当前命名空间）
   */
  clear(): boolean {
    try {
      const prefix = this.namespace + ':'
      const keys: string[] = []

      // 收集所有键
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i)
        if (key && key.startsWith(prefix)) {
          keys.push(key)
        }
      }

      // 删除所有键
      keys.forEach(key => this.storage.removeItem(key))
      return true
    } catch (error) {
      console.error('Storage clear error:', error)
      return false
    }
  }

  /**
   * 检查存储项是否存在
   */
  has(key: string): boolean {
    const fullKey = this.getKey(key)
    return this.storage.getItem(fullKey) !== null
  }

  /**
   * 获取所有键（当前命名空间）
   */
  keys(): string[] {
    const prefix = this.namespace + ':'
    const result: string[] = []

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (key && key.startsWith(prefix)) {
        result.push(key.slice(prefix.length))
      }
    }

    return result
  }

  /**
   * 获取存储大小（字节）
   */
  size(): number {
    let total = 0
    const prefix = this.namespace + ':'

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (key && key.startsWith(prefix)) {
        const value = this.storage.getItem(key)
        if (value) {
          total += key.length + value.length
        }
      }
    }

    return total
  }
}

// 创建默认实例
export const localStorage = new Storage('localStorage')
export const sessionStorage = new Storage('sessionStorage')

/**
 * 便捷函数：设置 localStorage
 */
export function setLocal<T>(key: string, value: T, expires?: number): boolean {
  return localStorage.set(key, value, { expires })
}

/**
 * 便捷函数：获取 localStorage
 */
export function getLocal<T>(key: string): T | null {
  return localStorage.get<T>(key)
}

/**
 * 便捷函数：删除 localStorage
 */
export function removeLocal(key: string): boolean {
  return localStorage.remove(key)
}

/**
 * 便捷函数：清空 localStorage（当前命名空间）
 */
export function clearLocal(): boolean {
  return localStorage.clear()
}

/**
 * 便捷函数：设置 sessionStorage
 */
export function setSession<T>(key: string, value: T, expires?: number): boolean {
  return sessionStorage.set(key, value, { expires })
}

/**
 * 便捷函数：获取 sessionStorage
 */
export function getSession<T>(key: string): T | null {
  return sessionStorage.get<T>(key)
}

/**
 * 便捷函数：删除 sessionStorage
 */
export function removeSession(key: string): boolean {
  return sessionStorage.remove(key)
}

/**
 * 便捷函数：清空 sessionStorage（当前命名空间）
 */
export function clearSession(): boolean {
  return sessionStorage.clear()
}

/**
 * 存储键名常量
 */
export const StorageKeys = {
  /** 用户信息 */
  USER_INFO: 'user-info',
  /** 认证令牌 */
  AUTH_TOKEN: 'auth-token',
  /** 当前会话ID */
  CURRENT_SESSION: 'current-session',
  /** 用户偏好设置 */
  USER_PREFERENCES: 'user-preferences',
  /** 主题设置 */
  THEME: 'theme',
  /** 语言设置 */
  LANGUAGE: 'language',
  /** 最近访问的会话列表 */
  RECENT_SESSIONS: 'recent-sessions',
  /** 系统设置授权密码（本地缓存） */
  SETTINGS_PASSWORD: 'settings-password',
} as const
