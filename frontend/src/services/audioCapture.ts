/**
 * 音频捕获服务 (F1011, F1014)
 * 处理麦克风权限、音频捕获和 PCM 编码
 */

export interface AudioConfig {
  sampleRate?: number
  channelCount?: number
  bufferSize?: number
}

export interface AudioData {
  data: Float32Array
  sampleRate: number
}

export type AudioDataCallback = (data: AudioData) => void
export type ErrorHandler = (error: Error) => void

export class AudioCaptureService {
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private sink: GainNode | null = null

  private isCapturing = false
  private onDataCallback: AudioDataCallback | null = null
  private onErrorCallback: ErrorHandler | null = null
  private loggedFirstFrame = false

  private readonly DEFAULT_SAMPLE_RATE = 16000 // PCM 16kHz
  private readonly DEFAULT_CHANNEL_COUNT = 1
  // 4096 对应 16kHz 下约 256ms，部分流式 ASR 更偏好更小的分片以降低断连风险
  private readonly DEFAULT_BUFFER_SIZE = 1024

  /**
   * 请求麦克风权限
   */
  async requestPermission(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: this.DEFAULT_CHANNEL_COUNT,
          sampleRate: this.DEFAULT_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      return true
    } catch (error) {
      this.handleError(new Error('麦克风权限被拒绝'))
      return false
    }
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
    const hasPermission = await this.requestPermission()
    if (!hasPermission || !this.stream) {
      throw new Error('无法获取麦克风权限')
    }

    try {
      // 创建音频上下文
      const sampleRate = config?.sampleRate || this.DEFAULT_SAMPLE_RATE
      this.audioContext = new AudioContext({ sampleRate })

      // 创建音频源
      this.source = this.audioContext.createMediaStreamSource(this.stream)

      // 创建处理器
      const bufferSize = config?.bufferSize || this.DEFAULT_BUFFER_SIZE
      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
      this.sink = this.audioContext.createGain()
      this.sink.gain.value = 0

      this.isCapturing = true

      // 处理音频数据
      this.processor.onaudioprocess = (event) => {
        if (!this.isCapturing) return

        const inputData = event.inputBuffer.getChannelData(0)
        const float32Array = new Float32Array(inputData.length)
        float32Array.set(inputData)

        if (import.meta.env.DEV && !this.loggedFirstFrame) {
          this.loggedFirstFrame = true
          const energy = AudioCaptureService.getAudioEnergy(float32Array)
          console.log('[AudioCapture] 已开始采集音频', {
            length: float32Array.length,
            sampleRate: this.audioContext?.sampleRate,
            energy,
          })
        }

        this.onDataCallback?.({
          data: float32Array,
          sampleRate: this.audioContext!.sampleRate,
        })
      }

      // 连接音频节点
      this.source.connect(this.processor)
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
      const sample = Math.max(-1, Math.min(1, float32Array[i]))
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
      if (Math.abs(float32Array[i]) < threshold) {
        silenceCount++
      }
    }

    return silenceCount / Math.min(float32Array.length, samplesToCheck) > 0.95
  }

  /**
   * 获取音频能量（用于音量可视化）
   */
  static getAudioEnergy(float32Array: Float32Array): number {
    let sum = 0
    for (let i = 0; i < float32Array.length; i++) {
      sum += float32Array[i] * float32Array[i]
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

    if (this.source) {
      this.source.disconnect()
      this.source = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
      this.audioContext = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
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
