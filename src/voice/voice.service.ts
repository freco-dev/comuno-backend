import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket, Server } from 'socket.io';
import { UsersService } from '../users/users.service';
import { RecordingsService } from '../recordings/recordings.service';

interface RecordingSession {
  userId: string;
  buffers: Buffer[];
  startTime: Date;
}

@Injectable()
export class VoiceService {
  // Set of "groupId:userId" indicating active speakers
  private activeSpeakers = new Set<string>();
  
  // Map of "groupId:userId" -> RecordingSession
  private recordingBuffers = new Map<string, RecordingSession>();

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
    const key = `${groupId}:${userId}`;
    this.activeSpeakers.add(key);
    
    // Initialize recording buffer with start time
    this.recordingBuffers.set(key, { userId, buffers: [], startTime: new Date() });
    
    return true;
  }

  async stopSpeaking(groupId: string, userId: string) {
    const key = `${groupId}:${userId}`;
    if (this.activeSpeakers.has(key)) {
      this.activeSpeakers.delete(key);
      
      // Handle the end of recording session
      const session = this.recordingBuffers.get(key);
      if (session) {
        await this.recordingsService.saveRecording(groupId, userId, session.buffers, session.startTime);
        this.recordingBuffers.delete(key);
      }
    }
  }

  appendVoiceData(groupId: string, userId: string, buffer: Buffer) {
    const key = `${groupId}:${userId}`;
    const session = this.recordingBuffers.get(key);
    if (session && session.userId === userId) {
      session.buffers.push(buffer);
    }
  }

  async handleUserDisconnect(client: Socket, server: Server) {
    const userId = client.data.user?.id;
    if (!userId) return;

    // Check if the user was speaking in any room
    for (const key of this.activeSpeakers) {
      const [groupId, speakerId] = key.split(':');
      if (speakerId === userId) {
        await this.stopSpeaking(groupId, userId);
        server.to(groupId).emit('userStoppedSpeaking', { userId });
      }
    }
  }
}
