import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import {
  BrandDropdownFieldKey,
  ComputedColumnKey,
  MappingTargetField,
  ReportWorkflowState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BrandsService } from '../brands/brands.service';
import { ColumnConfigService } from '../column-config/column-config.service';
import type { TopContentDataSourcePolicyMode } from '../column-config/column-config.types';
import { MediaService } from '../media/media.service';
import { readImportJobSnapshot } from '../imports/import-snapshot';
import { AVAILABLE_TARGETS_BY_KEY } from '../mapping/mapping-targets';
import {
  parseManualSourceRowsSettingPayload,
  toManualSourceRowsSettingKey
} from '../dataset/manual-source-rows-setting';
import { TOP_CONTENT_SLOTS, type TopContentSlotKey } from './top-content.constants';
import type { TopContentOverviewResponse } from './top-content.types';

type RankedRow = {
  id: string;
  sourceRowNumber: number;
};

type GeneratedCardCandidate = {
  slotKey: TopContentSlotKey;
  metricKey: MappingTargetField;
  datasetRowId: string;
  headlineValue: number;
  selectionBasis: string;
  rankPosition: number;
  displayOrder: number;
  sourceType: 'csv' | 'manual';
};

type TopContentCurrentness = {
  state: TopContentOverviewResponse['readiness']['state'];
  detail: string;
  generatedCount: number;
  requiredSlotCount: number;
  currentSlotCount: number;
  isCurrent: boolean;
  cards: TopContentOverviewResponse['cards'];
};

type SnapshotMetricsByRow = {
  hasImportSnapshot: boolean;
  sourceRowCount: number;
  valuesByRowNumber: Map<
    number,
    {
      top_views: number | null;
      top_reach: number | null;
      top_engagement: number | null;
    }
  >;
  postUrlByRowNumber: Map<number, string | null>;
  publishedAtByRowNumber: Map<number, string | null>;
  contentStyleValueKeyByRowNumber: Map<number, string | null>;
  availableBySlot: Record<TopContentSlotKey, boolean>;
};

type DatasetMetricValuesByRow = {
  valuesByRowNumber: Map<
    number,
    {
      top_views: number | null;
      top_reach: number | null;
      top_engagement: number | null;
    }
  >;
  postUrlByRowNumber: Map<number, string | null>;
  publishedAtByRowNumber: Map<number, string | null>;
  contentStyleValueKeyByRowNumber: Map<number, string | null>;
};

type ContentStyleOptionLookup = {
  valueKeySet: Set<string>;
  valueKeyByNormalizedLabel: Map<string, string>;
};

const DEFAULT_REQUIRED_SOURCE_LABELS_BY_SLOT: Record<TopContentSlotKey, string> = {
  top_views: 'Views',
  top_engagement: 'Engagement',
  top_reach: 'Reach'
};

const DEFAULT_ENGAGEMENT_SOURCE_LABEL_A = 'Reactions, comments and shares';
const DEFAULT_ENGAGEMENT_SOURCE_LABEL_B = 'Total clicks';
const DEFAULT_PERMALINK_LABEL = 'Permalink';
const DEFAULT_CONTENT_STYLE_LABEL = 'Content Style';

@Injectable()
export class TopContentService {
  private readonly logger = new Logger(TopContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly brandsService: BrandsService,
    private readonly columnConfigService: ColumnConfigService,
    private readonly mediaService: MediaService
  ) {}

  async getOverview(
    brandCode: string,
    periodId: string
  ): Promise<TopContentOverviewResponse> {
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
    const dataSourcePolicy = await this.columnConfigService.getTopContentDataSourcePolicy();

    const baseResponse: Omit<TopContentOverviewResponse, 'readiness' | 'generation' | 'dataSourcePolicy' | 'cards'> = {
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

    if (!targetVersion) {
      return {
        ...baseResponse,
        readiness: {
          state: 'blocked',
          detail: 'Create a reporting version before top content can be generated.'
        },
        generation: {
          reportVersionId: null,
          generatedCount: 0,
          requiredSlotCount: TOP_CONTENT_SLOTS.length,
          currentSlotCount: 0,
          isCurrent: false
        },
        dataSourcePolicy: {
          mode: dataSourcePolicy.mode,
          label: dataSourcePolicy.label,
          excludeManualRows: dataSourcePolicy.excludeManualRows
        },
        cards: []
      };
    }

    if (targetVersion.workflowState === ReportWorkflowState.draft) {
      // Keep draft placeholders fresh whenever user opens the page.
      await this.refreshForReportVersion(targetVersion.id, dataSourcePolicy.mode);
    }

    const currentness = await this.getCurrentnessForReportVersion(
      targetVersion.id,
      dataSourcePolicy.mode,
      {
        skipRefresh: true
      }
    );

    return {
      ...baseResponse,
      readiness: {
        state: currentness.state,
        detail: currentness.detail
      },
      generation: {
        reportVersionId: targetVersion.id,
        generatedCount: currentness.generatedCount,
        requiredSlotCount: currentness.requiredSlotCount,
        currentSlotCount: currentness.currentSlotCount,
        isCurrent: currentness.isCurrent
      },
      dataSourcePolicy: {
        mode: dataSourcePolicy.mode,
        label: dataSourcePolicy.label,
        excludeManualRows: dataSourcePolicy.excludeManualRows
      },
      cards: currentness.cards
    };
  }

  async regenerateForPeriod(brandCode: string, periodId: string) {
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

    await this.refreshForReportVersion(targetVersion.id);

    return this.getOverview(brandCode, periodId);
  }

  async refreshForReportVersion(
    reportVersionId: string,
    policyMode?: TopContentDataSourcePolicyMode
  ) {
    const dataSourcePolicy = await this.columnConfigService.getTopContentDataSourcePolicy();
    const resolvedPolicyMode =
      policyMode ?? dataSourcePolicy.mode;
    const excludedContentStyleValueKeys = new Set(
      dataSourcePolicy.excludedContentStyleValueKeys
    );
    const requiredSourceLabelsBySlot = await this.getRequiredSourceLabelsBySlot();
    const snapshotMetricsByRow = await this.getSnapshotMetricsByRow(reportVersionId);

    if (!snapshotMetricsByRow.hasImportSnapshot) {
      return {
        refreshedCount: 0,
        requiredSlotCount: TOP_CONTENT_SLOTS.length,
        currentSlotCount: 0,
        state: 'blocked' as const
      };
    }

    const datasetMetricValuesByRow = await this.getDatasetMetricValuesByRow(reportVersionId);
    const metricResolution = this.resolveSlotMetricKeys(
      requiredSourceLabelsBySlot,
      this.resolveSlotAvailability({
        snapshotMetricsByRow,
        datasetMetricValuesByRow,
        policyMode: resolvedPolicyMode
      })
    );
    if (metricResolution.missingSlotLabels.length > 0) {
      return {
        refreshedCount: 0,
        requiredSlotCount: TOP_CONTENT_SLOTS.length,
        currentSlotCount: 0,
        state: 'blocked' as const
      };
    }

    return this.materializeCards(
      reportVersionId,
      metricResolution.metricKeyBySlot,
      snapshotMetricsByRow,
      resolvedPolicyMode,
      datasetMetricValuesByRow,
      excludedContentStyleValueKeys,
      requiredSourceLabelsBySlot
    );
  }

  async getCurrentnessForReportVersion(
    reportVersionId: string,
    policyMode?: TopContentDataSourcePolicyMode,
    options?: {
      skipRefresh?: boolean;
    }
  ): Promise<TopContentCurrentness> {
    const dataSourcePolicy = await this.columnConfigService.getTopContentDataSourcePolicy();
    const resolvedPolicyMode =
      policyMode ?? dataSourcePolicy.mode;
    const excludedContentStyleValueKeys = new Set(
      dataSourcePolicy.excludedContentStyleValueKeys
    );
    const requiredSourceLabelsBySlot = await this.getRequiredSourceLabelsBySlot();
    const reportVersion = await this.prisma.reportVersion.findUnique({
      where: {
        id: reportVersionId
      },
      select: {
        workflowState: true
      }
    });

    if (!reportVersion) {
      return {
        state: 'blocked',
        detail: 'Top content version was not found.',
        generatedCount: 0,
        requiredSlotCount: TOP_CONTENT_SLOTS.length,
        currentSlotCount: 0,
        isCurrent: false,
        cards: []
      };
    }

    if (reportVersion.workflowState !== ReportWorkflowState.draft) {
      return this.getImmutableCurrentnessForReportVersion(
        reportVersionId,
        requiredSourceLabelsBySlot
      );
    }

    if (!options?.skipRefresh) {
      await this.refreshForReportVersion(reportVersionId, resolvedPolicyMode);
    }

    const snapshotMetricsByRow = await this.getSnapshotMetricsByRow(reportVersionId);

    if (!snapshotMetricsByRow.hasImportSnapshot) {
      return {
        state: 'blocked',
        detail:
          'Top content requires an imported CSV snapshot for this period. Import file first.',
        generatedCount: 0,
        requiredSlotCount: TOP_CONTENT_SLOTS.length,
        currentSlotCount: 0,
        isCurrent: false,
        cards: []
      };
    }

    const datasetMetricValuesByRow = await this.getDatasetMetricValuesByRow(reportVersionId);
    const metricResolution = this.resolveSlotMetricKeys(
      requiredSourceLabelsBySlot,
      this.resolveSlotAvailability({
        snapshotMetricsByRow,
        datasetMetricValuesByRow,
        policyMode: resolvedPolicyMode
      })
    );
    if (metricResolution.missingSlotLabels.length > 0) {
      const missingMetricLabels = metricResolution.missingSlotLabels.join(', ');

      return {
        state: 'blocked',
        detail: `Top content is blocked because required metric inputs are missing: ${missingMetricLabels}.`,
        generatedCount: 0,
        requiredSlotCount: TOP_CONTENT_SLOTS.length,
        currentSlotCount: 0,
        isCurrent: false,
        cards: []
      };
    }

    const postUrlByRowNumber = this.mergeMapWithFallback(
      snapshotMetricsByRow.postUrlByRowNumber,
      datasetMetricValuesByRow?.postUrlByRowNumber ?? null
    );

    const [rows, existingCards] = await Promise.all([
      this.prisma.datasetRow.findMany({
        where: {
          reportVersionId
        }
      }),
      this.prisma.topContentCard.findMany({
        where: {
          reportVersionId
        },
        orderBy: {
          displayOrder: 'asc'
        },
        include: {
          datasetRow: true
        }
      })
    ]);

    const expectedCards = this.buildGeneratedCards(
      rows,
      metricResolution.metricKeyBySlot,
      snapshotMetricsByRow,
      resolvedPolicyMode,
      datasetMetricValuesByRow,
      excludedContentStyleValueKeys,
      requiredSourceLabelsBySlot
    );
    const requiredSlotCount = TOP_CONTENT_SLOTS.length;
    const contentStyleCoverage = this.getContentStyleCoverage({
      rows,
      snapshotMetricsByRow,
      policyMode: resolvedPolicyMode,
      datasetMetricValuesByRow
    });
    const hasExcludedStyles = excludedContentStyleValueKeys.size > 0;
    const hasNoContentStyleCoverage =
      hasExcludedStyles &&
      contentStyleCoverage.eligibleRowCount > 0 &&
      contentStyleCoverage.styledRowCount === 0;

    if (expectedCards.length < requiredSlotCount) {
      return {
        state: 'blocked',
        detail:
          'No eligible posts were found for one or more required Top 3 categories in imported CSV.',
        generatedCount: existingCards.length,
        requiredSlotCount,
        currentSlotCount: 0,
        isCurrent: false,
        cards: existingCards.map((card) =>
          this.toCardResponse(card, postUrlByRowNumber, requiredSourceLabelsBySlot)
        )
      };
    }

    const requiredCards = TOP_CONTENT_SLOTS.map((slot) =>
      existingCards.find(
        (card) => card.slotKey === slot.slotKey && card.rankPosition === slot.rankPosition
      ) ?? null
    );
    const populatedRequiredCards = requiredCards.filter(
      (card): card is NonNullable<(typeof requiredCards)[number]> => !!card
    );
    const hasAllRequiredCards = populatedRequiredCards.length === requiredSlotCount;
    const screenshotSlotCount = populatedRequiredCards.filter(
      (card) => !!card.screenshotUrl?.trim()
    ).length;

    const matchingExpectedCardCount = expectedCards.filter((expected) => {
      const existing = existingCards.find(
        (card) => card.slotKey === expected.slotKey && card.rankPosition === expected.rankPosition
      );

      if (!existing) {
        return false;
      }

      return this.isCurrentRankingMatch(existing, expected);
    }).length;

    const matchedScreenshotSlotCount = expectedCards.filter((expected) => {
      const existing = existingCards.find(
        (card) => card.slotKey === expected.slotKey && card.rankPosition === expected.rankPosition
      );

      if (!existing) {
        return false;
      }

      const matchesRanking =
        this.isCurrentRankingMatch(existing, expected);

      if (!matchesRanking) {
        return false;
      }

      return !!existing.screenshotUrl?.trim();
    }).length;

    const hasCurrentRanking =
      expectedCards.length === requiredSlotCount &&
      matchingExpectedCardCount === requiredSlotCount;
    const hasAllScreenshots =
      hasAllRequiredCards && screenshotSlotCount === requiredSlotCount;
    const skipRankingStrictness = hasNoContentStyleCoverage;
    const currentSlotCount = skipRankingStrictness
      ? screenshotSlotCount
      : matchedScreenshotSlotCount;
    const isCurrent = hasAllScreenshots && (skipRankingStrictness || hasCurrentRanking);

    return {
      state: isCurrent ? 'ready' : 'pending',
      detail: isCurrent
        ? hasNoContentStyleCoverage
          ? 'Top 3 cards have complete screenshot evidence and are accepted for this draft. Content Style exclusion is enabled, but no Content Style values were found in this draft.'
          : 'Top 3 cards are current and screenshot evidence is complete for all required slots.'
        : !hasAllScreenshots
          ? hasNoContentStyleCoverage
            ? 'Top content screenshot evidence is still incomplete. Content Style exclusion is enabled, but no Content Style values were found in this draft.'
            : 'Top content ranking is current, but screenshot evidence is still incomplete.'
          : !hasCurrentRanking
            ? 'Top content cards are stale for the latest imported CSV snapshot. Refresh ranking before submit.'
            : 'Top content is pending review.',
      generatedCount: existingCards.length,
      requiredSlotCount,
      currentSlotCount,
      isCurrent,
      cards: existingCards.map((card) =>
        this.toCardResponse(card, postUrlByRowNumber, requiredSourceLabelsBySlot)
      )
    };
  }

  private async getImmutableCurrentnessForReportVersion(
    reportVersionId: string,
    requiredSourceLabelsBySlot: Record<TopContentSlotKey, string>
  ): Promise<TopContentCurrentness> {
    const [snapshotMetricsByRow, datasetMetricValuesByRow, existingCards] = await Promise.all([
      this.getSnapshotMetricsByRow(reportVersionId),
      this.getDatasetMetricValuesByRow(reportVersionId),
      this.prisma.topContentCard.findMany({
        where: {
          reportVersionId
        },
        orderBy: {
          displayOrder: 'asc'
        },
        include: {
          datasetRow: true
        }
      })
    ]);
    const postUrlByRowNumber = this.mergeMapWithFallback(
      snapshotMetricsByRow.postUrlByRowNumber,
      datasetMetricValuesByRow.postUrlByRowNumber
    );
    const requiredSlotCount = TOP_CONTENT_SLOTS.length;
    const requiredCards = TOP_CONTENT_SLOTS.map(slot =>
      existingCards.find(
        card => card.slotKey === slot.slotKey && card.rankPosition === slot.rankPosition
      ) ?? null
    );
    const populatedRequiredCards = requiredCards.filter(
      (card): card is NonNullable<(typeof requiredCards)[number]> => !!card
    );
    const currentSlotCount = populatedRequiredCards.filter(
      card => !!card.screenshotUrl?.trim()
    ).length;
    const hasAllRequiredCards = populatedRequiredCards.length === requiredSlotCount;
    const isCurrent = hasAllRequiredCards && currentSlotCount === requiredSlotCount;

    return {
      state: isCurrent ? 'ready' : hasAllRequiredCards ? 'pending' : 'blocked',
      detail: isCurrent
        ? 'Top content is frozen from the approved/submitted version snapshot.'
        : hasAllRequiredCards
          ? 'Top content is frozen, but screenshot evidence is incomplete for one or more cards.'
          : 'Top content snapshot is incomplete for this frozen version.',
      generatedCount: existingCards.length,
      requiredSlotCount,
      currentSlotCount,
      isCurrent,
      cards: existingCards.map(card =>
        this.toCardResponse(card, postUrlByRowNumber, requiredSourceLabelsBySlot)
      )
    };
  }

  async updateCard(
    brandCode: string,
    periodId: string,
    cardId: string,
    input: {
      screenshotUrl?: string | null;
      actorName?: string | null;
      actorEmail?: string | null;
    }
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
      throw new ConflictException('Create or resume a draft before editing top content.');
    }

    const card = await this.prisma.topContentCard.findUnique({
      where: {
        id: cardId
      }
    });

    if (!card || card.reportVersionId !== currentDraft.id) {
      throw new NotFoundException('Top content card not found for the current draft.');
    }

    const screenshotUrl = input.screenshotUrl?.trim() || null;
    if (screenshotUrl) {
      this.assertHttpUrl(screenshotUrl, 'Screenshot URL');
    }
    await this.mediaService.assertManagedPublicUrlsExist(
      [screenshotUrl],
      'Top content screenshot'
    );

    const previousScreenshotUrl = this.normalizeMediaUrl(card.screenshotUrl);
    const updatedCard = await this.prisma.topContentCard.update({
      where: {
        id: card.id
      },
      data: {
        screenshotUrl
      }
    });

    const currentScreenshotUrl = this.normalizeMediaUrl(updatedCard.screenshotUrl);
    if (previousScreenshotUrl && previousScreenshotUrl !== currentScreenshotUrl) {
      const unreferencedUrls = await this.filterUnreferencedTopContentScreenshotUrls([
        previousScreenshotUrl
      ]);
      await this.deleteRemovedScreenshotUrls(unreferencedUrls);
    }

    await this.auditLogService.append({
      actionKey: 'CONTENT_TOP_CONTENT_UPDATED',
      entityType: 'CONTENT',
      entityId: updatedCard.id,
      entityLabel: `Top Content ${updatedCard.slotKey}`,
      summary: `Updated Top Content card ${updatedCard.slotKey} #${updatedCard.rankPosition}.`,
      metadata: {
        reportVersionId: currentDraft.id,
        slotKey: updatedCard.slotKey,
        rankPosition: updatedCard.rankPosition
      },
      actor: {
        actorName: input.actorName,
        actorEmail: input.actorEmail
      }
    });

    return updatedCard;
  }

  private async materializeCards(
    reportVersionId: string,
    metricKeyBySlot: Record<TopContentSlotKey, MappingTargetField>,
    snapshotMetricsByRow: SnapshotMetricsByRow,
    policyMode: TopContentDataSourcePolicyMode,
    datasetMetricValuesByRow: DatasetMetricValuesByRow | null,
    excludedContentStyleValueKeys: Set<string>,
    requiredSourceLabelsBySlot: Record<TopContentSlotKey, string>
  ) {
    const rows = await this.prisma.datasetRow.findMany({
      where: {
        reportVersionId
      }
    });

    const generatedCards = this.buildGeneratedCards(
      rows,
      metricKeyBySlot,
      snapshotMetricsByRow,
      policyMode,
      datasetMetricValuesByRow,
      excludedContentStyleValueKeys,
      requiredSourceLabelsBySlot
    );
    const existingCards = await this.prisma.topContentCard.findMany({
      where: {
        reportVersionId
      }
    });
    const screenshotUrlBySlotAndDatasetRowId = new Map<string, string>();
    for (const card of existingCards) {
      const screenshotUrl = this.normalizeMediaUrl(card.screenshotUrl);
      if (!screenshotUrl) {
        continue;
      }

      const key = `${card.slotKey}:${card.datasetRowId}`;
      if (!screenshotUrlBySlotAndDatasetRowId.has(key)) {
        screenshotUrlBySlotAndDatasetRowId.set(key, screenshotUrl);
      }
    }
    const beforeScreenshotUrls = new Set(
      existingCards
        .map((card) => this.normalizeMediaUrl(card.screenshotUrl))
        .filter((url): url is string => !!url)
    );

    await this.prisma.$transaction(async (tx) => {
      for (const existing of existingCards) {
        const stillRequired = generatedCards.some(
          (generated) =>
            generated.slotKey === existing.slotKey &&
            generated.rankPosition === existing.rankPosition
        );

        if (!stillRequired) {
          await tx.topContentCard.delete({
            where: {
              id: existing.id
            }
          });
        }
      }

      for (const generated of generatedCards) {
        const existing = existingCards.find(
          (card) =>
            card.slotKey === generated.slotKey &&
            card.rankPosition === generated.rankPosition
        );

        if (!existing) {
          const preservedScreenshotUrl =
            screenshotUrlBySlotAndDatasetRowId.get(
              `${generated.slotKey}:${generated.datasetRowId}`
            ) ?? null;
          await tx.topContentCard.create({
            data: {
              reportVersionId,
              datasetRowId: generated.datasetRowId,
              slotKey: generated.slotKey,
              metricKey: generated.metricKey,
              title: null,
              headlineValue: generated.headlineValue,
              caption: null,
              externalUrl: null,
              screenshotUrl: preservedScreenshotUrl,
              selectionBasis: generated.selectionBasis,
              rankPosition: generated.rankPosition,
              displayOrder: generated.displayOrder
            }
          });
          continue;
        }

        const preservedScreenshotUrl =
          screenshotUrlBySlotAndDatasetRowId.get(
            `${generated.slotKey}:${generated.datasetRowId}`
          ) ?? null;
        await tx.topContentCard.update({
          where: {
            id: existing.id
          },
          data: {
            datasetRowId: generated.datasetRowId,
            metricKey: generated.metricKey,
            headlineValue: generated.headlineValue,
            selectionBasis: generated.selectionBasis,
            displayOrder: generated.displayOrder,
            screenshotUrl: preservedScreenshotUrl
          }
        });
      }
    });
    if (beforeScreenshotUrls.size > 0) {
      const afterCards = await this.prisma.topContentCard.findMany({
        where: {
          reportVersionId
        },
        select: {
          screenshotUrl: true
        }
      });
      const afterScreenshotUrls = new Set(
        afterCards
          .map((card) => this.normalizeMediaUrl(card.screenshotUrl))
          .filter((url): url is string => !!url)
      );
      await this.deleteRemovedScreenshotUrls(
        await this.filterUnreferencedTopContentScreenshotUrls(
          Array.from(beforeScreenshotUrls).filter((url) => !afterScreenshotUrls.has(url))
        )
      );
    }

    return {
      refreshedCount: generatedCards.length,
      requiredSlotCount: TOP_CONTENT_SLOTS.length,
      currentSlotCount: generatedCards.length,
      state: generatedCards.length === TOP_CONTENT_SLOTS.length ? ('ready' as const) : ('blocked' as const)
    };
  }

  private buildGeneratedCards(
    rows: RankedRow[],
    metricKeyBySlot: Record<TopContentSlotKey, MappingTargetField>,
    snapshotMetricsByRow: SnapshotMetricsByRow,
    policyMode: TopContentDataSourcePolicyMode,
    datasetMetricValuesByRow: DatasetMetricValuesByRow | null,
    excludedContentStyleValueKeys: Set<string>,
    requiredSourceLabelsBySlot: Record<TopContentSlotKey, string>
  ): GeneratedCardCandidate[] {
    const includeManualRows = policyMode === 'csv_and_manual';
    const publishedAtByRowNumber = this.mergeMapWithFallback(
      snapshotMetricsByRow.publishedAtByRowNumber,
      includeManualRows ? datasetMetricValuesByRow?.publishedAtByRowNumber ?? null : null
    );

    return TOP_CONTENT_SLOTS.flatMap((slot) => {
      const slotMetricKey = metricKeyBySlot[slot.slotKey];
      if (!slotMetricKey) {
        return [];
      }

      const rankedRows = rows
        .map((row) => ({
          row,
          resolvedMetric: this.resolveMetricValueForSlot({
            row,
            slotKey: slot.slotKey,
            snapshotMetricsByRow,
            policyMode,
            datasetMetricValuesByRow
          }),
          publishedAtTimestamp: this.parsePublishedAt(
            publishedAtByRowNumber.get(row.sourceRowNumber) ?? null
          ),
          contentStyleValueKey: this.resolveContentStyleValueKeyForRow({
            rowNumber: row.sourceRowNumber,
            snapshotMetricsByRow,
            datasetMetricValuesByRow
          })
        }))
        .filter((item): item is {
          row: RankedRow;
          resolvedMetric: { value: number; sourceType: 'csv' | 'manual' };
          publishedAtTimestamp: number | null;
          contentStyleValueKey: string | null;
        } => {
          if (!item.resolvedMetric || item.resolvedMetric.value <= 0) {
            return false;
          }

          if (
            item.contentStyleValueKey &&
            this.isContentStyleExcluded(
              item.contentStyleValueKey,
              excludedContentStyleValueKeys
            )
          ) {
            return false;
          }

          return true;
        })
        .sort((left, right) => {
          if (right.resolvedMetric.value !== left.resolvedMetric.value) {
            return right.resolvedMetric.value - left.resolvedMetric.value;
          }

          const leftPublishedAt = left.publishedAtTimestamp ?? Number.NEGATIVE_INFINITY;
          const rightPublishedAt = right.publishedAtTimestamp ?? Number.NEGATIVE_INFINITY;

          if (rightPublishedAt !== leftPublishedAt) {
            return rightPublishedAt - leftPublishedAt;
          }

          return left.row.id.localeCompare(right.row.id);
        });

      const winner = rankedRows[slot.rankPosition - 1];

      if (!winner) {
        return [];
      }

      return [
        {
          slotKey: slot.slotKey,
          metricKey: slotMetricKey,
          datasetRowId: winner.row.id,
          headlineValue: winner.resolvedMetric.value,
          selectionBasis: this.toSelectionBasis({
            rankPosition: slot.rankPosition,
            slotMetricLabel:
              requiredSourceLabelsBySlot[slot.slotKey] ?? this.toMetricLabel(slotMetricKey),
            sourceType: winner.resolvedMetric.sourceType,
            policyMode
          }),
          rankPosition: slot.rankPosition,
          displayOrder: slot.displayOrder,
          sourceType: winner.resolvedMetric.sourceType
        }
      ];
    });
  }

  private toCardResponse(card: {
    id: string;
    slotKey: string;
    metricKey: MappingTargetField;
    headlineValue: number;
    rankPosition: number;
    screenshotUrl: string | null;
    selectionBasis: string;
    datasetRow: {
      id: string;
      sourceRowNumber: number;
    };
  },
  postUrlByRowNumber: Map<number, string | null>,
  requiredSourceLabelsBySlot: Record<TopContentSlotKey, string>
  ): TopContentOverviewResponse['cards'][number] {
    const slotKey = card.slotKey as TopContentSlotKey;
    const metricLabel =
      requiredSourceLabelsBySlot[slotKey] ?? this.toMetricLabel(card.metricKey);

    return {
      id: card.id,
      slotKey,
      slotLabel: `Top 3 ${metricLabel}`,
      metricKey: card.metricKey,
      metricLabel,
      headlineValue: card.headlineValue,
      rankPosition: card.rankPosition,
      screenshotUrl: card.screenshotUrl,
      postUrl: postUrlByRowNumber.get(card.datasetRow.sourceRowNumber) ?? null,
      selectionBasis: card.selectionBasis,
      datasetRow: {
        id: card.datasetRow.id,
        rowNumber: card.datasetRow.sourceRowNumber
      }
    };
  }

  private resolveSlotMetricKeys(
    requiredSourceLabelsBySlot: Record<TopContentSlotKey, string>,
    snapshotAvailableBySlot: Record<TopContentSlotKey, boolean>
  ) {
    const slotKeys = Array.from(
      new Set(TOP_CONTENT_SLOTS.map((slot) => slot.slotKey))
    ) as TopContentSlotKey[];
    const metricKeyBySlot = {} as Record<TopContentSlotKey, MappingTargetField>;
    const missingSlotLabels: string[] = [];

    for (const slotKey of slotKeys) {
      const requiredLabel =
        requiredSourceLabelsBySlot[slotKey] ?? DEFAULT_REQUIRED_SOURCE_LABELS_BY_SLOT[slotKey];
      if (!snapshotAvailableBySlot[slotKey]) {
        missingSlotLabels.push(requiredLabel);
        continue;
      }

      metricKeyBySlot[slotKey] = this.defaultMetricKeyForSlot(slotKey);
    }

    return {
      metricKeyBySlot,
      missingSlotLabels
    };
  }

  private resolveSlotAvailability(input: {
    snapshotMetricsByRow: SnapshotMetricsByRow;
    datasetMetricValuesByRow: DatasetMetricValuesByRow | null;
    policyMode: TopContentDataSourcePolicyMode;
  }) {
    const resolved: Record<TopContentSlotKey, boolean> = {
      ...input.snapshotMetricsByRow.availableBySlot
    };

    if (!input.datasetMetricValuesByRow) {
      return resolved;
    }

    const allowManualRows = input.policyMode === 'csv_and_manual';

    for (const [
      rowNumber,
      values
    ] of input.datasetMetricValuesByRow.valuesByRowNumber.entries()) {
      const isManualRow = rowNumber > input.snapshotMetricsByRow.sourceRowCount;
      if (isManualRow && !allowManualRows) {
        continue;
      }

      if (values.top_views !== null) {
        resolved.top_views = true;
      }
      if (values.top_reach !== null) {
        resolved.top_reach = true;
      }
      if (values.top_engagement !== null) {
        resolved.top_engagement = true;
      }
    }

    return resolved;
  }

  private getContentStyleCoverage(input: {
    rows: RankedRow[];
    snapshotMetricsByRow: SnapshotMetricsByRow;
    policyMode: TopContentDataSourcePolicyMode;
    datasetMetricValuesByRow: DatasetMetricValuesByRow | null;
  }) {
    let eligibleRowCount = 0;
    let styledRowCount = 0;

    for (const row of input.rows) {
      const isManualRow =
        row.sourceRowNumber > input.snapshotMetricsByRow.sourceRowCount;
      if (isManualRow && input.policyMode !== 'csv_and_manual') {
        continue;
      }

      eligibleRowCount += 1;
      const styleValueKey = this.resolveContentStyleValueKeyForRow({
        rowNumber: row.sourceRowNumber,
        snapshotMetricsByRow: input.snapshotMetricsByRow,
        datasetMetricValuesByRow: input.datasetMetricValuesByRow
      });
      if (styleValueKey) {
        styledRowCount += 1;
      }
    }

    return {
      eligibleRowCount,
      styledRowCount
    };
  }

  private normalizeMetricLabel(label: string | null | undefined) {
    return (label ?? '').trim().toLowerCase();
  }

  private defaultMetricKeyForSlot(slotKey: TopContentSlotKey) {
    if (slotKey === 'top_views') {
      return MappingTargetField.views;
    }

    if (slotKey === 'top_reach') {
      return MappingTargetField.viewers;
    }

    return MappingTargetField.engagement;
  }

  private resolveMetricValueForSlot(input: {
    row: RankedRow;
    slotKey: TopContentSlotKey;
    snapshotMetricsByRow: SnapshotMetricsByRow;
    policyMode: TopContentDataSourcePolicyMode;
    datasetMetricValuesByRow: DatasetMetricValuesByRow | null;
  }) {
    const isManualRow =
      input.row.sourceRowNumber > input.snapshotMetricsByRow.sourceRowCount;
    if (isManualRow && input.policyMode !== 'csv_and_manual') {
      return null;
    }

    const fromSnapshot = input.snapshotMetricsByRow.valuesByRowNumber.get(input.row.sourceRowNumber);
    const fromDataset = input.datasetMetricValuesByRow
      ? input.datasetMetricValuesByRow.valuesByRowNumber.get(input.row.sourceRowNumber) ?? null
      : null;

    if (fromDataset) {
      const metricValue = fromDataset[input.slotKey] ?? null;
      if (metricValue !== null) {
        const sourceType = isManualRow ? ('manual' as const) : ('csv' as const);

        return {
          value: metricValue,
          sourceType
        };
      }
    }

    if (!fromSnapshot) {
      return null;
    }

    const metricValue = fromSnapshot[input.slotKey] ?? null;
    if (metricValue === null) {
      return null;
    }

    return {
      value: metricValue,
      sourceType: 'csv' as const
    };
  }

  private resolveContentStyleValueKeyForRow(input: {
    rowNumber: number;
    snapshotMetricsByRow: SnapshotMetricsByRow;
    datasetMetricValuesByRow: DatasetMetricValuesByRow | null;
  }) {
    const snapshotValueKey =
      input.snapshotMetricsByRow.contentStyleValueKeyByRowNumber.get(input.rowNumber) ?? null;
    const datasetValueKey = input.datasetMetricValuesByRow
      ? input.datasetMetricValuesByRow.contentStyleValueKeyByRowNumber.get(input.rowNumber) ?? null
      : null;

    return datasetValueKey ?? snapshotValueKey;
  }

  private async getSnapshotMetricsByRow(
    reportVersionId: string
  ): Promise<SnapshotMetricsByRow> {
    const importJob = await this.prisma.importJob.findFirst({
      where: {
        reportVersionId
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        snapshotSourceType: true,
        snapshotSheetName: true,
        snapshotHeaderRow: true,
        snapshotDataRows: true
      }
    });

    const emptyResult: SnapshotMetricsByRow = {
      hasImportSnapshot: false,
      sourceRowCount: 0,
      valuesByRowNumber: new Map(),
      postUrlByRowNumber: new Map(),
      publishedAtByRowNumber: new Map(),
      contentStyleValueKeyByRowNumber: new Map(),
      availableBySlot: {
        top_views: false,
        top_reach: false,
        top_engagement: false
      }
    };

    if (!importJob) {
      return emptyResult;
    }

    const snapshot = readImportJobSnapshot(importJob);
    if (!snapshot) {
      return emptyResult;
    }
    const requiredSourceLabelsBySlot = await this.getRequiredSourceLabelsBySlot();

    const normalizedHeaders = snapshot.headerRow.map((header) =>
      this.normalizeMetricLabel(header)
    );
    const headerCandidatesLookup = await this.getHeaderCandidatesLookup();
    const findColumnIndex = (label: string) => {
      const candidates = this.resolveHeaderCandidates([label], headerCandidatesLookup);
      for (const candidate of candidates) {
        const index = normalizedHeaders.findIndex(
          (header) => header === this.normalizeMetricLabel(candidate)
        );
        if (index >= 0) {
          return index;
        }
      }

      return -1;
    };
    const findColumnIndexAny = (labels: string[]) =>
      this.resolveHeaderCandidates(labels, headerCandidatesLookup).reduce(
        (foundIndex, label) =>
          foundIndex >= 0 ? foundIndex : findColumnIndex(label),
        -1
      );

    const viewsIndex = findColumnIndex(requiredSourceLabelsBySlot.top_views);
    const reachIndex = findColumnIndex(requiredSourceLabelsBySlot.top_reach);
    const engagementIndex = findColumnIndex(requiredSourceLabelsBySlot.top_engagement);
    const permalinkIndex = findColumnIndexAny([DEFAULT_PERMALINK_LABEL, 'Post URL']);
    const publishedAtIndex = findColumnIndexAny([
      'Publish time',
      'Published at',
      'Published time',
      'Publish date',
      'Date'
    ]);
    const contentStyleIndex = findColumnIndexAny([
      DEFAULT_CONTENT_STYLE_LABEL,
      'Content style'
    ]);
    const fallbackStyleIndex = findColumnIndexAny([
      'Custom labels',
      'Custom label',
      'Data comment',
      'Label',
      'Labels'
    ]);
    const resolvedContentStyleIndex =
      contentStyleIndex >= 0 ? contentStyleIndex : fallbackStyleIndex;
    const engagementFormula = await this.getEngagementSourceLabels();
    const engagementAIndex = findColumnIndex(engagementFormula.sourceLabelA);
    const engagementBIndex = findColumnIndex(engagementFormula.sourceLabelB);
    const contentStyleOptionLookup = await this.getContentStyleOptionLookup();

    const availableBySlot: Record<TopContentSlotKey, boolean> = {
      top_views: viewsIndex >= 0,
      top_reach: reachIndex >= 0,
      top_engagement:
        engagementIndex >= 0 || (engagementAIndex >= 0 && engagementBIndex >= 0)
    };

    const valuesByRowNumber = new Map<
      number,
      {
        top_views: number | null;
        top_reach: number | null;
        top_engagement: number | null;
      }
    >();
    const postUrlByRowNumber = new Map<number, string | null>();
    const publishedAtByRowNumber = new Map<number, string | null>();
    const contentStyleValueKeyByRowNumber = new Map<number, string | null>();

    snapshot.dataRows.forEach((row, index) => {
      const rowNumber = index + 1;
      const viewsValue = viewsIndex >= 0 ? this.toNumber(row[viewsIndex] ?? null) : null;
      const reachValue = reachIndex >= 0 ? this.toNumber(row[reachIndex] ?? null) : null;
      const engagementValue =
        engagementIndex >= 0
          ? this.toNumber(row[engagementIndex] ?? null)
          : engagementAIndex >= 0 && engagementBIndex >= 0
            ? (() => {
                const a = this.toNumber(row[engagementAIndex] ?? null);
                const b = this.toNumber(row[engagementBIndex] ?? null);

                if (a === null || b === null) {
                  return null;
                }

                return a + b;
              })()
            : null;

      valuesByRowNumber.set(rowNumber, {
        top_views: viewsValue,
        top_reach: reachValue,
        top_engagement: engagementValue
      });
      postUrlByRowNumber.set(
        rowNumber,
        permalinkIndex >= 0 ? (row[permalinkIndex] || '').trim() || null : null
      );
      publishedAtByRowNumber.set(
        rowNumber,
        publishedAtIndex >= 0 ? (row[publishedAtIndex] || '').trim() || null : null
      );
      contentStyleValueKeyByRowNumber.set(
        rowNumber,
        this.resolveContentStyleValueKey({
          rawValues: row,
          explicitValue:
            resolvedContentStyleIndex >= 0 ? row[resolvedContentStyleIndex] ?? null : null,
          lookup: contentStyleOptionLookup
        })
      );
    });

    return {
      hasImportSnapshot: true,
      sourceRowCount: snapshot.dataRows.length,
      valuesByRowNumber,
      postUrlByRowNumber,
      publishedAtByRowNumber,
      contentStyleValueKeyByRowNumber,
      availableBySlot
    };
  }

  private async getDatasetMetricValuesByRow(
    reportVersionId: string
  ): Promise<DatasetMetricValuesByRow> {
    const manualContentStyleValueKeyByRowNumber =
      await this.getManualContentStyleValueKeyByRow(reportVersionId);
    const rows = await this.prisma.datasetRow.findMany({
      where: {
        reportVersionId
      },
      select: {
        sourceRowNumber: true,
        cells: {
          where: {
            targetField: {
              in: [
                MappingTargetField.views,
                MappingTargetField.viewers,
                MappingTargetField.engagement,
                MappingTargetField.content_url,
                MappingTargetField.published_at
              ]
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
    });

    const valuesByRowNumber = new Map<
      number,
      {
        top_views: number | null;
        top_reach: number | null;
        top_engagement: number | null;
      }
    >();
    const postUrlByRowNumber = new Map<number, string | null>();
    const publishedAtByRowNumber = new Map<number, string | null>();
    const contentStyleValueKeyByRowNumber = new Map<number, string | null>();

    for (const row of rows) {
      const effectiveValuesByTarget = new Map<MappingTargetField, string | null>();

      for (const cell of row.cells) {
        const effectiveValue = cell.override?.overrideValue ?? cell.value;
        effectiveValuesByTarget.set(cell.targetField, effectiveValue);
      }

      valuesByRowNumber.set(row.sourceRowNumber, {
        top_views: this.toNumber(effectiveValuesByTarget.get(MappingTargetField.views) ?? null),
        top_reach: this.toNumber(effectiveValuesByTarget.get(MappingTargetField.viewers) ?? null),
        top_engagement: this.toNumber(
          effectiveValuesByTarget.get(MappingTargetField.engagement) ?? null
        )
      });
      postUrlByRowNumber.set(
        row.sourceRowNumber,
        this.normalizeTextOrNull(effectiveValuesByTarget.get(MappingTargetField.content_url) ?? null)
      );
      publishedAtByRowNumber.set(
        row.sourceRowNumber,
        this.normalizeTextOrNull(effectiveValuesByTarget.get(MappingTargetField.published_at) ?? null)
      );
      contentStyleValueKeyByRowNumber.set(
        row.sourceRowNumber,
        manualContentStyleValueKeyByRowNumber.get(row.sourceRowNumber) ?? null
      );
    }

    return {
      valuesByRowNumber,
      postUrlByRowNumber,
      publishedAtByRowNumber,
      contentStyleValueKeyByRowNumber
    };
  }

  private async getManualContentStyleValueKeyByRow(reportVersionId: string) {
    const setting = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey: toManualSourceRowsSettingKey(reportVersionId)
      },
      select: {
        valueJson: true
      }
    });
    const rowsByRowNumber = parseManualSourceRowsSettingPayload(setting?.valueJson ?? null);
    const map = new Map<number, string | null>();
    const contentStyleOptionLookup = await this.getContentStyleOptionLookup();

    for (const [rowNumber, columns] of Object.entries(rowsByRowNumber)) {
      const parsedRowNumber = Number(rowNumber);
      if (!Number.isInteger(parsedRowNumber) || parsedRowNumber < 1) {
        continue;
      }

      const contentStyleEntry = Object.entries(columns).find(
        ([columnLabel]) => this.isContentStyleColumnLabel(columnLabel)
      );
      map.set(
        parsedRowNumber,
        this.resolveContentStyleValueKey({
          rawValues: Object.values(columns),
          explicitValue: contentStyleEntry ? contentStyleEntry[1] : null,
          lookup: contentStyleOptionLookup
        })
      );
    }

    return map;
  }

  private mergeMapWithFallback(
    primary: Map<number, string | null>,
    fallback: Map<number, string | null> | null
  ) {
    const merged = new Map(primary);

    if (!fallback) {
      return merged;
    }

    for (const [rowNumber, fallbackValue] of fallback.entries()) {
      const existing = this.normalizeTextOrNull(merged.get(rowNumber) ?? null);
      if (existing) {
        continue;
      }

      merged.set(rowNumber, this.normalizeTextOrNull(fallbackValue));
    }

    return merged;
  }

  private async getEngagementSourceLabels() {
    const setting = await this.prisma.globalComputedColumnSetting.findUnique({
      where: {
        key: ComputedColumnKey.engagement
      },
      select: {
        sourceLabelA: true,
        sourceLabelB: true
      }
    });

    return {
      sourceLabelA: setting?.sourceLabelA?.trim() || DEFAULT_ENGAGEMENT_SOURCE_LABEL_A,
      sourceLabelB: setting?.sourceLabelB?.trim() || DEFAULT_ENGAGEMENT_SOURCE_LABEL_B
    };
  }

  private async getRequiredSourceLabelsBySlot() {
    const displayLabelLookup =
      await this.columnConfigService.getPublishedImportColumnDisplayLabelLookup();

    return {
      top_views: this.columnConfigService.resolveImportColumnDisplayLabel(
        DEFAULT_REQUIRED_SOURCE_LABELS_BY_SLOT.top_views,
        displayLabelLookup
      ),
      top_engagement: this.columnConfigService.resolveImportColumnDisplayLabel(
        DEFAULT_REQUIRED_SOURCE_LABELS_BY_SLOT.top_engagement,
        displayLabelLookup
      ),
      top_reach: this.columnConfigService.resolveImportColumnDisplayLabel(
        DEFAULT_REQUIRED_SOURCE_LABELS_BY_SLOT.top_reach,
        displayLabelLookup
      )
    } satisfies Record<TopContentSlotKey, string>;
  }

  private async getHeaderCandidatesLookup() {
    const rules = await this.columnConfigService.getPublishedImportColumnHeaderRules();
    const lookup = new Map<string, string[]>();

    for (const rule of rules) {
      const candidates = Array.from(
        new Set(
          [rule.baselineHeader, rule.displayLabel, ...rule.aliases]
            .map((candidate) => (candidate ?? '').trim())
            .filter((candidate) => !!candidate)
        )
      );

      if (candidates.length === 0) {
        continue;
      }

      for (const candidate of candidates) {
        const key = this.normalizeMetricLabel(candidate);
        const existing = lookup.get(key) ?? [];
        lookup.set(key, Array.from(new Set([...existing, ...candidates])));
      }
    }

    return lookup;
  }

  private resolveHeaderCandidates(labels: string[], lookup: Map<string, string[]>) {
    return Array.from(
      new Set(
        labels.flatMap((label) => {
          const candidates = lookup.get(this.normalizeMetricLabel(label));
          return candidates && candidates.length > 0 ? candidates : [label];
        })
      )
    );
  }

  private toMetricLabel(metricKey: MappingTargetField) {
    return AVAILABLE_TARGETS_BY_KEY.get(metricKey)?.label ?? metricKey;
  }

  private toSelectionBasis(input: {
    rankPosition: number;
    slotMetricLabel: string;
    sourceType: 'csv' | 'manual';
    policyMode: TopContentDataSourcePolicyMode;
  }) {
    if (input.sourceType === 'manual') {
      return `Top ${input.rankPosition} by ${input.slotMetricLabel} (manual row included by policy: CSV + manual rows).`;
    }

    if (input.policyMode === 'csv_and_manual') {
      return `Top ${input.rankPosition} by ${input.slotMetricLabel} (CSV ranking with manual rows allowed by policy).`;
    }

    return `Top ${input.rankPosition} by ${input.slotMetricLabel} (CSV ranking; manual rows excluded by policy).`;
  }

  private normalizeTextOrNull(rawValue: string | null | undefined) {
    const normalized = String(rawValue ?? '').trim();
    return normalized || null;
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

  private toOptionValueKey(rawValue: string | null | undefined) {
    const normalized = String(rawValue ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || null;
  }

  private resolveContentStyleValueKey(input: {
    rawValues: Array<string | null | undefined>;
    explicitValue: string | null | undefined;
    lookup: ContentStyleOptionLookup;
  }) {
    const explicitCandidates = this.toContentStyleCandidates(input.explicitValue);
    for (const candidate of explicitCandidates) {
      const matched = this.matchContentStyleCandidate(candidate, input.lookup);
      if (matched) {
        return matched;
      }
    }
    // When the value is explicitly in the Content Style column but not present
    // in global option lookup, keep a normalized key so style coverage is still detected.
    const explicitFallbackValueKey = this.toOptionValueKey(input.explicitValue);
    if (explicitFallbackValueKey) {
      return explicitFallbackValueKey;
    }

    for (const rawValue of input.rawValues) {
      const candidates = this.toContentStyleCandidates(rawValue);
      for (const candidate of candidates) {
        const matched = this.matchContentStyleCandidate(candidate, input.lookup);
        if (matched) {
          return matched;
        }
      }
    }

    return null;
  }

  private toContentStyleCandidates(rawValue: string | null | undefined) {
    const normalized = String(rawValue ?? '').trim();
    if (!normalized) {
      return [];
    }

    const parts = normalized
      .split(/[\n,|/;]+/g)
      .map((value) => value.trim())
      .filter((value) => !!value);

    const candidates = [normalized, ...parts];
    return Array.from(new Set(candidates));
  }

  private matchContentStyleCandidate(
    candidate: string,
    lookup: ContentStyleOptionLookup
  ) {
    const normalizedLabel = candidate.toLowerCase().replace(/\s+/g, ' ').trim();
    const byLabel = lookup.valueKeyByNormalizedLabel.get(normalizedLabel) ?? null;
    if (byLabel) {
      return byLabel;
    }

    const normalizedValueKey = this.toOptionValueKey(candidate);
    if (normalizedValueKey && lookup.valueKeySet.has(normalizedValueKey)) {
      return normalizedValueKey;
    }

    return null;
  }

  private async getContentStyleOptionLookup(): Promise<ContentStyleOptionLookup> {
    const options = await this.prisma.globalCompanyFormatOption.findMany({
      where: {
        fieldKey: BrandDropdownFieldKey.content_style
      },
      select: {
        valueKey: true,
        label: true
      }
    });

    return {
      valueKeySet: new Set(options.map((option) => option.valueKey)),
      valueKeyByNormalizedLabel: new Map(
        options.map((option) => [
          option.label.toLowerCase().replace(/\s+/g, ' ').trim(),
          option.valueKey
        ])
      )
    };
  }

  private isContentStyleColumnLabel(rawLabel: string | null | undefined) {
    const normalized = String(rawLabel ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ');

    if (!normalized) {
      return false;
    }

    return (
      normalized.includes('content style') ||
      normalized.includes('custom label') ||
      normalized.includes('data comment')
    );
  }

  private isContentStyleExcluded(
    contentStyleValueKey: string,
    excludedContentStyleValueKeys: Set<string>
  ) {
    if (excludedContentStyleValueKeys.has(contentStyleValueKey)) {
      return true;
    }

    for (const excludedValueKey of excludedContentStyleValueKeys) {
      // Support nested style labels such as "give-away-call-to-engage"
      // when policy excludes "call-to-engage".
      if (
        contentStyleValueKey.startsWith(`${excludedValueKey}-`) ||
        contentStyleValueKey.endsWith(`-${excludedValueKey}`) ||
        contentStyleValueKey.includes(`-${excludedValueKey}-`)
      ) {
        return true;
      }
    }

    return false;
  }

  private parsePublishedAt(rawValue: string | null | undefined) {
    if (!rawValue) {
      return null;
    }

    const parsed = Date.parse(rawValue.trim());
    if (Number.isNaN(parsed)) {
      return null;
    }

    return parsed;
  }

  private normalizeMediaUrl(value: string | null | undefined) {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private isCurrentRankingMatch(
    existing: {
      datasetRowId: string;
      metricKey: MappingTargetField;
      headlineValue: number;
    },
    expected: {
      datasetRowId: string;
      metricKey: MappingTargetField;
      headlineValue: number;
    }
  ) {
    if (existing.datasetRowId !== expected.datasetRowId) {
      return false;
    }

    if (existing.metricKey !== expected.metricKey) {
      return false;
    }

    // Avoid false stale detection from floating-point storage/serialization drift.
    return Math.abs(existing.headlineValue - expected.headlineValue) < 1e-6;
  }

  private async filterUnreferencedTopContentScreenshotUrls(urls: string[]) {
    const candidates = Array.from(
      new Set(
        urls
          .map((url) => this.normalizeMediaUrl(url))
          .filter((url): url is string => !!url)
      )
    );
    if (candidates.length === 0) {
      return [];
    }

    const referencedRows = await this.prisma.topContentCard.findMany({
      where: {
        screenshotUrl: {
          not: null
        }
      },
      select: {
        screenshotUrl: true
      }
    });
    const referencedUrls = new Set(
      referencedRows
        .map((row) => this.normalizeMediaUrl(row.screenshotUrl))
        .filter((url): url is string => !!url)
    );

    return candidates.filter((url) => !referencedUrls.has(url));
  }

  private async deleteRemovedScreenshotUrls(urls: string[]) {
    const targets = Array.from(
      new Set(
        urls
          .map((url) => this.normalizeMediaUrl(url))
          .filter((url): url is string => !!url)
      )
    );

    for (const publicUrl of targets) {
      try {
        await this.mediaService.deleteObject({
          publicUrl
        });
      } catch (error) {
        this.logger.warn(
          `Failed to delete top-content screenshot (${publicUrl}): ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }
  }

  private assertHttpUrl(value: string, label: string) {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(value);
    } catch {
      throw new BadRequestException(`${label} must be a valid URL.`);
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new BadRequestException(`${label} must start with http:// or https://.`);
    }
  }
}
