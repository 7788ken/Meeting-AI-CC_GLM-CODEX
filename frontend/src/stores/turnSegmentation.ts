import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { turnSegmentationApi, type TurnSegmentRange } from '@/services/api'
import { websocket, type TranscriptMessage } from '@/services/websocket'

export const useTurnSegmentationStore = defineStore('turnSegmentation', () => {
  const sessionId = ref<string>('')
  const targetRevision = ref<number>(0)
  const revision = ref<number>(0)
  const status = ref<'processing' | 'completed' | 'failed'>('completed')
  const segments = ref<TurnSegmentRange[]>([])
  const error = ref<string>('')

  const hasSegments = computed(() => segments.value.length > 0)

  let bound = false

  async function loadSnapshot(targetSessionId: string): Promise<void> {
    if (!targetSessionId) {
      reset()
      return
    }

    sessionId.value = targetSessionId
    const response = await turnSegmentationApi.getSnapshot(targetSessionId)
    const snapshot = response.data
    if (!snapshot) return

    revision.value = snapshot.revision ?? 0
    targetRevision.value = snapshot.targetRevision ?? 0
    status.value = snapshot.status ?? 'completed'
    segments.value = snapshot.segments ?? []
    error.value = snapshot.error ?? ''
  }

  function bindWebSocket(): void {
    if (bound) return
    bound = true

    websocket.onMessage((message: TranscriptMessage) => {
      if (message.type !== 'turn_segments_upsert') return
      if (!message.data?.sessionId) return
      if (sessionId.value && message.data.sessionId !== sessionId.value) return
      applyUpsert(message.data)
    })
  }

  function applyUpsert(data: {
    sessionId: string
    revision: number
    status: 'processing' | 'completed' | 'failed'
    segments?: TurnSegmentRange[]
    error?: string
  }): void {
    if (!data) return
    targetRevision.value = Math.max(targetRevision.value, Number(data.revision) || 0)
    status.value = data.status

    if (data.status === 'completed' && Array.isArray(data.segments)) {
      revision.value = Math.max(revision.value, Number(data.revision) || 0)
      segments.value = data.segments
      error.value = ''
      return
    }

    if (data.status === 'failed') {
      error.value = data.error || '分段失败'
    }
  }

  function reset(): void {
    sessionId.value = ''
    targetRevision.value = 0
    revision.value = 0
    status.value = 'completed'
    segments.value = []
    error.value = ''
  }

  return {
    sessionId,
    targetRevision,
    revision,
    status,
    segments,
    error,
    hasSegments,
    loadSnapshot,
    bindWebSocket,
    reset,
  }
})
