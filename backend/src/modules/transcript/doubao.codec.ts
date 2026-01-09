import { gzipSync, gunzipSync } from 'zlib'

export enum DoubaoMessageType {
  Config = 0x01,
  Audio = 0x02,
  Response = 0x09,
  Error = 0x0f,
}

export enum DoubaoFlag {
  NoSeq = 0x00,
  Seq = 0x01,
  LastNoSeq = 0x02,
  LastNegSeq = 0x03,
}

export enum DoubaoSerialization {
  None = 0x00,
  Json = 0x01,
}

export enum DoubaoCompression {
  None = 0x00,
  Gzip = 0x01,
}

export interface DoubaoEncodeOptions {
  messageType: DoubaoMessageType
  flags: DoubaoFlag
  serialization: DoubaoSerialization
  compression: DoubaoCompression
  sequence?: number
  payload?: unknown
}

export interface DoubaoDecodedMessage {
  messageType: DoubaoMessageType
  flags: DoubaoFlag
  serialization: DoubaoSerialization
  compression: DoubaoCompression
  sequence?: number
  payload?: unknown
  rawPayload: Buffer
}

const HEADER_VERSION = 0x01
const HEADER_WORDS = 0x01
const BASE_HEADER_SIZE = 4

export class DoubaoBinaryCodec {
  encode(options: DoubaoEncodeOptions): Buffer {
    const payloadBuffer = this.serializePayload(
      options.payload,
      options.serialization,
      options.compression
    )
    const header = Buffer.alloc(BASE_HEADER_SIZE)
    header[0] = (HEADER_VERSION << 4) | HEADER_WORDS
    header[1] = ((options.messageType & 0x0f) << 4) | (options.flags & 0x0f)
    header[2] = ((options.serialization & 0x0f) << 4) | (options.compression & 0x0f)
    header[3] = 0x00

    const parts: Buffer[] = [header]

    if (this.hasSequence(options.flags)) {
      const seqBuffer = Buffer.alloc(4)
      seqBuffer.writeInt32BE(options.sequence ?? 0, 0)
      parts.push(seqBuffer)
    }

    const sizeBuffer = Buffer.alloc(4)
    sizeBuffer.writeUInt32BE(payloadBuffer.length, 0)
    parts.push(sizeBuffer)

    if (payloadBuffer.length > 0) {
      parts.push(payloadBuffer)
    }

    return Buffer.concat(parts)
  }

  decode(buffer: Buffer): DoubaoDecodedMessage {
    if (buffer.length < BASE_HEADER_SIZE + 4) {
      throw new Error('Invalid Doubao packet: buffer too short')
    }

    const byte0 = buffer[0]
    const version = byte0 >> 4
    const headerWords = byte0 & 0x0f
    const headerSize = headerWords * 4

    if (version !== HEADER_VERSION) {
      throw new Error(`Unsupported Doubao version: ${version}`)
    }

    if (buffer.length < headerSize + 4) {
      throw new Error('Invalid Doubao packet: header size mismatch')
    }

    const byte1 = buffer[1]
    const messageType = (byte1 >> 4) & 0x0f
    const flags = byte1 & 0x0f

    const byte2 = buffer[2]
    const serialization = (byte2 >> 4) & 0x0f
    const compression = byte2 & 0x0f

    let offset = headerSize
    let sequence: number | undefined

    if (this.hasSequence(flags)) {
      sequence = buffer.readInt32BE(offset)
      offset += 4
    }

    const payloadSize = buffer.readUInt32BE(offset)
    offset += 4

    if (buffer.length < offset + payloadSize) {
      throw new Error('Invalid Doubao packet: payload size mismatch')
    }

    let payloadBuffer = buffer.subarray(offset, offset + payloadSize)
    if (compression === DoubaoCompression.Gzip) {
      payloadBuffer = gunzipSync(payloadBuffer)
    }

    let payload: unknown | undefined
    if (serialization === DoubaoSerialization.Json && payloadBuffer.length > 0) {
      try {
        payload = JSON.parse(payloadBuffer.toString('utf8'))
      } catch {
        payload = payloadBuffer.toString('utf8')
      }
    }

    return {
      messageType: messageType as DoubaoMessageType,
      flags: flags as DoubaoFlag,
      serialization: serialization as DoubaoSerialization,
      compression: compression as DoubaoCompression,
      sequence,
      payload,
      rawPayload: payloadBuffer,
    }
  }

  private hasSequence(flags: DoubaoFlag): boolean {
    return flags === DoubaoFlag.Seq || flags === DoubaoFlag.LastNegSeq
  }

  private serializePayload(
    payload: unknown,
    serialization: DoubaoSerialization,
    compression: DoubaoCompression
  ): Buffer {
    let buffer: Buffer

    if (payload === undefined || payload === null) {
      buffer = Buffer.alloc(0)
    } else if (Buffer.isBuffer(payload)) {
      buffer = payload
    } else if (serialization === DoubaoSerialization.Json) {
      buffer = Buffer.from(JSON.stringify(payload), 'utf8')
    } else {
      buffer = Buffer.from(String(payload), 'utf8')
    }

    if (compression === DoubaoCompression.Gzip && buffer.length > 0) {
      return gzipSync(buffer)
    }

    return buffer
  }
}
