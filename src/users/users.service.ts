import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async create(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    // Check if username already exists
    const existing = await this.findOne(dto.username);
    if (existing) {
      throw new BadRequestException('Ushbu login band. Iltimos boshqa login tanlang.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        password: hashedPassword,
        role: dto.role,
        groupId: dto.groupId || null,
      },
    });

    const { password, ...result } = user;
    return result;
  }

  async update(id: string, dto: UpdateUserDto): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const updateData: any = {};
    if (dto.username) {
      // Check if new username belongs to someone else
      if (dto.username !== user.username) {
        const existing = await this.findOne(dto.username);
        if (existing) {
          throw new BadRequestException('Ushbu yangi login allaqachon band.');
        }
      }
      updateData.username = dto.username;
    }

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }

    if (dto.role) {
      updateData.role = dto.role;
    }

    if (dto.groupId !== undefined) {
      updateData.groupId = dto.groupId || null;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    const { password, ...result } = updated;
    return result;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return { success: true };
  }
}
