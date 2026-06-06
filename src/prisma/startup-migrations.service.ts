import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma.service';

interface StartupMigration {
  id: string;
  statements: string[];
}

const STARTUP_MIGRATIONS: StartupMigration[] = [
  {
    id: '20260606_recording_segments',
    statements: [
      'ALTER TABLE "Recording" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER',
      `UPDATE "Recording"
       SET "durationMs" = ROUND(EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000)::INTEGER
       WHERE "durationMs" IS NULL`,
      `CREATE INDEX IF NOT EXISTS "Recording_groupId_startTime_idx"
       ON "Recording" ("groupId", "startTime")`,
      `CREATE INDEX IF NOT EXISTS "Recording_userId_startTime_idx"
       ON "Recording" ("userId", "startTime")`,
    ],
  },
];

@Injectable()
export class StartupMigrationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupMigrationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "__app_migrations" (
        "id" TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const migration of STARTUP_MIGRATIONS) {
      await this.applyMigration(migration);
    }
  }

  private async applyMigration(migration: StartupMigration) {
    const applied = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        migration.id,
      );

      const existing = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "__app_migrations" WHERE "id" = $1',
        migration.id,
      );
      if (existing.length > 0) {
        return false;
      }

      for (const statement of migration.statements) {
        await transaction.$executeRawUnsafe(statement);
      }

      await transaction.$executeRawUnsafe(
        'INSERT INTO "__app_migrations" ("id") VALUES ($1)',
        migration.id,
      );
      return true;
    }, {
      maxWait: 10_000,
      timeout: 120_000,
    });

    if (applied) {
      this.logger.log(`Startup migration applied: ${migration.id}`);
    }
  }
}
