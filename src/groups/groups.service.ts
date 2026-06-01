import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Group, Prisma } from '@prisma/client';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.group.findMany({
      include: {
        moderator: { select: { id: true, username: true } },
        _count: { select: { users: true, recordings: true } },
      },
    });
  }

  async findAllForUser(userId: string): Promise<Group[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        group: {
          include: {
            moderator: { select: { id: true, username: true } },
            _count: { select: { users: true } },
          },
        },
      },
    });

    return user?.group ? [user.group] : [];
  }

  async findAvailable(userId: string): Promise<Group[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { groupId: true },
    });

    return this.prisma.group.findMany({
      where: {
        id: { not: user?.groupId || undefined },
      },
      include: {
        moderator: { select: { id: true, username: true } },
        _count: { select: { users: true } },
      },
    });
  }

  async findById(id: string): Promise<any> {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        moderator: { select: { id: true, username: true } },
        users: {
          select: { id: true, username: true, role: true },
        },
        _count: { select: { users: true, recordings: true } },
      },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    return {
      ...group,
      members: group.users.map(u => ({ user: u })),
    };
  }

  async joinGroup(userId: string, groupId: string) {
    const [group, user] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: groupId },
        include: {
          _count: { select: { users: true } },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, groupId: true },
      }),
    ]);

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Idempotent join: return current state instead of writing same value again.
    if (user.groupId === groupId) {
      return {
        joined: false,
        alreadyMember: true,
        group,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { groupId },
    });

    return {
      joined: true,
      alreadyMember: false,
      group,
    };
  }

  async leaveGroup(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, groupId: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.groupId) {
      return {
        left: false,
        alreadyWithoutGroup: true,
      };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { groupId: null },
    });

    return {
      left: true,
      alreadyWithoutGroup: false,
    };
  }

  async createGroup(data: { name: string; description?: string; moderatorId?: string }) {
    return this.prisma.group.create({
      data: {
        name: data.name,
        description: data.description,
        moderatorId: data.moderatorId,
      },
    });
  }

  async updateGroup(id: string, data: { name?: string; description?: string; moderatorId?: string }) {
    return this.prisma.group.update({
      where: { id },
      data,
    });
  }

  async deleteGroup(id: string) {
    return this.prisma.group.delete({ where: { id } });
  }
}
