import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { StartupMigrationsService } from './startup-migrations.service';

@Global()
@Module({
  providers: [PrismaService, StartupMigrationsService],
  exports: [PrismaService],
})
export class PrismaModule {}
