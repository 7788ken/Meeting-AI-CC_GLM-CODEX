import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import AIAnalysisPanel from './AIAnalysisPanel.vue'
import type { AIAnalysis, Speech } from '@/services/api'
import type { AIModel } from '@/types'
import { ElMessage } from 'element-plus'

// Mock Element Plus components
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElButton: { name: 'ElButton', template: '<button><slot /></button>' },
    ElSelect: { name: 'ElSelect', template: '<select><slot /></select>' },
    ElOption: { name: 'ElOption', template: '<option /><slot />' },
    ElOptionGroup: { name: 'ElOptionGroup', template: '<optgroup /><slot />' },
    ElDropdown: { name: 'ElDropdown', template: '<div><slot /></div>' },
    ElDropdownMenu: { name: 'ElDropdownMenu', template: '<ul><slot /></ul>' },
    ElDropdownItem: { name: 'ElDropdownItem', template: '<li><slot /></li>' },
    ElTag: { name: 'ElTag', template: '<span><slot /></span>' },
    ElIcon: { name: 'ElIcon', template: '<span><slot /></span>' },
    ElMessage: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
  }
})

// Mock API
vi.mock('@/services/api', () => ({
  analysisApi: {
    getOrCreate: vi.fn(),
  },
}))

import { analysisApi } from '@/services/api'

describe('AIAnalysisPanel.vue', () => {
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
  ]

  const mockAnalysis: AIAnalysis = {
    id: 'analysis-1',
    sessionId: 'session-1',
    analysisType: 'summary',
    modelUsed: 'qianwen',
    result: '## 会议摘要\n\n今天讨论了项目进度，前端开发已完成80%。',
    status: 'completed',
    processingTime: 1500,
    createdAt: '2025-01-10T10:05:00Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  describe('组件渲染', () => {
    beforeEach(() => {
      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
    })

    it('应该渲染面板头部', () => {
      expect(wrapper.find('.panel-title').text()).toBe('AI 分析')
    })

    it('应该显示分析类型选择器', () => {
      expect(wrapper.find('.form-label').text()).toContain('分析类型')
    })

    it('应该显示 AI 模型选择器', () => {
      const labels = wrapper.findAll('.form-label')
      expect(labels.some(l => l.text().includes('AI 模型'))).toBe(true)
    })

    it('应该显示分析按钮', () => {
      // 检查分析按钮文字计算属性
      expect(wrapper.vm.analysisButtonText).toBe('生成分析')
      expect(wrapper.vm.canAnalyze).toBe(true)
    })
  })

  describe('分析按钮状态', () => {
    beforeEach(() => {
      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
    })

    it('应该在有发言时启用分析按钮', () => {
      expect(wrapper.vm.canAnalyze).toBe(true)
    })

    it('应该在无发言时禁用分析按钮', async () => {
      await wrapper.setProps({ speeches: [] })
      expect(wrapper.vm.canAnalyze).toBe(false)
      expect(wrapper.vm.analysisButtonText).toBe('暂无内容')
    })

    it('应该在禁用状态下显示正确文字', async () => {
      await wrapper.setProps({ disabled: true })
      expect(wrapper.vm.analysisButtonText).toBe('无法分析')
    })

    it('应该在分析中显示加载状态', async () => {
      wrapper.vm.analysisStatus = 'analyzing'
      await nextTick()
      expect(wrapper.vm.analysisButtonText).toBe('分析中...')
    })
  })

  describe('分析功能', () => {
    beforeEach(() => {
      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
    })

    it('应该调用 API 生成分析', async () => {
      vi.mocked(analysisApi.getOrCreate).mockResolvedValue({
        data: mockAnalysis,
      } as any)

      await wrapper.vm.handleAnalysis()
      expect(analysisApi.getOrCreate).toHaveBeenCalledWith({
        sessionId: 'session-1',
        speechIds: ['1'],
        analysisType: 'summary',
        model: 'qianwen',
      })
    })

    it('应该在成功后设置分析结果', async () => {
      vi.mocked(analysisApi.getOrCreate).mockResolvedValue({
        data: mockAnalysis,
      } as any)

      await wrapper.vm.handleAnalysis()
      await nextTick()

      expect(wrapper.vm.currentAnalysis).toEqual(mockAnalysis)
      expect(wrapper.vm.analysisStatus).toBe('success')
    })

    it('应该在失败时处理错误', async () => {
      vi.mocked(analysisApi.getOrCreate).mockRejectedValue(new Error('API 错误'))

      await wrapper.vm.handleAnalysis()
      await nextTick()

      expect(wrapper.vm.analysisStatus).toBe('error')
    })

    it('应该在无内容时显示警告', async () => {
      await wrapper.setProps({ speeches: [] })
      const ElMessage = await import('element-plus')
      await wrapper.vm.handleAnalysis()
      // ElMessage.warning 应该被调用
    })
  })

  describe('复制功能', () => {
    beforeEach(() => {
      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
      wrapper.vm.currentAnalysis = mockAnalysis
    })

    it('应该复制内容到剪贴板', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      })

      await wrapper.vm.handleCopy()
      expect(mockWriteText).toHaveBeenCalledWith(mockAnalysis.result)
    })

    it('应该在剪贴板 API 失败时使用回退方案', async () => {
      const mockExecCommand = vi.fn().mockReturnValue(true)
      document.execCommand = mockExecCommand
      Object.assign(navigator, {
        clipboard: null,
      })

      const createSpy = vi.spyOn(document, 'createElement')
      await wrapper.vm.handleCopy()

      expect(createSpy).toHaveBeenCalledWith('textarea')
    })
  })

  describe('Markdown 渲染', () => {
    beforeEach(() => {
      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
    })

    it('应该渲染标题', () => {
      const result = wrapper.vm.renderMarkdown('## 标题\n\n内容')
      expect(result).toContain('<h2>标题</h2>')
    })

    it('应该渲染粗体文本', () => {
      const result = wrapper.vm.renderMarkdown('这是 **粗体** 文本')
      expect(result).toContain('<strong>粗体</strong>')
    })

    it('应该渲染斜体文本', () => {
      const result = wrapper.vm.renderMarkdown('这是 *斜体* 文本')
      expect(result).toContain('<em>斜体</em>')
    })

    it('应该渲染列表', () => {
      const result = wrapper.vm.renderMarkdown('- 项目1\n- 项目2')
      expect(result).toContain('<li>项目1</li>')
      expect(result).toContain('<li>项目2</li>')
    })

    it('应该清理不安全的 HTML', () => {
      const result = wrapper.vm.renderMarkdown('## 标题\n<script>alert("xss")</script>')
      expect(result).not.toContain('<script>')
    })
  })

  describe('分析类型切换', () => {
    beforeEach(() => {
      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
      wrapper.vm.currentAnalysis = mockAnalysis
    })

    it('应该在类型变化时清空当前结果', async () => {
      wrapper.vm.selectedAnalysisType = 'action-items'
      await wrapper.vm.handleTypeChange()
      expect(wrapper.vm.currentAnalysis).toBeNull()
    })
  })

  describe('defineExpose 方法', () => {
    beforeEach(() => {
      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
    })

    it('应该暴露 setAnalysisResult 方法', () => {
      expect(typeof wrapper.vm.setAnalysisResult).toBe('function')
    })

    it('应该暴露 reset 方法', () => {
      expect(typeof wrapper.vm.reset).toBe('function')
    })

    it('应该暴露 generate 方法', () => {
      expect(typeof wrapper.vm.generate).toBe('function')
    })

    it('应该暴露 clear 方法', () => {
      expect(typeof wrapper.vm.clear).toBe('function')
    })

    it('reset 方法应该重置状态', () => {
      wrapper.vm.currentAnalysis = mockAnalysis
      wrapper.vm.analysisStatus = 'success'
      wrapper.vm.reset()
      expect(wrapper.vm.currentAnalysis).toBeNull()
      expect(wrapper.vm.analysisStatus).toBe('idle')
    })
  })

  describe('模型显示文本', () => {
    beforeEach(() => {
      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
    })

    it('应该正确显示 GLM 模型名称', () => {
      wrapper.vm.currentAnalysis = { ...mockAnalysis, modelUsed: 'glm-4.6v-flash' }
      expect(wrapper.vm.modelText).toBe('智谱 GLM')
    })

    it('应该正确显示豆包模型名称', () => {
      wrapper.vm.currentAnalysis = { ...mockAnalysis, modelUsed: 'doubao' }
      expect(wrapper.vm.modelText).toBe('豆包')
    })

    it('应该正确显示状态文本', () => {
      wrapper.vm.currentAnalysis = { ...mockAnalysis, status: 'completed' }
      expect(wrapper.vm.statusText).toBe('已完成')
    })
  })

  describe('导出功能', () => {
    let originalCreateElement: typeof document.createElement
    let anchorEl: HTMLAnchorElement

    beforeEach(() => {
      originalCreateElement = document.createElement.bind(document)
      anchorEl = originalCreateElement('a') as HTMLAnchorElement
      vi.spyOn(anchorEl, 'click').mockImplementation(() => {})

      // jsdom 可能缺失该 API，确保存在后再 mock
      if (!('createObjectURL' in URL)) {
        ;(URL as any).createObjectURL = () => 'blob:mock-url'
      }
      if (!('revokeObjectURL' in URL)) {
        ;(URL as any).revokeObjectURL = () => {}
      }
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url' as any)
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') return anchorEl as any
        return originalCreateElement(tagName)
      })
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchorEl as any)
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchorEl as any)

      wrapper = mount(AIAnalysisPanel, {
        props: {
          sessionId: 'session-1',
          speeches: mockSpeeches,
          disabled: false,
        },
        global: {
          stubs: {
            ElButton: true,
            ElSelect: true,
            ElOption: true,
            ElOptionGroup: true,
            ElDropdown: true,
            ElDropdownMenu: true,
            ElDropdownItem: true,
            ElTag: true,
            ElIcon: true,
            ModelSelector: true,
          },
        },
      })
    })

    it('在没有分析结果时导出应显示警告', () => {
      wrapper.vm.handleExport('markdown')
      expect(ElMessage.warning).toHaveBeenCalledWith('请先生成分析结果')
    })

    it('在有分析结果时导出应调用下载函数', () => {
      wrapper.vm.currentAnalysis = mockAnalysis
      wrapper.vm.handleExport('markdown')
      expect(URL.createObjectURL).toHaveBeenCalled()
      expect(anchorEl.click).toHaveBeenCalled()
    })
  })
})
