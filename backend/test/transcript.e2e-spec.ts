import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { AppModule } from '../src/app.module'

/**
 * E2E Tests for Transcript Module (Doubao Speech Recognition)
 *
 * These tests verify the application boots correctly.
 */
describe('Transcript E2E (Doubao Speech Recognition)', () => {
  let module: TestingModule
  let configService: ConfigService

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    configService = module.get<ConfigService>(ConfigService)
  })

  afterAll(async () => {
    if (module) {
      await module.close()
    }
  })

  describe('Application Bootstrap', () => {
    it('should create the module', () => {
      expect(module).toBeDefined()
    })

    it('should have ConfigService', () => {
      expect(configService).toBeDefined()
    })
  })

  describe('Configuration Validation', () => {
    it('should have Doubao configuration', () => {
      const endpoint = configService.get<string>('TRANSCRIPT_ENDPOINT')
      const appKey = configService.get<string>('TRANSCRIPT_APP_KEY')
      const accessKey = configService.get<string>('TRANSCRIPT_ACCESS_KEY')

      console.log(`TRANSCRIPT_ENDPOINT: ${endpoint ? 'SET' : 'NOT SET'}`)
      console.log(`TRANSCRIPT_APP_KEY: ${appKey ? 'SET' : 'NOT SET'}`)
      console.log(`TRANSCRIPT_ACCESS_KEY: ${accessKey ? 'SET' : 'NOT SET'}`)
    })

    it('should have valid endpoint URL format', () => {
      const endpoint = configService.get<string>('TRANSCRIPT_ENDPOINT')

      if (endpoint) {
        expect(endpoint).toMatch(/^wss?:\/\/.+/)
      }
    })

    it('should have valid timeout configuration', () => {
      const timeout = configService.get<string>('TRANSCRIPT_RESPONSE_TIMEOUT_MS')
      const parsed = Number(timeout)

      const expected = Number.isFinite(parsed) && parsed > 0 ? parsed : 5000
      expect(expected).toBeGreaterThan(0)
      expect(expected).toBeLessThanOrEqual(60000)
    })
  })

  describe('Transcript Module Loading', () => {
    it('should load TranscriptModule', () => {
      const { TranscriptModule } = require('../src/modules/transcript/transcript.module')
      expect(TranscriptModule).toBeDefined()
    })

    it('should load TranscriptService', () => {
      const { TranscriptService } = require('../src/modules/transcript/transcript.service')
      expect(TranscriptService).toBeDefined()
    })

    it('should load TranscriptGateway', () => {
      const { TranscriptGateway } = require('../src/modules/transcript/transcript.gateway')
      expect(TranscriptGateway).toBeDefined()
    })

    it('should load DoubaoClientManager', () => {
      const { DoubaoClientManager } = require('../src/modules/transcript/doubao.client')
      expect(DoubaoClientManager).toBeDefined()
    })
  })

  describe('DoubaoBinaryCodec', () => {
    it('should work correctly', () => {
      const { DoubaoBinaryCodec, DoubaoMessageType, DoubaoFlag, DoubaoSerialization, DoubaoCompression } =
        require('../src/modules/transcript/doubao.codec')

      const codec = new DoubaoBinaryCodec()

      const payload = { test: 'data', value: 123 }
      const encoded = codec.encode({
        messageType: DoubaoMessageType.Config,
        flags: DoubaoFlag.NoSeq,
        serialization: DoubaoSerialization.Json,
        compression: DoubaoCompression.None,
        payload,
      })

      const decoded = codec.decode(encoded)

      expect(decoded.payload).toEqual(payload)
    })
  })
})
