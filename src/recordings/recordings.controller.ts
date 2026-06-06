import { Body, Controller, Get, Param, Post, Query, Request, UseGuards, StreamableFile } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordingsService } from './recordings.service';

interface UploadRecordingBody {
  recordingId: string;
  groupId: string;
  audioBase64: string;
  mimeType?: string;
  startTime: string;
  endTime: string;
}

@ApiTags('Recordings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recordings')
export class RecordingsController {
  constructor(private recordingsService: RecordingsService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a push-to-talk recording' })
  async uploadRecording(
    @Request() req,
    @Body() data: UploadRecordingBody,
  ) {
    const recording = await this.recordingsService.saveUploadedRecording(
      data.recordingId,
      data.groupId,
      req.user.id,
      data.audioBase64,
      data.mimeType,
      data.startTime,
      data.endTime,
    );

    return recording
      ? {
          ...recording,
          fileUrl: `/uploads/${path.basename(recording.filePath)}`,
          timestamp: recording.createdAt,
        }
      : { status: 'empty' };
  }

  @Get(':groupId')
  @ApiOperation({ summary: 'Get recording history for a group' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async getRecordings(
    @Param('groupId') groupId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    const recordings = await this.recordingsService.findAllForGroup(groupId, skip ? +skip : 0, take ? +take : 20);
    return recordings.map(rec => ({
      ...rec,
      fileUrl: `/uploads/${path.basename(rec.filePath)}`,
      timestamp: rec.createdAt,
    }));
  }

  @Get('analytics')
  async getAnalytics(
    @Query('groupId') groupId?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.recordingsService.getAnalytics(
      groupId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      userId,
    );
  }

  @Get('daily/:groupId/:date')
  async getDailyUnified(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
  ) {
    const recordings = await this.recordingsService.getDailyUnified(groupId, date);
    return recordings.map(rec => ({
      ...rec,
      fileUrl: `/uploads/${path.basename(rec.filePath)}`,
      timestamp: rec.createdAt,
    }));
  }

  @Get('file/:id')
  @ApiOperation({ summary: 'Stream a recording file' })
  async streamFile(@Param('id') id: string) {
    const recording = await this.recordingsService.findById(id);
    if (!recording) return;
    
    const storagePath = process.env.STORAGE_PATH || './storage/records';
    const filename = path.basename(recording.filePath);
    const absolutePath = path.join(process.cwd(), storagePath, filename);
    
    if (!fs.existsSync(absolutePath)) {
      return;
    }

    const file = fs.createReadStream(absolutePath);
    return new StreamableFile(file);
  }
}
