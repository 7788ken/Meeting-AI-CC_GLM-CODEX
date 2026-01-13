import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { transcriptStreamApi, type TranscriptEvent } from '@/services/api'
import { websocket, type TranscriptMessage } from '@/services/websocket'

type TranscriptEventTiming = {
  firstAsrTimestampMs: number
  lastAsrTimestampMs: number
}

export const useTranscriptStreamStore = defineStore('transcriptStream', () => {
  const sessionId = ref<string>('')
  const revision = ref<number>(0)
  const nextEventIndex = ref<number>(0)
  const eventsByIndex = ref<Map<number, TranscriptEvent>>(new Map())
  // 按 segmentKey 分组，用于流式显示：同一 segmentKey 只显示最新一条
  const eventsByKey = ref<Map<string, TranscriptEvent>>(new Map())
  const timingByIndex = ref<Map<number, TranscriptEventTiming>>(new Map())

  // 流式显示：按 segmentKey 分组后的最新结果
  const events = computed(() =>
    Array.from(eventsByKey.value.values()).sort((a, b) => a.eventIndex - b.eventIndex)
  )

  let messageHandler: ((message: TranscriptMessage) => void) | null = null

  async function loadSnapshot(targetSessionId: string): Promise<void> {
    if (!targetSessionId) {
      reset()
      return
    }

    sessionId.value = targetSessionId
    const response = await transcriptStreamApi.getSnapshot(targetSessionId)
    const snapshot = response.data
    if (!snapshot) return

    revision.value = snapshot.revision ?? 0
    nextEventIndex.value = snapshot.nextEventIndex ?? 0

    const indexMap = new Map<number, TranscriptEvent>()
    const keyMap = new Map<string, TranscriptEvent>()
    const timingMap = new Map<number, TranscriptEventTiming>()
    for (const event of snapshot.events || []) {
      indexMap.set(event.eventIndex, event)
      // 按 segmentKey 分组：同一 key 只保留最新的（eventIndex 最大的）
      const key = event.segmentKey || `idx_${event.eventIndex}`
      const existing = keyMap.get(key)
      if (!existing || event.eventIndex > existing.eventIndex) {
        keyMap.set(key, event)
      }

      if (typeof event.asrTimestampMs === 'number' && Number.isFinite(event.asrTimestampMs)) {
        timingMap.set(event.eventIndex, {
          firstAsrTimestampMs: event.asrTimestampMs,
          lastAsrTimestampMs: event.asrTimestampMs,
        })
      }
    }
    eventsByIndex.value = indexMap
    eventsByKey.value = keyMap
    timingByIndex.value = timingMap
  }

  function bindWebSocket(): void {
    // 如果已经绑定，先解绑
    if (messageHandler) {
      unbindWebSocket()
    }

    messageHandler = (message: TranscriptMessage) => {
      if (message.type !== 'transcript_event_upsert') return
      if (!message.data?.sessionId) return
      if (sessionId.value && message.data.sessionId !== sessionId.value) return
      applyUpsert(message.data.revision, message.data.event)
    }

    websocket.onMessage(messageHandler)
  }

  function unbindWebSocket(): void {
    if (messageHandler) {
      websocket.offMessage(messageHandler)
      messageHandler = null
    }
  }

  function applyUpsert(nextRevision: number, event: TranscriptEvent): void {
    if (!event) return
    revision.value = Math.max(revision.value, Number(nextRevision) || 0)
    eventsByIndex.value.set(event.eventIndex, event)

    // 按 segmentKey 流式更新：同一 key 只保留最新的
    const key = event.segmentKey || `idx_${event.eventIndex}`
    eventsByKey.value.set(key, event)

    if (typeof event.asrTimestampMs === 'number' && Number.isFinite(event.asrTimestampMs)) {
      const existing = timingByIndex.value.get(event.eventIndex)
      if (!existing) {
        timingByIndex.value.set(event.eventIndex, {
          firstAsrTimestampMs: event.asrTimestampMs,
          lastAsrTimestampMs: event.asrTimestampMs,
        })
      } else {
        existing.lastAsrTimestampMs = event.asrTimestampMs
      }
    }
  }

  function getEventDurationMs(eventIndex: number): number | null {
    const event = eventsByIndex.value.get(eventIndex)
    if (event && typeof event.audioDurationMs === 'number' && Number.isFinite(event.audioDurationMs)) {
      const normalized = Math.max(0, Math.floor(event.audioDurationMs))
      return normalized > 0 ? normalized : null
    }

    const timing = timingByIndex.value.get(eventIndex)
    if (!timing) return null
    const duration = timing.lastAsrTimestampMs - timing.firstAsrTimestampMs
    if (!Number.isFinite(duration) || duration < 0) return null
    return duration
  }

  function getTextByRange(startEventIndex: number, endEventIndex: number): string {
    const start = Math.max(0, Math.floor(Number(startEventIndex) || 0))
    const end = Math.max(start, Math.floor(Number(endEventIndex) || 0))

    const parts: string[] = []
    for (let idx = start; idx <= end; idx += 1) {
      const event = eventsByIndex.value.get(idx)
      if (event?.content) parts.push(event.content)
    }
    return parts.join('')
  }

  function reset(): void {
    unbindWebSocket()
    sessionId.value = ''
    revision.value = 0
    nextEventIndex.value = 0
    eventsByIndex.value = new Map()
    eventsByKey.value = new Map()
    timingByIndex.value = new Map()
  }

  return {
    sessionId,
    revision,
    nextEventIndex,
    events,
    loadSnapshot,
    bindWebSocket,
    getEventDurationMs,
    getTextByRange,
    reset,
  }
})
