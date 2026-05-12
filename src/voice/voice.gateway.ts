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
import { ChatService } from '../chat/chat.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'voice',
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private voiceService: VoiceService,
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

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.voiceService.handleUserDisconnect(client, this.server);
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
      return { status: 'denied', reason: 'Someone else is speaking' };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('stopSpeaking')
  handleStopSpeaking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    this.voiceService.stopSpeaking(data.groupId, client.data.user.id);
    client.to(data.groupId).emit('userStoppedSpeaking', {
      userId: client.data.user.id,
    });
    return { status: 'released' };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('voiceData')
  handleVoiceData(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; buffer: Buffer },
  ) {
    // Broadcast voice data to everyone in the room except the sender
    client.to(data.groupId).emit('voiceStream', {
      userId: client.data.user.id,
      buffer: data.buffer,
    });
    
    // Also save to internal buffer for recording
    this.voiceService.appendVoiceData(data.groupId, client.data.user.id, data.buffer);
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
    
    // Broadcast message to everyone in the room
    this.server.to(data.groupId).emit('newMessage', message);
    
    return { status: 'sent', messageId: message.id };
  }
}
