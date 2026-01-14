import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { TranscriptStreamService } from './transcript-stream.service'
import { TranscriptEvent } from './schemas/transcript-event.schema'
import { TranscriptState } from './schemas/transcript-state.schema'

describe('TranscriptStreamService', () => {
  let service: TranscriptStreamService

  const eventModel = {
    findOneAndUpdate: jest.fn(),
  }

  const stateModel = {
    findOneAndUpdate: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptStreamService,
        {
          provide: getModelToken(TranscriptEvent.name),
          useValue: eventModel,
        },
        {
          provide: getModelToken(TranscriptState.name),
          useValue: stateModel,
        },
      ],
    }).compile()

    service = module.get<TranscriptStreamService>(TranscriptStreamService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should not clear audioDurationMs when omitted on update', async () => {
    stateModel.findOneAndUpdate
      .mockResolvedValueOnce({ revision: 1, nextEventIndex: 1 })
      .mockResolvedValueOnce({ revision: 2, nextEventIndex: 1 })

    eventModel.findOneAndUpdate
      .mockImplementationOnce(async (_filter: unknown, update: any) => {
        expect(update?.$set?.audioDurationMs).toBe(1234)
        return {
          eventIndex: 0,
          content: 'hello',
          isFinal: false,
          segmentKey: 'seg-1',
          asrTimestampMs: 111,
          audioDurationMs: 1234,
        }
      })
      .mockImplementationOnce(async (_filter: unknown, update: any) => {
        expect(update?.$set).not.toHaveProperty('audioDurationMs')
        return {
          eventIndex: 0,
          content: 'hello world',
          isFinal: true,
          segmentKey: 'seg-1',
          asrTimestampMs: 222,
          audioDurationMs: 1234,
        }
      })

    await service.upsertEvent({
      sessionId: 'session-1',
      content: 'hello',
      isFinal: false,
      segmentKey: 'seg-1',
      asrTimestampMs: 111,
      audioDurationMs: 1234,
    })

    const result = await service.upsertEvent({
      sessionId: 'session-1',
      eventIndex: 0,
      content: 'hello world',
      isFinal: true,
      segmentKey: 'seg-1',
      asrTimestampMs: 222,
      audioDurationMs: undefined,
    })

    expect(result.event.audioDurationMs).toBe(1234)
  })

  it('should ignore non-positive audioDurationMs to avoid wiping previous value', async () => {
    stateModel.findOneAndUpdate.mockResolvedValue({ revision: 1, nextEventIndex: 1 })

    eventModel.findOneAndUpdate.mockImplementationOnce(async (_filter: unknown, update: any) => {
      expect(update?.$set).not.toHaveProperty('audioDurationMs')
      return {
        eventIndex: 0,
        content: 'hello',
        isFinal: true,
        segmentKey: 'seg-1',
        asrTimestampMs: 111,
        audioDurationMs: 999,
      }
    })

    const result = await service.upsertEvent({
      sessionId: 'session-1',
      content: 'hello',
      isFinal: true,
      segmentKey: 'seg-1',
      asrTimestampMs: 111,
      audioDurationMs: 0,
    })

    expect(result.event.audioDurationMs).toBe(999)
  })
})
