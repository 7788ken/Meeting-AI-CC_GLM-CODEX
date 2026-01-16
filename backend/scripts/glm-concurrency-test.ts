import axios from 'axios'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { getGlmAuthorizationToken } from '../src/common/llm/glm'

type Mode = 'asr' | 'llm' | 'both'

type RequestResult = {
  status: number | null
  latencyMs: number
  key: string
  error?: string
}

type ScenarioResult = {
  name: string
  durationMs: number
  total: number
  ok: number
  rateLimited: number
  otherErrors: number
  p50Ms: number
  p95Ms: number
  maxInFlight: number
  statusCounts: Record<string, number>
  byKey: Record<string, number>
  maxInFlightByKey: Record<string, number>
}

type MultipartPart = {
  name: string
  value: string | Buffer
  filename?: string
  contentType?: string
}

const DEFAULT_ASR_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions'
const DEFAULT_LLM_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

async function main(): Promise<void> {
  const mode = readMode()
  const useMock = readBoolean('GLM_TEST_MOCK', false)
  const keys = readKeys(useMock)
  const totalRequests = readNumber('GLM_TEST_REQUESTS', 20, 1)
  const defaultConcurrency = readNumber('GLM_TEST_CONCURRENCY', 30, 1)
  const asrConcurrency = readNumber('GLM_TEST_ASR_CONCURRENCY', defaultConcurrency, 1)
  const llmConcurrency = readNumber('GLM_TEST_LLM_CONCURRENCY', defaultConcurrency, 1)
  const timeoutMs = readNumber('GLM_TEST_TIMEOUT_MS', 60000, 1000)

  // ASR 和 LLM 各自 30 并发，且并发执行（可用环境变量覆盖）
  const promises: Promise<ScenarioResult>[] = []

  if (mode === 'asr' || mode === 'both') {
    const asrEndpoint = readString('GLM_ASR_ENDPOINT') || DEFAULT_ASR_ENDPOINT
    const asrModel = readString('GLM_ASR_MODEL') || 'glm-asr-2512'
    const asrStream = readBoolean('GLM_ASR_STREAM', true)
    const wavBuffer = useMock ? Buffer.alloc(0) : readWavBuffer()
    promises.push(
      runScenario({
        name: 'ASR',
        totalRequests,
        concurrency: asrConcurrency,
        keys,
        makeRequest: useMock
          ? createMockRequest('ASR')
          : key =>
              callAsr({
                key,
                endpoint: asrEndpoint,
                model: asrModel,
                wavBuffer,
                stream: asrStream,
                timeoutMs,
              }),
      })
    )
  }

  if (mode === 'llm' || mode === 'both') {
    const llmEndpoint =
      readString('GLM_LLM_ENDPOINT') || readString('GLM_ENDPOINT') || DEFAULT_LLM_ENDPOINT
    const llmModel =
      readString('GLM_LLM_MODEL') || readString('GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL') || ''
    if (!llmModel && !useMock) {
      throw new Error('GLM_LLM_MODEL or GLM_TRANSCRIPT_EVENT_SEGMENT_MODEL not configured')
    }

    promises.push(
      runScenario({
        name: 'LLM',
        totalRequests,
        concurrency: llmConcurrency,
        keys,
        makeRequest: useMock
          ? createMockRequest('LLM')
          : key =>
              callLlm({
                key,
                endpoint: llmEndpoint,
                model: llmModel,
                timeoutMs,
              }),
      })
    )
  }

  // 并发执行所有测试
  const allResults = await Promise.all(promises)
  
  for (const result of allResults) {
    printScenarioResult(result)
  }
}

function readMode(): Mode {
  const raw = (process.env.GLM_TEST_MODE || 'both').trim().toLowerCase()
  if (raw === 'asr' || raw === 'llm' || raw === 'both') return raw
  return 'both'
}

function readKeys(useMock: boolean): string[] {
  const raw = process.env.GLM_API_KEYS || process.env.GLM_API_KEY || ''
  const keys = raw
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0)
  if (keys.length === 0 && useMock) {
    return ['mock-key-1', 'mock-key-2']
  }
  if (keys.length === 0) {
    throw new Error('GLM_API_KEYS or GLM_API_KEY not configured')
  }
  return keys
}

function readString(name: string): string {
  return (process.env[name] || '').trim()
}

function readNumber(name: string, fallback: number, min?: number, max?: number): number {
  const raw = readString(name)
  const value = raw ? Number(raw) : fallback
  if (!Number.isFinite(value)) return fallback
  if (min != null && value < min) return min
  if (max != null && value > max) return max
  return Math.floor(value)
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readString(name)
  if (!raw) return fallback
  if (raw === '1' || raw.toLowerCase() === 'true') return true
  if (raw === '0' || raw.toLowerCase() === 'false') return false
  return fallback
}

async function runScenario(input: {
  name: string
  totalRequests: number
  concurrency: number
  keys: string[]
  makeRequest: (key: string) => Promise<number>
}): Promise<ScenarioResult> {
  const { name, totalRequests, keys } = input
  const concurrency = Math.max(1, Math.min(input.concurrency, totalRequests))
  const results: RequestResult[] = []

  let nextIndex = 0
  let inFlight = 0
  let maxInFlight = 0
  const inFlightByKey = new Map<string, number>()
  const maxInFlightByKey = new Map<string, number>()

  const startedAt = Date.now()

  const worker = async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= totalRequests) return
      const key = keys[index % keys.length]

      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      const currentKeyInFlight = (inFlightByKey.get(key) || 0) + 1
      inFlightByKey.set(key, currentKeyInFlight)
      const currentKeyMax = maxInFlightByKey.get(key) || 0
      if (currentKeyInFlight > currentKeyMax) {
        maxInFlightByKey.set(key, currentKeyInFlight)
      }

      const started = Date.now()
      try {
        const status = await input.makeRequest(key)
        results.push({ status, latencyMs: Date.now() - started, key })
      } catch (error) {
        results.push({
          status: null,
          latencyMs: Date.now() - started,
          key,
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        inFlight -= 1
        inFlightByKey.set(key, Math.max(0, (inFlightByKey.get(key) || 1) - 1))
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const durationMs = Date.now() - startedAt
  const latencies = results.map(item => item.latencyMs)
  const statusCounts = countBy(results, item => String(item.status ?? 'error'))
  const ok = results.filter(item => item.status != null && item.status < 400).length
  const rateLimited = results.filter(item => item.status === 429).length
  const otherErrors = results.length - ok - rateLimited

  return {
    name,
    durationMs,
    total: results.length,
    ok,
    rateLimited,
    otherErrors,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    maxInFlight,
    statusCounts,
    byKey: countBy(results, item => maskKey(item.key)),
    maxInFlightByKey: mapBy(maxInFlightByKey, key => maskKey(key)),
  }
}

async function callAsr(input: {
  key: string
  endpoint: string
  model: string
  wavBuffer: Buffer
  stream: boolean
  timeoutMs: number
}): Promise<number> {
  const body = buildAsrBody(input.wavBuffer, input.model, input.stream)
  const headers = {
    Authorization: `Bearer ${getGlmAuthorizationToken(input.key)}`,
    Accept: input.stream ? 'text/event-stream' : 'application/json',
    'Content-Type': `multipart/form-data; boundary=${body.boundary}`,
    'Content-Length': String(body.body.length),
  }

  const { response, durationMs } = await postWithTimeout({
    url: input.endpoint,
    headers,
    data: body.body,
    responseType: input.stream ? 'stream' : 'json',
    timeoutMs: input.timeoutMs,
  })

  if (input.stream && response.data) {
    await drainStream(response.data)
  }

  if (durationMs > input.timeoutMs) {
    throw new Error(`ASR request exceeded timeout (${durationMs}ms)`)
  }

  return response.status
}

async function callLlm(input: {
  key: string
  endpoint: string
  model: string
  timeoutMs: number
}): Promise<number> {
  const headers = {
    Authorization: `Bearer ${getGlmAuthorizationToken(input.key)}`,
    'Content-Type': 'application/json',
  }

  const requestBody = {
    model: input.model,
    messages: [
      { role: 'system', content: [{ type: 'text', text: 'You are a helpful assistant.' }] },
      { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
    ],
    temperature: 0.2,
    max_tokens: 64,
    thinking: { type: 'disabled' },
  }

  const { response, durationMs } = await postWithTimeout({
    url: input.endpoint,
    headers,
    data: requestBody,
    responseType: 'json',
    timeoutMs: input.timeoutMs,
  })

  if (durationMs > input.timeoutMs) {
    throw new Error(`LLM request exceeded timeout (${durationMs}ms)`)
  }

  return response.status
}

async function postWithTimeout(input: {
  url: string
  headers: Record<string, string>
  data: unknown
  responseType: 'json' | 'stream'
  timeoutMs: number
}): Promise<{ response: { status: number; data: any }; durationMs: number }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), input.timeoutMs)
  const startedAt = Date.now()
  try {
    const response = await axios.post(input.url, input.data, {
      headers: input.headers,
      responseType: input.responseType,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
      signal: controller.signal,
    })
    return { response, durationMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timer)
  }
}

async function drainStream(stream: NodeJS.ReadableStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.on('error', reject)
    stream.on('end', () => resolve())
    stream.on('data', () => undefined)
  })
}

function readWavBuffer(): Buffer {
  const audioPath = readString('GLM_ASR_AUDIO_PATH')
  if (audioPath) {
    return fs.readFileSync(path.resolve(audioPath))
  }

  const seconds = readNumber('GLM_ASR_SILENCE_SECONDS', 1, 1, 5)
  const sampleRate = 16000
  const pcmBuffer = Buffer.alloc(sampleRate * seconds * 2)
  return pcm16ToWav(pcmBuffer)
}

function buildAsrBody(
  wavBuffer: Buffer,
  model: string,
  stream: boolean
): { body: Buffer; boundary: string } {
  const boundary = `----glm-asr-${randomUUID()}`
  const parts: MultipartPart[] = [
    { name: 'model', value: model },
    { name: 'stream', value: stream ? 'true' : 'false' },
    {
      name: 'file',
      filename: 'audio.wav',
      contentType: 'audio/wav',
      value: wavBuffer,
    },
  ]
  return buildMultipartBody(parts, boundary)
}

function buildMultipartBody(
  parts: MultipartPart[],
  boundary: string
): { body: Buffer; boundary: string } {
  const buffers: Buffer[] = []

  for (const part of parts) {
    buffers.push(Buffer.from(`--${boundary}\r\n`))
    const contentDisposition = `Content-Disposition: form-data; name="${part.name}"`
    const filename = part.filename ? `; filename="${part.filename}"` : ''
    buffers.push(Buffer.from(`${contentDisposition}${filename}\r\n`))
    if (part.contentType) {
      buffers.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`))
    }
    buffers.push(Buffer.from('\r\n'))
    buffers.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value))
    buffers.push(Buffer.from('\r\n'))
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(buffers), boundary }
}

function pcm16ToWav(pcmBuffer: Buffer): Buffer {
  if (pcmBuffer.length % 2 !== 0) {
    pcmBuffer = pcmBuffer.subarray(0, pcmBuffer.length - 1)
  }

  const sampleRate = 16000
  const bitsPerSample = 16
  const channels = 1
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcmBuffer.length
  const fileSize = 36 + dataSize

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(fileSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, pcmBuffer])
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * ratio) - 1))
  return sorted[index]
}

function createMockRequest(name: 'ASR' | 'LLM'): (key: string) => Promise<number> {
  let index = 0
  return async () => {
    const current = index
    index += 1
    const baseLatency = name === 'ASR' ? 280 : 180
    const jitter = (current % 5) * 30
    await sleep(baseLatency + jitter)
    if (current % 13 === 0) return 429
    if (current % 17 === 0) return 503
    return 200
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of items) {
    const key = getKey(item)
    result[key] = (result[key] || 0) + 1
  }
  return result
}

function mapBy(
  map: Map<string, number>,
  normalizeKey: (key: string) => string
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, value] of map.entries()) {
    result[normalizeKey(key)] = value
  }
  return result
}

function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '***'
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

function printScenarioResult(result: ScenarioResult): void {
  const qps = result.durationMs > 0 ? (result.total / (result.durationMs / 1000)).toFixed(2) : '0'
  console.log(`\n[${result.name}] total=${result.total} ok=${result.ok} 429=${result.rateLimited}`)
  console.log(
    `[${result.name}] otherErrors=${result.otherErrors} durationMs=${result.durationMs} qps=${qps}`
  )
  console.log(
    `[${result.name}] p50Ms=${result.p50Ms} p95Ms=${result.p95Ms} maxInFlight=${result.maxInFlight}`
  )
  console.log(`[${result.name}] statusCounts=${JSON.stringify(result.statusCounts)}`)
  console.log(`[${result.name}] byKey=${JSON.stringify(result.byKey)}`)
  console.log(`[${result.name}] maxInFlightByKey=${JSON.stringify(result.maxInFlightByKey)}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
