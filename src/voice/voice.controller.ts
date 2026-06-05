import {
  BadRequestException,
  Controller,
  Get,
  InternalServerErrorException,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessToken } from 'livekit-server-sdk';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Voice')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('voice')
export class VoiceController {
  constructor(private configService: ConfigService) {}

  @Get('livekit-token')
  @ApiOperation({ summary: 'Create a LiveKit access token for a group voice room' })
  async createLiveKitToken(@Query('groupId') groupId: string, @Request() req) {
    const livekitUrl = this.configService.get<string>('LIVEKIT_URL')?.trim();
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET')?.trim();

    if (!livekitUrl || !apiKey || !apiSecret) {
      throw new InternalServerErrorException('LiveKit env vars are missing');
    }
    if (!groupId?.trim()) {
      throw new BadRequestException('groupId is required');
    }

    const roomName = `group-${groupId.trim().replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const token = new AccessToken(apiKey, apiSecret, {
      identity: req.user.id,
      name: req.user.username,
      ttl: '2h',
      metadata: JSON.stringify({ groupId }),
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      url: livekitUrl,
      token: await token.toJwt(),
      room: roomName,
    };
  }
}
