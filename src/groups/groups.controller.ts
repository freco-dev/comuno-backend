import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { GroupsService } from './groups.service';

@ApiTags('Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('groups')
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all groups' })
  async getGroups(@Request() req) {
    // Admin, CEO, and Manager get all groups, others get their own
    if (req.user.role === Role.ADMIN || req.user.role === Role.CEO || req.user.role === Role.MANAGER) {
      return this.groupsService.findAll();
    }
    return this.groupsService.findAllForUser(req.user.id);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get groups available to join' })
  async getAvailableGroups(@Request() req) {
    return this.groupsService.findAvailable(req.user.id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new group (Admin only)' })
  async createGroup(@Body() data: { name: string; description?: string; moderatorId?: string }) {
    return this.groupsService.createGroup(data);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a group (Admin only)' })
  async updateGroup(@Param('id') id: string, @Body() data: { name?: string; description?: string; moderatorId?: string }) {
    return this.groupsService.updateGroup(id, data);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a group (Admin only)' })
  async deleteGroup(@Param('id') id: string) {
    return this.groupsService.deleteGroup(id);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join a group' })
  async joinGroup(@Param('id') id: string, @Request() req) {
    return this.groupsService.joinGroup(req.user.id, id);
  }

  @Post('leave')
  @ApiOperation({ summary: 'Leave current group' })
  async leaveGroup(@Request() req) {
    return this.groupsService.leaveGroup(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get group details' })
  async getGroup(@Param('id') id: string) {
    return this.groupsService.findById(id);
  }
}
