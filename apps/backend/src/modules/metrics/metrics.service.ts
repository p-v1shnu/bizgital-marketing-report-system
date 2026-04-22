import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ComputedColumnKey,
  KpiSourceType,
  MappingTargetField,
  ReportWorkflowState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { BrandsService } from '../brands/brands.service';
import { ColumnConfigService } from '../column-config/column-config.service';
import { previewFormulaExpression } from '../column-config/formula-engine';
import { resolveImportStoragePath } from '../imports/import-storage';
import { parseImportDocument } from '../imports/imports.tabular';
import { KpiService } from '../kpi/kpi.service';
import { ManualMetricsService } from '../manual-metrics/manual-metrics.service';
import {
  AVAILABLE_TARGETS_BY_KEY,
  METRIC_TARGET_FIELDS
} from '../mapping/mapping-targets';
import {
  parseManualSourceRowsSettingPayload,
  toManualSourceRowsSettingKey
} from '../dataset/manual-source-rows-setting';
import {
  parseManualFormulaRowsSettingPayload,
  toManualFormulaRowsSettingKey
} from '../dataset/manual-formula-rows-setting';
import type {
  MetricsKpiPreviewResponse,
  MetricsOverviewResponse
} from './metrics.types';
import type { BrandKpiPlanResponse } from '../kpi/kpi.types';

type SnapshotMetricItem = {
  key: MappingTargetField;
  label: string;
  value: number;
  rowCoverage: number;
  overrideCount: number;
  sourceColumnName: string | null;
  sourceAliasLabel: string | null;
};

type SnapshotStatus = {
  state: MetricsOverviewResponse['readiness']['state'];
  detail: string;
  snapshot: {
    id: string;
    reportVersionId: string;
    generatedAt: Date;
    isCurrent: boolean;
  } | null;
  summary: {
    datasetRowCount: number;
    overriddenCellCount: number;
    metricCount: number;
  };
  items: SnapshotMetricItem[];
};

const MANUAL_HEADER_CANONICAL_FIELDS = new Set<MappingTargetField>([
  MappingTargetField.viewers,
  MappingTargetField.page_followers
]);

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly columnConfigService: ColumnConfigService,
    private readonly kpiService: KpiService,
    private readonly manualMetricsService: ManualMetricsService
  ) {}

  async getMetricsOverview(
    brandCode: string,
    periodId: string
  ): Promise<MetricsOverviewResponse> {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const period = await this.prisma.reportingPeriod.findUnique({
      where: { id: periodId },
      include: {
        reportVersions: {
          orderBy: {
            versionNo: 'desc'
          },
          include: {
            importJobs: {
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        }
      }
    });

    if (!period || period.brandId !== brand.id) {
      throw new NotFoundException('Reporting period not found for this brand.');
    }

    const currentDraft =
      period.reportVersions.find((version) => version.workflowState === ReportWorkflowState.draft) ??
      null;
    const latestVersion = period.reportVersions[0] ?? null;
    const targetVersion = currentDraft ?? latestVersion;
    const latestImportJob = targetVersion
      ? await this.prisma.importJob.findFirst({
          where: {
            reportVersionId: targetVersion.id
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      : null;

    const baseResponse: Omit<
      MetricsOverviewResponse,
      'readiness' | 'snapshot' | 'summary' | 'items' | 'plan'
    > = {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name,
        timezone: brand.timezone
      },
      period: {
        id: period.id,
        year: period.year,
        month: period.month,
        label: new Intl.DateTimeFormat('en-US', {
          month: 'long',
          year: 'numeric'
        }).format(new Date(Date.UTC(period.year, period.month - 1, 1))),
        currentDraftVersionId: currentDraft?.id ?? null,
        latestVersionState: latestVersion?.workflowState ?? null
      }
    };

    if (!targetVersion || !latestImportJob) {
      return {
        ...baseResponse,
        readiness: {
          state: 'blocked',
          detail:
            'Import, mapping, and dataset materialization must exist before metrics can be calculated.'
        },
        snapshot: null,
        summary: {
          datasetRowCount: 0,
          overriddenCellCount: 0,
          metricCount: 0
        },
        plan: {
          id: null,
          year: period.year,
          itemCount: 0,
          updatedAt: null
        },
        items: []
      };
    }

    const preferSnapshotPlan = targetVersion.workflowState === ReportWorkflowState.approved;
    const [snapshotStatus, resolvedKpiPlan] = await Promise.all([
      this.getSnapshotStatusForReportVersion(targetVersion.id),
      this.kpiService.getBrandKpiPlanForReportVersion(
        brandCode,
        period.year,
        targetVersion.id,
        {
          preferSnapshot: preferSnapshotPlan,
          autoCaptureFromCurrentPlan: preferSnapshotPlan
        }
      )
    ]);
    const kpiPlan =
      resolvedKpiPlan.items.length > 0
        ? resolvedKpiPlan
        : preferSnapshotPlan
          ? this.buildLegacySnapshotFallbackPlan({
              brand: resolvedKpiPlan.brand,
              year: period.year,
              snapshotStatus
            })
          : resolvedKpiPlan;

    if (kpiPlan.items.length === 0) {
      return {
        ...baseResponse,
        readiness: {
          state: 'blocked',
          detail:
            'Create a KPI plan for this brand and year before the Metrics page can show monthly KPI tracking.'
        },
        snapshot: snapshotStatus.snapshot
          ? {
              id: snapshotStatus.snapshot.id,
              reportVersionId: snapshotStatus.snapshot.reportVersionId,
              generatedAt: snapshotStatus.snapshot.generatedAt.toISOString(),
              isCurrent: snapshotStatus.snapshot.isCurrent
            }
          : null,
        summary: {
          ...snapshotStatus.summary,
          metricCount: 0
        },
        plan: {
          ...kpiPlan.plan,
          year: kpiPlan.year
        },
        items: []
      };
    }

    const planItems = await this.buildPlanItems({
      brandCode,
      periodId,
      reportVersionId: targetVersion.id,
      snapshotStatus,
      kpiPlan,
      latestImportJob,
      manualHeaderMetrics: await this.manualMetricsService.getReportManualMetrics(targetVersion.id)
    });
    const needsCanonicalMetrics = kpiPlan.items.some(
      item => item.kpi.sourceType === KpiSourceType.canonical_metric
    );
    const readiness =
      snapshotStatus.state === 'blocked' && !needsCanonicalMetrics
        ? {
            state: 'ready' as const,
            detail:
              'This KPI plan is powered only by formula columns, so monthly KPI values can still be shown without canonical metric snapshot coverage.'
          }
        : {
            state: snapshotStatus.state,
            detail: snapshotStatus.detail
          };

    return {
      ...baseResponse,
      readiness,
      snapshot: snapshotStatus.snapshot
        ? {
            id: snapshotStatus.snapshot.id,
            reportVersionId: snapshotStatus.snapshot.reportVersionId,
            generatedAt: snapshotStatus.snapshot.generatedAt.toISOString(),
            isCurrent: snapshotStatus.snapshot.isCurrent
          }
        : null,
      plan: {
        ...kpiPlan.plan,
        year: kpiPlan.year
      },
      items: planItems,
      summary: {
        ...snapshotStatus.summary,
        metricCount: planItems.length
      }
    };
  }

  async getMetricsItemsForReportVersion(
    reportVersionId: string
  ): Promise<MetricsOverviewResponse['items']> {
    const reportVersion = await this.prisma.reportVersion.findUnique({
      where: {
        id: reportVersionId
      },
      include: {
        reportingPeriod: {
          include: {
            brand: true
          }
        }
      }
    });

    if (!reportVersion) {
      throw new NotFoundException('Report version was not found.');
    }

    const latestImportJob = await this.prisma.importJob.findFirst({
      where: {
        reportVersionId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!latestImportJob) {
      return [];
    }

    const brandCode = reportVersion.reportingPeriod.brand.code;
    const periodId = reportVersion.reportingPeriodId;
    const periodYear = reportVersion.reportingPeriod.year;
    const preferSnapshotPlan = reportVersion.workflowState === ReportWorkflowState.approved;
    const [resolvedKpiPlan, snapshotStatus, manualHeaderMetrics] = await Promise.all([
      this.kpiService.getBrandKpiPlanForReportVersion(
        brandCode,
        periodYear,
        reportVersionId,
        {
          preferSnapshot: preferSnapshotPlan,
          autoCaptureFromCurrentPlan: preferSnapshotPlan
        }
      ),
      this.getSnapshotStatusForReportVersion(reportVersionId),
      this.manualMetricsService.getReportManualMetrics(reportVersionId)
    ]);

    const kpiPlan =
      resolvedKpiPlan.items.length > 0
        ? resolvedKpiPlan
        : preferSnapshotPlan
          ? this.buildLegacySnapshotFallbackPlan({
              brand: resolvedKpiPlan.brand,
              year: periodYear,
              snapshotStatus
            })
          : resolvedKpiPlan;

    if (kpiPlan.items.length === 0) {
      return [];
    }

    return this.buildPlanItems({
      brandCode,
      periodId,
      reportVersionId,
      snapshotStatus,
      kpiPlan,
      latestImportJob: {
        id: latestImportJob.id,
        originalFilename: latestImportJob.originalFilename,
        storedFilename: latestImportJob.storedFilename,
        storagePath: latestImportJob.storagePath
      },
      manualHeaderMetrics
    });
  }

  async getKpiPreview(
    brandCode: string,
    periodId: string
  ): Promise<MetricsKpiPreviewResponse> {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const period = await this.prisma.reportingPeriod.findUnique({
      where: { id: periodId },
      include: {
        reportVersions: {
          orderBy: {
            versionNo: 'desc'
          }
        }
      }
    });

    if (!period || period.brandId !== brand.id) {
      throw new NotFoundException('Reporting period not found for this brand.');
    }

    const currentDraft =
      period.reportVersions.find((version) => version.workflowState === ReportWorkflowState.draft) ??
      null;
    const latestVersion = period.reportVersions[0] ?? null;
    const targetVersion = currentDraft ?? latestVersion;
    const latestImportJob = targetVersion
      ? await this.prisma.importJob.findFirst({
          where: {
            reportVersionId: targetVersion.id
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      : null;

    if (!targetVersion) {
      return {
        state: 'no_data',
        label: 'No data',
        detail: 'waiting for KPI data',
        hitCount: 0,
        totalCount: 0,
        measuredCount: 0
      };
    }

    const preferSnapshotPlan = targetVersion.workflowState === ReportWorkflowState.approved;
    const [resolvedKpiPlan, snapshotStatus, manualHeaderMetrics] = await Promise.all([
      this.kpiService.getBrandKpiPlanForReportVersion(
        brandCode,
        period.year,
        targetVersion.id,
        {
          preferSnapshot: preferSnapshotPlan,
          autoCaptureFromCurrentPlan: preferSnapshotPlan
        }
      ),
      this.getSnapshotStatusForReportVersion(targetVersion.id),
      this.manualMetricsService.getReportManualMetrics(targetVersion.id)
    ]);
    const kpiPlan =
      resolvedKpiPlan.items.length > 0
        ? resolvedKpiPlan
        : preferSnapshotPlan
          ? this.buildLegacySnapshotFallbackPlan({
              brand: resolvedKpiPlan.brand,
              year: period.year,
              snapshotStatus
            })
          : resolvedKpiPlan;

    if (kpiPlan.items.length === 0) {
      return {
        state: 'no_target',
        label: 'No target',
        detail: 'targets not configured',
        hitCount: 0,
        totalCount: 0,
        measuredCount: 0
      };
    }

    const targetItems = kpiPlan.items.filter(
      (item) => item.targetValue !== null && item.targetValue > 0
    );

    if (targetItems.length === 0) {
      return {
        state: 'no_target',
        label: 'No target',
        detail: 'targets not configured',
        hitCount: 0,
        totalCount: 0,
        measuredCount: 0
      };
    }

    const planItems = await this.buildPlanItems({
      brandCode,
      periodId,
      reportVersionId: targetVersion.id,
      snapshotStatus,
      kpiPlan,
      latestImportJob,
      manualHeaderMetrics
    });
    const targetPlanItems = planItems.filter(
      (item) => item.targetValue !== null && item.targetValue > 0
    );
    const measuredPlanItems = targetPlanItems.filter((item) => item.actualValue !== null);
    const measuredCount = measuredPlanItems.length;
    const hitCount = measuredPlanItems.filter(
      (item) => (item.actualValue ?? 0) >= (item.targetValue ?? 0)
    ).length;

    if (measuredCount === 0) {
      return {
        state: 'no_data',
        label: 'No data',
        detail: 'waiting for KPI data',
        hitCount: 0,
        totalCount: targetPlanItems.length,
        measuredCount: 0
      };
    }

    if (hitCount === targetPlanItems.length && measuredCount === targetPlanItems.length) {
      return {
        state: 'all_targets_hit',
        label: 'All targets hit',
        detail: `${hitCount}/${targetPlanItems.length} reached`,
        hitCount,
        totalCount: targetPlanItems.length,
        measuredCount
      };
    }

    if (hitCount === 0) {
      return {
        state: 'at_risk',
        label: 'At risk',
        detail: `0/${targetPlanItems.length} reached`,
        hitCount: 0,
        totalCount: targetPlanItems.length,
        measuredCount
      };
    }

    return {
      state: 'in_progress',
      label: 'In progress',
      detail: `${hitCount}/${targetPlanItems.length} reached`,
      hitCount,
      totalCount: targetPlanItems.length,
      measuredCount
    };
  }

  async regenerateSnapshotForPeriod(brandCode: string, periodId: string) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const period = await this.prisma.reportingPeriod.findUnique({
      where: { id: periodId },
      include: {
        reportVersions: {
          orderBy: {
            versionNo: 'desc'
          }
        }
      }
    });

    if (!period || period.brandId !== brand.id) {
      throw new NotFoundException('Reporting period not found for this brand.');
    }

    const currentDraft =
      period.reportVersions.find((version) => version.workflowState === ReportWorkflowState.draft) ??
      null;
    const latestVersion = period.reportVersions[0] ?? null;
    const targetVersion = currentDraft ?? latestVersion;

    if (!targetVersion) {
      throw new NotFoundException('Report version not found for this reporting period.');
    }

    await this.refreshSnapshotForReportVersion(targetVersion.id);

    return this.getMetricsOverview(brandCode, periodId);
  }

  async refreshSnapshotForReportVersion(reportVersionId: string) {
    const sourceContext = await this.getSnapshotSourceContext(reportVersionId);

    if (sourceContext.metricMappings.length === 0 || sourceContext.datasetRowCount === 0) {
      await this.clearSnapshotForReportVersion(reportVersionId);
      return {
        snapshot: null,
        overriddenCellCount: sourceContext.overriddenCellCount,
        items: [] as SnapshotMetricItem[]
      };
    }

    return this.persistSnapshot(reportVersionId, sourceContext.metricMappings);
  }

  async getSnapshotStatusForReportVersion(
    reportVersionId: string
  ): Promise<SnapshotStatus> {
    const sourceContext = await this.getSnapshotSourceContext(reportVersionId);

    if (sourceContext.datasetRowCount === 0) {
      return {
        state: 'blocked',
        detail: 'Persisted dataset rows must exist before a metric snapshot can be current.',
        snapshot: null,
        summary: {
          datasetRowCount: 0,
          overriddenCellCount: sourceContext.overriddenCellCount,
          metricCount: 0
        },
        items: []
      };
    }

    if (sourceContext.metricMappings.length === 0) {
      return {
        state: 'blocked',
        detail: 'Map at least one canonical metric field before metric snapshots can be generated.',
        snapshot: null,
        summary: {
          datasetRowCount: sourceContext.datasetRowCount,
          overriddenCellCount: sourceContext.overriddenCellCount,
          metricCount: 0
        },
        items: []
      };
    }

    const snapshot = await this.prisma.metricSnapshot.findUnique({
      where: {
        reportVersionId
      },
      include: {
        items: true
      }
    });
    const displayLabelLookup =
      await this.columnConfigService.getPublishedImportColumnDisplayLabelLookup();

    const latestSourceUpdate = this.maxDate(
      sourceContext.latestMappingUpdatedAt,
      sourceContext.latestDatasetRowUpdatedAt,
      sourceContext.latestDatasetCellUpdatedAt,
      sourceContext.latestOverrideUpdatedAt
    );

    const itemCount = snapshot?.items.length ?? 0;
    const isCurrent =
      !!snapshot &&
      itemCount > 0 &&
      (!latestSourceUpdate || snapshot.generatedAt >= latestSourceUpdate);
    const toSnapshotMetricItem = (item: {
      metricKey: MappingTargetField;
      value: number;
      rowCoverage: number;
      overrideCount: number;
      sourceColumnName: string | null;
    }) => {
      const label = AVAILABLE_TARGETS_BY_KEY.get(item.metricKey)?.label ?? item.metricKey;
      const sourceColumnName = item.sourceColumnName
        ? this.columnConfigService.resolveImportColumnDisplayLabel(
            item.sourceColumnName,
            displayLabelLookup
          )
        : null;

      return {
        key: item.metricKey,
        label,
        value: item.value,
        rowCoverage: item.rowCoverage,
        overrideCount: item.overrideCount,
        sourceColumnName,
        sourceAliasLabel:
          sourceColumnName && sourceColumnName !== label ? sourceColumnName : null
      };
    };

    if (!snapshot || itemCount === 0) {
      return {
        state: 'pending',
        detail: 'Metric mappings exist, but the current snapshot has not been generated yet.',
        snapshot: null,
        summary: {
          datasetRowCount: sourceContext.datasetRowCount,
          overriddenCellCount: sourceContext.overriddenCellCount,
          metricCount: 0
        },
        items: []
      };
    }

    if (!isCurrent) {
      return {
        state: 'pending',
        detail: 'Dataset or mapping changes happened after the last metric snapshot. Regenerate it before submit.',
        snapshot: {
          id: snapshot.id,
          reportVersionId,
          generatedAt: snapshot.generatedAt,
          isCurrent: false
        },
        summary: {
          datasetRowCount: sourceContext.datasetRowCount,
          overriddenCellCount: sourceContext.overriddenCellCount,
          metricCount: itemCount
        },
        items: snapshot.items.map((item) => toSnapshotMetricItem(item))
      };
    }

    return {
      state: 'ready',
      detail:
        'Metrics are served from a current persisted snapshot generated from canonical dataset values plus manual overrides.',
      snapshot: {
        id: snapshot.id,
        reportVersionId,
        generatedAt: snapshot.generatedAt,
        isCurrent: true
      },
      summary: {
        datasetRowCount: sourceContext.datasetRowCount,
        overriddenCellCount: sourceContext.overriddenCellCount,
        metricCount: itemCount
      },
      items: snapshot.items.map((item) => toSnapshotMetricItem(item))
    };
  }

  private async getSnapshotSourceContext(reportVersionId: string) {
    const [
      datasetRowCount,
      overriddenCellCount,
      metricMappings,
      latestMapping,
      latestDatasetRow,
      latestDatasetCell,
      latestOverride
    ] = await Promise.all([
      this.prisma.datasetRow.count({
        where: {
          reportVersionId
        }
      }),
      this.prisma.datasetCellOverride.count({
        where: {
          datasetCell: {
            datasetRow: {
              reportVersionId
            }
          }
        }
      }),
      this.prisma.columnMapping.findMany({
        where: {
          reportVersionId,
          targetField: {
            in: METRIC_TARGET_FIELDS
          }
        },
        include: {
          importColumnProfile: true
        }
      }),
      this.prisma.columnMapping.findFirst({
        where: {
          reportVersionId,
          targetField: {
            in: METRIC_TARGET_FIELDS
          }
        },
        orderBy: {
          updatedAt: 'desc'
        },
        select: {
          updatedAt: true
        }
      }),
      this.prisma.datasetRow.findFirst({
        where: {
          reportVersionId
        },
        orderBy: {
          updatedAt: 'desc'
        },
        select: {
          updatedAt: true
        }
      }),
      this.prisma.datasetCell.findFirst({
        where: {
          datasetRow: {
            reportVersionId
          },
          targetField: {
            in: METRIC_TARGET_FIELDS
          }
        },
        orderBy: {
          updatedAt: 'desc'
        },
        select: {
          updatedAt: true
        }
      }),
      this.prisma.datasetCellOverride.findFirst({
        where: {
          datasetCell: {
            datasetRow: {
              reportVersionId
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        },
        select: {
          updatedAt: true
        }
      })
    ]);

    return {
      datasetRowCount,
      overriddenCellCount,
      metricMappings: metricMappings.map((mapping) => ({
        targetField: mapping.targetField,
        sourceColumnName: mapping.importColumnProfile.sourceColumnName
      })),
      latestMappingUpdatedAt: latestMapping?.updatedAt ?? null,
      latestDatasetRowUpdatedAt: latestDatasetRow?.updatedAt ?? null,
      latestDatasetCellUpdatedAt: latestDatasetCell?.updatedAt ?? null,
      latestOverrideUpdatedAt: latestOverride?.updatedAt ?? null
    };
  }

  private async clearSnapshotForReportVersion(reportVersionId: string) {
    const snapshot = await this.prisma.metricSnapshot.findUnique({
      where: {
        reportVersionId
      },
      select: {
        id: true
      }
    });

    if (!snapshot) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.metricSnapshotItem.deleteMany({
        where: {
          metricSnapshotId: snapshot.id
        }
      });

      await tx.metricSnapshot.delete({
        where: {
          id: snapshot.id
        }
      });
    });
  }

  private async persistSnapshot(
    reportVersionId: string,
    metricMappings: Array<{
      targetField: MappingTargetField;
      sourceColumnName: string;
    }>
  ) {
    const displayLabelLookup =
      await this.columnConfigService.getPublishedImportColumnDisplayLabelLookup();
    const [overriddenCellCount, metricCells] = await Promise.all([
      this.prisma.datasetCellOverride.count({
        where: {
          datasetCell: {
            datasetRow: {
              reportVersionId
            }
          }
        }
      }),
      this.prisma.datasetCell.findMany({
        where: {
          datasetRow: {
            reportVersionId
          },
          targetField: {
            in: METRIC_TARGET_FIELDS
          }
        },
        include: {
          override: true
        }
      })
    ]);

    const items = METRIC_TARGET_FIELDS.map((targetField) => {
      const label = AVAILABLE_TARGETS_BY_KEY.get(targetField)?.label ?? targetField;
      const sourceColumnNameRaw =
        metricMappings.find((item) => item.targetField === targetField)?.sourceColumnName ?? null;
      const sourceColumnName = sourceColumnNameRaw
        ? this.columnConfigService.resolveImportColumnDisplayLabel(
            sourceColumnNameRaw,
            displayLabelLookup
          )
        : null;
      const cells = metricCells.filter((cell) => cell.targetField === targetField);
      const numericValues = cells
        .map((cell) => this.toNumber(cell.override?.overrideValue ?? cell.value))
        .filter((value): value is number => value !== null);

      return {
        key: targetField,
        label,
        value: numericValues.reduce((sum, value) => sum + value, 0),
        rowCoverage: numericValues.length,
        overrideCount: cells.filter((cell) => cell.override?.overrideValue !== null).length,
        sourceColumnName,
        sourceAliasLabel:
          sourceColumnName && sourceColumnName !== label ? sourceColumnName : null
      };
    }).filter((item) => item.sourceColumnName !== null);

    const generatedAt = new Date();

    const persistedSnapshot = await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.metricSnapshot.upsert({
        where: {
          reportVersionId
        },
        update: {
          generatedAt
        },
        create: {
          reportVersionId,
          generatedAt
        }
      });

      await tx.metricSnapshotItem.deleteMany({
        where: {
          metricSnapshotId: snapshot.id
        }
      });

      if (items.length > 0) {
        await tx.metricSnapshotItem.createMany({
          data: items.map((item) => ({
            metricSnapshotId: snapshot.id,
            metricKey: item.key,
            value: item.value,
            rowCoverage: item.rowCoverage,
            overrideCount: item.overrideCount,
            sourceColumnName: item.sourceColumnName,
            sourceAliasLabel: item.sourceAliasLabel
          }))
        });
      }

      return snapshot;
    });

    return {
      snapshot: {
        id: persistedSnapshot.id,
        reportVersionId,
        generatedAt
      },
      overriddenCellCount,
      items
    };
  }

  private async buildPlanItems(input: {
    brandCode: string;
    periodId: string;
    reportVersionId: string;
    snapshotStatus: SnapshotStatus;
    kpiPlan: Awaited<ReturnType<KpiService['getBrandKpiPlan']>>;
    latestImportJob: {
      id: string;
      originalFilename: string;
      storedFilename: string;
      storagePath: string;
    } | null;
    manualHeaderMetrics: {
      viewers: number | null;
      pageFollowers: number | null;
      pageVisit: number | null;
    };
  }): Promise<MetricsOverviewResponse['items']> {
    const canonicalMetricKeysInPlan = Array.from(
      new Set(
        input.kpiPlan.items
          .filter(
            (item) =>
              item.kpi.sourceType === KpiSourceType.canonical_metric &&
              !!item.kpi.canonicalMetricKey &&
              !MANUAL_HEADER_CANONICAL_FIELDS.has(item.kpi.canonicalMetricKey)
          )
          .map((item) => item.kpi.canonicalMetricKey as MappingTargetField)
      )
    );
    const canonicalDatasetActualEntries = await Promise.all(
      canonicalMetricKeysInPlan.map((metricKey) =>
        this.getCanonicalMetricActualFromDataset(input.reportVersionId, metricKey)
      )
    );
    const canonicalDatasetActualByKey = new Map(
      canonicalMetricKeysInPlan.map((metricKey, index) => [
        metricKey,
        canonicalDatasetActualEntries[index]
      ])
    );
    const formulaItems = input.kpiPlan.items.filter(
      item => item.kpi.sourceType === KpiSourceType.formula_column && item.kpi.formulaId
    );
    const manualFormulaRowsByRowNumber = await this.readManualFormulaRowsByRowNumber(
      input.reportVersionId
    );
    const [formulaActuals, systemEngagementFormulaIds] = await Promise.all([
      this.getFormulaActualsForPlanItems({
        reportVersionId: input.reportVersionId,
        brandCode: input.brandCode,
        periodId: input.periodId,
        latestImportJob: input.latestImportJob,
        planItems: formulaItems,
        manualFormulaRowsByRowNumber
      }),
      this.getSystemEngagementFormulaIds()
    ]);
    const engagementDatasetActual =
      systemEngagementFormulaIds.size > 0
        ? await this.getCanonicalMetricActualFromDataset(
            input.reportVersionId,
            MappingTargetField.engagement
          )
        : null;
    const engagementSnapshotItem =
      input.snapshotStatus.items.find((item) => item.key === MappingTargetField.engagement) ??
      null;

    return input.kpiPlan.items.map(item => {
      if (
        item.kpi.sourceType === KpiSourceType.canonical_metric &&
        item.kpi.canonicalMetricKey
      ) {
        const manualActualValue = this.getManualHeaderActualValue(
          item.kpi.canonicalMetricKey,
          input.manualHeaderMetrics
        );

        if (manualActualValue !== undefined) {
          return {
            id: item.id,
            key: item.kpi.key,
            label: item.kpi.label,
            description: item.kpi.description,
            sourceType: item.kpi.sourceType,
            sourceLabel:
              item.kpi.canonicalMetricKey === MappingTargetField.page_followers
                ? 'Page Followers (manual monthly input)'
                : 'Viewers (manual monthly input)',
            canonicalMetricKey: item.kpi.canonicalMetricKey,
            formulaId: null,
            targetValue: item.targetValue,
            actualValue: manualActualValue,
            varianceValue:
              manualActualValue !== null && item.targetValue !== null
                ? manualActualValue - item.targetValue
                : null,
            rowCoverage: manualActualValue === null ? 0 : 1,
            overrideCount: 0,
            sourceColumnName: null,
            sourceAliasLabel: 'Manual monthly input'
          };
        }

        const snapshotItem =
          input.snapshotStatus.items.find(
            snapshot => snapshot.key === item.kpi.canonicalMetricKey
          ) ?? null;
        const datasetActual =
          canonicalDatasetActualByKey.get(item.kpi.canonicalMetricKey) ?? null;
        const hasSnapshotCoverage = !!snapshotItem && snapshotItem.rowCoverage > 0;
        const actualValue = hasSnapshotCoverage
          ? (snapshotItem?.value ?? null)
          : (datasetActual?.value ?? null);
        const resolvedSourceLabel = hasSnapshotCoverage
          ? (snapshotItem
              ? (snapshotItem.sourceAliasLabel ?? snapshotItem.sourceColumnName)
              : null)
          : (datasetActual
              ? (datasetActual.sourceAliasLabel ?? datasetActual.sourceColumnName)
              : null);

        return {
          id: item.id,
          key: item.kpi.key,
          label: item.kpi.label,
          description: item.kpi.description,
          sourceType: item.kpi.sourceType,
          sourceLabel:
            resolvedSourceLabel ||
            AVAILABLE_TARGETS_BY_KEY.get(item.kpi.canonicalMetricKey)?.label ||
            item.kpi.canonicalMetricKey,
          canonicalMetricKey: item.kpi.canonicalMetricKey,
          formulaId: null,
          targetValue: item.targetValue,
          actualValue,
          varianceValue:
            actualValue !== null && item.targetValue !== null
              ? actualValue - item.targetValue
              : null,
          rowCoverage: hasSnapshotCoverage
            ? (snapshotItem?.rowCoverage ?? 0)
            : (datasetActual?.rowCoverage ?? 0),
          overrideCount: hasSnapshotCoverage
            ? (snapshotItem?.overrideCount ?? 0)
            : (datasetActual?.overrideCount ?? 0),
          sourceColumnName: hasSnapshotCoverage
            ? (snapshotItem?.sourceColumnName ?? null)
            : (datasetActual?.sourceColumnName ?? null),
          sourceAliasLabel: hasSnapshotCoverage
            ? (snapshotItem?.sourceAliasLabel ?? null)
            : (datasetActual?.sourceAliasLabel ?? null)
        };
      }

      const formulaActual = item.kpi.formulaId
        ? (() => {
            const resolvedFormulaActual = formulaActuals.get(item.kpi.formulaId) ?? null;
            const isSystemEngagementFormula = systemEngagementFormulaIds.has(item.kpi.formulaId);
            if (isSystemEngagementFormula && resolvedFormulaActual?.value !== null) {
              return resolvedFormulaActual;
            }

            if (
              isSystemEngagementFormula &&
              engagementDatasetActual &&
              engagementDatasetActual.value !== null
            ) {
              return {
                value: engagementDatasetActual.value,
                rowCoverage: engagementDatasetActual.rowCoverage
              };
            }

            if (
              isSystemEngagementFormula &&
              engagementSnapshotItem &&
              engagementSnapshotItem.value !== null
            ) {
              return {
                value: engagementSnapshotItem.value,
                rowCoverage: engagementSnapshotItem.rowCoverage
              };
            }

            return resolvedFormulaActual;
          })()
        : null;
      const isSystemEngagementFormula =
        !!item.kpi.formulaId && systemEngagementFormulaIds.has(item.kpi.formulaId);

      return {
        id: item.id,
        key: item.kpi.key,
        label: item.kpi.label,
        description: item.kpi.description,
        sourceType: item.kpi.sourceType,
        sourceLabel: isSystemEngagementFormula
          ? `${item.kpi.formulaLabel ?? 'Formula column'} (includes manual rows from dataset)`
          : (item.kpi.formulaLabel ?? 'Formula column'),
        canonicalMetricKey: null,
        formulaId: item.kpi.formulaId,
        targetValue: item.targetValue,
        actualValue: formulaActual?.value ?? null,
        varianceValue:
          formulaActual?.value !== null &&
          formulaActual?.value !== undefined &&
          item.targetValue !== null
            ? formulaActual.value - item.targetValue
            : null,
        rowCoverage: formulaActual?.rowCoverage ?? 0,
        overrideCount:
          isSystemEngagementFormula && engagementDatasetActual
            ? engagementDatasetActual.overrideCount
            : isSystemEngagementFormula && engagementSnapshotItem
              ? engagementSnapshotItem.overrideCount
            : 0,
        sourceColumnName:
          isSystemEngagementFormula && engagementDatasetActual
            ? engagementDatasetActual.sourceColumnName
            : isSystemEngagementFormula && engagementSnapshotItem
              ? engagementSnapshotItem.sourceColumnName
            : null,
        sourceAliasLabel:
          isSystemEngagementFormula && engagementDatasetActual
            ? (engagementDatasetActual.sourceAliasLabel ??
              engagementDatasetActual.sourceColumnName ??
              item.kpi.formulaLabel ??
              null)
            : isSystemEngagementFormula && engagementSnapshotItem
              ? (engagementSnapshotItem.sourceAliasLabel ??
                engagementSnapshotItem.sourceColumnName ??
              item.kpi.formulaLabel ??
              null)
            : (item.kpi.formulaLabel ?? null)
      };
    });
  }

  private getManualHeaderActualValue(
    canonicalMetricKey: MappingTargetField,
    manualHeaderMetrics: {
      viewers: number | null;
      pageFollowers: number | null;
      pageVisit: number | null;
    }
  ) {
    if (!MANUAL_HEADER_CANONICAL_FIELDS.has(canonicalMetricKey)) {
      return undefined;
    }

    if (canonicalMetricKey === MappingTargetField.page_followers) {
      return manualHeaderMetrics.pageFollowers;
    }

    return manualHeaderMetrics.viewers;
  }

  private async getFormulaActualsForPlanItems(input: {
    reportVersionId: string;
    brandCode: string;
    periodId: string;
    latestImportJob: {
      id: string;
      originalFilename: string;
      storedFilename: string;
      storagePath: string;
    } | null;
    planItems: Array<
      Awaited<ReturnType<KpiService['getBrandKpiPlan']>>['items'][number]
    >;
    manualFormulaRowsByRowNumber: Map<number, Record<string, string>>;
  }) {
    const formulaIds = Array.from(
      new Set(
        input.planItems
          .map(item => item.kpi.formulaId)
          .filter((formulaId): formulaId is string => !!formulaId)
      )
    );

    if (formulaIds.length === 0) {
      return new Map<
        string,
        {
          value: number | null;
          rowCoverage: number;
        }
      >();
    }

    const formulas = await this.prisma.globalComputedFormula.findMany({
      where: {
        id: {
          in: formulaIds
        }
      },
      select: {
        id: true,
        expression: true
      }
    });

    if (formulas.length === 0) {
      return new Map();
    }

    const resolvedByFormulaId = new Map<
      string,
      {
        value: number | null;
        rowCoverage: number;
      }
    >(
      formulaIds.map((formulaId) => [
        formulaId,
        {
          value: null,
          rowCoverage: 0
        }
      ])
    );
    const datasetEvaluated = await this.getFormulaActualsFromDatasetRows({
      reportVersionId: input.reportVersionId,
      formulas,
      manualFormulaRowsByRowNumber: input.manualFormulaRowsByRowNumber
    });

    for (const [formulaId, actual] of datasetEvaluated.actualsByFormulaId.entries()) {
      resolvedByFormulaId.set(formulaId, actual);
    }

    const fallbackFormulaIds = formulaIds.filter((formulaId) =>
      datasetEvaluated.unsupportedFormulaIds.has(formulaId)
    );
    if (fallbackFormulaIds.length === 0 || !input.latestImportJob) {
      return resolvedByFormulaId;
    }

    const fallbackFormulas = formulas.filter((formula) =>
      fallbackFormulaIds.includes(formula.id)
    );
    if (fallbackFormulas.length === 0) {
      return resolvedByFormulaId;
    }

    const csvActualsByFormulaId = await this.getFormulaActualsFromCsvRows({
      formulas: fallbackFormulas,
      reportVersionId: input.reportVersionId,
      brandCode: input.brandCode,
      periodId: input.periodId,
      latestImportJob: input.latestImportJob,
      manualFormulaRowsByRowNumber: input.manualFormulaRowsByRowNumber
    });
    for (const [formulaId, actual] of csvActualsByFormulaId.entries()) {
      resolvedByFormulaId.set(formulaId, actual);
    }

    return resolvedByFormulaId;
  }

  private async getFormulaActualsFromDatasetRows(input: {
    reportVersionId: string;
    formulas: Array<{
      id: string;
      expression: string;
    }>;
    manualFormulaRowsByRowNumber: Map<number, Record<string, string>>;
  }) {
    const [mappings, rows, displayLabelLookup] = await Promise.all([
      this.prisma.columnMapping.findMany({
        where: {
          reportVersionId: input.reportVersionId,
          targetField: {
            in: METRIC_TARGET_FIELDS
          }
        },
        select: {
          targetField: true,
          importColumnProfile: {
            select: {
              sourceColumnName: true
            }
          }
        }
      }),
      this.prisma.datasetRow.findMany({
        where: {
          reportVersionId: input.reportVersionId
        },
        select: {
          sourceRowNumber: true,
          cells: {
            where: {
              targetField: {
                in: METRIC_TARGET_FIELDS
              }
            },
            select: {
              targetField: true,
              value: true,
              override: {
                select: {
                  overrideValue: true
                }
              }
            }
          }
        },
        orderBy: {
          sourceRowNumber: 'asc'
        }
      }),
      this.columnConfigService.getPublishedImportColumnDisplayLabelLookup()
    ]);

    const sourceLabelsByTarget = new Map<MappingTargetField, string[]>();
    for (const mapping of mappings) {
      const sourceLabelRaw = mapping.importColumnProfile.sourceColumnName.trim();
      if (!sourceLabelRaw) {
        continue;
      }
      const sourceDisplayLabel = this.columnConfigService.resolveImportColumnDisplayLabel(
        sourceLabelRaw,
        displayLabelLookup
      );

      const existing = sourceLabelsByTarget.get(mapping.targetField) ?? [];
      const next = Array.from(new Set([...existing, sourceDisplayLabel, sourceLabelRaw]));
      if (next.length !== existing.length) {
        sourceLabelsByTarget.set(mapping.targetField, next);
      }
    }

    const availableColumns = Array.from(
      new Set(
        METRIC_TARGET_FIELDS.flatMap((targetField) => {
          const canonicalLabel = AVAILABLE_TARGETS_BY_KEY.get(targetField)?.label ?? targetField;
          return [canonicalLabel, ...(sourceLabelsByTarget.get(targetField) ?? [])];
        })
      )
    );
    const evaluableFormulas: Array<{ id: string; expression: string }> = [];
    const unsupportedFormulaIds = new Set<string>();

    for (const formula of input.formulas) {
      const probe = previewFormulaExpression({
        expression: formula.expression,
        row: {},
        availableColumns
      });
      const hasMissingColumns = probe.issues.some((issue) => issue.code === 'column_missing');

      if (hasMissingColumns) {
        unsupportedFormulaIds.add(formula.id);
        continue;
      }

      evaluableFormulas.push(formula);
    }

    const summaryByFormulaId = new Map(
      evaluableFormulas.map((formula) => [
        formula.id,
        {
          value: 0,
          rowCoverage: 0
        }
      ])
    );

    for (const row of rows) {
      const cellByTarget = new Map(
        row.cells.map((cell) => [
          cell.targetField,
          cell.override?.overrideValue ?? cell.value
        ] as const)
      );
      const rowMap: Record<string, string | null> = {};

      for (const targetField of METRIC_TARGET_FIELDS) {
        const value = cellByTarget.get(targetField) ?? null;
        const canonicalLabel = AVAILABLE_TARGETS_BY_KEY.get(targetField)?.label ?? targetField;
        rowMap[canonicalLabel] = value;

        for (const sourceLabel of sourceLabelsByTarget.get(targetField) ?? []) {
          rowMap[sourceLabel] = value;
        }
      }

      for (const formula of evaluableFormulas) {
        const manualFormulaOverride = this.toNumber(
          input.manualFormulaRowsByRowNumber.get(row.sourceRowNumber)?.[formula.id] ?? null
        );
        if (manualFormulaOverride !== null) {
          const current = summaryByFormulaId.get(formula.id);
          if (!current) {
            continue;
          }

          current.value += manualFormulaOverride;
          current.rowCoverage += 1;
          continue;
        }

        const result = previewFormulaExpression({
          expression: formula.expression,
          row: rowMap,
          availableColumns
        });

        if (!result.isValid || result.result === null || !Number.isFinite(result.result)) {
          continue;
        }

        const current = summaryByFormulaId.get(formula.id);
        if (!current) {
          continue;
        }

        current.value += result.result;
        current.rowCoverage += 1;
      }
    }

    const actualsByFormulaId = new Map<
      string,
      {
        value: number | null;
        rowCoverage: number;
      }
    >();
    for (const formula of evaluableFormulas) {
      const summary = summaryByFormulaId.get(formula.id);
      actualsByFormulaId.set(formula.id, {
        value: summary && summary.rowCoverage > 0 ? summary.value : null,
        rowCoverage: summary?.rowCoverage ?? 0
      });
    }

    return {
      actualsByFormulaId,
      unsupportedFormulaIds
    };
  }

  private async getFormulaActualsFromCsvRows(input: {
    formulas: Array<{
      id: string;
      expression: string;
    }>;
    reportVersionId: string;
    brandCode: string;
    periodId: string;
    latestImportJob: {
      id: string;
      originalFilename: string;
      storedFilename: string;
      storagePath: string;
    };
    manualFormulaRowsByRowNumber: Map<number, Record<string, string>>;
  }) {
    const [metricMappings, metricDatasetRows, displayLabelLookup] = await Promise.all([
      this.prisma.columnMapping.findMany({
        where: {
          reportVersionId: input.reportVersionId,
          targetField: {
            in: METRIC_TARGET_FIELDS
          }
        },
        select: {
          targetField: true,
          importColumnProfile: {
            select: {
              sourceColumnName: true
            }
          }
        }
      }),
      this.prisma.datasetRow.findMany({
        where: {
          reportVersionId: input.reportVersionId
        },
        select: {
          sourceRowNumber: true,
          cells: {
            where: {
              targetField: {
                in: METRIC_TARGET_FIELDS
              }
            },
            select: {
              targetField: true,
              value: true,
              override: {
                select: {
                  overrideValue: true
                }
              }
            }
          }
        }
      }),
      this.columnConfigService.getPublishedImportColumnDisplayLabelLookup()
    ]);
    const metricSourceLabelsByTarget = new Map<MappingTargetField, string[]>();
    for (const mapping of metricMappings) {
      const sourceLabelRaw = mapping.importColumnProfile.sourceColumnName.trim();
      if (!sourceLabelRaw) {
        continue;
      }
      const sourceDisplayLabel = this.columnConfigService.resolveImportColumnDisplayLabel(
        sourceLabelRaw,
        displayLabelLookup
      );

      const existing = metricSourceLabelsByTarget.get(mapping.targetField) ?? [];
      const next = Array.from(new Set([...existing, sourceDisplayLabel, sourceLabelRaw]));
      if (next.length !== existing.length) {
        metricSourceLabelsByTarget.set(mapping.targetField, next);
      }
    }
    const metricValuesByRowNumber = new Map(
      metricDatasetRows.map((row) => [
        row.sourceRowNumber,
        new Map(
          row.cells.map((cell) => [
            cell.targetField,
            cell.override?.overrideValue ?? cell.value
          ] as const)
        )
      ])
    );

    const resolvedStoragePath = resolveImportStoragePath({
      storagePath: input.latestImportJob.storagePath,
      brandCode: input.brandCode,
      periodId: input.periodId,
      storedFilename: input.latestImportJob.storedFilename
    });

    let parsedDocument: Awaited<ReturnType<typeof parseImportDocument>> | null = null;

    try {
      parsedDocument = await parseImportDocument(
        resolvedStoragePath,
        input.latestImportJob.originalFilename
      );
    } catch {
      return new Map();
    }

    const availableColumns = parsedDocument.headerRow
      .map(column => column.trim())
      .filter(column => column.length > 0);
    const displayColumnByRaw = new Map<string, string>();
    for (const rawColumn of availableColumns) {
      const displayColumn = this.columnConfigService.resolveImportColumnDisplayLabel(
        rawColumn,
        displayLabelLookup
      );
      if (displayColumn && displayColumn !== rawColumn) {
        displayColumnByRaw.set(rawColumn, displayColumn);
      }
    }
    const displayColumns = Array.from(displayColumnByRaw.values());
    const manualSourceRowsByRowNumber = await this.readManualSourceRowsByRowNumber(
      input.reportVersionId
    );
    const manualColumns = Array.from(
      new Set(
        Array.from(manualSourceRowsByRowNumber.values()).flatMap((rowValues) =>
          Object.keys(rowValues).map((columnLabel) => columnLabel.trim()).filter(Boolean)
        )
      )
    );
    const metricOverlayColumns = Array.from(
      new Set(
        METRIC_TARGET_FIELDS.flatMap((targetField) => {
          const canonicalLabel = AVAILABLE_TARGETS_BY_KEY.get(targetField)?.label ?? targetField;
          return [canonicalLabel, ...(metricSourceLabelsByTarget.get(targetField) ?? [])];
        })
      )
    );
    const availableColumnsWithManual = Array.from(
      new Set([...availableColumns, ...displayColumns, ...manualColumns, ...metricOverlayColumns])
    );
    const summaryByFormulaId = new Map(
      input.formulas.map(formula => [
        formula.id,
        {
          value: 0,
          rowCoverage: 0
        }
      ])
    );

    for (const [rowIndex, row] of parsedDocument.dataRows.entries()) {
      const rowNumber = rowIndex + 1;
      const rowMap = Object.fromEntries(
        availableColumnsWithManual.map((columnLabel) => [columnLabel, null as string | null])
      );
      for (const [columnIndex, rawColumnLabel] of availableColumns.entries()) {
        const value = row[columnIndex]?.trim() || null;
        rowMap[rawColumnLabel] = value;
        const displayColumnLabel = displayColumnByRaw.get(rawColumnLabel);
        if (displayColumnLabel) {
          rowMap[displayColumnLabel] = value;
        }
      }
      const metricValues = metricValuesByRowNumber.get(rowNumber) ?? null;
      if (metricValues) {
        for (const targetField of METRIC_TARGET_FIELDS) {
          const metricValue = metricValues.get(targetField) ?? null;
          if (metricValue === null) {
            continue;
          }

          const canonicalLabel = AVAILABLE_TARGETS_BY_KEY.get(targetField)?.label ?? targetField;
          rowMap[canonicalLabel] = metricValue;

          for (const sourceLabel of metricSourceLabelsByTarget.get(targetField) ?? []) {
            rowMap[sourceLabel] = metricValue;
          }
        }
      }

      for (const formula of input.formulas) {
        const manualFormulaOverride = this.toNumber(
          input.manualFormulaRowsByRowNumber.get(rowNumber)?.[formula.id] ?? null
        );
        if (manualFormulaOverride !== null) {
          const current = summaryByFormulaId.get(formula.id);

          if (!current) {
            continue;
          }

          current.value += manualFormulaOverride;
          current.rowCoverage += 1;
          continue;
        }

        const result = previewFormulaExpression({
          expression: formula.expression,
          row: rowMap,
          availableColumns: availableColumnsWithManual
        });

        if (!result.isValid || result.result === null || !Number.isFinite(result.result)) {
          continue;
        }

        const current = summaryByFormulaId.get(formula.id);

        if (!current) {
          continue;
        }

        current.value += result.result;
        current.rowCoverage += 1;
      }
    }

    for (const [rowNumber, manualRowValues] of manualSourceRowsByRowNumber.entries()) {
      if (rowNumber <= parsedDocument.dataRows.length) {
        continue;
      }

      const rowMap = Object.fromEntries(
        availableColumnsWithManual.map((columnLabel) => [columnLabel, null as string | null])
      );
      for (const [columnLabel, value] of Object.entries(manualRowValues)) {
        rowMap[columnLabel] = value;
      }
      const metricValues = metricValuesByRowNumber.get(rowNumber) ?? null;
      if (metricValues) {
        for (const targetField of METRIC_TARGET_FIELDS) {
          const metricValue = metricValues.get(targetField) ?? null;
          if (metricValue === null) {
            continue;
          }

          const canonicalLabel = AVAILABLE_TARGETS_BY_KEY.get(targetField)?.label ?? targetField;
          rowMap[canonicalLabel] = metricValue;

          for (const sourceLabel of metricSourceLabelsByTarget.get(targetField) ?? []) {
            rowMap[sourceLabel] = metricValue;
          }
        }
      }

      for (const formula of input.formulas) {
        const manualFormulaOverride = this.toNumber(
          input.manualFormulaRowsByRowNumber.get(rowNumber)?.[formula.id] ?? null
        );
        if (manualFormulaOverride !== null) {
          const current = summaryByFormulaId.get(formula.id);

          if (!current) {
            continue;
          }

          current.value += manualFormulaOverride;
          current.rowCoverage += 1;
          continue;
        }

        const result = previewFormulaExpression({
          expression: formula.expression,
          row: rowMap,
          availableColumns: availableColumnsWithManual
        });

        if (!result.isValid || result.result === null || !Number.isFinite(result.result)) {
          continue;
        }

        const current = summaryByFormulaId.get(formula.id);

        if (!current) {
          continue;
        }

        current.value += result.result;
        current.rowCoverage += 1;
      }
    }

    return new Map(
      Array.from(summaryByFormulaId.entries()).map(([formulaId, summary]) => [
        formulaId,
        {
          value: summary.rowCoverage > 0 ? summary.value : null,
          rowCoverage: summary.rowCoverage
        }
      ])
    );
  }

  private async readManualSourceRowsByRowNumber(reportVersionId: string) {
    const setting = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey: toManualSourceRowsSettingKey(reportVersionId)
      },
      select: {
        valueJson: true
      }
    });
    const rowsByRowNumber = parseManualSourceRowsSettingPayload(setting?.valueJson ?? null);

    return new Map(
      Object.entries(rowsByRowNumber)
        .map(([rowNumber, values]) => [Number(rowNumber), values] as const)
        .filter(([rowNumber]) => Number.isInteger(rowNumber) && rowNumber > 0)
    );
  }

  private async readManualFormulaRowsByRowNumber(reportVersionId: string) {
    const setting = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey: toManualFormulaRowsSettingKey(reportVersionId)
      },
      select: {
        valueJson: true
      }
    });
    const rowsByRowNumber = parseManualFormulaRowsSettingPayload(setting?.valueJson ?? null);

    return new Map(
      Object.entries(rowsByRowNumber)
        .map(([rowNumber, values]) => [Number(rowNumber), values] as const)
        .filter(([rowNumber]) => Number.isInteger(rowNumber) && rowNumber > 0)
    );
  }

  private async getSystemEngagementFormulaIds() {
    const setting = await this.prisma.globalComputedColumnSetting.findUnique({
      where: {
        key: ComputedColumnKey.engagement
      },
      select: {
        label: true,
        sourceLabelA: true,
        sourceLabelB: true
      }
    });

    if (!setting) {
      return new Set<string>();
    }

    const expectedExpression = `{{${setting.sourceLabelA}}} + {{${setting.sourceLabelB}}}`;
    const formulas = await this.prisma.globalComputedFormula.findMany({
      where: {
        OR: [
          {
            columnLabel: setting.label
          },
          {
            expression: expectedExpression
          }
        ]
      },
      select: {
        id: true
      }
    });

    return new Set(formulas.map((formula) => formula.id));
  }

  private async getCanonicalMetricActualFromDataset(
    reportVersionId: string,
    targetField: MappingTargetField
  ) {
    const [cells, mapping, displayLabelLookup] = await Promise.all([
      this.prisma.datasetCell.findMany({
        where: {
          datasetRow: {
            reportVersionId
          },
          targetField
        },
        include: {
          override: true
        }
      }),
      this.prisma.columnMapping.findFirst({
        where: {
          reportVersionId,
          targetField
        },
        select: {
          importColumnProfile: {
            select: {
              sourceColumnName: true
            }
          }
        }
      }),
      this.columnConfigService.getPublishedImportColumnDisplayLabelLookup()
    ]);

    const numericValues = cells
      .map((cell) => this.toNumber(cell.override?.overrideValue ?? cell.value))
      .filter((value): value is number => value !== null);
    const sourceColumnNameRaw = mapping?.importColumnProfile.sourceColumnName ?? null;
    const sourceColumnName = sourceColumnNameRaw
      ? this.columnConfigService.resolveImportColumnDisplayLabel(
          sourceColumnNameRaw,
          displayLabelLookup
        )
      : null;
    const label = AVAILABLE_TARGETS_BY_KEY.get(targetField)?.label ?? targetField;

    return {
      value: numericValues.length > 0 ? numericValues.reduce((sum, value) => sum + value, 0) : null,
      rowCoverage: numericValues.length,
      overrideCount: cells.filter((cell) => cell.override?.overrideValue !== null).length,
      sourceColumnName,
      sourceAliasLabel: sourceColumnName && sourceColumnName !== label ? sourceColumnName : null
    };
  }

  private buildLegacySnapshotFallbackPlan(input: {
    brand: {
      id: string;
      code: string;
      name: string;
    };
    year: number;
    snapshotStatus: SnapshotStatus;
  }): BrandKpiPlanResponse {
    if (input.snapshotStatus.items.length === 0) {
      return {
        brand: input.brand,
        year: input.year,
        plan: {
          id: null,
          itemCount: 0,
          updatedAt: null
        },
        items: []
      };
    }

    const items: BrandKpiPlanResponse['items'] = input.snapshotStatus.items.map((item, index) => ({
      id: `snapshot-fallback-${item.key}-${index + 1}`,
      sortOrder: index + 1,
      targetValue: null,
      note: 'Recovered from legacy metric snapshot',
      kpi: {
        id: `snapshot-fallback-${item.key}`,
        key: item.key,
        label: item.label,
        description: 'Recovered KPI definition from legacy metric snapshot',
        sourceType: KpiSourceType.canonical_metric,
        canonicalMetricKey: item.key,
        formulaId: null,
        formulaLabel: null,
        isActive: true
      }
    }));

    return {
      brand: input.brand,
      year: input.year,
      plan: {
        id: null,
        itemCount: items.length,
        updatedAt: input.snapshotStatus.snapshot?.generatedAt.toISOString() ?? null
      },
      items
    };
  }

  private maxDate(...dates: Array<Date | null>) {
    const timestamps = dates
      .filter((value): value is Date => value instanceof Date)
      .map((value) => value.getTime());

    if (timestamps.length === 0) {
      return null;
    }

    return new Date(Math.max(...timestamps));
  }

  private toNumber(rawValue: string | null | undefined) {
    if (!rawValue) {
      return null;
    }

    const normalized = rawValue.replaceAll(',', '').trim();

    if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
      return null;
    }

    return Number(normalized);
  }
}
