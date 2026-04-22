import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  MappingTargetField,
  ReportWorkflowState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { BrandsService } from '../brands/brands.service';
import { ColumnConfigService } from '../column-config/column-config.service';
import { DatasetMaterializerService } from '../dataset/dataset-materializer.service';
import { MetricsService } from '../metrics/metrics.service';
import { TopContentService } from '../top-content/top-content.service';
import { AVAILABLE_TARGETS } from './mapping-targets';
import type { MappingOverviewResponse } from './mapping.types';

@Injectable()
export class MappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly columnConfigService: ColumnConfigService,
    private readonly datasetMaterializerService: DatasetMaterializerService,
    private readonly metricsService: MetricsService,
    private readonly topContentService: TopContentService
  ) {}

  async getMappingOverview(
    brandCode: string,
    periodId: string
  ): Promise<MappingOverviewResponse> {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const period = await this.prisma.reportingPeriod.findUnique({
      where: { id: periodId },
      include: {
        brand: true,
        reportVersions: {
          orderBy: {
            versionNo: 'desc'
          },
          include: {
            _count: {
              select: {
                datasetRows: true
              }
            },
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
    const displayLabelLookup =
      await this.columnConfigService.getPublishedImportColumnDisplayLabelLookup();
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

    return {
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
            createdAt: latestImportJob.createdAt.toISOString(),
            persistedRowCount: currentDraft?._count.datasetRows ?? 0,
            columnProfiles: latestImportJob.columnProfiles.map((profile) => ({
              id: profile.id,
              sourceColumnName: this.columnConfigService.resolveImportColumnDisplayLabel(
                profile.sourceColumnName,
                displayLabelLookup
              ),
              sourceRawColumnName: profile.sourceColumnName,
              sourcePosition: profile.sourcePosition,
              sampleValue: profile.sampleValue,
              mappedTargetField: profile.mappings[0]?.targetField ?? null
            }))
          }
        : null,
      availableTargets: AVAILABLE_TARGETS,
      validation: {
        targetFieldsMustBeUnique: true
      }
    };
  }

  async autoMapLatestImportJob(brandCode: string, periodId: string) {
    const overview = await this.getMappingOverview(brandCode, periodId);
    const latestImportJob = overview.latestImportJob;

    if (!latestImportJob) {
      return {
        status: 'missing_import' as const,
        mappedCount: 0,
        missingRequiredTargets: [] as MappingTargetField[]
      };
    }

    const rules = await this.columnConfigService.getPublishedImportColumnMappingRules();
    const targetByNormalizedHeader = new Map<string, MappingTargetField>();

    for (const rule of rules) {
      if (!this.isMappingTargetField(rule.targetField)) {
        continue;
      }

      const headers = [rule.baselineHeader, ...rule.aliases]
        .map((header) => this.normalizeHeaderKey(header))
        .filter((header) => !!header);

      for (const header of headers) {
        if (!targetByNormalizedHeader.has(header)) {
          targetByNormalizedHeader.set(header, rule.targetField);
        }
      }
    }

    const usedTargets = new Set<MappingTargetField>();
    const matchedTargets = new Set<MappingTargetField>();
    const mappings = latestImportJob.columnProfiles.map((profile) => {
      const targetField =
        targetByNormalizedHeader.get(
          this.normalizeHeaderKey(profile.sourceColumnName)
        ) ?? null;

      if (!targetField || usedTargets.has(targetField)) {
        return {
          importColumnProfileId: profile.id,
          targetField: null
        };
      }

      usedTargets.add(targetField);
      matchedTargets.add(targetField);

      return {
        importColumnProfileId: profile.id,
        targetField
      };
    });

    const selectedMappings = mappings.filter(
      (mapping): mapping is { importColumnProfileId: string; targetField: MappingTargetField } =>
        mapping.targetField !== null
    );
    const missingRequiredTargets = rules
      .filter((rule) => rule.required && this.isMappingTargetField(rule.targetField))
      .map((rule) => rule.targetField as MappingTargetField)
      .filter((targetField) => !matchedTargets.has(targetField));

    if (selectedMappings.length === 0) {
      return {
        status: 'no_matches' as const,
        mappedCount: 0,
        missingRequiredTargets
      };
    }

    const saveResult = await this.saveMappings(brandCode, periodId, mappings);

    return {
      status:
        missingRequiredTargets.length > 0
          ? ('requires_admin_mapping' as const)
          : ('mapped' as const),
      mappedCount: saveResult.savedCount,
      missingRequiredTargets
    };
  }

  async saveMappings(
    brandCode: string,
    periodId: string,
    mappings: Array<{
      importColumnProfileId: string;
      targetField: MappingTargetField | null;
    }>
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
      throw new ConflictException(
        'Create or resume a draft before saving mappings.'
      );
    }

    const submittedRows = mappings.filter((mapping) => mapping.importColumnProfileId);
    const selectedMappings = submittedRows.filter((mapping) => mapping.targetField);
    const duplicateTargets = Array.from(
      selectedMappings.reduce((counts, mapping) => {
        const targetField = String(mapping.targetField);
        counts.set(targetField, (counts.get(targetField) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
    )
      .filter(([, count]) => count > 1)
      .map(([targetField]) => targetField);

    if (duplicateTargets.length > 0) {
      throw new BadRequestException(
        `Each canonical target field can be mapped only once. Duplicate targets: ${duplicateTargets.join(', ')}.`
      );
    }

    const latestImportJob = await this.prisma.importJob.findFirst({
      where: {
        reportVersionId: currentDraft.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        columnProfiles: {
          orderBy: {
            sourcePosition: 'asc'
          }
        }
      }
    });

    if (!latestImportJob) {
      throw new ConflictException('Upload an import file before saving mappings.');
    }

    const profileIds = new Set(
      latestImportJob.columnProfiles.map((profile) => profile.id)
    );

    if (
      submittedRows.some(
        (mapping) => !profileIds.has(mapping.importColumnProfileId)
      )
    ) {
      throw new BadRequestException(
        'One or more mapping rows do not belong to the latest import job for the current draft.'
      );
    }

    const mappingLookup = new Map(
      submittedRows.map((mapping) => [mapping.importColumnProfileId, mapping.targetField])
    );

    const result = await this.prisma.$transaction(async (tx) => {
      for (const profile of latestImportJob.columnProfiles) {
        const targetField = mappingLookup.get(profile.id) ?? null;

        if (!targetField) {
          await tx.columnMapping.deleteMany({
            where: {
              reportVersionId: currentDraft.id,
              importColumnProfileId: profile.id
            }
          });

          continue;
        }

        await tx.columnMapping.upsert({
          where: {
            column_mapping_version_column_unique: {
              reportVersionId: currentDraft.id,
              importColumnProfileId: profile.id
            }
          },
          update: {
            targetField,
            importJobId: latestImportJob.id
          },
          create: {
            reportVersionId: currentDraft.id,
            importJobId: latestImportJob.id,
            importColumnProfileId: profile.id,
            targetField
          }
        });
      }

      return {
        savedCount: selectedMappings.length
      };
    });

    const materialized = await this.datasetMaterializerService.materializeReportVersion(
      currentDraft.id
    );

    await this.metricsService.refreshSnapshotForReportVersion(currentDraft.id);
    await this.topContentService.refreshForReportVersion(currentDraft.id);

    return {
      ...result,
      materializedRows: materialized.rowCount,
      materializedCells: materialized.cellCount
    };
  }

  private normalizeHeaderKey(value: string | null | undefined) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isMappingTargetField(value: string): value is MappingTargetField {
    return Object.values(MappingTargetField).includes(value as MappingTargetField);
  }
}
