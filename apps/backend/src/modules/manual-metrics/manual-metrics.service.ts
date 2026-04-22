import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  ManualHeaderMetricValues,
  UpdateManualHeaderMetricInput
} from './manual-metrics.types';

type RawManualMetricRow = {
  viewers: string | number | null;
  page_followers: string | number | null;
  page_visit: string | number | null;
};

const MANUAL_HEADER_MAX_VALUE = 999_999_999_999_999;

@Injectable()
export class ManualMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReportManualMetrics(reportVersionId: string): Promise<ManualHeaderMetricValues> {
    await this.ensureStorage();

    const rows = await this.prisma.$queryRawUnsafe<RawManualMetricRow[]>(
      `
      SELECT viewers, page_followers, page_visit
      FROM report_manual_metrics
      WHERE report_version_id = ?
      LIMIT 1
      `,
      reportVersionId
    );
    const row = rows[0] ?? null;

    if (!row) {
      return {
        viewers: null,
        pageFollowers: null,
        pageVisit: null
      };
    }

    return {
      viewers: this.toNumber(row.viewers),
      pageFollowers: this.toNumber(row.page_followers),
      pageVisit: this.toNumber(row.page_visit)
    };
  }

  async upsertReportManualMetrics(
    reportVersionId: string,
    input: UpdateManualHeaderMetricInput
  ) {
    await this.ensureStorage();

    const viewers = this.normalizeNumberInput(input.viewers, 'Viewers');
    const pageFollowers = this.normalizeNumberInput(input.pageFollowers, 'Page Followers');
    const pageVisit = this.normalizeNumberInput(input.pageVisit, 'Page Visit');

    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO report_manual_metrics (
        report_version_id,
        viewers,
        page_followers,
        page_visit,
        updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE
        viewers = VALUES(viewers),
        page_followers = VALUES(page_followers),
        page_visit = VALUES(page_visit),
        updated_at = CURRENT_TIMESTAMP(3)
      `,
      reportVersionId,
      viewers,
      pageFollowers,
      pageVisit
    );

    return this.getReportManualMetrics(reportVersionId);
  }

  private async ensureStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS report_manual_metrics (
        report_version_id VARCHAR(191) NOT NULL,
        viewers DECIMAL(18, 2) NULL,
        page_followers DECIMAL(18, 2) NULL,
        page_visit DECIMAL(18, 2) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (report_version_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  private normalizeNumberInput(rawValue: string | null | undefined, label: string) {
    const normalized = String(rawValue ?? '').trim();

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized.replaceAll(',', ''));

    if (!Number.isSafeInteger(parsed)) {
      throw new BadRequestException(`${label} must be a whole number.`);
    }

    if (parsed < 0) {
      throw new BadRequestException(`${label} must be 0 or more.`);
    }

    if (parsed > MANUAL_HEADER_MAX_VALUE) {
      throw new BadRequestException(
        `${label} must be ${new Intl.NumberFormat('en-US').format(MANUAL_HEADER_MAX_VALUE)} or less.`
      );
    }

    return parsed;
  }

  private toNumber(value: string | number | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
