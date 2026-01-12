import { heuristicSegmentBySpeaker, parseTurnSegmentsJson, validateAndNormalizeSegments } from './turn-segmentation.validation'
import type { TranscriptEventDTO } from '../transcript-stream/transcript-stream.service'

describe('turn-segmentation.validation', () => {
  const events: TranscriptEventDTO[] = [
    { eventIndex: 0, speakerId: 'a', speakerName: 'A', content: '1', isFinal: false },
    { eventIndex: 1, speakerId: 'a', speakerName: 'A', content: '2', isFinal: false },
    { eventIndex: 2, speakerId: 'b', speakerName: 'B', content: '3', isFinal: false },
    { eventIndex: 3, speakerId: 'b', speakerName: 'B', content: '4', isFinal: false },
  ]

  it('should parse fenced json', () => {
    const parsed = parseTurnSegmentsJson('```json\n{ "segments": [] }\n```')
    expect(Array.isArray(parsed.segments)).toBe(true)
  })

  it('should heuristic segment by speaker', () => {
    const segments = heuristicSegmentBySpeaker({ events, startEventIndex: 0, endEventIndex: 3 })
    expect(segments).toEqual([
      { speakerId: 'a', speakerName: 'A', startEventIndex: 0, endEventIndex: 1 },
      { speakerId: 'b', speakerName: 'B', startEventIndex: 2, endEventIndex: 3 },
    ])
  })

  it('should validate and normalize segments and enforce continuity', () => {
    const normalized = validateAndNormalizeSegments({
      events,
      startEventIndex: 0,
      endEventIndex: 3,
      segments: [
        { speakerId: 'a', speakerName: 'A', startEventIndex: 0, endEventIndex: 1 },
        { speakerId: 'b', speakerName: 'B', startEventIndex: 2, endEventIndex: 3 },
      ],
    })
    expect(normalized[0].speakerId).toBe('a')
    expect(normalized[1].speakerId).toBe('b')
  })

  it('should reject segments that split same speaker into multiple turns', () => {
    expect(() =>
      validateAndNormalizeSegments({
        events,
        startEventIndex: 0,
        endEventIndex: 3,
        segments: [
          { speakerId: 'a', speakerName: 'A', startEventIndex: 0, endEventIndex: 0 },
          { speakerId: 'a', speakerName: 'A', startEventIndex: 1, endEventIndex: 1 },
          { speakerId: 'b', speakerName: 'B', startEventIndex: 2, endEventIndex: 3 },
        ],
      })
    ).toThrow(/未合并同 speaker/)
  })
})

