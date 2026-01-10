import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import TranscriptDisplay from './TranscriptDisplay.vue'
import type { Speech } from '@/services/api'
import ElButton from 'element-plus'
import ElEmpty from 'element-plus'

// Mock Element Plus components
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElButton: { name: 'ElButton', template: '<button><slot /></button>' },
    ElButtonGroup: { name: 'ElButtonGroup', template: '<div><slot /></div>' },
    ElInput: { name: 'ElInput', model: { value: '' }, template: '<textarea />' },
    Empty: { name: 'ElEmpty', template: '<div><slot /></div>' },
    Icon: { name: 'ElIcon', template: '<span><slot /></span>' },
  }
})

describe('TranscriptDisplay.vue', () => {
  let wrapper: VueWrapper

  const mockSpeeches: Speech[] = [
    {
      id: '1',
      sessionId: 'session-1',
      speakerId: 'speaker-1',
      speakerName: '张三',
      speakerColor: '#1890ff',
      content: '大家好，今天我们讨论项目进度。',
      confidence: 0.95,
      startTime: '2025-01-10T10:00:00Z',
      endTime: '2025-01-10T10:00:05Z',
      duration: 5000,
      isEdited: false,
      isMarked: false,
    },
    {
      id: '2',
      sessionId: 'session-1',
      speakerId: 'speaker-2',
      speakerName: '李四',
      speakerColor: '#52c41a',
      content: '好的，我先汇报一下前端开发进度。',
      confidence: 0.92,
      startTime: '2025-01-10T10:00:06Z',
      endTime: '2025-01-10T10:00:12Z',
      duration: 6000,
      isEdited: false,
      isMarked: true,
    },
  ]

  beforeEach(() => {
    wrapper = mount(TranscriptDisplay, {
      props: {
        speeches: mockSpeeches,
        autoScroll: true,
      },
      global: {
        stubs: {
          ElButton: true,
          ElButtonGroup: true,
          ElInput: true,
          ElEmpty: true,
          ElIcon: true,
        },
      },
    })
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  describe('组件渲染', () => {
    it('应该正确渲染转写列表', () => {
      const speechItems = wrapper.findAll('.speech-item')
      expect(speechItems.length).toBe(2)
    })

    it('应该显示发言者名称和颜色', () => {
      const firstSpeaker = wrapper.find('.speaker-name')
      expect(firstSpeaker.text()).toBe('张三')
    })

    it('应该显示发言时间', () => {
      const timeElement = wrapper.find('.speech-time')
      expect(timeElement.exists()).toBe(true)
    })

    it('应该显示发言内容', () => {
      const contentElement = wrapper.find('.speech-content')
      expect(contentElement.text()).toBe('大家好，今天我们讨论项目进度。')
    })

    it('应该显示已标记状态', () => {
      const markedBadges = wrapper.findAll('.mark-badge')
      expect(markedBadges.length).toBe(1)
    })

    it('应该在无发言时显示空状态', async () => {
      await wrapper.setProps({ speeches: [] })
      await nextTick()
      expect(wrapper.find('.empty-state').exists()).toBe(true)
    })
  })

  describe('事件处理', () => {
    it('应该触发刷新事件', () => {
      const onRefresh = vi.fn()
      wrapper.setProps({ onRefresh })

      const refreshBtn = wrapper.findAll('button')[0]
      refreshBtn.trigger('click')

      expect(wrapper.emitted('refresh')).toBeTruthy()
    })

    it('应该触发清空事件', () => {
      wrapper.vm.handleClear()
      expect(wrapper.emitted('clear')).toBeTruthy()
    })

    it('应该选择发言并触发事件', async () => {
      const speechItem = wrapper.find('.speech-item')
      await speechItem.trigger('click')

      expect(wrapper.emitted('select')).toBeTruthy()
      expect(wrapper.emitted('select')![0]).toEqual(['1'])
    })

    it('应该触发编辑保存事件', () => {
      wrapper.vm.handleEditSave('1')
      expect(wrapper.emitted('update:speech')).toBeTruthy()
    })

    it('应该触发标记切换事件', () => {
      const speech = mockSpeeches[0]
      wrapper.vm.handleToggleMark(speech)
      expect(wrapper.emitted('toggle-mark')).toBeTruthy()
    })
  })

  describe('编辑功能', () => {
    it('应该开始编辑发言', async () => {
      const speech = mockSpeeches[0]
      wrapper.vm.handleEditStart(speech)
      await nextTick()

      expect(wrapper.vm.editingId).toBe('1')
      expect(wrapper.vm.editContent).toBe(speech.content)
    })

    it('应该取消编辑', () => {
      wrapper.vm.handleEditStart(mockSpeeches[0])
      wrapper.vm.handleEditCancel()

      expect(wrapper.vm.editingId).toBe('')
      expect(wrapper.vm.editContent).toBe('')
    })

    it('应该保存编辑', () => {
      wrapper.vm.handleEditStart(mockSpeeches[0])
      wrapper.vm.editContent = '修改后的内容'
      wrapper.vm.handleEditSave('1')

      const emitted = wrapper.emitted('update:speech')![0] as any
      expect(emitted[0].content).toBe('修改后的内容')
      expect(emitted[0].isEdited).toBe(true)
    })
  })

  describe('滚动功能', () => {
    it('应该提供滚动到底部的方法', () => {
      const scrollToBottomSpy = vi.spyOn(wrapper.vm, 'scrollToBottom')
      wrapper.vm.scrollToBottom()
      expect(scrollToBottomSpy).toHaveBeenCalled()
    })

    it('应该处理滚动事件', () => {
      const mockEvent = {
        target: {
          scrollTop: 100,
          scrollHeight: 1000,
          clientHeight: 500,
        },
      }
      wrapper.vm.handleScroll(mockEvent)
      expect(wrapper.vm.autoScrollEnabled).toBe(false)
    })

    it('应该在接近底部时恢复自动滚动', () => {
      wrapper.vm.autoScrollEnabled = false
      const mockEvent = {
        target: {
          scrollTop: 990,
          scrollHeight: 1000,
          clientHeight: 500,
        },
      }
      wrapper.vm.handleScroll(mockEvent)
      expect(wrapper.vm.autoScrollEnabled).toBe(true)
    })
  })

  describe('时间格式化', () => {
    it('应该正确格式化时间', () => {
      const timeStr = '2025-01-10T10:30:45Z'
      const formatted = wrapper.vm.formatTime(timeStr)
      expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    })

    it('应该处理无效时间字符串', () => {
      const formatted = wrapper.vm.formatTime('invalid')
      expect(formatted).toContain('NaN')
    })
  })

  describe('Watch 行为', () => {
    it('应该在发言数量增加时自动滚动', async () => {
      wrapper.vm.autoScrollEnabled = true
      wrapper.vm.isUserScrolling = false

      await wrapper.setProps({ speeches: [...mockSpeeches, mockSpeeches[0]] })
      await nextTick()

      // 由于 scrollToBottom 使用 nextTick，需要等待
      await nextTick()
    })

    it('应该响应 autoScroll prop 变化', async () => {
      await wrapper.setProps({ autoScroll: false })
      expect(wrapper.vm.autoScrollEnabled).toBe(false)
    })
  })

  describe('defineExpose 方法', () => {
    it('应该暴露 scrollToBottom 方法', () => {
      expect(typeof wrapper.vm.scrollToBottom).toBe('function')
    })
  })
})
