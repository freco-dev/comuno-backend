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
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { VoiceService } from './voice.service';
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
    if (client.data.groupId && client.data.user?.id) {
      client.to(client.data.groupId).emit('peerLeft', {
        userId: client.data.user.id,
      });
    }
    await this.voiceService.handleUserDisconnect(client, this.server);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    client.join(data.groupId);
    client.data.groupId = data.groupId;
    console.log(`User ${client.data.user.username} joined room ${data.groupId}`);
    client.to(data.groupId).emit('peerJoined', {
      userId: client.data.user.id,
      username: client.data.user.username,
    });

    const participants = this.getRoomParticipants(data.groupId, client.id);
    return { status: 'joined', groupId: data.groupId, participants };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    client.leave(data.groupId);
    client.to(data.groupId).emit('peerLeft', {
      userId: client.data.user.id,
    });
    client.data.groupId = undefined;
    console.log(`User ${client.data.user.username} left room ${data.groupId}`);
    return { status: 'left', groupId: data.groupId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('webrtcOffer')
  handleWebRTCOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; to: string; sdp: any },
  ) {
    this.emitToUserInRoom(data.groupId, data.to, 'webrtcOffer', {
      from: client.data.user.id,
      username: client.data.user.username,
      sdp: data.sdp,
    });
    return { status: 'sent' };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('webrtcAnswer')
  handleWebRTCAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; to: string; sdp: any },
  ) {
    this.emitToUserInRoom(data.groupId, data.to, 'webrtcAnswer', {
      from: client.data.user.id,
      username: client.data.user.username,
      sdp: data.sdp,
    });
    return { status: 'sent' };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('webrtcIceCandidate')
  handleWebRTCIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; to: string; candidate: any },
  ) {
    this.emitToUserInRoom(data.groupId, data.to, 'webrtcIceCandidate', {
      from: client.data.user.id,
      username: client.data.user.username,
      candidate: data.candidate,
    });
    return { status: 'sent' };
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

  private getRoomParticipants(groupId: string, excludeSocketId: string) {
    const adapterRoom = this.server.sockets.adapter.rooms.get(groupId);
    if (!adapterRoom) return [];

    return Array.from(adapterRoom)
      .filter((socketId) => socketId !== excludeSocketId)
      .map((socketId) => this.server.sockets.sockets.get(socketId))
      .filter((socket): socket is Socket => Boolean(socket?.data?.user))
      .map((socket) => ({
        userId: socket.data.user.id,
        username: socket.data.user.username,
      }));
  }

  private emitToUserInRoom(groupId: string, userId: string, event: string, payload: any) {
    const adapterRoom = this.server.sockets.adapter.rooms.get(groupId);
    if (!adapterRoom) return;

    for (const socketId of adapterRoom) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket?.data?.user?.id === userId) {
        socket.emit(event, payload);
      }
    }
  }

}
