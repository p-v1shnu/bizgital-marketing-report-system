import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  MappingTargetField,
  ReportCadence,
  ReportWorkflowState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { BrandsService } from '../brands/brands.service';
import { ColumnConfigService } from '../column-config/column-config.service';
import { readImportJobSnapshot } from '../imports/import-snapshot';
import { resolveImportStoragePath } from '../imports/import-storage';
import { parseImportDocument } from '../imports/imports.tabular';
import { ManualMetricsService } from '../manual-metrics/manual-metrics.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  AVAILABLE_TARGETS_BY_KEY,
  type CanonicalFieldDataType
} from '../mapping/mapping-targets';
import { TopContentService } from '../top-content/top-content.service';
import { DatasetMaterializerService } from './dataset-materializer.service';
import {
  parseManualSourceRowsSettingPayload,
  stringifyManualSourceRowsSettingPayload,
  toManualSourceRowsSettingKey
} from './manual-source-rows-setting';
import {
  parseManualFormulaRowsSettingPayload,
  stringifyManualFormulaRowsSettingPayload,
  toManualFormulaRowsSettingKey
} from './manual-formula-rows-setting';
import type {
  DatasetOverviewResponse,
  UpdateDatasetValuesInput
} from './dataset.types';
import {
  REPORT_METRIC_COMMENTARY_KEYS,
  REPORT_METRIC_LABELS
} from '../manual-metrics/manual-metrics.types';
import type { ReportMetricCommentaryKey } from '../manual-metrics/manual-metrics.types';

const DATASET_PREVIEW_LIMIT = 5;
const MANUAL_EXTENDED_TARGET_FIELDS: MappingTargetField[] = [
  MappingTargetField.views,
  MappingTargetField.viewers,
  MappingTargetField.engagement,
  MappingTargetField.video_views_3s,
  MappingTargetField.content_url,
  MappingTargetField.published_at
];
const MANUAL_EXTENDED_TARGET_FIELD_SET = new Set<MappingTargetField>(MANUAL_EXTENDED_TARGET_FIELDS);

@Injectable()
export class DatasetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly columnConfigService: ColumnConfigService,
    private readonly datasetMaterializerService: DatasetMaterializerService,
    private readonly manualMetricsService: ManualMetricsService,
    private readonly metricsService: MetricsService,
    private readonly topContentService: TopContentService
  ) {}

  async getDatasetOverview(
    brandCode: string,
    periodId: string
  ): Promise<DatasetOverviewResponse> {
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
              },
              include: {
                columnProfiles: {
                  orderBy: {
                    sourcePosition: 'asc'
                  },
                  include: {
                    mappings: true
                  }
                }
              }
            },
            _count: {
              select: {
                datasetRows: true
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
    const latestApprovedVersion =
      period.reportVersions.find(
        version => version.workflowState === ReportWorkflowState.approved
      ) ?? null;
    const metricCommentaryOverview = await this.buildMetricCommentaryOverview({
      brandId: brand.id,
      period,
      targetVersionId: targetVersion?.id ?? null
    });
    const [contentCountPreview, approvedContentCountSnapshot] = await Promise.all([
      targetVersion
        ? this.topContentService.getContentCountPreviewForReportVersion(targetVersion.id)
        : Promise.resolve(null),
      latestApprovedVersion
        ? this.topContentService.getApprovalContentCountSnapshot(latestApprovedVersion.id)
        : Promise.resolve(null)
    ]);
    const manualHeaderMetrics = targetVersion
      ? await this.manualMetricsService.getReportManualMetrics(targetVersion.id)
      : {
          viewers: null,
          pageFollowers: null,
          pageVisit: null
        };
    const latestImportJob = targetVersion
      ? await this.prisma.importJob.findFirst({
          where: {
            reportVersionId: targetVersion.id
          },
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            columnProfiles: {
              orderBy: {
                sourcePosition: 'asc'
              },
              include: {
                mappings: true
              }
            }
          }
        })
      : null;

    const baseResponse: Omit<DatasetOverviewResponse, 'readiness' | 'preview' | 'warnings'> = {
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
      },
      latestImportJob: latestImportJob
        ? {
            id: latestImportJob.id,
            originalFilename: latestImportJob.originalFilename,
            status: latestImportJob.status,
            profiledColumnCount: latestImportJob.columnProfiles.length,
            mappedColumnCount: latestImportJob.columnProfiles.filter((profile) => profile.mappings[0])
              .length,
            persistedRowCount: targetVersion?._count.datasetRows ?? 0,
            createdAt: latestImportJob.createdAt.toISOString()
          }
        : null,
      mappingSummary: {
        profiledColumnCount: latestImportJob?.columnProfiles.length ?? 0,
        mappedColumnCount:
          latestImportJob?.columnProfiles.filter((profile) => profile.mappings[0]).length ?? 0,
        unmappedColumnCount:
          (latestImportJob?.columnProfiles.length ?? 0) -
          (latestImportJob?.columnProfiles.filter((profile) => profile.mappings[0]).length ?? 0)
      },
      materialization: {
        source: 'persisted',
        rowCount: targetVersion?._count.datasetRows ?? 0,
        cellCount: 0
      },
      manualHeader: {
        viewers: this.toStringValue(manualHeaderMetrics.viewers),
        pageFollowers: this.toStringValue(manualHeaderMetrics.pageFollowers),
        pageVisit: this.toStringValue(manualHeaderMetrics.pageVisit)
      },
      metricCommentary: metricCommentaryOverview,
      contentCount: {
        preview: contentCountPreview
          ? {
              reportVersionId: contentCountPreview.reportVersionId,
              countedContentCount: contentCountPreview.countedContentCount,
              csvRowCount: contentCountPreview.csvRowCount,
              manualRowCount: contentCountPreview.manualRowCount,
              policyMode: contentCountPreview.policy.mode,
              policyLabel: contentCountPreview.policy.label,
              policyUpdatedAt: contentCountPreview.policy.updatedAt,
              policyUpdatedBy: contentCountPreview.policy.updatedBy,
              policyNote: contentCountPreview.policy.note
            }
          : null,
        approvedSnapshot: approvedContentCountSnapshot
          ? {
              reportVersionId: approvedContentCountSnapshot.reportVersionId,
              capturedAt: approvedContentCountSnapshot.capturedAt,
              approvedAt: latestApprovedVersion?.approvedAt?.toISOString() ?? null,
              countedContentCount: approvedContentCountSnapshot.countedContentCount,
              csvRowCount: approvedContentCountSnapshot.csvRowCount,
              manualRowCount: approvedContentCountSnapshot.manualRowCount,
              policyMode: approvedContentCountSnapshot.policy.mode,
              policyLabel: approvedContentCountSnapshot.policy.label,
              policyUpdatedAt: approvedContentCountSnapshot.policy.updatedAt,
              policyUpdatedBy: approvedContentCountSnapshot.policy.updatedBy,
              policyNote: approvedContentCountSnapshot.policy.note
            }
          : null
      }
    };
    const displayLabelLookup =
      await this.columnConfigService.getPublishedImportColumnDisplayLabelLookup();

    if (!latestImportJob) {
      return {
        ...baseResponse,
        readiness: {
          state: 'blocked',
          detail: 'Upload an import file before dataset materialization can begin.'
        },
        preview: null,
        warnings: []
      };
    }

    const previewColumns = latestImportJob.columnProfiles
      .filter((profile) => profile.mappings[0])
      .map((profile) => {
        const target = AVAILABLE_TARGETS_BY_KEY.get(profile.mappings[0].targetField);

        return {
          targetField: profile.mappings[0].targetField,
          label: target?.label ?? profile.mappings[0].targetField,
          sourceColumnName: this.columnConfigService.resolveImportColumnDisplayLabel(
            profile.sourceColumnName,
            displayLabelLookup
          ),
          sourcePosition: profile.sourcePosition,
          dataType: target?.dataType ?? 'string',
          inputType: target?.inputType ?? 'text',
          isMetric: target?.isMetric ?? false
        };
      })
      .sort((left, right) => left.sourcePosition - right.sourcePosition);

    if (previewColumns.length === 0) {
      return {
        ...baseResponse,
        readiness: {
          state: 'blocked',
          detail: 'Save at least one mapping before dataset preview can be generated.'
        },
        preview: null,
        warnings: []
      };
    }

    const warnings: DatasetOverviewResponse['warnings'] = [];

    if (targetVersion && targetVersion._count.datasetRows === 0) {
      try {
        await this.datasetMaterializerService.materializeReportVersion(targetVersion.id);
      } catch {
        return {
          ...baseResponse,
          readiness: {
            state: 'blocked',
            detail: 'The import file could not be read from storage for persisted dataset generation.'
          },
          preview: null,
          warnings: [
            {
              key: 'storage_unavailable',
              message:
                'The latest import file exists in the database but is not currently readable from the configured storage path.'
            }
          ]
        };
      }
    }

    let sourceRowCount: number | null = readImportJobSnapshot(latestImportJob)?.dataRows.length ?? null;

    if (sourceRowCount === null) {
      const resolvedStoragePath = resolveImportStoragePath({
        storagePath: latestImportJob.storagePath,
        brandCode: brand.code,
        periodId: period.id,
        storedFilename: latestImportJob.storedFilename
      });

      try {
        const parsedDocument = await parseImportDocument(
          resolvedStoragePath,
          latestImportJob.originalFilename
        );
        sourceRowCount = parsedDocument.dataRows.length;
      } catch {
        warnings.push({
          key: 'storage_unavailable',
          message:
            'Source file is not currently readable from storage, so this preview is using persisted dataset rows and manual overrides only.'
        });
      }
    }

    if (
      sourceRowCount !== null &&
      sourceRowCount > 0 &&
      targetVersion &&
      targetVersion._count.datasetRows !== sourceRowCount
    ) {
      warnings.push({
        key: 'duplicate_targets',
        message:
          'The persisted dataset row count does not match the latest import file yet. Save mappings again if the source file changed.'
      });
    }

    const [totalRowCount, totalCellCount, persistedRows] = targetVersion
      ? await Promise.all([
          this.prisma.datasetRow.count({
            where: {
              reportVersionId: targetVersion.id
            }
          }),
          this.prisma.datasetCell.count({
            where: {
              datasetRow: {
                reportVersionId: targetVersion.id
              }
            }
          }),
          this.prisma.datasetRow.findMany({
            where: {
              reportVersionId: targetVersion.id
            },
            orderBy: {
              sourceRowNumber: 'asc'
            },
            take: DATASET_PREVIEW_LIMIT,
            include: {
              cells: {
                include: {
                  override: true
                }
              }
            }
          })
        ])
      : [0, 0, []];

    const previewRows = persistedRows.map((row) => ({
      datasetRowId: row.id,
      rowNumber: row.sourceRowNumber,
      cells: Object.fromEntries(
        previewColumns.map((column) => {
          const cell =
            row.cells.find((item) => item.targetField === column.targetField) ?? null;
          const importedValue = cell?.value ?? null;
          const overrideValue = cell?.override?.overrideValue ?? null;

          return [
            column.targetField,
            {
              effectiveValue: overrideValue ?? importedValue,
              importedValue,
              overrideValue,
              isOverridden: overrideValue !== null
            }
          ];
        })
      )
    }));

    return {
      ...baseResponse,
      materialization: {
        source: 'persisted',
        rowCount: totalRowCount,
        cellCount: totalCellCount
      },
      readiness: {
        state: 'ready',
        detail:
          previewRows.length > 0
            ? 'Dataset preview is now served from persisted draft dataset rows plus manual overrides.'
            : 'Mappings exist, but the persisted dataset does not contain any non-empty data rows yet.'
      },
      preview: {
        totalRows: totalRowCount,
        shownRows: previewRows.length,
        truncated: totalRowCount > DATASET_PREVIEW_LIMIT,
        columns: previewColumns,
        rows: previewRows
      },
      warnings
    };
  }

  async updateDatasetValues(
    brandCode: string,
    periodId: string,
    input: UpdateDatasetValuesInput
  ) {
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

    if (!currentDraft) {
      throw new ConflictException('Create or resume a draft before editing enrichment values.');
    }

    const hasRowUpdates = input.rows.length > 0;
    const hasManualSourceRowsUpdate =
      Array.isArray(input.manualSourceRows) && input.manualSourceRows.length > 0;
    const hasManualFormulaRowsUpdate =
      Array.isArray(input.manualFormulaRows) && input.manualFormulaRows.length > 0;
    const hasManualHeaderUpdate = input.manualHeader !== undefined;
    const hasMetricCommentaryUpdate = input.metricCommentary !== undefined;

    if (
      !hasRowUpdates &&
      !hasManualSourceRowsUpdate &&
      !hasManualFormulaRowsUpdate &&
      !hasManualHeaderUpdate &&
      !hasMetricCommentaryUpdate
    ) {
      throw new BadRequestException(
        'At least one dataset row, manual source row, manual formula row, manual header update, or metric commentary update is required.'
      );
    }

    if (hasRowUpdates) {
      const requestedRowNumbers = input.rows.map((row) => row.rowNumber);

      if (
        requestedRowNumbers.some(
          (rowNumber) => !Number.isInteger(rowNumber) || rowNumber < 1
        )
      ) {
        throw new BadRequestException('Dataset row numbers must be positive integers.');
      }

      const existingDatasetRows = await this.prisma.datasetRow.findMany({
        where: {
          reportVersionId: currentDraft.id,
          sourceRowNumber: {
            in: requestedRowNumbers
          }
        },
        include: {
          cells: {
            include: {
              override: true
            }
          }
        }
      });

      const existingRowNumberSet = new Set(
        existingDatasetRows.map((row) => row.sourceRowNumber)
      );
      const missingRowNumbers = requestedRowNumbers.filter(
        (rowNumber) => !existingRowNumberSet.has(rowNumber)
      );

      if (missingRowNumbers.length > 0) {
        const latestImportJob = await this.prisma.importJob.findFirst({
          where: {
            reportVersionId: currentDraft.id
          },
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            id: true
          }
        });

        if (!latestImportJob) {
          throw new BadRequestException(
            'An import job must exist before manual dataset rows can be created.'
          );
        }

        const mappings = await this.prisma.columnMapping.findMany({
          where: {
            reportVersionId: currentDraft.id
          },
          select: {
            targetField: true
          }
        });
        const mappedTargetFields = Array.from(new Set(mappings.map((mapping) => mapping.targetField)));
        const manualRowTargetFields = Array.from(
          new Set<MappingTargetField>([
            ...mappedTargetFields,
            ...MANUAL_EXTENDED_TARGET_FIELDS
          ])
        );

        if (manualRowTargetFields.length === 0) {
          throw new BadRequestException(
            'At least one mapping target is required before manual dataset rows can be saved.'
          );
        }

        await this.prisma.$transaction(async (tx) => {
          for (const rowNumber of missingRowNumbers) {
            const createdRow = await tx.datasetRow.create({
              data: {
                reportVersionId: currentDraft.id,
                importJobId: latestImportJob.id,
                sourceRowNumber: rowNumber
              }
            });

            await tx.datasetCell.createMany({
              data: manualRowTargetFields.map((targetField) => ({
                datasetRowId: createdRow.id,
                targetField,
                value: null
              }))
            });
          }
        });
      }

      const datasetRows = await this.prisma.datasetRow.findMany({
        where: {
          reportVersionId: currentDraft.id,
          sourceRowNumber: {
            in: requestedRowNumbers
          }
        },
        include: {
          cells: {
            include: {
              override: true
            }
          }
        }
      });

      await this.prisma.$transaction(async (tx) => {
        for (const rowUpdate of input.rows) {
          const datasetRow =
            datasetRows.find((row) => row.sourceRowNumber === rowUpdate.rowNumber) ?? null;

          if (!datasetRow) {
            continue;
          }

          const entries = Object.entries(rowUpdate.values) as Array<
            [MappingTargetField, string | null | undefined]
          >;

          for (const [targetField, rawValue] of entries) {
            let cell = datasetRow.cells.find((item) => item.targetField === targetField) ?? null;

            if (!cell) {
              if (!MANUAL_EXTENDED_TARGET_FIELD_SET.has(targetField)) {
                throw new BadRequestException(
                  `Target field ${targetField} is not materialized for dataset row ${rowUpdate.rowNumber}.`
                );
              }

              const createdCell = await tx.datasetCell.create({
                data: {
                  datasetRowId: datasetRow.id,
                  targetField,
                  value: null
                },
                include: {
                  override: true
                }
              });
              datasetRow.cells.push(createdCell);
              cell = createdCell;
            }

            const targetConfig = AVAILABLE_TARGETS_BY_KEY.get(targetField);
            const normalizedInput = this.normalizeValue(
              targetConfig?.dataType ?? 'string',
              rawValue,
              targetConfig?.label ?? targetField
            );
            const normalizedImported = this.normalizeComparableValue(
              targetConfig?.dataType ?? 'string',
              cell.value
            );

            if (normalizedInput === normalizedImported) {
              await tx.datasetCellOverride.deleteMany({
                where: {
                  datasetCellId: cell.id
                }
              });
              continue;
            }

            await tx.datasetCellOverride.upsert({
              where: {
                datasetCellId: cell.id
              },
              update: {
                overrideValue: normalizedInput
              },
              create: {
                datasetCellId: cell.id,
                overrideValue: normalizedInput
              }
            });
          }
        }
      });
    }

    if (hasManualHeaderUpdate) {
      await this.manualMetricsService.upsertReportManualMetrics(
        currentDraft.id,
        input.manualHeader ?? {}
      );
    }

    if (hasMetricCommentaryUpdate) {
      await this.manualMetricsService.upsertReportMetricCommentary(
        currentDraft.id,
        input.metricCommentary ?? { entries: [] }
      );
    }

    if (hasManualSourceRowsUpdate) {
      await this.upsertManualSourceRows(currentDraft.id, input.manualSourceRows ?? []);
    }
    if (hasManualFormulaRowsUpdate) {
      await this.upsertManualFormulaRows(currentDraft.id, input.manualFormulaRows ?? []);
    }

    await this.metricsService.refreshSnapshotForReportVersion(currentDraft.id);
    if (hasRowUpdates || hasManualSourceRowsUpdate) {
      await this.topContentService.refreshForReportVersion(currentDraft.id);
    }
    if (hasRowUpdates || hasManualSourceRowsUpdate || hasManualFormulaRowsUpdate) {
      await this.clearVideoViewsCommentaryWhenNoData(currentDraft.id);
    }

    return {
      updatedRowCount: input.rows.length,
      updatedCellCount: input.rows.reduce(
        (sum, row) => sum + Object.keys(row.values).length,
        0
      )
    };
  }

  private async buildMetricCommentaryOverview(input: {
    brandId: string;
    period: {
      id: string;
      year: number;
      month: number;
    };
    targetVersionId: string | null;
  }): Promise<DatasetOverviewResponse['metricCommentary']> {
    const { brandId, period, targetVersionId } = input;

    if (!targetVersionId) {
      const emptyItems = [...REPORT_METRIC_COMMENTARY_KEYS].map((key) => ({
        key,
        label: REPORT_METRIC_LABELS[key],
        applicability: 'applicable' as const,
        remark: null,
        requiresRemark: key !== 'video_views_3s',
        requirementDetail:
          key === 'video_views_3s'
            ? 'Required only when this month 3-second Video Views total is greater than 0.'
            : 'Required',
        currentValue: null,
        previousValue: null,
        hasPreviousValue: false,
        changePercent: null
      }));

      return {
        isFirstReportingMonth: true,
        viewersInputReady: false,
        items: emptyItems,
        summary: {
          requiredCount: emptyItems.filter((item) => item.requiresRemark).length,
          completedCount: 0,
          missingCount: emptyItems.filter((item) => item.requiresRemark).length
        }
      };
    }

    const [entries, currentValues, manualHeaderMetrics, previousVersionId] = await Promise.all([
      this.manualMetricsService.getReportMetricCommentary(targetVersionId),
      this.metricsService.getDashboardMetricValuesForReportVersion(targetVersionId),
      this.manualMetricsService.getReportManualMetrics(targetVersionId),
      this.resolvePreviousVersionIdForCommentary({
        brandId,
        year: period.year,
        month: period.month
      })
    ]);

    const previousValues = previousVersionId
      ? await this.metricsService.getDashboardMetricValuesForReportVersion(previousVersionId)
      : null;
    const hasPreviousValue = !!previousVersionId;
    const viewersInputReady =
      manualHeaderMetrics.viewers !== null && manualHeaderMetrics.viewers > 0;
    const requireVideoCommentary = (currentValues.video_views_3s ?? 0) > 0;

    const items = entries.map((entry) => {
      const currentValue = this.pickDashboardValueForMetric(currentValues, entry.key);
      const previousValue = previousValues
        ? this.pickDashboardValueForMetric(previousValues, entry.key)
        : null;
      const requiresRemark =
        entry.key === 'video_views_3s'
          ? requireVideoCommentary
          : true;
      return {
        ...entry,
        remark: requiresRemark ? entry.remark : null,
        requiresRemark,
        requirementDetail:
          entry.key === 'video_views_3s'
            ? requiresRemark
              ? 'Required because this month 3-second Video Views total is greater than 0.'
              : 'Optional because this month 3-second Video Views total is 0.'
            : entry.key === 'viewers'
              ? viewersInputReady
                ? 'Required'
                : 'Required. Enter Viewers in Import first.'
              : 'Required',
        currentValue,
        previousValue,
        hasPreviousValue,
        changePercent: this.calculateChangePercent(currentValue, previousValue)
      };
    });

    const requiredItems = items.filter((item) => item.requiresRemark);
    const completedCount = requiredItems.filter(
      (item) => item.remark !== null && item.remark.trim().length > 0
    ).length;

    return {
      isFirstReportingMonth: !hasPreviousValue,
      viewersInputReady,
      items,
      summary: {
        requiredCount: requiredItems.length,
        completedCount,
        missingCount: Math.max(0, requiredItems.length - completedCount)
      }
    };
  }

  private async clearVideoViewsCommentaryWhenNoData(reportVersionId: string) {
    const dashboardValues =
      await this.metricsService.getDashboardMetricValuesForReportVersion(reportVersionId);

    if ((dashboardValues.video_views_3s ?? 0) > 0) {
      return;
    }

    await this.manualMetricsService.upsertReportMetricCommentary(reportVersionId, {
      entries: [
        {
          key: 'video_views_3s',
          remark: null
        }
      ]
    });
  }

  private async resolvePreviousVersionIdForCommentary(input: {
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

  private pickDashboardValueForMetric(
    values: {
      views: number | null;
      viewers: number | null;
      engagement: number | null;
      video_views_3s: number | null;
      page_followers: number | null;
      page_visit: number | null;
    },
    key: ReportMetricCommentaryKey
  ) {
    return values[key];
  }

  private calculateChangePercent(currentValue: number | null, previousValue: number | null) {
    if (currentValue === null || previousValue === null || previousValue === 0) {
      return null;
    }

    return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  }

  private toStringValue(value: number | null) {
    if (value === null) {
      return null;
    }

    if (Number.isInteger(value)) {
      return String(value);
    }

    return String(value);
  }

  private normalizeValue(
    dataType: CanonicalFieldDataType,
    rawValue: string | null | undefined,
    label: string
  ) {
    const trimmed = rawValue?.trim() ?? '';

    if (!trimmed) {
      return null;
    }

    switch (dataType) {
      case 'number': {
        const normalizedNumber = trimmed.replaceAll(',', '');

        if (!/^-?\d+(\.\d+)?$/.test(normalizedNumber)) {
          throw new BadRequestException(`${label} must be a valid number.`);
        }

        return normalizedNumber;
      }

      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          throw new BadRequestException(`${label} must use YYYY-MM-DD format.`);
        }

        const parsed = new Date(`${trimmed}T00:00:00Z`);

        if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(trimmed)) {
          throw new BadRequestException(`${label} must be a real calendar date.`);
        }

        return trimmed;
      }

      case 'url': {
        let parsedUrl: URL;

        try {
          parsedUrl = new URL(trimmed);
        } catch {
          throw new BadRequestException(`${label} must be a valid URL.`);
        }

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new BadRequestException(`${label} must start with http:// or https://.`);
        }

        return trimmed;
      }

      default:
        return trimmed;
    }
  }

  private normalizeComparableValue(
    dataType: CanonicalFieldDataType,
    rawValue: string | null | undefined
  ) {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    try {
      return this.normalizeValue(dataType, rawValue, 'Value');
    } catch {
      return rawValue.trim() || null;
    }
  }

  private async upsertManualSourceRows(
    reportVersionId: string,
    rows: Array<{
      rowNumber: number;
      values: Record<string, string | null>;
    }>
  ) {
    const settingKey = toManualSourceRowsSettingKey(reportVersionId);
    const existing = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey
      },
      select: {
        valueJson: true
      }
    });
    const rowsByRowNumber = {
      ...parseManualSourceRowsSettingPayload(existing?.valueJson ?? null)
    };

    for (const row of rows) {
      if (!Number.isInteger(row.rowNumber) || row.rowNumber < 1) {
        throw new BadRequestException('Manual source row numbers must be positive integers.');
      }

      const normalizedValues: Record<string, string> = {};
      for (const [rawLabel, rawValue] of Object.entries(row.values ?? {})) {
        const label = String(rawLabel ?? '').trim().replace(/\s+/g, ' ');
        const value = String(rawValue ?? '').trim();

        if (!label || !value) {
          continue;
        }

        normalizedValues[label] = value;
      }

      const rowNumberKey = String(row.rowNumber);
      if (Object.keys(normalizedValues).length === 0) {
        delete rowsByRowNumber[rowNumberKey];
        continue;
      }

      rowsByRowNumber[rowNumberKey] = normalizedValues;
    }

    if (Object.keys(rowsByRowNumber).length === 0) {
      await this.prisma.globalUiSetting.deleteMany({
        where: {
          settingKey
        }
      });
      return;
    }

    await this.prisma.globalUiSetting.upsert({
      where: {
        settingKey
      },
      update: {
        valueJson: stringifyManualSourceRowsSettingPayload(rowsByRowNumber)
      },
      create: {
        settingKey,
        valueJson: stringifyManualSourceRowsSettingPayload(rowsByRowNumber)
      }
    });
  }

  private async upsertManualFormulaRows(
    reportVersionId: string,
    rows: Array<{
      rowNumber: number;
      values: Record<string, string | null>;
    }>
  ) {
    const settingKey = toManualFormulaRowsSettingKey(reportVersionId);
    const existing = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey
      },
      select: {
        valueJson: true
      }
    });
    const rowsByRowNumber = {
      ...parseManualFormulaRowsSettingPayload(existing?.valueJson ?? null)
    };

    for (const row of rows) {
      if (!Number.isInteger(row.rowNumber) || row.rowNumber < 1) {
        throw new BadRequestException('Manual formula row numbers must be positive integers.');
      }

      const normalizedValues: Record<string, string> = {};
      for (const [rawFormulaId, rawValue] of Object.entries(row.values ?? {})) {
        const formulaId = String(rawFormulaId ?? '').trim();
        const value = String(rawValue ?? '').trim();

        if (!formulaId || !value) {
          continue;
        }

        normalizedValues[formulaId] = value;
      }

      const rowNumberKey = String(row.rowNumber);
      if (Object.keys(normalizedValues).length === 0) {
        delete rowsByRowNumber[rowNumberKey];
        continue;
      }

      rowsByRowNumber[rowNumberKey] = normalizedValues;
    }

    if (Object.keys(rowsByRowNumber).length === 0) {
      await this.prisma.globalUiSetting.deleteMany({
        where: {
          settingKey
        }
      });
      return;
    }

    await this.prisma.globalUiSetting.upsert({
      where: {
        settingKey
      },
      update: {
        valueJson: stringifyManualFormulaRowsSettingPayload(rowsByRowNumber)
      },
      create: {
        settingKey,
        valueJson: stringifyManualFormulaRowsSettingPayload(rowsByRowNumber)
      }
    });
  }
}
