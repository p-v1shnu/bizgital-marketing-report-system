import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ReportCadence, ReportWorkflowState } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  REPORT_METRIC_COMMENTARY_KEYS,
  REPORT_METRIC_LABELS
} from './manual-metrics.types';
import type {
  ManualHeaderMetricValues,
  ReportMetricApplicability,
  ReportMetricCommentaryEntry,
  ReportMetricCommentaryKey,
  UpdateReportMetricCommentaryInput,
  UpdateManualHeaderMetricInput
} from './manual-metrics.types';

type RawManualMetricRow = {
  viewers: string | number | null;
  page_followers: string | number | null;
  page_visit: string | number | null;
};

type RawMetricCommentaryRow = {
  metric_key: string;
  applicability: string;
  remark: string | null;
};

const MANUAL_HEADER_MAX_VALUE = 999_999_999_999_999;
const MAX_METRIC_COMMENTARY_REMARK_LENGTH = 280;

@Injectable()
export class ManualMetricsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureCommentaryStorage();
  }

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

  async getReportMetricCommentary(
    reportVersionId: string
  ): Promise<ReportMetricCommentaryEntry[]> {
    const rows = await this.prisma.$queryRawUnsafe<RawMetricCommentaryRow[]>(
      `
      SELECT metric_key, applicability, remark
      FROM report_metric_commentaries
      WHERE report_version_id = ?
      `,
      reportVersionId
    );
    const byKey = new Map(rows.map((row) => [row.metric_key, row]));

    return [...REPORT_METRIC_COMMENTARY_KEYS].map((key) => {
      const raw = byKey.get(key) ?? null;
      return {
        key,
        label: REPORT_METRIC_LABELS[key],
        applicability: this.normalizeApplicability(raw?.applicability),
        remark: this.normalizeRemark(raw?.remark)
      };
    });
  }

  async upsertReportMetricCommentary(
    reportVersionId: string,
    input: UpdateReportMetricCommentaryInput
  ) {
    if (!Array.isArray(input.entries) || input.entries.length === 0) {
      return this.getReportMetricCommentary(reportVersionId);
    }

    const seen = new Set<ReportMetricCommentaryKey>();

    await this.prisma.$transaction(async (tx) => {
      for (const entry of input.entries) {
        if (!entry || !this.isMetricCommentaryKey(entry.key)) {
          throw new BadRequestException('Metric commentary key is invalid.');
        }

        if (seen.has(entry.key)) {
          continue;
        }
        seen.add(entry.key);

        const applicability = this.normalizeApplicability(entry.applicability);
        const remark = this.normalizeRemark(entry.remark);

        await tx.$executeRawUnsafe(
          `
          INSERT INTO report_metric_commentaries (
            report_version_id,
            metric_key,
            applicability,
            remark,
            updated_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))
          ON DUPLICATE KEY UPDATE
            applicability = VALUES(applicability),
            remark = VALUES(remark),
            updated_at = CURRENT_TIMESTAMP(3)
          `,
          reportVersionId,
          entry.key,
          applicability,
          remark
        );
      }
    });

    return this.getReportMetricCommentary(reportVersionId);
  }

  async resolvePreviousVersionIdForCommentary(input: {
    brandId: string;
    year: number;
    month: number;
  }) {
    const previousPeriod = await this.prisma.reportingPeriod.findFirst({
      where: {
        brandId: input.brandId,
        cadence: ReportCadence.monthly,
        deletedAt: null,
        OR: [
          {
            year: {
              lt: input.year
            }
          },
          {
            year: input.year,
            month: {
              lt: input.month
            }
          }
        ]
      },
      include: {
        reportVersions: {
          orderBy: {
            versionNo: 'desc'
          }
        }
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });

    if (!previousPeriod) {
      return null;
    }

    const preferredOrder: ReportWorkflowState[] = [
      ReportWorkflowState.approved,
      ReportWorkflowState.submitted,
      ReportWorkflowState.draft,
      ReportWorkflowState.rejected,
      ReportWorkflowState.superseded
    ];

    for (const state of preferredOrder) {
      const matched = previousPeriod.reportVersions.find(
        (version) => version.workflowState === state
      );
      if (matched) {
        return matched.id;
      }
    }

    return previousPeriod.reportVersions[0]?.id ?? null;
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

  private async ensureCommentaryStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS report_metric_commentaries (
        report_version_id VARCHAR(191) NOT NULL,
        metric_key VARCHAR(64) NOT NULL,
        applicability VARCHAR(16) NOT NULL DEFAULT 'applicable',
        remark LONGTEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (report_version_id, metric_key)
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

    if (parsed <= 0) {
      throw new BadRequestException(`${label} must be greater than 0.`);
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

  private normalizeApplicability(
    value: string | null | undefined
  ): ReportMetricApplicability {
    return String(value ?? '')
      .toLowerCase()
      .trim() === 'na'
      ? 'na'
      : 'applicable';
  }

  private normalizeRemark(value: string | null | undefined) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length > MAX_METRIC_COMMENTARY_REMARK_LENGTH) {
      throw new BadRequestException(
        `Metric remark must be ${MAX_METRIC_COMMENTARY_REMARK_LENGTH} characters or fewer.`
      );
    }

    return normalized;
  }

  private isMetricCommentaryKey(value: string): value is ReportMetricCommentaryKey {
    return (REPORT_METRIC_COMMENTARY_KEYS as readonly string[]).includes(value);
  }
}
