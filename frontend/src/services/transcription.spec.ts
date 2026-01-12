import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TranscriptionService, transcription } from './transcription'
import * as audioCaptureModule from './audioCapture'
import * as websocketModule from './websocket'
import type { Speech } from './api'

// Mock dependencies
vi.mock('./audioCapture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./audioCapture')>()
  return {
    ...actual,
    audioCapture: {
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
    } as any,
  }
})
vi.mock('./websocket')

// Get mock references
const mockWebsocket = {
  isConnected: false,
  connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  setSession: vi.fn(),
  startTranscribe: vi.fn(),
  stopTranscribe: vi.fn(),
  sendAudioData: vi.fn(),
  sendMessage: vi.fn(),
  onMessage: vi.fn(),
  onConnectionStatus: vi.fn(),
  onError: vi.fn(),
  removeAllListeners: vi.fn(),
  disconnect: vi.fn(),
}

describe('TranscriptionService', () => {
  let service: TranscriptionService
  let mockCallbacks: {
    onTranscript: ReturnType<typeof vi.fn>
    onError: ReturnType<typeof vi.fn>
    onStatusChange: ReturnType<typeof vi.fn>
    onConnectionStatusChange: ReturnType<typeof vi.fn>
  }

  const mockConfig = {
    sessionId: 'test-session-123',
    language: 'zh-CN',
    model: 'doubao',
  }

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Reset mockWebsocket state
    mockWebsocket.isConnected = false
    mockWebsocket.connect.mockReset()
    mockWebsocket.connect.mockResolvedValue(undefined)
    mockWebsocket.setSession.mockReset()
    mockWebsocket.startTranscribe.mockReset()
    mockWebsocket.stopTranscribe.mockReset()
    mockWebsocket.sendAudioData.mockReset()
    mockWebsocket.sendMessage.mockReset()
    mockWebsocket.onMessage.mockReset()
    mockWebsocket.onConnectionStatus.mockReset()
    mockWebsocket.onError.mockReset()
    mockWebsocket.removeAllListeners.mockReset()
    mockWebsocket.disconnect.mockReset()

    // Setup mock websocket
    vi.spyOn(websocketModule, 'websocket', 'get').mockReturnValue(mockWebsocket as any)

    // Setup mock audioCapture
    vi.mocked(audioCaptureModule.audioCapture).stopCapture = vi.fn()
    vi.mocked(audioCaptureModule.audioCapture).startCapture = vi.fn().mockResolvedValue(undefined)

    // Create fresh instance for each test
    service = new TranscriptionService()

    // Setup mock callbacks
    mockCallbacks = {
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onStatusChange: vi.fn(),
      onConnectionStatusChange: vi.fn(),
    }
  })

  afterEach(() => {
    service.dispose()
  })

  describe('初始化', () => {
    it('应该创建服务实例', () => {
      expect(service).toBeInstanceOf(TranscriptionService)
    })

    it('应该导出单例', () => {
      expect(transcription).toBeInstanceOf(TranscriptionService)
    })

    it('初始状态应该是 idle', () => {
      expect(service.getStatus()).toBe('idle')
    })

    it('初始不应该是活跃状态', () => {
      expect(service.isActive()).toBe(false)
    })
  })

  describe('开始转写', () => {
    it('应该成功启动转写', async () => {
      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      expect(mockWebsocket.connect).toHaveBeenCalled()
      expect(mockWebsocket.setSession).toHaveBeenCalledWith(mockConfig.sessionId)
      expect(mockWebsocket.startTranscribe).toHaveBeenCalledWith({
        language: 'zh-CN',
        model: 'doubao',
      })
      expect(audioCaptureModule.audioCapture.startCapture).toHaveBeenCalled()
      expect(service.getStatus()).toBe('recording')
      expect(service.isActive()).toBe(true)
    })

    it('应该在已连接时跳过连接步骤', async () => {
      mockWebsocket.isConnected = true

      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      expect(mockWebsocket.connect).not.toHaveBeenCalled()
      expect(mockWebsocket.setSession).toHaveBeenCalledWith(mockConfig.sessionId)
    })

    it('应该使用默认语言和模型', async () => {
      await service.start({
        sessionId: 'test-session',
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      expect(mockWebsocket.startTranscribe).toHaveBeenCalledWith({
        language: 'zh-CN',
        model: 'doubao',
      })
    })

    it('应该在已经录制时抛出错误', async () => {
      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      await expect(
        service.start({
          ...mockConfig,
          onTranscript: mockCallbacks.onTranscript,
          onError: mockCallbacks.onError,
          onStatusChange: mockCallbacks.onStatusChange,
          onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
        })
      ).rejects.toThrow('转写已在进行中')
    })

    it('应该在启动失败时设置错误状态', async () => {
      mockWebsocket.connect.mockRejectedValue(new Error('连接失败'))

      await expect(
        service.start({
          ...mockConfig,
          onTranscript: mockCallbacks.onTranscript,
          onError: mockCallbacks.onError,
          onStatusChange: mockCallbacks.onStatusChange,
          onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
        })
      ).rejects.toThrow()

      expect(service.getStatus()).toBe('error')
    })

    it('应该触发状态变化回调', async () => {
      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      expect(mockCallbacks.onStatusChange).toHaveBeenCalledWith('connecting')
      expect(mockCallbacks.onStatusChange).toHaveBeenCalledWith('recording')
    })
  })

  describe('暂停和恢复', () => {
    beforeEach(async () => {
      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })
      vi.clearAllMocks()
    })

    it('应该暂停转写', () => {
      service.pause()

      expect(audioCaptureModule.audioCapture.stopCapture).toHaveBeenCalled()
      expect(service.getStatus()).toBe('paused')
      expect(service.isActive()).toBe(false)
    })

    it('应该在未录制时忽略暂停', () => {
      // 创建一个新的服务实例，确保不在录制状态
      const idleService = new TranscriptionService()
      idleService.pause()

      // 因为没有启动录制，pause 应该直接返回，不会调用 stopCapture
      expect(audioCaptureModule.audioCapture.stopCapture).not.toHaveBeenCalled()

      idleService.dispose()
    })

    it('应该在已暂停时忽略暂停', () => {
      service.pause()
      service.pause()

      expect(audioCaptureModule.audioCapture.stopCapture).toHaveBeenCalledTimes(1)
    })

    it('应该恢复转写', async () => {
      service.pause()
      await service.resume()

      expect(audioCaptureModule.audioCapture.startCapture).toHaveBeenCalled()
      expect(service.getStatus()).toBe('recording')
      expect(service.isActive()).toBe(true)
    })

    it('应该在未录制时忽略恢复', async () => {
      service.stop()
      await service.resume()

      expect(audioCaptureModule.audioCapture.startCapture).not.toHaveBeenCalled()
    })
  })

  describe('停止转写', () => {
    it('应该停止转写', async () => {
      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      service.stop()

      expect(audioCaptureModule.audioCapture.stopCapture).toHaveBeenCalled()
      expect(mockWebsocket.stopTranscribe).toHaveBeenCalled()
      expect(service.getStatus()).toBe('idle')
      expect(service.isActive()).toBe(false)
    })

    it('应该在未录制时忽略停止', () => {
      service.stop()

      expect(audioCaptureModule.audioCapture.stopCapture).not.toHaveBeenCalled()
      expect(mockWebsocket.stopTranscribe).not.toHaveBeenCalled()
    })
  })

  describe('音频数据处理', () => {
    it('应该将 Float32 转换为 PCM16', async () => {
      let audioDataCallback: ((data: any) => void) | null = null

      vi.mocked(audioCaptureModule.audioCapture).startCapture = vi.fn().mockImplementation(
        (onData, onError) => {
          audioDataCallback = onData
          return Promise.resolve()
        }
      )

      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      // 模拟音频数据
      const mockAudioData = {
        data: new Float32Array([0.5, -0.5, 1.0, -1.0, 0.0]),
      }

      if (audioDataCallback) {
        audioDataCallback(mockAudioData)
      }

      expect(mockWebsocket.sendAudioData).toHaveBeenCalled()
      const sentData = mockWebsocket.sendAudioData.mock.calls[0][0]
      expect(sentData).toBeInstanceOf(Int16Array)
    })

    it('应该处理音频溢出', async () => {
      let audioDataCallback: ((data: any) => void) | null = null

      vi.mocked(audioCaptureModule.audioCapture).startCapture = vi.fn().mockImplementation(
        (onData, onError) => {
          audioDataCallback = onData
          return Promise.resolve()
        }
      )

      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      // 模拟溢出音频数据
      const mockAudioData = {
        data: new Float32Array([2.0, -2.0, 1.5, -1.5]),
      }

      if (audioDataCallback) {
        audioDataCallback(mockAudioData)
      }

      const sentData = mockWebsocket.sendAudioData.mock.calls[0][0] as Int16Array
      // PCM16 的最大值是 32767，最小值是 -32768
      expect(sentData[0]).toBeLessThanOrEqual(32767)
      expect(sentData[1]).toBeGreaterThanOrEqual(-32768)
    })

    it('应该在静音达到阈值后发送 end_turn 并停止发包', async () => {
      let audioDataCallback: ((data: any) => void) | null = null

      vi.mocked(audioCaptureModule.audioCapture).startCapture = vi.fn().mockImplementation(
        (onData, onError) => {
          audioDataCallback = onData
          return Promise.resolve()
        }
      )

      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      const sampleRate = 16000
      const voicedFrame = {
        data: new Float32Array(1600).fill(0.2), // ~100ms voiced
        sampleRate,
      }
      const silentFrame = {
        data: new Float32Array(1600).fill(0), // ~100ms silence
        sampleRate,
      }

      if (audioDataCallback) {
        audioDataCallback(voicedFrame)
        for (let i = 0; i < 9; i += 1) {
          audioDataCallback(silentFrame)
        }
        // 静音后仍持续回调，不应重复发送 end_turn
        for (let i = 0; i < 5; i += 1) {
          audioDataCallback(silentFrame)
        }
      }

      expect(mockWebsocket.sendAudioData).toHaveBeenCalledTimes(1)
      expect(mockWebsocket.sendMessage).toHaveBeenCalledWith({ type: 'end_turn' })
    })
  })

  describe('转写结果处理', () => {
    it('应该处理最终转写结果', async () => {
      let messageCallback: ((data: any) => void) | null = null

      mockWebsocket.onMessage = vi.fn().mockImplementation((callback) => {
        messageCallback = callback
      })

      // 需要重新创建服务实例以使用 mock
      service.dispose()
      service = new TranscriptionService()

      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      // 模拟转写消息
      const transcriptMessage = {
        type: 'transcript',
        data: {
          isFinal: true,
          content: '大家好',
          speakerId: 'speaker-1',
          speakerName: '张三',
          confidence: 0.95,
          timestamp: Date.now(),
        },
      }

      if (messageCallback) {
        messageCallback(transcriptMessage)
      }

      expect(mockCallbacks.onTranscript).toHaveBeenCalled()
      const transcript = mockCallbacks.onTranscript.mock.calls[0][0] as Speech
      expect(transcript.content).toBe('大家好')
      expect(transcript.speakerName).toBe('张三')
      expect(transcript.sessionId).toBe(mockConfig.sessionId)
    })

    it('应该处理非最终结果（增量更新）', async () => {
      let messageCallback: ((data: any) => void) | null = null

      mockWebsocket.onMessage = vi.fn().mockImplementation((callback) => {
        messageCallback = callback
      })

      service.dispose()
      service = new TranscriptionService()

      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      const nonFinalMessage = {
        type: 'transcript',
        data: {
          isFinal: false,
          content: '大家好',
        },
      }

      if (messageCallback) {
        messageCallback(nonFinalMessage)
      }

      expect(mockCallbacks.onTranscript).toHaveBeenCalled()
    })

    it('应该处理错误消息', async () => {
      let messageCallback: ((data: any) => void) | null = null

      mockWebsocket.onMessage = vi.fn().mockImplementation((callback) => {
        messageCallback = callback
      })

      service.dispose()
      service = new TranscriptionService()

      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      const errorMessage = {
        type: 'error',
        data: { error: '识别服务错误' },
      }

      if (messageCallback) {
        messageCallback(errorMessage)
      }

      expect(mockCallbacks.onError).toHaveBeenCalled()
    })
  })

  describe('清理资源', () => {
    it('应该释放所有资源', async () => {
      await service.start({
        ...mockConfig,
        onTranscript: mockCallbacks.onTranscript,
        onError: mockCallbacks.onError,
        onStatusChange: mockCallbacks.onStatusChange,
        onConnectionStatusChange: mockCallbacks.onConnectionStatusChange,
      })

      service.dispose()

      expect(audioCaptureModule.audioCapture.stopCapture).toHaveBeenCalled()
      expect(mockWebsocket.stopTranscribe).toHaveBeenCalled()
      expect(mockWebsocket.removeAllListeners).toHaveBeenCalled()
    })
  })
})
