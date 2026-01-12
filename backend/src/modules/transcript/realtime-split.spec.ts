import {
  normalizeTranscriptContent,
  shouldSplitByContent,
  shouldSplitBySegmentKeyChange,
} from './realtime-split'

describe('realtime-split', () => {
  describe('normalizeTranscriptContent', () => {
    it('should trim, collapse spaces, and drop trailing punctuation', () => {
      expect(normalizeTranscriptContent('  你好   世界。  ')).toBe('你好 世界')
      expect(normalizeTranscriptContent('测试!!!')).toBe('测试')
      expect(normalizeTranscriptContent('测试，')).toBe('测试')
    })
  })

  describe('shouldSplitBySegmentKeyChange', () => {
    it('should not split when content is identical after normalization', () => {
      expect(shouldSplitBySegmentKeyChange('次次转写。', '次次转写')).toBe(false)
    })

    it('should not split on prefix corrections', () => {
      expect(shouldSplitBySegmentKeyChange('不过可能', '不过可能偶尔')).toBe(false)
      expect(shouldSplitBySegmentKeyChange('不过可能偶尔', '不过可能')).toBe(false)
    })

    it('should split when content differs substantially', () => {
      expect(shouldSplitBySegmentKeyChange('你好世界', '明天开会')).toBe(true)
    })
  })

  describe('shouldSplitByContent', () => {
    it('should remain conservative for short texts', () => {
      expect(shouldSplitByContent('不过可能', '不过')).toBe(false)
    })
  })
})

