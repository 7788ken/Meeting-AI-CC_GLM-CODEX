import { Injectable } from '@nestjs/common'

const RECORDING_ACTIVE_WINDOW_MS = 30_000

@Injectable()
export class SessionActivityService {
  private readonly recordingClientsBySession = new Map<string, Set<string>>()
  private readonly lastAudioAtBySession = new Map<string, number>()
  private readonly lastActivityAtBySession = new Map<string, number>()

  markRecordingStart(sessionId: string, clientId: string): void {
    const normalizedSessionId = sessionId.trim()
    const normalizedClientId = clientId.trim()
    if (!normalizedSessionId || !normalizedClientId) return

    const clients = this.recordingClientsBySession.get(normalizedSessionId) ?? new Set<string>()
    clients.add(normalizedClientId)
    this.recordingClientsBySession.set(normalizedSessionId, clients)
    this.lastAudioAtBySession.set(normalizedSessionId, Date.now())
    this.recordActivity(normalizedSessionId)
  }

  recordAudio(sessionId: string, clientId: string): void {
    this.markRecordingStart(sessionId, clientId)
  }

  recordActivity(sessionId: string, at = Date.now()): void {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) return
    if (!Number.isFinite(at) || at <= 0) return
    this.lastActivityAtBySession.set(normalizedSessionId, at)
  }

  markRecordingStop(sessionId: string, clientId: string): void {
    const normalizedSessionId = sessionId.trim()
    const normalizedClientId = clientId.trim()
    if (!normalizedSessionId || !normalizedClientId) return

    const clients = this.recordingClientsBySession.get(normalizedSessionId)
    if (!clients) return

    this.recordActivity(normalizedSessionId)
    clients.delete(normalizedClientId)
    if (clients.size === 0) {
      this.recordingClientsBySession.delete(normalizedSessionId)
      this.lastAudioAtBySession.delete(normalizedSessionId)
    }
  }

  getLastActivityAt(sessionId: string): Date | null {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) return null
    const lastActivityAt = this.lastActivityAtBySession.get(normalizedSessionId)
    if (!lastActivityAt) return null
    return new Date(lastActivityAt)
  }

  isRecording(sessionId: string, now = Date.now()): boolean {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) return false

    const clients = this.recordingClientsBySession.get(normalizedSessionId)
    if (!clients || clients.size === 0) return false

    const lastAudioAt = this.lastAudioAtBySession.get(normalizedSessionId)
    if (!lastAudioAt) return false

    return now - lastAudioAt <= RECORDING_ACTIVE_WINDOW_MS
  }
}
