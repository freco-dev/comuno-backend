import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket, Server } from 'socket.io';
import { UsersService } from '../users/users.service';
import { RecordingsService } from '../recordings/recordings.service';

@Injectable()
export class VoiceService {
  // Map of groupId -> userId of the person currently speaking
  private activeSpeakers = new Map<string, string>();
  
  // Map of groupId -> { userId, buffers: Buffer[] }
  private recordingBuffers = new Map<string, { userId: string; buffers: Buffer[] }>();

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private recordingsService: RecordingsService,
  ) {}

  async authenticate(socket: Socket) {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('No token provided');

    try {
      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findById(payload.sub);
      if (!user) throw new Error('User not found');
      return user;
    } catch (e) {
      throw new Error('Invalid token');
    }
  }

  async tryToSpeak(groupId: string, userId: string): Promise<boolean> {
    if (this.activeSpeakers.has(groupId)) {
      return false; // Someone is already speaking
    }
    this.activeSpeakers.set(groupId, userId);
    
    // Initialize recording buffer
    this.recordingBuffers.set(groupId, { userId, buffers: [] });
    
    return true;
  }

  stopSpeaking(groupId: string, userId: string) {
    if (this.activeSpeakers.get(groupId) === userId) {
      this.activeSpeakers.delete(groupId);
      
      // Handle the end of recording session
      const session = this.recordingBuffers.get(groupId);
      if (session) {
        this.recordingsService.saveRecording(groupId, userId, session.buffers);
        this.recordingBuffers.delete(groupId);
      }
    }
  }

  appendVoiceData(groupId: string, userId: string, buffer: Buffer) {
    const session = this.recordingBuffers.get(groupId);
    if (session && session.userId === userId) {
      session.buffers.push(buffer);
    }
  }

  handleUserDisconnect(client: Socket, server: Server) {
    const userId = client.data.user?.id;
    if (!userId) return;

    // Check if the user was speaking in any room
    for (const [groupId, speakerId] of this.activeSpeakers.entries()) {
      if (speakerId === userId) {
        this.stopSpeaking(groupId, userId);
        server.to(groupId).emit('userStoppedSpeaking', { userId });
      }
    }
  }
}
