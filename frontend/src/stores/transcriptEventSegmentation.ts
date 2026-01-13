import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  transcriptEventSegmentationApi,
  type TranscriptEventSegment,
} from '@/services/api'
import { websocket, type TranscriptMessage, type TranscriptEventSegmentationProgressData } from '@/services/websocket'

export const useTranscriptEventSegmentationStore = defineStore('transcriptEventSegmentation', () => {
  const sessionId = ref<string>('')
  const segments = ref<TranscriptEventSegment[]>([])
  const progress = ref<TranscriptEventSegmentationProgressData | null>(null)
  const isLoadingSnapshot = ref(false)

  const hasSegments = computed(() => segments.value.length > 0)
  const latestProcessedEventIndex = computed(() => {
    if (!segments.value.length) return null
    return segments.value.reduce((max, item) => Math.max(max, item.sourceEndEventIndex ?? -1), -1)
  })
  const pointerEventIndex = computed(() => progress.value?.pointerEventIndex ?? latestProcessedEventIndex.value)
  const isInFlight = computed(() => {
    const stage = progress.value?.stage
    if (!stage) return false
    return stage === 'queued' || stage === 'calling_llm' || stage === 'parsing' || stage === 'persisting'
  })

  let messageHandler: ((message: TranscriptMessage) => void) | null = null

  async function loadSnapshot(targetSessionId: string): Promise<void> {
    if (!targetSessionId) {
      reset()
      return
    }

    sessionId.value = targetSessionId
    try {
      isLoadingSnapshot.value = true
      const response = await transcriptEventSegmentationApi.getSnapshot(targetSessionId)
      const snapshot = response.data
      if (!snapshot) return

      segments.value = (snapshot.segments ?? []).slice().sort(sortBySequenceDesc)
    } finally {
      isLoadingSnapshot.value = false
    }
  }

  function bindWebSocket(): void {
    if (messageHandler) {
      unbindWebSocket()
    }

    messageHandler = (message: TranscriptMessage) => {
      if (message.type === 'transcript_event_segment_upsert') {
        if (!message.data?.sessionId) return
        if (sessionId.value && message.data.sessionId !== sessionId.value) return
        applyUpsert(message.data)
        return
      }

      if (message.type === 'transcript_event_segment_reset') {
        const targetSessionId = message.data?.sessionId
        if (!targetSessionId) return
        if (sessionId.value && targetSessionId !== sessionId.value) return
        clearSegments()
        void loadSnapshot(targetSessionId)
        return
      }

      if (message.type === 'transcript_event_segmentation_progress') {
        if (!message.data?.sessionId) return
        if (sessionId.value && message.data.sessionId !== sessionId.value) return
        progress.value = message.data
      }
    }

    websocket.onMessage(messageHandler)
  }

  function unbindWebSocket(): void {
    if (messageHandler) {
      websocket.offMessage(messageHandler)
      messageHandler = null
    }
  }

  function applyUpsert(segment: TranscriptEventSegment): void {
    if (!segment) return
    const index = segments.value.findIndex(item =>
      item.id ? item.id === segment.id : item.sequence === segment.sequence
    )
    if (index >= 0) {
      segments.value[index] = segment
    } else {
      segments.value.unshift(segment)
    }
    segments.value = segments.value.slice().sort(sortBySequenceDesc)
  }

  function clearSegments(): void {
    segments.value = []
    progress.value = null
  }

  function reset(): void {
    unbindWebSocket()
    sessionId.value = ''
    segments.value = []
    progress.value = null
    isLoadingSnapshot.value = false
  }

  function sortBySequenceDesc(a: TranscriptEventSegment, b: TranscriptEventSegment): number {
    return (b.sequence ?? 0) - (a.sequence ?? 0)
  }

  return {
    sessionId,
    segments,
    progress,
    hasSegments,
    pointerEventIndex,
    isInFlight,
    isLoadingSnapshot,
    loadSnapshot,
    bindWebSocket,
    clearSegments,
    reset,
  }
})
