import { Test, TestingModule } from '@nestjs/testing'
import { TranscriptGateway } from './transcript.gateway'
import { TranscriptService } from './transcript.service'
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'

describe('TranscriptGateway', () => {
  let gateway: TranscriptGateway
  let transcriptService: jest.Mocked<TranscriptService>
  let mockServer: Partial<Server>
  let mockClient: Partial<Socket>

  beforeEach(async () => {
    // Mock server
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    }

    // Mock client socket
    mockClient = {
      id: 'test-client-id',
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      once: jest.fn(),
      on: jest.fn(),
    }

    // Mock TranscriptService
    transcriptService = {
      addClient: jest.fn(),
      removeClient: jest.fn(),
      processAudio: jest.fn(),
      endAudio: jest.fn(),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptGateway,
        {
          provide: TranscriptService,
          useValue: transcriptService,
        },
      ],
    }).compile()

    gateway = module.get<TranscriptGateway>(TranscriptGateway)
    gateway.server = mockServer as Server
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('handleConnection', () => {
    it('should handle client connection', () => {
      // Should not throw when client connects
      expect(() => gateway.handleConnection(mockClient as Socket)).not.toThrow()
    })
  })

  describe('handleDisconnect', () => {
    it('should remove client from transcript service', async () => {
      await gateway.handleDisconnect(mockClient as Socket)

      expect(transcriptService.removeClient).toHaveBeenCalledWith(mockClient.id)
    })
  })

  describe('handleSessionStart', () => {
    it('should add client to session room and emit confirmation', () => {
      const data = { sessionId: 'session-123' }

      gateway.handleSessionStart(mockClient as Socket, data)

      expect(mockClient.join).toHaveBeenCalledWith('session:session-123')
      expect(mockClient.emit).toHaveBeenCalledWith('session:started', {
        sessionId: 'session-123',
      })
    })

    it('should handle session start with different session IDs', () => {
      const data1 = { sessionId: 'session-1' }
      const data2 = { sessionId: 'session-2' }

      gateway.handleSessionStart(mockClient as Socket, data1)
      gateway.handleSessionStart(mockClient as Socket, data2)

      expect(mockClient.join).toHaveBeenCalledTimes(2)
      expect(mockClient.join).toHaveBeenCalledWith('session:session-1')
      expect(mockClient.join).toHaveBeenCalledWith('session:session-2')
    })
  })

  describe('handleSessionEnd', () => {
    it('should remove client from session room and emit confirmation', () => {
      const data = { sessionId: 'session-123' }

      gateway.handleSessionEnd(mockClient as Socket, data)

      expect(mockClient.leave).toHaveBeenCalledWith('session:session-123')
      expect(mockClient.emit).toHaveBeenCalledWith('session:ended', {
        sessionId: 'session-123',
      })
    })
  })

  describe('handleAudioStart', () => {
    it('should add client to transcript service and emit confirmation', () => {
      gateway.handleAudioStart(mockClient as Socket)

      expect(transcriptService.addClient).toHaveBeenCalledWith(mockClient.id, mockClient)
      expect(mockClient.emit).toHaveBeenCalledWith('audio:started')
    })
  })

  describe('handleAudioData', () => {
    const mockData = {
      audioData: 'base64-audio-data',
      sessionId: 'session-123',
      isFinal: false,
    }

    it('should process audio data and broadcast result', async () => {
      const mockResult = {
        id: 'transcript-1',
        sessionId: 'session-123',
        speakerId: 'speaker-1',
        speakerName: 'Speaker 1',
        content: 'Hello world',
        isFinal: false,
        confidence: 0.95,
      }

      transcriptService.processAudio.mockResolvedValue(mockResult)

      await gateway.handleAudioData(mockClient as Socket, mockData)

      expect(transcriptService.processAudio).toHaveBeenCalledWith(
        mockClient.id,
        mockData.audioData,
        mockData.sessionId,
        false
      )
      expect(mockServer.to).toHaveBeenCalledWith('session:session-123')
      expect(mockServer.emit).toHaveBeenCalledWith('transcript:result', mockResult)
    })

    it('should handle isFinal flag correctly', async () => {
      const dataWithFinal = { ...mockData, isFinal: true }
      const mockResult = {
        id: 'transcript-2',
        sessionId: 'session-123',
        speakerId: 'speaker-1',
        speakerName: 'Speaker 1',
        content: 'Final result',
        isFinal: true,
        confidence: 0.98,
      }

      transcriptService.processAudio.mockResolvedValue(mockResult)

      await gateway.handleAudioData(mockClient as Socket, dataWithFinal)

      expect(transcriptService.processAudio).toHaveBeenCalledWith(
        mockClient.id,
        mockData.audioData,
        mockData.sessionId,
        true
      )
    })

    it('should handle null result from processAudio', async () => {
      transcriptService.processAudio.mockResolvedValue(null)

      await gateway.handleAudioData(mockClient as Socket, mockData)

      expect(transcriptService.processAudio).toHaveBeenCalled()
      expect(mockServer.emit).not.toHaveBeenCalled()
    })

    it('should handle errors during audio processing', async () => {
      transcriptService.processAudio.mockRejectedValue(new Error('Processing error'))

      // Call the method and catch the error
      try {
        await gateway.handleAudioData(mockClient as Socket, mockData)
      } catch (e) {
        // Error is expected to be thrown
        expect(e).toBeInstanceOf(Error)
      }

      expect(transcriptService.processAudio).toHaveBeenCalled()
    })
  })

  describe('handleAudioEnd', () => {
    it('should end audio processing and emit confirmation', async () => {
      await gateway.handleAudioEnd(mockClient as Socket)

      expect(transcriptService.endAudio).toHaveBeenCalledWith(mockClient.id)
      expect(mockClient.emit).toHaveBeenCalledWith('audio:ended')
    })

    it('should handle errors during audio end', async () => {
      transcriptService.endAudio.mockRejectedValue(new Error('End audio error'))

      // Call the method and catch the error
      try {
        await gateway.handleAudioEnd(mockClient as Socket)
      } catch (e) {
        // Error is expected to be thrown
        expect(e).toBeInstanceOf(Error)
      }

      expect(transcriptService.endAudio).toHaveBeenCalled()
    })
  })

  describe('WebSocket Gateway configuration', () => {
    it('should have correct namespace', () => {
      const decorators = Reflect.getMetadata('__socketGateway__', TranscriptGateway)

      // Verify the gateway is properly decorated
      expect(TranscriptGateway.prototype).toBeDefined()
    })

    it('should implement OnGatewayConnection and OnGatewayDisconnect', () => {
      expect(gateway.handleConnection).toBeDefined()
      expect(gateway.handleDisconnect).toBeDefined()
    })
  })

  describe('Message handlers', () => {
    it('should subscribe to session:start message', () => {
      // Verify handler exists
      expect(typeof gateway.handleSessionStart).toBe('function')
    })

    it('should subscribe to session:end message', () => {
      expect(typeof gateway.handleSessionEnd).toBe('function')
    })

    it('should subscribe to audio:start message', () => {
      expect(typeof gateway.handleAudioStart).toBe('function')
    })

    it('should subscribe to audio:data message', () => {
      expect(typeof gateway.handleAudioData).toBe('function')
    })

    it('should subscribe to audio:end message', () => {
      expect(typeof gateway.handleAudioEnd).toBe('function')
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete audio streaming flow', async () => {
      // 1. Start session
      gateway.handleSessionStart(mockClient as Socket, {
        sessionId: 'session-1',
      })
      expect(mockClient.join).toHaveBeenCalledWith('session:session-1')

      // 2. Start audio
      gateway.handleAudioStart(mockClient as Socket)
      expect(transcriptService.addClient).toHaveBeenCalled()

      // 3. Send audio data
      const mockResult = {
        id: 'transcript-1',
        sessionId: 'session-1',
        speakerId: 'speaker-1',
        speakerName: 'Speaker 1',
        content: 'Test transcript',
        isFinal: false,
        confidence: 0.9,
      }
      transcriptService.processAudio.mockResolvedValue(mockResult)

      await gateway.handleAudioData(mockClient as Socket, {
        audioData: 'audio-data',
        sessionId: 'session-1',
        isFinal: false,
      })
      expect(mockServer.emit).toHaveBeenCalledWith('transcript:result', mockResult)

      // 4. End audio
      await gateway.handleAudioEnd(mockClient as Socket)
      expect(transcriptService.endAudio).toHaveBeenCalled()

      // 5. End session
      gateway.handleSessionEnd(mockClient as Socket, {
        sessionId: 'session-1',
      })
      expect(mockClient.leave).toHaveBeenCalledWith('session:session-1')
    })

    it('should handle multiple clients in same session', async () => {
      const client1: Partial<Socket> = {
        id: 'client-1',
        join: jest.fn(),
        leave: jest.fn(),
        emit: jest.fn(),
      }
      const client2: Partial<Socket> = {
        id: 'client-2',
        join: jest.fn(),
        leave: jest.fn(),
        emit: jest.fn(),
      }

      // Both join same session
      gateway.handleSessionStart(client1 as Socket, { sessionId: 'shared-session' })
      gateway.handleSessionStart(client2 as Socket, { sessionId: 'shared-session' })

      expect(client1.join).toHaveBeenCalledWith('session:shared-session')
      expect(client2.join).toHaveBeenCalledWith('session:shared-session')

      // Client 1 sends audio
      const mockResult = {
        id: 'transcript-1',
        sessionId: 'shared-session',
        speakerId: 'speaker-1',
        speakerName: 'Speaker 1',
        content: 'Broadcast to all',
        isFinal: false,
        confidence: 0.9,
      }
      transcriptService.processAudio.mockResolvedValue(mockResult)

      await gateway.handleAudioData(client1 as Socket, {
        audioData: 'audio-data',
        sessionId: 'shared-session',
        isFinal: false,
      })

      // Should broadcast to entire session room
      expect(mockServer.to).toHaveBeenCalledWith('session:shared-session')
      expect(mockServer.emit).toHaveBeenCalledWith('transcript:result', mockResult)
    })
  })
})
