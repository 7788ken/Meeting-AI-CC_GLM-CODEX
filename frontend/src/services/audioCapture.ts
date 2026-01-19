/**
 * 音频捕获服务 (F1011, F1014)
 * 处理麦克风权限、音频捕获和 PCM 编码
 */

export interface AudioConfig {
  sampleRate?: number
  channelCount?: number
  bufferSize?: number
  deviceId?: string
  captureMode?: 'mic' | 'tab' | 'mix'
}

export interface AudioData {
  data: Float32Array
  sampleRate: number
}

export type AudioDataCallback = (data: AudioData) => void
export type ErrorHandler = (error: Error) => void

export class AudioCaptureService {
  private micStream: MediaStream | null = null
  private displayStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private sources: MediaStreamAudioSourceNode[] = []
  private mixer: GainNode | null = null
  private sink: GainNode | null = null

  private isCapturing = false
  private onDataCallback: AudioDataCallback | null = null
  private onErrorCallback: ErrorHandler | null = null
  private loggedFirstFrame = false
  private lastPermissionError: Error | null = null

  private readonly DEFAULT_SAMPLE_RATE = 16000 // PCM 16kHz
  private readonly DEFAULT_CHANNEL_COUNT = 1
  // 4096 对应 16kHz 下约 256ms，部分流式 ASR 更偏好更小的分片以降低断连风险
  private readonly DEFAULT_BUFFER_SIZE = 1024
  private readonly DEFAULT_DEVICE_ID: string | undefined = undefined
  private readonly DEFAULT_CAPTURE_MODE: NonNullable<AudioConfig['captureMode']> = 'mic'

  private targetSampleRate = this.DEFAULT_SAMPLE_RATE
  private resampleState: {
    ratio: number
    position: number
    lastSample: number
    sourceRate: number
    targetRate: number
  } | null = null

  /**
   * 请求麦克风权限
   */
  async requestPermission(config?: AudioConfig): Promise<boolean> {
    this.cleanupStreamsOnly()
    this.lastPermissionError = null
    try {
      const mode = config?.captureMode ?? this.DEFAULT_CAPTURE_MODE

      const needMic = mode === 'mic' || mode === 'mix'
      const needDisplay = mode === 'tab' || mode === 'mix'

      if (needMic) {
        this.micStream = await this.getUserMediaWithFallback(config)
      }
      if (needDisplay) {
        this.displayStream = await this.getDisplayMediaWithFallback()
      }

      const micOk = this.micStream?.getAudioTracks?.()?.length ? true : false
      const displayOk = this.displayStream?.getAudioTracks?.()?.length ? true : false
      if (needMic && !micOk) throw new Error('未找到可用的麦克风音轨')
      if (needDisplay && !displayOk) {
        throw new Error('未捕获到共享音频：请在选择要共享的标签页时勾选“共享音频”')
      }

      return true
    } catch (error) {
      this.cleanupStreamsOnly()
      const normalized = this.normalizeGetUserMediaError(error)
      this.lastPermissionError = normalized
      this.handleError(normalized)
      return false
    }
  }

  private getSupportedConstraints(): MediaTrackSupportedConstraints {
    return navigator.mediaDevices?.getSupportedConstraints?.() ?? {}
  }

  private getAudioContextCtor(): (new (options?: AudioContextOptions) => AudioContext) | null {
    return (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext || null
  }

  private buildAudioConstraints(config?: AudioConfig): MediaTrackConstraints {
    const supported = this.getSupportedConstraints()
    const channelCount = config?.channelCount ?? this.DEFAULT_CHANNEL_COUNT
    const deviceId = config?.deviceId || this.DEFAULT_DEVICE_ID

    const constraints: MediaTrackConstraints = {}
    if (supported.channelCount) constraints.channelCount = { ideal: channelCount }
    if (deviceId && supported.deviceId) constraints.deviceId = { exact: deviceId }

    // 语音场景的默认约束：这些在不同浏览器上通常更稳定（且不强制采样率，避免 overconstrained）。
    if (supported.echoCancellation) constraints.echoCancellation = true
    if (supported.noiseSuppression) constraints.noiseSuppression = true
    if (supported.autoGainControl) constraints.autoGainControl = true

    return constraints
  }

  private async getUserMediaWithFallback(config?: AudioConfig): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风采集（缺少 mediaDevices.getUserMedia）')
    }

    const audioConstraints = this.buildAudioConstraints(config)

    try {
      return await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
    } catch (error) {
      // 常见场景：保存的 deviceId 失效（设备拔插/权限变化）导致 OverconstrainedError
      const shouldFallback =
        Boolean(config?.deviceId) &&
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as any).name === 'OverconstrainedError'

      if (!shouldFallback) throw error

      return await navigator.mediaDevices.getUserMedia({ audio: true })
    }
  }

  private async getDisplayMediaWithFallback(): Promise<MediaStream> {
    const getDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices)
    if (!getDisplayMedia) {
      throw new Error('当前浏览器不支持共享标签页音频（缺少 mediaDevices.getDisplayMedia）')
    }

    // 说明：
    // - Chrome 通常需要 video=true 才会在分享对话框里提供“共享音频”选项。
    // - 实际仅使用音轨，video 轨会在 cleanup 时 stop。
    return await getDisplayMedia({ video: true, audio: true } as any)
  }

  private normalizeGetUserMediaError(error: unknown): Error {
    if (error instanceof Error && error.message) {
      // 透传明确的运行时错误（如“不支持”），便于排查。
      if (error.message.includes('不支持') || error.message.includes('AudioContext') || error.message.includes('getUserMedia')) {
        return new Error(error.message)
      }
      if (error.message.includes('共享音频') || error.message.includes('音轨')) {
        return new Error(error.message)
      }
    }
    if (typeof error === 'object' && error) {
      const name = (error as any).name as string | undefined
      if (name === 'NotAllowedError') {
        return new Error('音频采集权限被拒绝，请在浏览器地址栏允许麦克风/共享音频后重试')
      }
      if (name === 'AbortError') return new Error('已取消共享标签页音频')
      if (name === 'NotFoundError') return new Error('未找到可用的麦克风设备')
      if (name === 'NotReadableError') return new Error('麦克风被占用或不可用')
      if (name === 'OverconstrainedError') return new Error('麦克风约束不满足（可能是设备不可用）')
    }
    return new Error('无法获取音频采集权限')
  }

  /**
   * 开始音频捕获
   */
  async startCapture(
    onData: AudioDataCallback,
    onError?: ErrorHandler,
    config?: AudioConfig
  ): Promise<void> {
    if (this.isCapturing) {
      throw new Error('音频捕获已在运行')
    }

    this.onDataCallback = onData
    this.onErrorCallback = onError || null
    this.loggedFirstFrame = false

    // 请求麦克风权限
    const hasPermission = await this.requestPermission(config)
    if (!hasPermission || (!this.micStream && !this.displayStream)) {
      this.cleanupStreamsOnly()
      throw this.lastPermissionError ?? new Error('无法获取音频采集权限')
    }

    try {
      // 创建音频上下文
      this.targetSampleRate = config?.sampleRate || this.DEFAULT_SAMPLE_RATE
      this.audioContext = this.createAudioContextWithFallback(this.targetSampleRate)

      this.sources = []
      this.mixer = this.audioContext.createGain()
      this.mixer.gain.value = 1

      const micTrack = this.micStream?.getAudioTracks?.()?.[0] ?? null
      if (micTrack && this.micStream) {
        const node = this.audioContext.createMediaStreamSource(this.micStream)
        this.sources.push(node)
        node.connect(this.mixer)
      }

      const displayTrack = this.displayStream?.getAudioTracks?.()?.[0] ?? null
      if (displayTrack && this.displayStream) {
        const node = this.audioContext.createMediaStreamSource(this.displayStream)
        this.sources.push(node)
        node.connect(this.mixer)
      }

      if (this.sources.length === 0) {
        throw new Error('未找到可用的音频输入（请确认麦克风或共享标签页音频已开启）')
      }

      // 创建处理器
      const bufferSize = config?.bufferSize || this.DEFAULT_BUFFER_SIZE
      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
      this.sink = this.audioContext.createGain()
      this.sink.gain.value = 0

      this.isCapturing = true
      this.resetResampler(this.audioContext.sampleRate, this.targetSampleRate)

      // 处理音频数据
      this.processor.onaudioprocess = (event) => {
        if (!this.isCapturing) return

        const inputData = event.inputBuffer.getChannelData(0)
        const float32Array = new Float32Array(inputData.length)
        float32Array.set(inputData)
        const sourceRate = this.audioContext?.sampleRate || this.targetSampleRate
        const out =
          sourceRate === this.targetSampleRate
            ? float32Array
            : this.resampleToTarget(float32Array, sourceRate, this.targetSampleRate)

        if (import.meta.env.DEV && !this.loggedFirstFrame) {
          this.loggedFirstFrame = true
          const mic = this.micStream?.getAudioTracks?.()?.[0]
          const display = this.displayStream?.getAudioTracks?.()?.[0]
          const energy = AudioCaptureService.getAudioEnergy(out)
          console.log('[AudioCapture] 已开始采集音频', {
            length: out.length,
            targetSampleRate: this.targetSampleRate,
            contextSampleRate: this.audioContext?.sampleRate,
            micTrackSettings: mic?.getSettings?.(),
            displayTrackSettings: display?.getSettings?.(),
            energy,
          })
        }

        this.onDataCallback?.({
          data: out,
          sampleRate: this.targetSampleRate,
        })
      }

      // 连接音频节点
      this.mixer.connect(this.processor)
      this.processor.connect(this.sink)
      this.sink.connect(this.audioContext.destination)

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('音频捕获启动失败'))
      this.cleanup()
      throw error
    }
  }

  private createAudioContextWithFallback(sampleRate: number): AudioContext {
    const Ctor = this.getAudioContextCtor()
    if (!Ctor) {
      throw new Error('当前浏览器不支持音频处理（缺少 AudioContext）')
    }

    try {
      return new Ctor({ sampleRate })
    } catch {
      return new Ctor()
    }
  }

  private resetResampler(sourceRate: number, targetRate: number): void {
    if (sourceRate === targetRate) {
      this.resampleState = null
      return
    }
    this.resampleState = {
      ratio: sourceRate / targetRate,
      position: 0,
      lastSample: 0,
      sourceRate,
      targetRate,
    }
  }

  private resampleToTarget(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
    if (input.length < 2) return new Float32Array()
    if (!this.resampleState || this.resampleState.sourceRate !== sourceRate || this.resampleState.targetRate !== targetRate) {
      this.resetResampler(sourceRate, targetRate)
    }
    if (!this.resampleState) return input

    const state = this.resampleState
    const ratio = state.ratio
    let position = state.position

    const maxOut = Math.max(0, Math.ceil((input.length + 1) / Math.max(1e-9, ratio)) + 2)
    const output = new Float32Array(maxOut)
    let outIndex = 0

    while (position < input.length - 1 && outIndex < output.length) {
      const index0 = Math.floor(position)
      const frac = position - index0

      const sample0 = index0 === -1 ? state.lastSample : (input[index0] ?? 0)
      const sample1 = input[index0 + 1] ?? sample0
      output[outIndex++] = sample0 + (sample1 - sample0) * frac

      position += ratio
    }

    state.lastSample = input[input.length - 1] ?? state.lastSample
    state.position = position - input.length

    return output.subarray(0, outIndex)
  }

  /**
   * 停止音频捕获
   */
  stopCapture(): void {
    if (!this.isCapturing) return

    this.isCapturing = false
    this.cleanup()
  }

  /**
   * 将 Float32Array 转换为 PCM 16-bit 数据 (F1014)
   */
  static floatToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const value = float32Array[i] ?? 0
      const sample = Math.max(-1, Math.min(1, value))
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    return pcm16
  }

  /**
   * 将 PCM 16-bit 数据转换为 Int16Array
   */
  static floatToInt16(float32Array: Float32Array): Int16Array {
    return AudioCaptureService.floatToPCM16(float32Array)
  }

  /**
   * 检测静音 (F1015)
   */
  static detectSilence(
    float32Array: Float32Array,
    threshold = 0.01,
    duration = 1000
  ): boolean {
    let silenceCount = 0
    const samplesToCheck = (duration * 16000) / 1000 // 假设 16kHz

    for (let i = 0; i < Math.min(float32Array.length, samplesToCheck); i++) {
      const value = float32Array[i] ?? 0
      if (Math.abs(value) < threshold) {
        silenceCount++
      }
    }

    return silenceCount / Math.min(float32Array.length, samplesToCheck) > 0.95
  }

  /**
   * 获取音频能量（用于音量可视化）
   */
  static getAudioEnergy(float32Array: Float32Array): number {
    if (float32Array.length === 0) return 0

    let sum = 0
    for (let i = 0; i < float32Array.length; i++) {
      const value = float32Array[i] ?? 0
      sum += value * value
    }
    return Math.sqrt(sum / float32Array.length)
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }

    if (this.sink) {
      this.sink.disconnect()
      this.sink = null
    }

    if (this.mixer) {
      this.mixer.disconnect()
      this.mixer = null
    }

    if (this.sources.length) {
      for (const source of this.sources) {
        source.disconnect()
      }
      this.sources = []
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
      this.audioContext = null
    }

    this.cleanupStreamsOnly()

    this.resampleState = null
  }

  private cleanupStreamsOnly(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop())
      this.micStream = null
    }
    if (this.displayStream) {
      this.displayStream.getTracks().forEach((track) => track.stop())
      this.displayStream = null
    }
  }

  /**
   * 错误处理
   */
  private handleError(error: Error): void {
    this.onErrorCallback?.(error)
  }

  /**
   * 获取当前状态
   */
  get isActive(): boolean {
    return this.isCapturing
  }
}

// 导出单例
export const audioCapture = new AudioCaptureService()
