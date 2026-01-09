import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { TranscriptService } from './transcript.service'

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class TranscriptGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(TranscriptGateway.name)

  constructor(private readonly transcriptService: TranscriptService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`)
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`)
    this.transcriptService.removeClient(client.id)
  }

  @SubscribeMessage('session:start')
  handleSessionStart(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    this.logger.log(`Session started: ${data.sessionId}`)
    client.join(`session:${data.sessionId}`)
    client.emit('session:started', { sessionId: data.sessionId })
  }

  @SubscribeMessage('session:end')
  handleSessionEnd(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    this.logger.log(`Session ended: ${data.sessionId}`)
    client.leave(`session:${data.sessionId}`)
    client.emit('session:ended', { sessionId: data.sessionId })
  }

  @SubscribeMessage('audio:start')
  handleAudioStart(@ConnectedSocket() client: Socket) {
    this.logger.log(`Audio streaming started for client: ${client.id}`)
    this.transcriptService.addClient(client.id, client)
    client.emit('audio:started')
  }

  @SubscribeMessage('audio:data')
  async handleAudioData(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    // 处理音频数据
    const result = await this.transcriptService.processAudio(
      client.id,
      data.audioData,
      data.sessionId
    )

    if (result) {
      // 发送转写结果到该会话的所有客户端
      this.server.to(`session:${data.sessionId}`).emit('transcript:result', result)
    }
  }

  @SubscribeMessage('audio:end')
  handleAudioEnd(@ConnectedSocket() client: Socket) {
    this.logger.log(`Audio streaming ended for client: ${client.id}`)
    client.emit('audio:ended')
  }
}
