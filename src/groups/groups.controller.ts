import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupsService } from './groups.service';

@ApiTags('Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all groups for the authenticated user' })
  async getMyGroups(@Request() req) {
    return this.groupsService.findAllForUser(req.user.id);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get groups available to join' })
  async getAvailableGroups(@Request() req) {
    return this.groupsService.findAvailable(req.user.id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join a group' })
  async joinGroup(@Param('id') id: string, @Request() req) {
    return this.groupsService.joinGroup(req.user.id, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get group details' })
  async getGroup(@Param('id') id: string) {
    return this.groupsService.findById(id);
  }
}
