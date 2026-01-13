import { isSegmentKeyRollback, parseSegmentKeyOrder } from './segment-key'

describe('segment-key', () => {
  describe('parseSegmentKeyOrder', () => {
    it('should parse index-based keys', () => {
      expect(parseSegmentKeyOrder('u0')).toBe(0)
      expect(parseSegmentKeyOrder('u12')).toBe(12)
    })

    it('should parse numeric keys', () => {
      expect(parseSegmentKeyOrder('0')).toBe(0)
      expect(parseSegmentKeyOrder('42')).toBe(42)
      expect(parseSegmentKeyOrder('100.5')).toBe(100.5)
    })

    it('should parse speaker-prefixed keys', () => {
      expect(parseSegmentKeyOrder('speaker-a:u3')).toBe(3)
      expect(parseSegmentKeyOrder('speaker-a:123')).toBe(123)
    })

    it('should return null for unparseable keys', () => {
      expect(parseSegmentKeyOrder('')).toBeNull()
      expect(parseSegmentKeyOrder('foo')).toBeNull()
      expect(parseSegmentKeyOrder('speaker-a:utt_1')).toBeNull()
    })
  })

  describe('isSegmentKeyRollback', () => {
    it('should detect rollback when both keys are comparable', () => {
      expect(isSegmentKeyRollback('u3', 'u2')).toBe(true)
      expect(isSegmentKeyRollback('speaker:u3', 'speaker:u2')).toBe(true)
      expect(isSegmentKeyRollback('10', '9')).toBe(true)
    })

    it('should not treat equal/forward as rollback', () => {
      expect(isSegmentKeyRollback('u2', 'u2')).toBe(false)
      expect(isSegmentKeyRollback('u2', 'u3')).toBe(false)
      expect(isSegmentKeyRollback('1', '2')).toBe(false)
    })

    it('should return false when keys are not comparable', () => {
      expect(isSegmentKeyRollback('utt_a', 'utt_b')).toBe(false)
      expect(isSegmentKeyRollback('u2', 'utt_b')).toBe(false)
      expect(isSegmentKeyRollback(null, 'u1')).toBe(false)
      expect(isSegmentKeyRollback('u1', null)).toBe(false)
    })
  })
})
