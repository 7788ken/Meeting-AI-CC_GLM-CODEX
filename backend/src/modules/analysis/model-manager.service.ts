import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GlmClient } from './clients/glm.client'
import { DoubaoClient } from './clients/doubao.client'

/**
 * 支持的 AI 模型类型
 */
export enum AIModelType {
  GLM = 'glm',
  DOUBAO = 'doubao',
}

/**
 * 模型配置信息
 */
export interface ModelConfig {
  type: AIModelType
  name: string
  version: string
  enabled: boolean
  priority: number
  maxTokens: number
  temperature: number
}

/**
 * 模型健康状态
 */
export interface ModelHealthStatus {
  type: AIModelType
  name: string
  healthy: boolean
  lastCheck: Date
  responseTime?: number
  error?: string
}

/**
 * AI 模型接口（统一接口）
 */
interface IAIModelClient {
  generateAnalysis(params: {
    analysisType: string
    speeches: Array<{ content: string; speakerName: string }>
    sessionId: string
    prompt?: string
  }): Promise<string>
  healthCheck(): Promise<boolean>
}

/**
 * 多模型管理器 (B1025)
 * 统一管理多个 AI 模型客户端，支持模型选择、健康检查和故障转移
 */
@Injectable()
export class ModelManagerService {
  private readonly logger = new Logger(ModelManagerService.name)

  // 模型客户端注册表
  private readonly clients: Map<AIModelType, IAIModelClient> = new Map()

  // 模型配置
  private readonly modelConfigs: Map<AIModelType, ModelConfig> = new Map()

  // 健康状态缓存
  private readonly healthStatus: Map<AIModelType, ModelHealthStatus> = new Map()

  // 故障计数器（用于熔断）
  private readonly failureCount: Map<AIModelType, number> = new Map()

  // 熔断阈值
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3

  constructor(
    private readonly configService: ConfigService,
    private readonly glmClient: GlmClient,
    private readonly doubaoClient: DoubaoClient
  ) {
    this.initializeClients()
    this.initializeConfigs()
    this.startHealthCheck()
  }

  /**
   * 初始化模型客户端
   */
  private initializeClients(): void {
    // 注册 GLM 客户端
    this.clients.set(AIModelType.GLM, this.glmClient)
    this.failureCount.set(AIModelType.GLM, 0)

    // 注册豆包客户端
    this.clients.set(AIModelType.DOUBAO, this.doubaoClient)
    this.failureCount.set(AIModelType.DOUBAO, 0)
  }

  /**
   * 初始化模型配置
   */
  private initializeConfigs(): void {
    const glmVersion = (this.configService.get<string>('GLM_ANALYSIS_MODEL') || '').trim()
    const configs: ModelConfig[] = [
      {
        type: AIModelType.GLM,
        name: '智谱 GLM',
        version: glmVersion,
        enabled: this.isModelEnabled('GLM'),
        priority: this.getModelPriority('GLM', 1),
        maxTokens: 2000,
        temperature: 0.7,
      },
      {
        type: AIModelType.DOUBAO,
        name: '豆包 Doubao',
        version: 'ep-202410',
        enabled: this.isModelEnabled('DOUBAO'),
        priority: this.getModelPriority('DOUBAO', 2),
        maxTokens: 2000,
        temperature: 0.7,
      },
    ]

    configs.forEach(config => {
      this.modelConfigs.set(config.type, config)
    })

    this.logger.log(`Initialized ${configs.length} model configs`)
  }

  /**
   * 检查模型是否启用
   */
  private isModelEnabled(model: string): boolean {
    const apiKey = this.configService.get<string>(`${model}_API_KEY`)
    return !!apiKey
  }

  /**
   * 获取模型优先级
   */
  private getModelPriority(model: string, defaultPriority: number): number {
    return this.configService.get<number>(`${model}_PRIORITY`, defaultPriority)
  }

  /**
   * 获取默认模型类型
   */
  getDefaultModel(): AIModelType {
    const defaultModel = this.configService.get<string>('DEFAULT_AI_MODEL', AIModelType.GLM)

    // 检查默认模型是否可用
    if (this.isModelAvailable(defaultModel as AIModelType)) {
      return defaultModel as AIModelType
    }

    // 返回第一个可用的模型
    for (const [type, config] of this.modelConfigs) {
      if (config.enabled && this.failureCount.get(type)! < this.CIRCUIT_BREAKER_THRESHOLD) {
        return type
      }
    }

    throw new NotFoundException('No available AI model found')
  }

  /**
   * 获取模型客户端
   */
  getClient(modelType?: AIModelType): IAIModelClient {
    const type = modelType || this.getDefaultModel()
    const client = this.clients.get(type)

    if (!client) {
      throw new NotFoundException(`AI model client not found: ${type}`)
    }

    // 检查熔断状态
    const failures = this.failureCount.get(type) || 0
    if (failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.logger.warn(`Model ${type} is circuit-opened, attempting fallback...`)
      return this.getFallbackClient(type)
    }

    return client
  }

  /**
   * 获取故障转移客户端
   */
  private getFallbackClient(failedType: AIModelType): IAIModelClient {
    // 按优先级排序获取可用模型
    const availableModels = Array.from(this.modelConfigs.entries())
      .filter(([type, config]) => type !== failedType && config.enabled)
      .sort(([, a], [, b]) => a.priority - b.priority)

    for (const [type] of availableModels) {
      const failures = this.failureCount.get(type) || 0
      if (failures < this.CIRCUIT_BREAKER_THRESHOLD) {
        this.logger.log(`Fallback to model: ${type}`)
        return this.clients.get(type)!
      }
    }

    throw new NotFoundException('No available fallback model')
  }

  /**
   * 生成 AI 分析
   */
  async generateAnalysis(params: {
    analysisType: string
    speeches: Array<{ content: string; speakerName: string }>
    sessionId: string
    modelType?: AIModelType
    prompt?: string
  }): Promise<{ result: string; modelUsed: string }> {
    const modelType = params.modelType || this.getDefaultModel()
    const client = this.getClient(modelType)

    try {
      const result = await client.generateAnalysis({
        analysisType: params.analysisType,
        speeches: params.speeches,
        sessionId: params.sessionId,
        prompt: params.prompt,
      })

      // 重置失败计数
      this.failureCount.set(modelType, 0)

      return {
        result,
        modelUsed: modelType,
      }
    } catch (error) {
      // 增加失败计数
      const currentFailures = (this.failureCount.get(modelType) || 0) + 1
      this.failureCount.set(modelType, currentFailures)

      this.logger.error(
        `Model ${modelType} failed (${currentFailures}/${this.CIRCUIT_BREAKER_THRESHOLD}): ${error}`
      )

      // 尝试故障转移
      if (currentFailures >= this.CIRCUIT_BREAKER_THRESHOLD && !params.modelType) {
        this.logger.warn(`Circuit breaker opened for ${modelType}, attempting fallback...`)
        const fallbackClient = this.getFallbackClient(modelType)
        const fallbackType = this.getModelTypeByClient(fallbackClient)

        const result = await fallbackClient.generateAnalysis({
          analysisType: params.analysisType,
          speeches: params.speeches,
          sessionId: params.sessionId,
          prompt: params.prompt,
        })

        return {
          result,
          modelUsed: fallbackType,
        }
      }

      throw error
    }
  }

  /**
   * 通过客户端获取模型类型
   */
  private getModelTypeByClient(client: IAIModelClient): AIModelType {
    for (const [type, c] of this.clients.entries()) {
      if (c === client) return type
    }
    return AIModelType.GLM
  }

  /**
   * 检查模型是否可用
   */
  isModelAvailable(modelType: AIModelType): boolean {
    const config = this.modelConfigs.get(modelType)
    if (!config || !config.enabled) return false

    const failures = this.failureCount.get(modelType) || 0
    return failures < this.CIRCUIT_BREAKER_THRESHOLD
  }

  /**
   * 获取所有模型配置
   */
  getModelConfigs(): ModelConfig[] {
    return Array.from(this.modelConfigs.values()).sort((a, b) => a.priority - b.priority)
  }

  /**
   * 获取模型健康状态
   */
  getHealthStatus(): ModelHealthStatus[] {
    return Array.from(this.healthStatus.values())
  }

  /**
   * 对指定模型执行健康检查
   */
  async checkModelHealth(modelType: AIModelType): Promise<ModelHealthStatus> {
    const client = this.clients.get(modelType)
    const config = this.modelConfigs.get(modelType)

    if (!client || !config) {
      return {
        type: modelType,
        name: modelType,
        healthy: false,
        lastCheck: new Date(),
        error: 'Client or config not found',
      }
    }

    const startTime = Date.now()
    try {
      const healthy = await client.healthCheck()
      const responseTime = Date.now() - startTime

      const status: ModelHealthStatus = {
        type: modelType,
        name: config.name,
        healthy,
        lastCheck: new Date(),
        responseTime,
      }

      this.healthStatus.set(modelType, status)

      if (healthy) {
        // 重置失败计数
        this.failureCount.set(modelType, 0)
      }

      return status
    } catch (error) {
      const status: ModelHealthStatus = {
        type: modelType,
        name: config.name,
        healthy: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      this.healthStatus.set(modelType, status)
      return status
    }
  }

  /**
   * 对所有模型执行健康检查
   */
  async checkAllModelsHealth(): Promise<ModelHealthStatus[]> {
    const promises = Array.from(this.clients.keys()).map(type => this.checkModelHealth(type))
    return Promise.all(promises)
  }

  /**
   * 启动定期健康检查
   */
  private startHealthCheck(): void {
    const enabled = this.readBooleanFromEnv('HEALTH_CHECK_ENABLED', true)
    if (!enabled) {
      this.logger.log('Health check disabled by HEALTH_CHECK_ENABLED')
      return
    }

    const interval = this.configService.get<number>('HEALTH_CHECK_INTERVAL', 5 * 60 * 1000) // 默认 5 分钟

    // 初始健康检查
    this.checkAllModelsHealth().catch(error => {
      this.logger.error('Initial health check failed:', error)
    })

    // 定期健康检查
    setInterval(() => {
      this.checkAllModelsHealth().catch(error => {
        this.logger.error('Scheduled health check failed:', error)
      })
    }, interval)

    this.logger.log(`Health check started with interval: ${interval}ms`)
  }

  private readBooleanFromEnv(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key) ?? process.env[key]
    if (raw == null || raw === '') return fallback
    const normalized = String(raw).trim().toLowerCase()
    if (normalized === '0' || normalized === 'false') return false
    if (normalized === '1' || normalized === 'true') return true
    return fallback
  }

  /**
   * 重置模型的熔断状态
   */
  resetCircuitBreaker(modelType: AIModelType): void {
    this.failureCount.set(modelType, 0)
    this.logger.log(`Circuit breaker reset for model: ${modelType}`)
  }

  /**
   * 获取模型统计信息
   */
  getStatistics(): {
    totalModels: number
    enabledModels: number
    healthyModels: number
    circuitOpenModels: number
    defaultModel: AIModelType
  } {
    const configs = Array.from(this.modelConfigs.values())
    const enabled = configs.filter(c => c.enabled).length
    const healthy = Array.from(this.healthStatus.values()).filter(h => h.healthy).length
    const circuitOpen = Array.from(this.failureCount.entries()).filter(
      ([, count]) => count >= this.CIRCUIT_BREAKER_THRESHOLD
    ).length

    return {
      totalModels: configs.length,
      enabledModels: enabled,
      healthyModels: healthy,
      circuitOpenModels: circuitOpen,
      defaultModel: this.getDefaultModel(),
    }
  }
}
