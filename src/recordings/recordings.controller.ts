import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordingsService } from './recordings.service';

@ApiTags('Recordings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recordings')
export class RecordingsController {
  constructor(private recordingsService: RecordingsService) {}

  @Get(':groupId')
  @ApiOperation({ summary: 'Get recording history for a group' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async getRecordings(
    @Param('groupId') groupId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.recordingsService.findAllForGroup(groupId, skip ? +skip : 0, take ? +take : 20);
  }
}
