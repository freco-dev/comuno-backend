import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get(':groupId')
  @ApiOperation({ summary: 'Get chat history for a group' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async getMessages(
    @Param('groupId') groupId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.chatService.getMessages(groupId, skip ? +skip : 0, take ? +take : 50);
  }
}
