import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createMessage(userId: string, groupId: string, content: string) {
    return this.prisma.message.create({
      data: {
        userId,
        groupId,
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  async getMessages(groupId: string, skip = 0, take = 50) {
    return this.prisma.message.findMany({
      where: { groupId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }
}
