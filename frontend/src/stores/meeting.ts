import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Speech {
  id: string
  sessionId: string
  speakerId: string
  speakerName: string
  content: string
  startTime: Date
  endTime: Date
  confidence: number
  isEdited: boolean
  isMarked: boolean
}

export interface AIAnalysis {
  id: string
  speechId: string
  coreAnalysis: string
  briefAnswer: string
  deepAnswer: string
  modelUsed: string
  generatedAt: Date
}

export interface Session {
  id: string
  startedAt: Date
  endedAt: Date | null
  duration: number | null
  isActive: boolean
}

export const useMeetingStore = defineStore('meeting', () => {
  // 状态
  const currentSession = ref<Session | null>(null)
  const speeches = ref<Speech[]>([])
  const analyses = ref<Map<string, AIAnalysis>>(new Map())
  const isRecording = ref(false)
  const selectedSpeechId = ref<string | null>(null)

  // 计算属性
  const activeSpeeches = computed(() =>
    speeches.value.filter((s) => !s.content.includes('[转写中]'))
  )

  const selectedAnalysis = computed(() => {
    if (!selectedSpeechId.value) return null
    return analyses.value.get(selectedSpeechId.value) || null
  })

  // 操作
  function createSession() {
    const session: Session = {
      id: generateId(),
      startedAt: new Date(),
      endedAt: null,
      duration: null,
      isActive: true,
    }
    currentSession.value = session
    return session
  }

  function endSession() {
    if (currentSession.value) {
      currentSession.value.endedAt = new Date()
      currentSession.value.duration =
        currentSession.value.endedAt.getTime() - currentSession.value.startedAt.getTime()
      currentSession.value.isActive = false
    }
  }

  function addSpeech(speech: Omit<Speech, 'id'>) {
    const newSpeech: Speech = {
      ...speech,
      id: generateId(),
    }
    speeches.value.push(newSpeech)
    return newSpeech
  }

  function updateSpeech(id: string, updates: Partial<Speech>) {
    const index = speeches.value.findIndex((s) => s.id === id)
    if (index !== -1) {
      speeches.value[index] = { ...speeches.value[index], ...updates }
    }
  }

  function setAnalysis(speechId: string, analysis: AIAnalysis) {
    analyses.value.set(speechId, analysis)
  }

  function selectSpeech(id: string | null) {
    selectedSpeechId.value = id
  }

  function clearSession() {
    currentSession.value = null
    speeches.value = []
    analyses.value.clear()
    selectedSpeechId.value = null
  }

  function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  return {
    // 状态
    currentSession,
    speeches,
    isRecording,
    selectedSpeechId,
    // 计算属性
    activeSpeeches,
    selectedAnalysis,
    // 操作
    createSession,
    endSession,
    addSpeech,
    updateSpeech,
    setAnalysis,
    selectSpeech,
    clearSession,
  }
})
