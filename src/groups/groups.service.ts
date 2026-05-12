import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Group, Prisma } from '@prisma/client';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  async findAllForUser(userId: string): Promise<Group[]> {
    return this.prisma.group.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        parent: true,
      },
    });
  }

  async findAvailable(userId: string): Promise<Group[]> {
    return this.prisma.group.findMany({
      where: {
        members: {
          none: { userId },
        },
      },
      include: {
        parent: true,
      },
    });
  }

  async findById(id: string): Promise<Group> {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        members: {
          include: { user: true },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    return group;
  }

  async joinGroup(userId: string, groupId: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    try {
      return await this.prisma.groupMember.create({
        data: {
          userId,
          groupId,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User is already a member of this group');
      }
      throw error;
    }
  }

  async createGroup(data: Prisma.GroupCreateInput) {
    return this.prisma.group.create({ data });
  }
}
