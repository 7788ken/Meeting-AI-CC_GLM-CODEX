import {
  AnonymousSpeakerCluster,
  TurnDetector,
  cosineSimilarity,
  getDefaultTurnModeConfig,
} from './turn-mode'

describe('turn-mode', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for same vector', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
    })

    it('should return 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
    })
  })

  describe('AnonymousSpeakerCluster', () => {
    it('should assign same speaker when embedding is similar', () => {
      const cluster = new AnonymousSpeakerCluster('s1', { sameTh: 0.9, newTh: 0.1 })
      const speaker1 = cluster.assign([1, 0])
      const speaker2 = cluster.assign([0.99, 0.01])
      expect(speaker2).toBe(speaker1)
    })

    it('should create new speaker when embedding differs enough', () => {
      const cluster = new AnonymousSpeakerCluster('s1', { sameTh: 0.9, newTh: 0.2 })
      const speaker1 = cluster.assign([1, 0])
      const speaker2 = cluster.assign([0, 1])
      expect(speaker2).not.toBe(speaker1)
    })
  })

  describe('TurnDetector', () => {
    it('should start on non-silent then finalize after gap', () => {
      const config = {
        ...getDefaultTurnModeConfig(),
        gapMs: 500,
        minFinalizeVoicedMs: 1,
        silenceRmsThreshold: 1,
      }
      const detector = new TurnDetector(config)

      const silent = Buffer.alloc(320) // 10ms at 16kHz s16le mono
      const voiced = Buffer.alloc(320)
      voiced.writeInt16LE(2000, 0)

      expect(detector.pushPcmChunk(silent, 0)).toEqual({
        shouldStartTurn: false,
        shouldFinalizeTurn: false,
      })

      expect(detector.pushPcmChunk(voiced, 10).shouldStartTurn).toBe(true)
      expect(detector.hasActiveTurn()).toBe(true)

      expect(detector.pushPcmChunk(silent, 200).shouldFinalizeTurn).toBe(false)
      expect(detector.pushPcmChunk(silent, 600).shouldFinalizeTurn).toBe(true)
    })
  })
})
