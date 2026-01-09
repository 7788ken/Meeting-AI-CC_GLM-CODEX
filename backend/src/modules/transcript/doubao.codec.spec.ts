import { DoubaoBinaryCodec } from './doubao.codec'
import {
  DoubaoCompression,
  DoubaoFlag,
  DoubaoMessageType,
  DoubaoSerialization,
} from './doubao.codec'

describe('DoubaoBinaryCodec', () => {
  let codec: DoubaoBinaryCodec

  beforeEach(() => {
    codec = new DoubaoBinaryCodec()
  })

  describe('encode', () => {
    it('should encode config message without sequence', () => {
      const payload = {
        user: { uid: 'test-user' },
        audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      }

      const buffer = codec.encode({
        messageType: DoubaoMessageType.Config,
        flags: DoubaoFlag.NoSeq,
        serialization: DoubaoSerialization.Json,
        compression: DoubaoCompression.None,
        payload,
      })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)

      // Verify header
      expect(buffer[0]).toBe(0x11) // version 1, header words 1
      expect(buffer[1]).toBe(0x10) // Config (0x01) << 4 | NoSeq (0x00)
      expect(buffer[2]).toBe(0x10) // Json (0x01) << 4 | None (0x00)
    })

    it('should encode audio message with sequence', () => {
      const audioData = Buffer.from([0x00, 0x01, 0x02, 0x03])

      const buffer = codec.encode({
        messageType: DoubaoMessageType.Audio,
        flags: DoubaoFlag.Seq,
        serialization: DoubaoSerialization.None,
        compression: DoubaoCompression.None,
        sequence: 1,
        payload: audioData,
      })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    })

    it('should encode audio message with negative sequence for final packet', () => {
      const audioData = Buffer.from([0x00, 0x01, 0x02, 0x03])

      const buffer = codec.encode({
        messageType: DoubaoMessageType.Audio,
        flags: DoubaoFlag.LastNegSeq,
        serialization: DoubaoSerialization.None,
        compression: DoubaoCompression.None,
        sequence: -1,
        payload: audioData,
      })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    })

    it('should encode message with gzip compression', () => {
      const payload = JSON.stringify({ test: 'data'.repeat(100) })

      const buffer = codec.encode({
        messageType: DoubaoMessageType.Config,
        flags: DoubaoFlag.NoSeq,
        serialization: DoubaoSerialization.Json,
        compression: DoubaoCompression.Gzip,
        payload,
      })

      expect(buffer).toBeInstanceOf(Buffer)
      // Compressed data should be shorter than original
      expect(buffer.length).toBeLessThan(payload.length)
    })

    it('should encode message with empty payload', () => {
      const buffer = codec.encode({
        messageType: DoubaoMessageType.Config,
        flags: DoubaoFlag.NoSeq,
        serialization: DoubaoSerialization.Json,
        compression: DoubaoCompression.None,
        payload: null,
      })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBe(8) // header (4) + size (4) + no payload
    })
  })

  describe('decode', () => {
    it('should decode config message without sequence', () => {
      const payload = JSON.stringify({
        user: { uid: 'test-user' },
        audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      })
      const payloadBuffer = Buffer.from(payload, 'utf8')

      // Build packet manually
      const header = Buffer.alloc(4)
      header[0] = 0x11 // version 1, header words 1
      header[1] = 0x10 // Config (0x01) << 4 | NoSeq (0x00)
      header[2] = 0x10 // Json (0x01) << 4 | None (0x00)
      header[3] = 0x00

      const sizeBuffer = Buffer.alloc(4)
      sizeBuffer.writeUInt32BE(payloadBuffer.length, 0)

      const packet = Buffer.concat([header, sizeBuffer, payloadBuffer])

      const decoded = codec.decode(packet)

      expect(decoded.messageType).toBe(DoubaoMessageType.Config)
      expect(decoded.flags).toBe(DoubaoFlag.NoSeq)
      expect(decoded.serialization).toBe(DoubaoSerialization.Json)
      expect(decoded.compression).toBe(DoubaoCompression.None)
      expect(decoded.payload).toEqual({
        user: { uid: 'test-user' },
        audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      })
    })

    it('should decode audio message with sequence', () => {
      const audioData = Buffer.from([0x00, 0x01, 0x02, 0x03])

      const header = Buffer.alloc(4)
      header[0] = 0x11
      header[1] = 0x21 // Audio (0x02) << 4 | Seq (0x01)
      header[2] = 0x00 // None (0x00) << 4 | None (0x00)
      header[3] = 0x00

      const seqBuffer = Buffer.alloc(4)
      seqBuffer.writeInt32BE(1, 0)

      const sizeBuffer = Buffer.alloc(4)
      sizeBuffer.writeUInt32BE(audioData.length, 0)

      const packet = Buffer.concat([header, seqBuffer, sizeBuffer, audioData])

      const decoded = codec.decode(packet)

      expect(decoded.messageType).toBe(DoubaoMessageType.Audio)
      expect(decoded.flags).toBe(DoubaoFlag.Seq)
      expect(decoded.sequence).toBe(1)
      expect(decoded.rawPayload).toEqual(audioData)
    })

    it('should decode message with negative sequence', () => {
      const audioData = Buffer.from([0x00, 0x01])

      const header = Buffer.alloc(4)
      header[0] = 0x11
      header[1] = 0x23 // Audio (0x02) << 4 | LastNegSeq (0x03)
      header[2] = 0x00
      header[3] = 0x00

      const seqBuffer = Buffer.alloc(4)
      seqBuffer.writeInt32BE(-1, 0)

      const sizeBuffer = Buffer.alloc(4)
      sizeBuffer.writeUInt32BE(audioData.length, 0)

      const packet = Buffer.concat([header, seqBuffer, sizeBuffer, audioData])

      const decoded = codec.decode(packet)

      expect(decoded.sequence).toBe(-1)
      expect(decoded.flags).toBe(DoubaoFlag.LastNegSeq)
    })

    it('should throw error for buffer too short', () => {
      const buffer = Buffer.from([0x01, 0x02])

      expect(() => codec.decode(buffer)).toThrow('Invalid Doubao packet')
    })

    it('should throw error for unsupported version', () => {
      const header = Buffer.alloc(8)
      header[0] = 0x20 // version 2
      header[1] = 0x10
      header[2] = 0x10
      header[3] = 0x00
      // size = 0
      header.writeUInt32BE(0, 4)

      expect(() => codec.decode(header)).toThrow('Unsupported Doubao version')
    })

    it('should decode response message with JSON payload', () => {
      const payload = JSON.stringify({ result: { text: 'Hello' } })
      const payloadBuffer = Buffer.from(payload, 'utf8')

      const header = Buffer.alloc(4)
      header[0] = 0x11
      header[1] = 0x90 // Response (0x09) << 4 | NoSeq (0x00)
      header[2] = 0x10 // Json
      header[3] = 0x00

      const sizeBuffer = Buffer.alloc(4)
      sizeBuffer.writeUInt32BE(payloadBuffer.length, 0)

      const packet = Buffer.concat([header, sizeBuffer, payloadBuffer])

      const decoded = codec.decode(packet)

      expect(decoded.messageType).toBe(DoubaoMessageType.Response)
      expect(decoded.payload).toEqual({ result: { text: 'Hello' } })
    })
  })

  describe('encode/decode roundtrip', () => {
    it('should correctly encode and decode config message', () => {
      const payload = {
        user: { uid: 'test-user-123' },
        audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
      }

      const encoded = codec.encode({
        messageType: DoubaoMessageType.Config,
        flags: DoubaoFlag.NoSeq,
        serialization: DoubaoSerialization.Json,
        compression: DoubaoCompression.None,
        payload,
      })

      const decoded = codec.decode(encoded)

      expect(decoded.messageType).toBe(DoubaoMessageType.Config)
      expect(decoded.flags).toBe(DoubaoFlag.NoSeq)
      expect(decoded.serialization).toBe(DoubaoSerialization.Json)
      expect(decoded.compression).toBe(DoubaoCompression.None)
      expect(decoded.payload).toEqual(payload)
    })

    it('should correctly encode and decode audio data', () => {
      const audioData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])

      const encoded = codec.encode({
        messageType: DoubaoMessageType.Audio,
        flags: DoubaoFlag.Seq,
        serialization: DoubaoSerialization.None,
        compression: DoubaoCompression.None,
        sequence: 5,
        payload: audioData,
      })

      const decoded = codec.decode(encoded)

      expect(decoded.messageType).toBe(DoubaoMessageType.Audio)
      expect(decoded.sequence).toBe(5)
      expect(decoded.rawPayload).toEqual(audioData)
    })

    it('should correctly encode and decode object payload', () => {
      const payload = { message: 'test', value: 123 }

      const encoded = codec.encode({
        messageType: DoubaoMessageType.Config,
        flags: DoubaoFlag.NoSeq,
        serialization: DoubaoSerialization.Json,
        compression: DoubaoCompression.None,
        payload,
      })

      const decoded = codec.decode(encoded)

      expect(decoded.payload).toEqual(payload)
    })

    it('should handle edge cases', () => {
      const payload = {}

      const encoded = codec.encode({
        messageType: DoubaoMessageType.Config,
        flags: DoubaoFlag.NoSeq,
        serialization: DoubaoSerialization.Json,
        compression: DoubaoCompression.None,
        payload,
      })

      const decoded = codec.decode(encoded)

      expect(decoded.payload).toEqual({})
    })
  })
})
