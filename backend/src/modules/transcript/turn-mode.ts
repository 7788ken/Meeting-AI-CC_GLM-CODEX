export type TurnModeConfig = {
  gapMs: number
  silenceRmsThreshold: number
  minFinalizeVoicedMs: number
  minEmbeddingVoicedMs: number
}

export type TurnDetectionResult = {
  shouldStartTurn: boolean
  shouldFinalizeTurn: boolean
}

export type TurnAudioSnapshot = {
  pcm: Buffer
  voicedMs: number
}

export function getDefaultTurnModeConfig(): TurnModeConfig {
  const legacyMinVoicedMs = readNumberFromEnv(
    'TRANSCRIPT_TURN_MIN_VOICED_MS',
    900,
    value => value >= 0
  )

  return {
    gapMs: readNumberFromEnv('TRANSCRIPT_TURN_GAP_MS', 1000, value => value >= 200),
    silenceRmsThreshold: readNumberFromEnv(
      'TRANSCRIPT_TURN_SILENCE_RMS_TH',
      550,
      value => value >= 0
    ),
    minFinalizeVoicedMs: readNumberFromEnv(
      'TRANSCRIPT_TURN_MIN_FINALIZE_VOICED_MS',
      250,
      value => value >= 0
    ),
    minEmbeddingVoicedMs: readNumberFromEnv(
      'TRANSCRIPT_TURN_MIN_EMBEDDING_VOICED_MS',
      legacyMinVoicedMs,
      value => value >= 0
    ),
  }
}

export class TurnDetector {
  private started = false
  private lastNonSilentAtMs: number | null = null
  private voicedMs = 0
  private readonly voicedBuffers: Buffer[] = []

  constructor(private readonly config: TurnModeConfig) {}

  pushPcmChunk(chunk: Buffer, nowMs: number): TurnDetectionResult {
    const isSilent = isSilentPcm16le(chunk, this.config.silenceRmsThreshold)

    if (!this.started) {
      if (isSilent) {
        return { shouldStartTurn: false, shouldFinalizeTurn: false }
      }
      this.started = true
      this.lastNonSilentAtMs = nowMs
      this.voicedMs += estimatePcm16leDurationMs(chunk)
      this.voicedBuffers.push(chunk)
      return { shouldStartTurn: true, shouldFinalizeTurn: false }
    }

    if (!isSilent) {
      this.lastNonSilentAtMs = nowMs
      this.voicedMs += estimatePcm16leDurationMs(chunk)
      this.voicedBuffers.push(chunk)
      return { shouldStartTurn: false, shouldFinalizeTurn: false }
    }

    if (this.lastNonSilentAtMs == null) {
      this.lastNonSilentAtMs = nowMs
      return { shouldStartTurn: false, shouldFinalizeTurn: false }
    }

    const silentForMs = nowMs - this.lastNonSilentAtMs
    const shouldFinalize =
      silentForMs >= this.config.gapMs && this.voicedMs >= this.config.minFinalizeVoicedMs

    return { shouldStartTurn: false, shouldFinalizeTurn: shouldFinalize }
  }

  hasActiveTurn(): boolean {
    return this.started
  }

  snapshot(): TurnAudioSnapshot | null {
    if (!this.started || this.voicedBuffers.length === 0) return null
    return {
      pcm: Buffer.concat(this.voicedBuffers),
      voicedMs: this.voicedMs,
    }
  }

  reset(): void {
    this.started = false
    this.lastNonSilentAtMs = null
    this.voicedMs = 0
    this.voicedBuffers.length = 0
  }
}

export type SpeakerEmbedding = number[]

export type SpeakerPrototype = {
  id: string
  centroid: SpeakerEmbedding
  count: number
}

export class AnonymousSpeakerCluster {
  private readonly speakers: SpeakerPrototype[] = []
  private nextIndex = 0

  constructor(
    private readonly sessionId: string,
    private readonly thresholds: { sameTh: number; newTh: number }
  ) {}

  assign(embedding: SpeakerEmbedding): string {
    if (this.speakers.length === 0) {
      return this.createSpeaker(embedding).id
    }

    let bestIndex = -1
    let bestScore = -1
    for (let i = 0; i < this.speakers.length; i += 1) {
      const score = cosineSimilarity(this.speakers[i].centroid, embedding)
      if (score > bestScore) {
        bestScore = score
        bestIndex = i
      }
    }

    if (bestIndex >= 0 && bestScore >= this.thresholds.sameTh) {
      this.updateCentroid(this.speakers[bestIndex], embedding)
      return this.speakers[bestIndex].id
    }

    if (bestIndex >= 0 && bestScore <= this.thresholds.newTh) {
      return this.createSpeaker(embedding).id
    }

    if (bestIndex >= 0) {
      this.updateCentroid(this.speakers[bestIndex], embedding)
      return this.speakers[bestIndex].id
    }

    return this.createSpeaker(embedding).id
  }

  private createSpeaker(embedding: SpeakerEmbedding): SpeakerPrototype {
    const id = `SPEAKER_${this.sessionId}_${this.nextIndex++}`
    const speaker: SpeakerPrototype = { id, centroid: [...embedding], count: 1 }
    this.speakers.push(speaker)
    return speaker
  }

  private updateCentroid(speaker: SpeakerPrototype, embedding: SpeakerEmbedding): void {
    const nextCount = speaker.count + 1
    for (let i = 0; i < speaker.centroid.length; i += 1) {
      const current = speaker.centroid[i] ?? 0
      const value = embedding[i] ?? 0
      speaker.centroid[i] = (current * speaker.count + value) / nextCount
    }
    speaker.count = nextCount
  }
}

export function cosineSimilarity(a: SpeakerEmbedding, b: SpeakerEmbedding): number {
  const length = Math.min(a.length, b.length)
  if (length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  if (normA === 0 || normB === 0) return 0
  return dot / Math.sqrt(normA * normB)
}

export function estimatePcm16leDurationMs(chunk: Buffer, sampleRate = 16000, channels = 1): number {
  const bytesPerSample = 2
  const samples = Math.floor(chunk.length / (bytesPerSample * channels))
  return Math.floor((samples / sampleRate) * 1000)
}

export function isSilentPcm16le(chunk: Buffer, rmsThreshold: number): boolean {
  return calculateRmsPcm16le(chunk) < rmsThreshold
}

export function calculateRmsPcm16le(chunk: Buffer): number {
  if (chunk.length < 2) return 0
  const sampleCount = Math.floor(chunk.length / 2)
  if (sampleCount <= 0) return 0

  let sumSq = 0
  for (let offset = 0; offset + 1 < chunk.length; offset += 2) {
    const value = chunk.readInt16LE(offset)
    sumSq += value * value
  }

  const meanSq = sumSq / sampleCount
  return Math.sqrt(meanSq)
}

function readNumberFromEnv(
  key: string,
  defaultValue: number,
  isValid: (value: number) => boolean
): number {
  const raw = process.env[key]
  if (!raw) return defaultValue
  const value = Number(raw)
  return Number.isFinite(value) && isValid(value) ? value : defaultValue
}
