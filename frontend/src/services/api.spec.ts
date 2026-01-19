import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sessionApi, speechApi } from './api'
import { get, post, put, del } from './http'

// Mock http module
vi.mock('./http', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

describe('API Services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sessionApi', () => {
    describe('create', () => {
      it('应该创建会话', async () => {
        vi.mocked(post).mockResolvedValue({
          data: { id: 'session-1', title: '测试会议' },
        })

        const result = await sessionApi.create({ title: '测试会议' })

        expect(post).toHaveBeenCalledWith('/sessions', {
          settings: { title: '测试会议' },
        })
        expect(result.data).toEqual({ id: 'session-1', title: '测试会议' })
      })

      it('应该创建无标题的会话', async () => {
        vi.mocked(post).mockResolvedValue({ data: { id: 'session-1' } })

        await sessionApi.create()

        expect(post).toHaveBeenCalledWith('/sessions', { settings: undefined })
      })
    })

    describe('end', () => {
      it('应该结束会话', async () => {
        vi.mocked(post).mockResolvedValue({ data: { id: 'session-1', isActive: false } })

        const result = await sessionApi.end('session-1')

        expect(post).toHaveBeenCalledWith('/sessions/session-1/end')
        expect(result.data.isActive).toBe(false)
      })
    })

    describe('get', () => {
      it('应该获取会话详情', async () => {
        const mockSession = {
          id: 'session-1',
          title: '测试会议',
          isActive: true,
        }
        vi.mocked(get).mockResolvedValue({ data: mockSession })

        const result = await sessionApi.get('session-1')

        expect(get).toHaveBeenCalledWith('/sessions/session-1')
        expect(result.data).toEqual(mockSession)
      })
    })

    describe('list', () => {
      it('应该获取会话列表', async () => {
        const mockSessions = [
          { id: 'session-1', title: '会议1' },
          { id: 'session-2', title: '会议2' },
        ]
        vi.mocked(get).mockResolvedValue({ data: mockSessions })

        const result = await sessionApi.list()

        expect(get).toHaveBeenCalledWith('/sessions')
        expect(result.data).toEqual(mockSessions)
      })
    })

    describe('updateStatus', () => {
      it('应该更新会话状态', async () => {
        vi.mocked(put).mockResolvedValue({ data: { id: 'session-1', status: 'paused' } })

        await sessionApi.updateStatus('session-1', 'paused')

        expect(put).toHaveBeenCalledWith('/sessions/session-1/status', { status: 'paused' })
      })
    })
  })

  describe('speechApi', () => {
    describe('create', () => {
      it('应该创建发言记录', async () => {
        const speechData = {
          sessionId: 'session-1',
          content: '测试内容',
        }
        vi.mocked(post).mockResolvedValue({
          data: { id: 'speech-1', ...speechData },
        })

        const result = await speechApi.create(speechData)

        expect(post).toHaveBeenCalledWith('/speeches', speechData)
        expect(result.data.id).toBe('speech-1')
      })
    })

    describe('batchCreate', () => {
      it('应该批量创建发言记录', async () => {
        const speechesData = [{ content: '发言1' }, { content: '发言2' }]
        vi.mocked(post).mockResolvedValue({
          data: [{ id: 'speech-1' }, { id: 'speech-2' }],
        })

        const result = await speechApi.batchCreate(speechesData)

        expect(post).toHaveBeenCalledWith('/speeches/batch', speechesData)
        expect(result.data).toHaveLength(2)
      })
    })

    describe('get', () => {
      it('应该获取发言详情', async () => {
        const mockSpeech = { id: 'speech-1', content: '测试内容' }
        vi.mocked(get).mockResolvedValue({ data: mockSpeech })

        const result = await speechApi.get('speech-1')

        expect(get).toHaveBeenCalledWith('/speeches/speech-1')
        expect(result.data).toEqual(mockSpeech)
      })
    })

    describe('list', () => {
      it('应该获取会话的所有发言', async () => {
        const mockSpeeches = [
          { id: 'speech-1', content: '发言1' },
          { id: 'speech-2', content: '发言2' },
        ]
        vi.mocked(get).mockResolvedValue({ data: mockSpeeches })

        const result = await speechApi.list('session-1')

        expect(get).toHaveBeenCalledWith('/speeches/session/session-1')
        expect(result.data).toEqual(mockSpeeches)
      })
    })

    describe('search', () => {
      it('应该搜索发言记录', async () => {
        const mockSpeeches = [{ id: 'speech-1', content: '包含关键词的发言' }]
        vi.mocked(get).mockResolvedValue({ data: mockSpeeches })

        const result = await speechApi.search('session-1', '关键词')

        expect(get).toHaveBeenCalledWith(
          `/speeches/session/session-1/search?keyword=${encodeURIComponent('关键词')}`
        )
        expect(result.data).toEqual(mockSpeeches)
      })

      it('应该对搜索关键词进行 URL 编码', async () => {
        vi.mocked(get).mockResolvedValue({ data: [] })

        await speechApi.search('session-1', '搜索 空格')

        expect(get).toHaveBeenCalledWith(
          `/speeches/session/session-1/search?keyword=${encodeURIComponent('搜索 空格')}`
        )
      })
    })

    describe('update', () => {
      it('应该更新发言', async () => {
        const updateData = { content: '更新后的内容', isEdited: true }
        vi.mocked(put).mockResolvedValue({
          data: { id: 'speech-1', ...updateData },
        })

        const result = await speechApi.update('speech-1', updateData)

        expect(put).toHaveBeenCalledWith('/speeches/speech-1', updateData)
        expect(result.data.content).toBe('更新后的内容')
      })
    })

    describe('toggleMark', () => {
      it('应该标记发言', async () => {
        vi.mocked(put).mockResolvedValue({
          data: { id: 'speech-1', isMarked: true },
        })

        const result = await speechApi.toggleMark('speech-1', true, '重要内容')

        expect(put).toHaveBeenCalledWith('/speeches/speech-1/mark', {
          marked: true,
          reason: '重要内容',
        })
        expect(result.data.isMarked).toBe(true)
      })

      it('应该取消标记发言', async () => {
        vi.mocked(put).mockResolvedValue({
          data: { id: 'speech-1', isMarked: false },
        })

        await speechApi.toggleMark('speech-1', false)

        expect(put).toHaveBeenCalledWith('/speeches/speech-1/mark', {
          marked: false,
          reason: undefined,
        })
      })
    })

    describe('deleteBySession', () => {
      it('应该删除会话的所有发言', async () => {
        vi.mocked(del).mockResolvedValue({ data: { success: true } })

        await speechApi.deleteBySession('session-1')

        expect(del).toHaveBeenCalledWith('/speeches/session/session-1')
      })
    })
  })
})
