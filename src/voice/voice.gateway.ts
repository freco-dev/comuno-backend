import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, UnauthorizedException } from '@nestjs/common';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { VoiceService } from './voice.service';
import { MediasoupService } from './mediasoup.service';
import { ChatService } from '../chat/chat.service';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: 'voice',
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private voiceService: VoiceService,
    private mediasoupService: MediasoupService,
    private chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const user = await this.voiceService.authenticate(client);
      client.data.user = user;
      console.log(`Client connected: ${user.username} (${client.id})`);
    } catch (e) {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    await this.mediasoupService.closeTransportsForSocket(client.id);
    await this.voiceService.handleUserDisconnect(client, this.server);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    client.join(data.groupId);
    console.log(`User ${client.data.user.username} joined room ${data.groupId}`);
    return { status: 'joined', groupId: data.groupId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    client.leave(data.groupId);
    console.log(`User ${client.data.user.username} left room ${data.groupId}`);
    return { status: 'left', groupId: data.groupId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('startSpeaking')
  async handleStartSpeaking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    const canSpeak = await this.voiceService.tryToSpeak(data.groupId, client.data.user.id);
    if (canSpeak) {
      client.to(data.groupId).emit('userStartedSpeaking', {
        userId: client.data.user.id,
        username: client.data.user.username,
      });
      return { status: 'granted' };
    } else {
      // Emit speakingDenied directly to the requester
      client.emit('speakingDenied', { reason: 'Someone else is speaking' });
      return { status: 'denied', reason: 'Someone else is speaking' };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('stopSpeaking')
  async handleStopSpeaking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    await this.voiceService.stopSpeaking(data.groupId, client.data.user.id);
    client.to(data.groupId).emit('userStoppedSpeaking', {
      userId: client.data.user.id,
    });
    return { status: 'released' };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('getRouterRtpCapabilities')
  handleGetRouterRtpCapabilities(
    @ConnectedSocket() client: Socket,
  ) {
    return this.mediasoupService.getRtpCapabilities();
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('createWebRtcTransport')
  async handleCreateWebRtcTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; direction: 'send' | 'recv' },
  ) {
    const transport = await this.mediasoupService.createWebRtcTransport(
      client.id,
      client.data.user.id,
      data.groupId,
      data.direction,
    );
    return transport;
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('connectTransport')
  async handleConnectTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transportId: string; dtlsParameters: any },
  ) {
    await this.mediasoupService.connectTransport(data.transportId, data.dtlsParameters);
    return { status: 'connected' };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('produce')
  async handleProduce(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transportId: string; kind: 'audio' | 'video'; rtpParameters: any; groupId: string },
  ) {
    const result = await this.mediasoupService.produce(
      data.transportId,
      data.kind,
      data.rtpParameters,
      client.data.user.id,
      data.groupId,
    );

    client.to(data.groupId).emit('userStartedSpeaking', {
      userId: client.data.user.id,
      username: client.data.user.username,
      producerId: result.id,
    });

    return result;
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('consume')
  async handleConsume(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transportId: string; producerId: string; rtpCapabilities: any; groupId: string },
  ) {
    const consumer = await this.mediasoupService.consume(
      data.transportId,
      data.producerId,
      data.rtpCapabilities,
      client.data.user.id,
    );

    return consumer;
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('closeProducer')
  async handleCloseProducer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    await this.mediasoupService.closeProducer(data.groupId, client.data.user.id);
    client.to(data.groupId).emit('userStoppedSpeaking', { userId: client.data.user.id });
    return { status: 'closed' };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; content: string },
  ) {
    const message = await this.chatService.createMessage(
      client.data.user.id,
      data.groupId,
      data.content,
    );
    
    console.log(`New message from ${client.data.user.username} in room ${data.groupId}`);
    
    // Broadcast message to everyone in the room
    this.server.to(data.groupId).emit('newMessage', message);
    
    return { status: 'sent', messageId: message.id };
  }
}
