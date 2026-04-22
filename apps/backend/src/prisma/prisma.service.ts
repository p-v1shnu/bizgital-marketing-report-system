import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    await this.ensureBrandLifecycleSchema();
    await this.ensureReportingPeriodRecycleBinSchema();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async ensureBrandLifecycleSchema() {
    await this.ensureBrandColumn(
      'activated_at',
      `ALTER TABLE brands
         ADD COLUMN activated_at DATETIME(3) NULL AFTER status`
    );
    await this.ensureBrandColumn(
      'deactivated_at',
      `ALTER TABLE brands
         ADD COLUMN deactivated_at DATETIME(3) NULL AFTER activated_at`
    );

    await this.$executeRawUnsafe(
      `UPDATE brands
       SET
         activated_at = CASE
           WHEN status = 'active' THEN COALESCE(activated_at, created_at)
           ELSE activated_at
         END,
         deactivated_at = CASE
           WHEN status = 'inactive' THEN COALESCE(deactivated_at, updated_at, created_at)
           ELSE deactivated_at
         END`
    );
  }

  private async ensureReportingPeriodRecycleBinSchema() {
    await this.ensureReportingPeriodColumn(
      'deleted_at',
      `ALTER TABLE reporting_periods
         ADD COLUMN deleted_at DATETIME(3) NULL AFTER question_snapshot_captured_at`
    );
    await this.ensureReportingPeriodColumn(
      'deleted_by_name',
      `ALTER TABLE reporting_periods
         ADD COLUMN deleted_by_name VARCHAR(191) NULL AFTER deleted_at`
    );
    await this.ensureReportingPeriodColumn(
      'deleted_by_email',
      `ALTER TABLE reporting_periods
         ADD COLUMN deleted_by_email VARCHAR(191) NULL AFTER deleted_by_name`
    );
    await this.ensureReportingPeriodColumn(
      'purge_at',
      `ALTER TABLE reporting_periods
         ADD COLUMN purge_at DATETIME(3) NULL AFTER deleted_by_email`
    );

    const hasRecycleIndex = await this.hasReportingPeriodIndex(
      'reporting_periods_deleted_at_purge_at_idx'
    );

    if (!hasRecycleIndex) {
      await this.$executeRawUnsafe(
        `CREATE INDEX reporting_periods_deleted_at_purge_at_idx
           ON reporting_periods (deleted_at, purge_at)`
      );
    }
  }

  private async ensureBrandColumn(
    columnName: 'activated_at' | 'deactivated_at',
    alterSql: string
  ) {
    const hasColumn = await this.hasBrandColumn(columnName);
    if (!hasColumn) {
      await this.$executeRawUnsafe(alterSql);
    }
  }

  private async ensureReportingPeriodColumn(
    columnName: 'deleted_at' | 'deleted_by_name' | 'deleted_by_email' | 'purge_at',
    alterSql: string
  ) {
    const hasColumn = await this.hasReportingPeriodColumn(columnName);
    if (!hasColumn) {
      await this.$executeRawUnsafe(alterSql);
    }
  }

  private async hasBrandColumn(columnName: string) {
    const rows = await this.$queryRawUnsafe<Array<{ total: bigint | number }>>(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'brands'
         AND COLUMN_NAME = ?`,
      columnName
    );

    return Number(rows[0]?.total ?? 0) > 0;
  }

  private async hasReportingPeriodColumn(columnName: string) {
    const rows = await this.$queryRawUnsafe<Array<{ total: bigint | number }>>(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'reporting_periods'
         AND COLUMN_NAME = ?`,
      columnName
    );

    return Number(rows[0]?.total ?? 0) > 0;
  }

  private async hasReportingPeriodIndex(indexName: string) {
    const rows = await this.$queryRawUnsafe<Array<{ total: bigint | number }>>(
      `SELECT COUNT(*) AS total
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'reporting_periods'
         AND INDEX_NAME = ?`,
      indexName
    );

    return Number(rows[0]?.total ?? 0) > 0;
  }
}
