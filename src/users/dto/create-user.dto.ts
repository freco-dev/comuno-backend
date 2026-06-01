import { IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'sardor123', description: 'Username of the user' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ example: 'parol123', description: 'Password of the user' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ enum: Role, example: Role.SELLER, description: 'Role assigned to the user' })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'group-uuid-here', description: 'Associated group ID', required: false })
  @IsOptional()
  @IsString()
  groupId?: string;
}
