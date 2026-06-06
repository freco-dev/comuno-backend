import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';
import * as crypto from 'crypto';

@Injectable()
export class RecordingsService {
  private readonly logger = new Logger(RecordingsService.name);
  private storagePath: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.storagePath = this.configService.get('STORAGE_PATH') || './storage/records';
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async saveRecording(groupId: string, userId: string, buffers: Buffer[], startTime: Date) {
    if (buffers.length === 0) return;

    const recordingId = crypto.randomUUID();
    const tempFilePath = path.join(this.storagePath, `${recordingId}.raw`);
    const finalFilePath = path.join(this.storagePath, `${recordingId}.mp3`);
    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    const duration = durationMs / 1000;

    try {
      // Concatenate buffers
      const fullBuffer = Buffer.concat(buffers);
      fs.writeFileSync(tempFilePath, fullBuffer);

      // Convert to mp3 using ffmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempFilePath)
          .toFormat('mp3')
          .on('error', (err) => {
            this.logger.error(`Error converting recording: ${err.message}`);
            reject(err);
          })
          .on('end', async () => {
            this.logger.log(`Recording saved: ${finalFilePath}`);
            
            // Save to database
            await this.prisma.recording.create({
              data: {
                id: recordingId,
                groupId,
                userId,
                filePath: `${recordingId}.mp3`,
                startTime,
                endTime,
                duration,
                durationMs,
              },
            });

            // Delete temp file
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
            resolve();
          })
          .save(finalFilePath);
      });

    } catch (error) {
      this.logger.error(`Failed to save recording: ${error.message}`);
    }
  }

  async saveUploadedRecording(
    recordingId: string,
    groupId: string,
    userId: string,
    audioBase64: string,
    mimeType = 'audio/mp4',
    startTimeValue: string,
    endTimeValue: string,
  ) {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(recordingId || '')) {
      throw new BadRequestException('recordingId is invalid');
    }
    if (!groupId?.trim()) {
      throw new BadRequestException('groupId is required');
    }

    const existingRecording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
    });
    if (existingRecording) {
      if (existingRecording.userId !== userId || existingRecording.groupId !== groupId) {
        throw new BadRequestException('recordingId is already in use');
      }
      return existingRecording;
    }

    const startTime = new Date(startTimeValue);
    const endTime = new Date(endTimeValue);
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime())) {
      throw new BadRequestException('startTime and endTime must be valid ISO dates');
    }
    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const normalizedBase64 = audioBase64.includes(',') ? audioBase64.split(',').pop() || '' : audioBase64;
    if (!normalizedBase64) {
      throw new BadRequestException('audioBase64 is required');
    }

    const audioBuffer = Buffer.from(normalizedBase64, 'base64');
    if (audioBuffer.length === 0) {
      throw new BadRequestException('Audio payload is empty');
    }
    if (audioBuffer.length > 15 * 1024 * 1024) {
      throw new BadRequestException('Audio segment exceeds the 15 MB limit');
    }

    const groupMembership = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        OR: [
          { moderatorId: userId },
          { users: { some: { id: userId } } },
        ],
      },
      select: { id: true },
    });
    if (!groupMembership) {
      throw new NotFoundException('User is not a member of this group');
    }

    const extension = this.getExtensionForMimeType(mimeType);
    const filename = `${recordingId}${extension}`;
    const filePath = path.join(this.storagePath, filename);
    const durationMs = endTime.getTime() - startTime.getTime();

    try {
      fs.writeFileSync(filePath, audioBuffer);

      return this.prisma.recording.create({
        data: {
          id: recordingId,
          groupId,
          userId,
          filePath: filename,
          startTime,
          endTime,
          duration: durationMs / 1000,
          durationMs,
        },
      });
    } catch (error) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this.logger.error(`Failed to save uploaded recording: ${error.message}`);
      throw error;
    }
  }

  private getExtensionForMimeType(mimeType: string) {
    switch (mimeType.toLowerCase()) {
      case 'audio/m4a':
      case 'audio/mp4':
      case 'audio/aac':
        return '.m4a';
      case 'audio/mpeg':
      case 'audio/mp3':
        return '.mp3';
      case 'audio/webm':
        return '.webm';
      case 'audio/wav':
      case 'audio/wave':
      case 'audio/x-wav':
        return '.wav';
      default:
        return '.m4a';
    }
  }

  async findAllForGroup(groupId: string, skip = 0, take = 20) {
    return this.prisma.recording.findMany({
      where: { groupId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async findById(id: string) {
    return this.prisma.recording.findUnique({ where: { id } });
  }

  async getAnalytics(groupId?: string, startDate?: Date, endDate?: Date, userId?: string) {
    const where: any = {};
    if (groupId) where.groupId = groupId;
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const recordings = await this.prisma.recording.findMany({
      where,
      include: { 
        user: { select: { username: true } },
        group: { select: { name: true } }
      },
      orderBy: { createdAt: 'asc' },
    });

    // Activity calculations
    const dailyActivity: Record<string, number> = {};
    const userActivity: Record<string, number> = {};
    const groupActivity: Record<string, number> = {};
    const hourlyActivity = Array(24).fill(0);
    const weeklyActivity = Array(7).fill(0);
    const now = new Date();
    
    recordings.forEach((rec) => {
      const day = rec.createdAt.toISOString().split('T')[0];
      const hour = rec.createdAt.getHours();
      const duration = rec.duration || 0;

      dailyActivity[day] = (dailyActivity[day] || 0) + duration;
      hourlyActivity[hour] += duration;
      
      // Weekly index (0 = 6 days ago, 6 = today)
      const diffTime = Math.abs(now.getTime() - rec.createdAt.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        weeklyActivity[6 - diffDays] += duration;
      }

      const username = rec.user.username;
      userActivity[username] = (userActivity[username] || 0) + duration;

      const groupName = (rec as any).group?.name || 'Unknown';
      groupActivity[groupName] = (groupActivity[groupName] || 0) + duration;
    });

    return {
      totalDuration: recordings.reduce((acc, rec) => acc + (rec.duration || 0), 0),
      count: recordings.length,
      dailyActivity,
      userActivity,
      groupActivity,
      hourlyActivity,
      weeklyActivity,
    };
  }

  async getDailyUnified(groupId: string, date: string) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return this.prisma.recording.findMany({
      where: {
        groupId,
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
