import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { TranscriptService } from './transcript.service'
import { DoubaoClientManager } from './doubao.client'
import { DoubaoDecodedMessage } from './doubao.codec'

describe('TranscriptService', () => {
  let service: TranscriptService
  let configService: jest.Mocked<ConfigService>
  let doubaoClientManager: jest.Mocked<DoubaoClientManager>
  let mockClient: any

  beforeEach(async () => {
    // Mock client
    mockClient = {
      sendAudio: jest.fn(),
      nextResponse: jest.fn(),
      close: jest.fn(),
    }

    configService = {
      get: jest.fn(),
    } as any

    doubaoClientManager = {
      getOrCreate: jest.fn().mockReturnValue(mockClient),
      get: jest.fn().mockReturnValue(mockClient),
      close: jest.fn(),
    } as any

    // Default config
    configService.get.mockImplementation((key: string) => {
      if (key === 'TRANSCRIPT_RESPONSE_TIMEOUT_MS') return '5000'
      return null
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptService,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: DoubaoClientManager,
          useValue: doubaoClientManager,
        },
      ],
    }).compile()

    service = module.get<TranscriptService>(TranscriptService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('addClient', () => {
    it('should add client to clients map', () => {
      const socket = { id: 'socket-1', emit: jest.fn() }
      service.addClient('client-1', socket)

      expect(service['clients'].has('client-1')).toBe(true)
    })
  })

  describe('removeClient', () => {
    it('should remove client and close Doubao connection', async () => {
      const socket = { id: 'socket-1', emit: jest.fn() }
      service.addClient('client-1', socket)

      await service.removeClient('client-1')

      expect(service['clients'].has('client-1')).toBe(false)
      expect(doubaoClientManager.close).toHaveBeenCalledWith('client-1')
    })
  })

  describe('processAudio', () => {
    const mockSocket = { id: 'socket-1', emit: jest.fn() }

    beforeEach(() => {
      service.addClient('client-1', mockSocket)
    })

    it('should process audio data and return transcript result', async () => {
      const audioData = 'base64-encoded-audio'
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09, // Response
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            text: 'Hello world',
            is_final: true,
            confidence: 0.95,
            speaker_id: 'speaker-1',
            speaker_name: 'Speaker 1',
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', audioData, 'session-1', true)

      expect(result).not.toBeNull()
      expect(result?.content).toBe('Hello world')
      expect(result?.sessionId).toBe('session-1')
      expect(result?.isFinal).toBe(true)
      expect(result?.confidence).toBe(0.95)
      expect(mockClient.sendAudio).toHaveBeenCalled()
      expect(doubaoClientManager.close).toHaveBeenCalledWith('client-1')
    })

    it('should handle empty audio data', async () => {
      const result = await service.processAudio('client-1', '', 'session-1', false)

      expect(result).toBeNull()
      expect(mockClient.sendAudio).not.toHaveBeenCalled()
    })

    it('should handle invalid base64 data', async () => {
      const result = await service.processAudio('client-1', 'invalid-base64!!!', 'session-1', false)

      // Empty buffer after decode, should return null
      expect(result).toBeNull()
    })

    it('should handle no response from Doubao', async () => {
      mockClient.nextResponse.mockResolvedValue(null)

      const result = await service.processAudio(
        'client-1',
        'aGVsbG8=', // 'hello' in base64
        'session-1',
        false
      )

      expect(result).toBeNull()
    })

    it('should extract text from utterances array', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            utterances: [{ text: 'Hello ' }, { text: 'world' }],
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.content).toBe('world')
      expect(result?.segmentKey).toBe('u1')
    })

    it('should ignore payload sequence for segmentKey selection', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            payload_sequence: 999,
            utterances: [{ text: 'Hello ' }, { text: 'world' }],
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.content).toBe('world')
      expect(result?.segmentKey).toBe('u1')
    })

    it('should extract utterance segment when speaker info is present', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            utterances: [
              { text: 'A1', speaker_id: 'speaker-a' },
              { text: 'A2', speaker_id: 'speaker-a' },
              { text: 'B1', speaker_id: 'speaker-b' },
              { text: 'B2', speaker_id: 'speaker-b', confidence: 0.88, is_final: false },
            ],
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.speakerId).toBe('speaker-b')
      expect(result?.content).toBe('B2')
      expect(result?.confidence).toBe(0.88)
      expect(result?.isFinal).toBe(false)
      expect(result?.segmentKey).toBe('u3')
    })

    it('should extract text from sentence field', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            sentence: 'Test sentence',
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.content).toBe('Test sentence')
    })

    it('should handle string payload', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: 'Direct text payload',
        rawPayload: Buffer.from('Direct text payload'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.content).toBe('Direct text payload')
    })

    it('should return null for empty payload', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: null,
        rawPayload: Buffer.alloc(0),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      mockClient.sendAudio.mockRejectedValue(new Error('Network error'))

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result).toBeNull()
    })

    it('should use custom timeout from config', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TRANSCRIPT_RESPONSE_TIMEOUT_MS') return '3000'
        return null
      })

      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: { result: { text: 'Test' } },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(mockClient.nextResponse).toHaveBeenCalledWith(3000)
    })

    it('should use default timeout when config is invalid', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TRANSCRIPT_RESPONSE_TIMEOUT_MS') return 'invalid'
        return null
      })

      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: { result: { text: 'Test' } },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(mockClient.nextResponse).toHaveBeenCalledWith(5000)
    })
  })

  describe('endAudio', () => {
    beforeEach(() => {
      const socket = { id: 'socket-1', emit: jest.fn() }
      service.addClient('client-1', socket)
    })

    it('should send empty audio buffer with isFinal flag', async () => {
      doubaoClientManager.get.mockReturnValueOnce(mockClient)
      doubaoClientManager.close.mockResolvedValueOnce(undefined)

      await service.endAudio('client-1')

      expect(mockClient.sendAudio).toHaveBeenCalledWith(expect.any(Buffer), true)
    })

    it('should close client after ending audio', async () => {
      doubaoClientManager.get.mockReturnValueOnce(mockClient)
      doubaoClientManager.close.mockResolvedValueOnce(undefined)

      await service.endAudio('client-1')

      expect(doubaoClientManager.close).toHaveBeenCalledWith('client-1')
    })

    it('should handle non-existent client', async () => {
      doubaoClientManager.get.mockReturnValueOnce(undefined)

      await expect(service.endAudio('non-existent')).resolves.not.toThrow()
      expect(doubaoClientManager.close).not.toHaveBeenCalled()
    })

    it('should handle errors during endAudio', async () => {
      doubaoClientManager.get.mockReturnValueOnce(mockClient)
      doubaoClientManager.close.mockResolvedValueOnce(undefined)
      mockClient.sendAudio.mockRejectedValue(new Error('Send error'))

      await expect(service.endAudio('client-1')).resolves.not.toThrow()
      expect(doubaoClientManager.close).toHaveBeenCalledWith('client-1')
    })
  })

  describe('speaker extraction', () => {
    const mockSocket = { id: 'socket-1', emit: jest.fn() }

    beforeEach(() => {
      service.addClient('client-1', mockSocket)
    })

    it('should extract speaker from result.speaker_id', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            text: 'Test',
            speaker_id: 'speaker-123',
            speaker_name: 'John Doe',
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.speakerId).toBe('speaker-123')
      expect(result?.speakerName).toBe('John Doe')
    })

    it('should extract speaker from result.speaker.id', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            text: 'Test',
            speaker: { id: 'speaker-456', name: 'Jane Doe' },
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.speakerId).toBe('speaker-456')
      expect(result?.speakerName).toBe('Jane Doe')
    })

    it('should use default values when speaker info not found', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: { text: 'Test' },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.speakerId).toBe('client_client-1')
      expect(result?.speakerName).toBe('发言者')
    })
  })

  describe('isFinal extraction', () => {
    const mockSocket = { id: 'socket-1', emit: jest.fn() }

    beforeEach(() => {
      service.addClient('client-1', mockSocket)
    })

    it('should extract is_final from result', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            text: 'Test',
            is_final: true,
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.isFinal).toBe(true)
    })

    it('should extract isFinal from result', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: {
            text: 'Test',
            isFinal: true,
          },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.isFinal).toBe(true)
    })

    it('should default to false when is_final not present', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: { text: 'Test' },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.isFinal).toBe(false)
    })
  })

  describe('confidence extraction', () => {
    const mockSocket = { id: 'socket-1', emit: jest.fn() }

    beforeEach(() => {
      service.addClient('client-1', mockSocket)
    })

    it('should extract confidence from result', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: { text: 'Test', confidence: 0.85 },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.confidence).toBe(0.85)
    })

    it('should default to 1 when confidence not present', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: { text: 'Test' },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.confidence).toBe(1)
    })

    it('should handle invalid confidence value', async () => {
      const mockResponse: DoubaoDecodedMessage = {
        messageType: 0x09,
        flags: 0x00,
        serialization: 0x01,
        compression: 0x00,
        payload: {
          result: { text: 'Test', confidence: 'invalid' },
        },
        rawPayload: Buffer.from('{}'),
      }

      mockClient.nextResponse.mockResolvedValue(mockResponse)

      const result = await service.processAudio('client-1', 'aGVsbG8=', 'session-1', false)

      expect(result?.confidence).toBe(1)
    })
  })
})
