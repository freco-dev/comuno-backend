import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService
  ) {}

  @Get('users')
  async getAllUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a new user' })
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Put('users/:id')
  @ApiOperation({ summary: 'Update a user' })
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete a user' })
  async deleteUser(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Get('groups')
  async getAllGroups() {
    return this.prisma.group.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get overall system stats' })
  async getStats() {
    const [users, groups, recordings] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.group.count(),
      this.prisma.recording.count(),
    ]);

    // Mock online users for now
    const online = Math.floor(Math.random() * 10) + 1;

    return {
      users,
      groups,
      recordings,
      online,
    };
  }

  @Get('recordings')
  @ApiOperation({ summary: 'Get all recordings for admin' })
  async getAllRecordings() {
    const recordings = await this.prisma.recording.findMany({
      include: {
        user: { select: { username: true } },
        group: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return recordings.map(rec => ({
      ...rec,
      fileUrl: `/uploads/${require('path').basename(rec.filePath)}`
    }));
  }
}
