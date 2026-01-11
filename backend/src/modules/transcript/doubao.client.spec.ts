import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { DoubaoClientManager } from './doubao.client'

// Mock WebSocket
jest.mock('ws')

describe('DoubaoClientManager', () => {
  let manager: DoubaoClientManager
  let configService: jest.Mocked<ConfigService>

  beforeEach(async () => {
    configService = {
      get: jest.fn(),
    } as any

    // Mock config values
    configService.get.mockImplementation((key: string) => {
      const configs: Record<string, string> = {
        TRANSCRIPT_ENDPOINT: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
        TRANSCRIPT_APP_KEY: 'test-app-key',
        TRANSCRIPT_ACCESS_KEY: 'test-access-key',
        TRANSCRIPT_RESOURCE_ID: 'volc.bigasr.sauc.duration',
      }
      return configs[key] || null
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoubaoClientManager,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile()

    manager = module.get<DoubaoClientManager>(DoubaoClientManager)
  })

  describe('getOrCreate', () => {
    it('should create new client for new clientId', () => {
      const client = manager.getOrCreate('client-1', 'user-1')

      expect(client).toBeDefined()
      expect(typeof client.sendAudio).toBe('function')
      expect(typeof client.nextResponse).toBe('function')
      expect(typeof client.close).toBe('function')
    })

    it('should return existing client for same clientId', () => {
      const client1 = manager.getOrCreate('client-1', 'user-1')
      const client2 = manager.getOrCreate('client-1', 'user-2')

      expect(client1).toBe(client2)
    })

    it('should create different clients for different clientIds', () => {
      const client1 = manager.getOrCreate('client-1', 'user-1')
      const client2 = manager.getOrCreate('client-2', 'user-1')

      expect(client1).not.toBe(client2)
    })

    it('should use correct config values', () => {
      manager.getOrCreate('client-1', 'user-1')

      expect(configService.get).toHaveBeenCalledWith('TRANSCRIPT_ENDPOINT')
      expect(configService.get).toHaveBeenCalledWith('TRANSCRIPT_APP_KEY')
      expect(configService.get).toHaveBeenCalledWith('TRANSCRIPT_ACCESS_KEY')
    })

    it('should throw error for missing TRANSCRIPT_ENDPOINT', () => {
      configService.get.mockReturnValueOnce(null)

      expect(() => manager.getOrCreate('client-1', 'user-1')).toThrow(
        'Missing config: TRANSCRIPT_ENDPOINT'
      )
    })

    it('should throw error for missing TRANSCRIPT_APP_KEY', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TRANSCRIPT_ENDPOINT') return 'wss://test.com'
        if (key === 'TRANSCRIPT_APP_KEY') return null
        return 'test-value'
      })

      expect(() => manager.getOrCreate('client-1', 'user-1')).toThrow(
        'Missing config: TRANSCRIPT_APP_KEY'
      )
    })

    it('should throw error for missing TRANSCRIPT_ACCESS_KEY', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TRANSCRIPT_ENDPOINT') return 'wss://test.com'
        if (key === 'TRANSCRIPT_APP_KEY') return 'app-key'
        if (key === 'TRANSCRIPT_ACCESS_KEY') return null
        return 'test-value'
      })

      expect(() => manager.getOrCreate('client-1', 'user-1')).toThrow(
        'Missing config: TRANSCRIPT_ACCESS_KEY'
      )
    })

    it('should use default resourceId when not configured', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TRANSCRIPT_ENDPOINT') return 'wss://test.com'
        if (key === 'TRANSCRIPT_APP_KEY') return 'app-key'
        if (key === 'TRANSCRIPT_ACCESS_KEY') return 'access-key'
        return null
      })

      const client = manager.getOrCreate('client-1', 'user-1')
      expect(client).toBeDefined()
    })
  })

  describe('get', () => {
    it('should return undefined for non-existent client', () => {
      const client = manager.get('non-existent')
      expect(client).toBeUndefined()
    })

    it('should return existing client', () => {
      const created = manager.getOrCreate('client-1', 'user-1')
      const retrieved = manager.get('client-1')

      expect(retrieved).toBe(created)
    })
  })

  describe('close', () => {
    it('should close and remove client', async () => {
      const client = manager.getOrCreate('client-1', 'user-1')
      jest.spyOn(client, 'close')

      await manager.close('client-1')

      expect(client.close).toHaveBeenCalled()
      expect(manager.get('client-1')).toBeUndefined()
    })

    it('should handle closing non-existent client', async () => {
      await expect(manager.close('non-existent')).resolves.not.toThrow()
    })

    it('should close multiple clients independently', async () => {
      const client1 = manager.getOrCreate('client-1', 'user-1')
      const client2 = manager.getOrCreate('client-2', 'user-2')
      const closeSpy1 = jest.spyOn(client1, 'close')
      const closeSpy2 = jest.spyOn(client2, 'close')

      await manager.close('client-1')

      expect(closeSpy1).toHaveBeenCalled()
      expect(closeSpy2).not.toHaveBeenCalled()
      expect(manager.get('client-1')).toBeUndefined()
      expect(manager.get('client-2')).toBeDefined()

      await manager.close('client-2')
      expect(manager.get('client-2')).toBeUndefined()
    })
  })

  describe('client behavior', () => {
    it('should provide sendAudio method', async () => {
      const client = manager.getOrCreate('client-1', 'user-1')

      // This will fail to connect since we're not actually connecting to a server,
      // but we can verify the method exists
      expect(() => client.sendAudio(Buffer.from([]), false)).rejects.toThrow()
    })

    it('should provide nextResponse method', async () => {
      const client = manager.getOrCreate('client-1', 'user-1')

      // Timeout without actual connection
      const response = await client.nextResponse(100)
      expect(response).toBeNull()
    })

    it('should provide close method', async () => {
      const client = manager.getOrCreate('client-1', 'user-1')

      await expect(client.close()).resolves.not.toThrow()
    })
  })
})
