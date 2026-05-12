import { Injectable, Logger } from '@nestjs/common';
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

  async saveRecording(groupId: string, userId: string, buffers: Buffer[]) {
    if (buffers.length === 0) return;

    const recordingId = crypto.randomUUID();
    const tempFilePath = path.join(this.storagePath, `${recordingId}.raw`);
    const finalFilePath = path.join(this.storagePath, `${recordingId}.mp3`);

    try {
      // Concatenate buffers
      const fullBuffer = Buffer.concat(buffers);
      fs.writeFileSync(tempFilePath, fullBuffer);

      // Convert to mp3 using ffmpeg (assuming input is PCM or something ffmpeg understands)
      // Note: In a real PTT app, you'd know the codec (e.g. Opus). 
      // For now, let's assume we can convert it.
      ffmpeg(tempFilePath)
        .toFormat('mp3')
        .on('error', (err) => {
          this.logger.error(`Error converting recording: ${err.message}`);
        })
        .on('end', async () => {
          this.logger.log(`Recording saved: ${finalFilePath}`);
          
          // Save to database
          await this.prisma.recording.create({
            data: {
              id: recordingId,
              groupId,
              userId,
              filePath: finalFilePath,
            },
          });

          // Delete temp file
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        })
        .save(finalFilePath);

    } catch (error) {
      this.logger.error(`Failed to save recording: ${error.message}`);
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
}
