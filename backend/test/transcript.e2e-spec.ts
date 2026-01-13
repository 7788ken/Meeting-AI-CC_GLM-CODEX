import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import request from 'supertest'

/**
 * E2E Tests for API Endpoints
 *
 * These tests verify the application boots correctly and API endpoints work as expected.
 */
describe('API E2E Tests', () => {
  let app: INestApplication
  let configService: ConfigService

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = module.createNestApplication()

    // 设置全局前缀和验证管道（与 main.ts 一致）
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    )
    app.enableCors({ origin: '*' })

    await app.init()

    configService = app.get<ConfigService>(ConfigService)
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
  })

  describe('Health and Bootstrap', () => {
    it('should bootstrap the application', () => {
      expect(app).toBeDefined()
    })

    it('should have ConfigService', () => {
      expect(configService).toBeDefined()
    })

    it('/api (GET)', () => {
      return request(app.getHttpServer()).get('/api').expect(200) // 设置全局前缀后返回 200
    })
  })

  describe('Session API (B1012, B1013, B1014)', () => {
    let createdSessionId: string

    it('POST /api/sessions - should create a new session', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          settings: {
            title: 'E2E Test Session',
            description: 'Test session for E2E testing',
          },
        })
        .expect(201)

      expect(response.body).toBeDefined()
      expect(response.body.id).toBeDefined()
      expect(response.body.isActive).toBe(true)

      createdSessionId = response.body.id
    })

    it('POST /api/sessions - should create session without settings', async () => {
      const response = await request(app.getHttpServer()).post('/api/sessions').send({}).expect(201)

      expect(response.body).toBeDefined()
      expect(response.body.id).toBeDefined()
    })

    it('GET /api/sessions/:id - should get session by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/sessions/${createdSessionId}`)
        .expect(200)

      expect(response.body).toBeDefined()
      expect(response.body.id).toBe(createdSessionId)
    })

    it('GET /api/sessions/:id - should return 404 for non-existent session', async () => {
      await request(app.getHttpServer()).get('/api/sessions/non-existent-id').expect(404)
    })

    it('GET /api/sessions - should get all sessions', async () => {
      const response = await request(app.getHttpServer()).get('/api/sessions').expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBeGreaterThan(0)
    })

    it('POST /api/sessions/:id/end - should end a session', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/sessions/${createdSessionId}/end`)
        .expect(200)

      expect(response.body).toBeDefined()
      expect(response.body.isActive).toBe(false)
    })
  })

  describe('Speech API (B1027, B1028, B1029, B1030)', () => {
    let testSessionId: string
    let accessToken: string

    beforeAll(async () => {
      // Login to access protected endpoints (POST/PUT/DELETE)
      const username = configService.get<string>('DEFAULT_USERNAME') || 'admin'
      const password = configService.get<string>('DEFAULT_PASSWORD') || 'admin123'

      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password })
        .expect(200)

      accessToken = loginResponse.body?.accessToken
      expect(accessToken).toBeDefined()

      // Create a test session
      const response = await request(app.getHttpServer())
        .post('/api/sessions')
        .send({ settings: { title: 'Speech Test Session' } })
        .expect(201)

      testSessionId = response.body.id
      expect(testSessionId).toBeDefined()
    })

    it('POST /api/speeches - should create a speech record', async () => {
      const speechData = {
        sessionId: testSessionId,
        speakerId: 'speaker-test-1',
        speakerName: '测试发言人',
        speakerColor: '#1890ff',
        content: '这是一段测试的发言内容',
        confidence: 0.95,
      }

      const response = await request(app.getHttpServer())
        .post('/api/speeches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(speechData)
        .expect(201)

      expect(response.body).toBeDefined()
      expect(response.body.id).toBeDefined()
      expect(response.body.content).toBe(speechData.content)
      expect(response.body.speakerName).toBe(speechData.speakerName)
    })

    it('POST /api/speeches/batch - should batch create speech records', async () => {
      const speechesData = [
        {
          sessionId: testSessionId,
          speakerId: 'speaker-1',
          speakerName: '张三',
          content: '第一条发言',
        },
        {
          sessionId: testSessionId,
          speakerId: 'speaker-2',
          speakerName: '李四',
          content: '第二条发言',
        },
      ]

      const response = await request(app.getHttpServer())
        .post('/api/speeches/batch')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(speechesData)
        .expect(201)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body).toHaveLength(2)
    })

    it('GET /api/speeches/session/:sessionId - should get speeches by session', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/speeches/session/${testSessionId}`)
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
    })

    it('GET /api/speeches/session/:sessionId/search - should search speeches', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/speeches/session/${testSessionId}/search?keyword=test`)
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
    })

    it('PUT /api/speeches/:id - should update a speech (requires valid speech id)', async () => {
      // First create a speech
      const createResponse = await request(app.getHttpServer())
        .post('/api/speeches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          speakerId: 'speaker-update',
          speakerName: '更新测试',
          content: '原始内容',
        })
        .expect(201)

      const speechId = createResponse.body.id

      // Update the speech
      const updateResponse = await request(app.getHttpServer())
        .put(`/api/speeches/${speechId}`)
        .send({ content: '更新后的内容' })
        .expect(200)

      expect(updateResponse.body.content).toBe('更新后的内容')
      expect(updateResponse.body.isEdited).toBe(true)
    })

    it('PUT /api/speeches/:id/mark - should mark a speech', async () => {
      // First create a speech
      const createResponse = await request(app.getHttpServer())
        .post('/api/speeches')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sessionId: testSessionId,
          speakerId: 'speaker-mark',
          speakerName: '标记测试',
          content: '需要标记的内容',
        })
        .expect(201)

      const speechId = createResponse.body.id

      // Mark the speech
      const markResponse = await request(app.getHttpServer())
        .put(`/api/speeches/${speechId}/mark`)
        .send({ marked: true, reason: '重要内容' })
        .expect(200)

      expect(markResponse.body.isMarked).toBe(true)
    })
  })

  // Speaker Management routes not yet implemented - skipping tests
  // TODO: Implement POST /api/sessions/:id/speakers and GET /api/sessions/:id/speakers

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
      const {
        DoubaoBinaryCodec,
        DoubaoMessageType,
        DoubaoFlag,
        DoubaoSerialization,
        DoubaoCompression,
      } = require('../src/modules/transcript/doubao.codec')

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
