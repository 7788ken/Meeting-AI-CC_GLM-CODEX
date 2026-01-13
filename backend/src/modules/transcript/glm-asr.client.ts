import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { randomUUID } from 'crypto'
import { getGlmAuthorizationToken } from '../../common/llm/glm'

export interface TranscriptChunk {
  text: string
  isFinal: boolean
  requestId?: string
}

export type GlmAsrOptions = {
  language?: string
  prompt?: string
  hotwords?: string[]
}

@Injectable()
export class GlmAsrClient {
  private readonly logger = new Logger(GlmAsrClient.name)
  private readonly endpoint = 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions'
  private readonly model = 'glm-asr-2512'
  private readonly apiKey: string

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.apiKey = (this.configService.get<string>('GLM_API_KEY') || '').trim()
    if (!this.apiKey) {
      this.logger.warn('GLM_API_KEY not configured')
    }
  }

  async *transcribeStream(
    audioBuffer: Buffer,
    options?: GlmAsrOptions
  ): AsyncIterable<TranscriptChunk> {
    if (!this.apiKey) {
      throw new Error('GLM_API_KEY not configured')
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('audioBuffer is empty')
    }

    if (audioBuffer.length % 2 !== 0) {
      this.logger.warn('PCM buffer length is odd, trimming the last byte')
    }

    const wavBuffer = pcm16ToWav(audioBuffer)
    const requestBody = this.buildMultipartBody(wavBuffer, options)

    const headers = {
      Authorization: `Bearer ${getGlmAuthorizationToken(this.apiKey)}`,
      Accept: 'text/event-stream',
      'Content-Type': `multipart/form-data; boundary=${requestBody.boundary}`,
      'Content-Length': String(requestBody.body.length),
    }

    const hotwordsText = normalizeHotwords(options?.hotwords).join(',')

    this.logger.debug(
      `GLM ASR request: pcmBytes=${audioBuffer.length} wavBytes=${wavBuffer.length} language=${
        options?.language || 'auto'
      } hotwords=${hotwordsText ? 'set' : 'none'}`
    )

    let response: { data: NodeJS.ReadableStream; status: number; headers: Record<string, any> }

    try {
      response = await firstValueFrom(
        this.httpService.post(this.endpoint, requestBody.body, {
          headers,
          responseType: 'stream',
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true,
        })
      )
    } catch (error) {
      this.logger.error(
        'GLM ASR request failed',
        error instanceof Error ? error.stack : String(error)
      )
      throw new Error(
        `GLM ASR request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }

    if (response.status >= 400) {
      const errorText = await readStreamAsText(response.data)
      const detail = errorText ? ` ${errorText}` : ''
      this.logger.error(`GLM ASR HTTP error: status=${response.status}${detail}`)
      throw new Error(`GLM ASR HTTP error: status=${response.status}${detail}`)
    }

    const requestId = extractRequestId(response.headers)
    if (requestId) {
      this.logger.log(`GLM ASR stream started, requestId=${requestId}`)
    } else {
      this.logger.log('GLM ASR stream started')
    }

    try {
      let yielded = false
      for await (const chunk of this.parseEventStream(response.data, requestId)) {
        yielded = true
        yield chunk
      }
      if (!yielded) {
        this.logger.warn('GLM ASR stream ended with no chunks')
      }
    } catch (error) {
      this.logger.error(
        'GLM ASR stream error',
        error instanceof Error ? error.stack : String(error)
      )
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  private buildMultipartBody(
    wavBuffer: Buffer,
    options?: GlmAsrOptions
  ): { body: Buffer; boundary: string } {
    const boundary = `----glm-asr-${randomUUID()}`
    const parts: MultipartPart[] = [
      { name: 'model', value: this.model },
      { name: 'stream', value: 'true' },
      {
        name: 'file',
        filename: 'audio.wav',
        contentType: 'audio/wav',
        value: wavBuffer,
      },
    ]

    const language = options?.language?.trim()
    if (language) {
      parts.push({ name: 'language', value: language })
    }

    const prompt = options?.prompt?.trim()
    if (prompt) {
      parts.push({ name: 'prompt', value: prompt })
    }

    const hotwords = normalizeHotwords(options?.hotwords)
    if (hotwords && hotwords.length > 0) {
      parts.push({ name: 'hotwords', value: hotwords.join(',') })
    }

    return buildMultipartBody(parts, boundary)
  }

  private async *parseEventStream(
    stream: NodeJS.ReadableStream,
    requestId?: string
  ): AsyncIterable<TranscriptChunk> {
    let buffer = ''
    let eventLines: string[] = []

    for await (const chunk of stream) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line) {
          const data = eventLines.join('\n').trim()
          eventLines = []
          if (!data) {
            continue
          }
          const payload = this.parseEventPayload(data, requestId)
          if (payload) {
            yield payload
          }
          continue
        }

        if (line.startsWith('data:')) {
          eventLines.push(line.slice(5).trimStart())
        }
      }
    }

    if (eventLines.length > 0) {
      const data = eventLines.join('\n').trim()
      if (data) {
        const payload = this.parseEventPayload(data, requestId)
        if (payload) {
          yield payload
        }
      }
    }
  }

  private parseEventPayload(data: string, requestId?: string): TranscriptChunk | null {
    if (!data) {
      return null
    }

    if (data === '[DONE]') {
      return {
        text: '',
        isFinal: true,
        requestId,
      }
    }

    let payload: unknown = data

    try {
      payload = JSON.parse(data)
    } catch {
      this.logger.warn(`GLM ASR SSE data not JSON: ${data.slice(0, 120)}`)
      return {
        text: data,
        isFinal: false,
        requestId,
      }
    }

    if (payload && typeof payload === 'object') {
      const errorMessage = extractErrorMessage(payload as Record<string, unknown>)
      if (errorMessage) {
        throw new Error(`GLM ASR error: ${errorMessage}`)
      }
    }

    const text = extractText(payload)
    const isFinal = extractIsFinal(payload)
    const resolvedRequestId = extractPayloadRequestId(payload) || requestId

    if (!text && !isFinal) {
      return null
    }

    return {
      text: text ?? '',
      isFinal,
      requestId: resolvedRequestId,
    }
  }
}

type MultipartPart = {
  name: string
  value: string | Buffer
  filename?: string
  contentType?: string
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

function extractRequestId(headers: Record<string, unknown> | undefined): string | undefined {
  if (!headers) return undefined
  const candidates = ['x-request-id', 'x-requestid', 'request-id', 'x-trace-id']
  for (const key of candidates) {
    const value = (headers as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      const first = value.find(item => typeof item === 'string')
      if (first) return first
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function extractPayloadRequestId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const record = payload as Record<string, unknown>
  const candidates = ['request_id', 'requestId', 'id']
  for (const key of candidates) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function extractErrorMessage(payload: Record<string, unknown>): string | null {
  const direct = payload.error
  if (typeof direct === 'string') {
    return direct
  }

  if (direct && typeof direct === 'object') {
    const message = (direct as Record<string, unknown>).message
    if (typeof message === 'string') {
      return message
    }
  }

  const nested = payload.data
  if (nested && typeof nested === 'object') {
    const nestedError = (nested as Record<string, unknown>).error
    if (typeof nestedError === 'string') {
      return nestedError
    }
    if (nestedError && typeof nestedError === 'object') {
      const message = (nestedError as Record<string, unknown>).message
      if (typeof message === 'string') {
        return message
      }
    }
  }

  return null
}

function extractText(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>

  const directText = record.text
  if (typeof directText === 'string') return directText

  const dataText = record.data
  if (typeof dataText === 'string') return dataText

  if (dataText && typeof dataText === 'object') {
    const nested = (dataText as Record<string, unknown>).text
    if (typeof nested === 'string') return nested
  }

  const result = record.result
  if (result && typeof result === 'object') {
    const resultText = (result as Record<string, unknown>).text
    if (typeof resultText === 'string') return resultText

    const alternatives = (result as Record<string, unknown>).alternatives
    if (Array.isArray(alternatives)) {
      const transcript = (alternatives[0] as Record<string, unknown>)?.transcript
      if (typeof transcript === 'string') return transcript
    }
  }

  const choices = record.choices
  if (Array.isArray(choices)) {
    const first = choices[0] as Record<string, unknown>
    const delta = first?.delta as Record<string, unknown>
    if (delta && typeof delta.text === 'string') return delta.text
    if (typeof first?.text === 'string') return first.text

    const message = first?.message as Record<string, unknown>
    if (message && typeof message.content === 'string') return message.content
  }

  const alternatives = record.alternatives
  if (Array.isArray(alternatives)) {
    const transcript = (alternatives[0] as Record<string, unknown>)?.transcript
    if (typeof transcript === 'string') return transcript
  }

  return null
}

function extractIsFinal(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const record = payload as Record<string, unknown>
  const direct = record.is_final ?? record.isFinal ?? record.final
  if (typeof direct === 'boolean') return direct

  const data = record.data
  if (data && typeof data === 'object') {
    const nested =
      (data as Record<string, unknown>).is_final ?? (data as Record<string, unknown>).isFinal
    if (typeof nested === 'boolean') return nested
  }

  const result = record.result
  if (result && typeof result === 'object') {
    const nested =
      (result as Record<string, unknown>).is_final ?? (result as Record<string, unknown>).isFinal
    if (typeof nested === 'boolean') return nested
  }

  const choices = record.choices
  if (Array.isArray(choices)) {
    const finishReason = (choices[0] as Record<string, unknown>)?.finish_reason
    if (typeof finishReason === 'string') {
      return finishReason === 'stop' || finishReason === 'final'
    }
  }

  return false
}

function normalizeHotwords(hotwords?: string[]): string[] {
  if (!hotwords) return []
  return hotwords.map(word => word.trim()).filter(word => word)
}

async function readStreamAsText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  const maxBytes = 64 * 1024

  for await (const chunk of stream) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    chunks.push(bufferChunk)
    total += bufferChunk.length

    if (total >= maxBytes) {
      break
    }
  }

  return Buffer.concat(chunks).toString('utf8').trim()
}
