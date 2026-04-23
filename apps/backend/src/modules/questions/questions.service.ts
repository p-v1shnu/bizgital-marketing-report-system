import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  QuestionStatus,
  ReportingPeriodState,
  ReportWorkflowState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BrandsService } from '../brands/brands.service';
import { MediaService } from '../media/media.service';
import type {
  QuestionCatalogResponse,
  QuestionOverviewResponse,
  QuestionSetupResponse,
  SaveQuestionEntryInput,
  SaveQuestionHighlightsInput,
  SaveQuestionMasterInput,
  UpdateQuestionMasterInput
} from './questions.types';

const BRAND_ASSIGNMENT_ANCHOR_DATE = new Date('2000-01-01T00:00:00.000Z');
const MAX_HIGHLIGHT_SCREENSHOTS = 10;
type QuestionMonthlyMode = 'has_questions' | 'no_questions';
type ResolvedQuestionAssignment = {
  id: string;
  questionMasterId: string;
  displayOrder: number;
  questionMaster: {
    id: string;
    questionText: string;
    status: QuestionStatus;
  };
};

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly brandsService: BrandsService,
    private readonly mediaService: MediaService
  ) {}

  async getGlobalCatalog(): Promise<QuestionCatalogResponse> {
    return this.buildGlobalCatalogResponse();
  }

  async getSetup(brandCode: string): Promise<QuestionSetupResponse> {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const [catalog, brandAssignments] = await Promise.all([
      this.prisma.questionMaster.findMany({
        orderBy: [{ status: 'asc' }, { questionText: 'asc' }]
      }),
      this.prisma.brandQuestionActivation.findMany({
        where: {
          brandId: brand.id
        },
        select: {
          id: true,
          questionMasterId: true,
          displayOrder: true,
          status: true,
          _count: {
            select: {
              questionEvidence: true
            }
          }
        },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }]
      })
    ]);

    const catalogById = new Map(catalog.map(item => [item.id, item]));
    const uniqueAssignments = this.deduplicateAssignments(brandAssignments);
    const activeAssignments = uniqueAssignments
      .map(item => {
        const questionMaster = catalogById.get(item.questionMasterId) ?? null;
        if (
          item.status !== QuestionStatus.active ||
          !questionMaster ||
          questionMaster.status !== QuestionStatus.active
        ) {
          return null;
        }

        return {
          ...item,
          questionMaster
        };
      })
      .filter(
        (
          item
        ): item is (typeof uniqueAssignments)[number] & { questionMaster: (typeof catalog)[number] } =>
          item !== null
      );
    const approvedUsedActivationIds = await this.findApprovedUsedAssignmentIds(
      activeAssignments.map(item => item.id)
    );
    const assignedQuestionIds = new Set(activeAssignments.map(item => item.questionMasterId));

    const assignmentCounts = await this.prisma.brandQuestionActivation.groupBy({
      by: ['questionMasterId'],
      _count: {
        questionMasterId: true
      }
    });
    const assignedBrandCountByQuestionId = new Map(
      assignmentCounts.map(item => [item.questionMasterId, item._count.questionMasterId])
    );

    const fullCatalog = catalog.map(item => ({
      id: item.id,
      text: item.questionText,
      status: item.status,
      usage: {
        assignedBrandCount: assignedBrandCountByQuestionId.get(item.id) ?? 0
      }
    }));
    const availableCatalog = fullCatalog.filter(
      item => item.status === QuestionStatus.active && !assignedQuestionIds.has(item.id)
    );

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name
      },
      summary: {
        assignedCount: activeAssignments.length,
        activeCatalogCount: fullCatalog.filter(item => item.status === QuestionStatus.active).length
      },
      assignments: activeAssignments.map(item => ({
        id: item.id,
        displayOrder: item.displayOrder,
        status: item.status,
        canRemove: !approvedUsedActivationIds.has(item.id),
        removeBlockedReason: approvedUsedActivationIds.has(item.id)
          ? 'Cannot remove because this category is already used in an approved report.'
          : null,
        question: {
          id: item.questionMaster.id,
          text: item.questionMaster.questionText,
          status: item.questionMaster.status
        },
        usage: {
          hasEvidence: item._count.questionEvidence > 0,
          hasApprovedEvidence: approvedUsedActivationIds.has(item.id)
        }
      })),
      availableCatalog,
      fullCatalog
    };
  }

  async createMaster(brandCode: string, input: SaveQuestionMasterInput) {
    await this.brandsService.getBrandByCodeOrThrow(brandCode);

    const questionText = this.normalizeRequiredText(input.questionText, 'Question name');

    await this.prisma.questionMaster.create({
      data: {
        questionText,
        status: input.status ?? QuestionStatus.active
      }
    });

    return this.getSetup(brandCode);
  }

  async createGlobalMaster(input: SaveQuestionMasterInput): Promise<QuestionCatalogResponse> {
    const questionText = this.normalizeRequiredText(input.questionText, 'Question name');

    await this.prisma.questionMaster.create({
      data: {
        questionText,
        status: input.status ?? QuestionStatus.active
      }
    });

    return this.buildGlobalCatalogResponse();
  }

  async updateMaster(
    brandCode: string,
    questionId: string,
    input: UpdateQuestionMasterInput
  ) {
    await this.brandsService.getBrandByCodeOrThrow(brandCode);

    const existing = await this.prisma.questionMaster.findUnique({
      where: {
        id: questionId
      }
    });

    if (!existing) {
      throw new NotFoundException('Question category was not found.');
    }

    const data: {
      questionText?: string;
      status?: QuestionStatus;
    } = {};

    if (input.questionText !== undefined) {
      data.questionText = this.normalizeRequiredText(input.questionText, 'Question name');
    }

    if (input.status !== undefined) {
      data.status = input.status;
    }

    await this.prisma.questionMaster.update({
      where: {
        id: questionId
      },
      data
    });

    return this.getSetup(brandCode);
  }

  async updateGlobalMaster(
    questionId: string,
    input: UpdateQuestionMasterInput
  ): Promise<QuestionCatalogResponse> {
    const existing = await this.prisma.questionMaster.findUnique({
      where: {
        id: questionId
      }
    });

    if (!existing) {
      throw new NotFoundException('Question category was not found.');
    }

    const data: {
      questionText?: string;
      status?: QuestionStatus;
    } = {};

    if (input.questionText !== undefined) {
      data.questionText = this.normalizeRequiredText(input.questionText, 'Question name');
    }

    if (input.status !== undefined) {
      data.status = input.status;
    }

    await this.prisma.questionMaster.update({
      where: {
        id: questionId
      },
      data
    });

    return this.buildGlobalCatalogResponse();
  }

  async deleteGlobalMaster(questionId: string): Promise<QuestionCatalogResponse> {
    const existing = await this.prisma.questionMaster.findUnique({
      where: {
        id: questionId
      }
    });

    if (!existing) {
      throw new NotFoundException('Question category was not found.');
    }

    const assignedBrandCount = await this.prisma.brandQuestionActivation.count({
      where: {
        questionMasterId: questionId
      }
    });
    if (assignedBrandCount > 0) {
      throw new ConflictException(
        'Cannot delete because this category is assigned to one or more brands.'
      );
    }

    const approvedUsedQuestionIds = await this.findApprovedUsedQuestionIds([questionId]);
    if (approvedUsedQuestionIds.has(questionId)) {
      throw new ConflictException(
        'Cannot delete because this category is already used in an approved report.'
      );
    }

    await this.prisma.$transaction(async tx => {
      await tx.questionMaster.delete({
        where: {
          id: questionId
        }
      });

      // Keep approved snapshots immutable; remove only stale snapshots on non-approved periods.
      await tx.reportingPeriodQuestionAssignment.deleteMany({
        where: {
          questionMasterId: questionId,
          reportingPeriod: {
            currentState: {
              not: ReportingPeriodState.approved
            }
          }
        }
      });
    });

    return this.buildGlobalCatalogResponse();
  }

  async saveAssignments(brandCode: string, questionIds: string[]) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const normalizedQuestionIds = Array.from(
      new Set(questionIds.map(item => item.trim()).filter(item => item.length > 0))
    );
    const selectedQuestionIds = new Set(normalizedQuestionIds);
    const questionMasters =
      normalizedQuestionIds.length === 0
        ? []
        : await this.prisma.questionMaster.findMany({
            where: {
              id: {
                in: normalizedQuestionIds
              }
            }
          });

    if (questionMasters.length !== normalizedQuestionIds.length) {
      throw new BadRequestException('One or more question categories were not found.');
    }

    const hasInactiveMaster = questionMasters.some(
      item => item.status !== QuestionStatus.active
    );
    if (hasInactiveMaster) {
      throw new BadRequestException('Only active question categories can be assigned.');
    }

    const allAssignments = await this.prisma.brandQuestionActivation.findMany({
      where: {
        brandId: brand.id
      },
      orderBy: [{ createdAt: 'asc' }]
    });
    const byQuestionId = new Map(allAssignments.map(item => [item.questionMasterId, item]));
    const activeAssignments = allAssignments.filter(item => item.status === QuestionStatus.active);
    const assignmentsToDeactivate = activeAssignments.filter(
      item => !selectedQuestionIds.has(item.questionMasterId)
    );
    const approvedUsedActivationIds = await this.findApprovedUsedAssignmentIds(
      assignmentsToDeactivate.map(item => item.id)
    );
    const blockedRemovals = assignmentsToDeactivate.filter(item =>
      approvedUsedActivationIds.has(item.id)
    );
    if (blockedRemovals.length > 0) {
      const blockedQuestionIds = Array.from(
        new Set(blockedRemovals.map(item => item.questionMasterId))
      );
      const blockedMasters =
        blockedQuestionIds.length > 0
          ? await this.prisma.questionMaster.findMany({
              where: {
                id: {
                  in: blockedQuestionIds
                }
              },
              select: {
                id: true,
                questionText: true
              }
            })
          : [];
      const blockedLabelByQuestionId = new Map(
        blockedMasters.map(item => [item.id, item.questionText])
      );
      const blockedLabels = blockedRemovals
        .map(item => (blockedLabelByQuestionId.get(item.questionMasterId) ?? '').trim())
        .filter(item => item.length > 0)
        .slice(0, 3)
        .join(', ');
      throw new ConflictException(
        blockedLabels.length > 0
          ? `Cannot remove assigned category already used in approved reports: ${blockedLabels}.`
          : 'Cannot remove assigned category already used in approved reports.'
      );
    }
    const removableActivationIds = assignmentsToDeactivate.map(item => item.id);
    const deactivatedAt = new Date();

    await this.prisma.$transaction(async tx => {
      for (const [index, questionId] of normalizedQuestionIds.entries()) {
        const existing = byQuestionId.get(questionId);

        if (existing) {
          await tx.brandQuestionActivation.update({
            where: {
              id: existing.id
            },
            data: {
              status: QuestionStatus.active,
              activeToDate: null,
              displayOrder: index + 1
            }
          });
          continue;
        }

        await tx.brandQuestionActivation.create({
          data: {
            brandId: brand.id,
            questionMasterId: questionId,
            status: QuestionStatus.active,
            displayOrder: index + 1,
            activeFromDate: BRAND_ASSIGNMENT_ANCHOR_DATE,
            activeToDate: null
          }
        });
      }

      if (removableActivationIds.length > 0) {
        await tx.brandQuestionActivation.updateMany({
          where: {
            id: {
              in: removableActivationIds
            }
          },
          data: {
            status: QuestionStatus.inactive,
            activeToDate: deactivatedAt
          }
        });
      }
    });

    return this.getSetup(brandCode);
  }

  async getOverview(
    brandCode: string,
    periodId: string
  ): Promise<QuestionOverviewResponse> {
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

    const baseResponse: Omit<QuestionOverviewResponse, 'readiness' | 'items' | 'highlights'> = {
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
          detail: 'Create a reporting version before monthly question monitoring can begin.',
          requiredQuestionCount: 0,
          completedQuestionCount: 0
        },
        highlights: {
          note: null,
          screenshots: []
        },
        items: []
      };
    }

    const activeAssignments = await this.getActiveAssignmentsForPeriod(brand.id, period.id);

    if (activeAssignments.length === 0) {
      return {
        ...baseResponse,
        readiness: {
          state: 'blocked',
          detail: 'No active question categories are assigned to this brand yet.',
          requiredQuestionCount: 0,
          completedQuestionCount: 0
        },
        highlights: {
          note: this.normalizeOptionalText(targetVersion.questionHighlightNote),
          screenshots: await this.loadHighlightScreenshotsByReportVersionId(targetVersion.id)
        },
        items: []
      };
    }

    const entries = await this.prisma.questionEvidence.findMany({
      where: {
        reportVersionId: targetVersion.id,
        brandQuestionActivationId: {
          in: activeAssignments.map(item => item.id)
        }
      },
      select: {
        id: true,
        reportVersionId: true,
        brandQuestionActivationId: true,
        title: true,
        responseNote: true,
        postUrl: true,
        displayOrder: true
      }
    });
    const entryIds = entries.map(item => item.id);
    const modeByEvidenceId = await this.loadModeByEvidenceId(entryIds);
    const screenshotsByEvidenceId = await this.loadScreenshotsByEvidenceId(entryIds);
    const highlights = {
      note: this.normalizeOptionalText(targetVersion.questionHighlightNote),
      screenshots: await this.loadHighlightScreenshotsByReportVersionId(targetVersion.id)
    };

    const items: QuestionOverviewResponse['items'] = activeAssignments.map(assignment => {
      const entry =
        entries.find(item => item.brandQuestionActivationId === assignment.id) ?? null;
      const screenshots = entry ? screenshotsByEvidenceId.get(entry.id) ?? [] : [];
      const mode = this.resolveMode(entry ? modeByEvidenceId.get(entry.id)?.mode ?? null : null);
      const questionCount = this.resolveQuestionCount(
        entry,
        entry ? modeByEvidenceId.get(entry.id)?.questionCount ?? null : null
      );
      const note = this.normalizeOptionalText(entry?.responseNote ?? null);
      const isComplete = this.isEntryComplete({
        mode,
        questionCount,
        note,
        screenshotCount: screenshots.length
      });

      return {
        activation: {
          id: assignment.id,
          displayOrder: assignment.displayOrder
        },
        question: {
          id: assignment.questionMaster.id,
          text: assignment.questionMaster.questionText,
          status: assignment.questionMaster.status
        },
        entry: {
          id: entry?.id ?? null,
          mode,
          questionCount,
          note,
          screenshots,
          isComplete
        }
      };
    });

    const completedQuestionCount = items.filter(item => item.entry.isComplete).length;
    const highlightScreenshotCount = highlights.screenshots.length;
    const hasHighlightScreenshot = highlightScreenshotCount >= 1;
    const hasCompleteCounts = completedQuestionCount === activeAssignments.length;
    const isReady = hasCompleteCounts && hasHighlightScreenshot;

    return {
      ...baseResponse,
      readiness: {
        state: isReady ? 'ready' : 'pending',
        detail: !hasCompleteCounts
          ? 'Complete question count for each active category before submit.'
          : !hasHighlightScreenshot
            ? 'Add at least 1 highlight screenshot before submit.'
            : 'Every active question category has complete monthly monitoring.',
        requiredQuestionCount: activeAssignments.length,
        completedQuestionCount
      },
      highlights,
      items
    };
  }

  async saveEntry(
    brandCode: string,
    periodId: string,
    activationId: string,
    input: SaveQuestionEntryInput
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
      throw new ConflictException('Create or resume a draft before editing question monitoring.');
    }

    const activeAssignments = await this.getActiveAssignmentsForPeriod(brand.id, period.id);
    const activation = activeAssignments.find(item => item.id === activationId) ?? null;

    if (!activation) {
      throw new NotFoundException('Question category is not active for this brand.');
    }

    const normalized = this.normalizeEntryInput(input);
    await this.mediaService.assertManagedPublicUrlsExist(
      normalized.screenshots ?? [],
      'Question evidence screenshot'
    );

    const existing = await this.prisma.questionEvidence.findUnique({
      where: {
        question_evidence_version_activation_unique: {
          reportVersionId: currentDraft.id,
          brandQuestionActivationId: activationId
        }
      },
      select: {
        id: true,
        displayOrder: true
      }
    });

    const nextDisplayOrder =
      (await this.prisma.questionEvidence.count({
        where: {
          reportVersionId: currentDraft.id
        }
      })) + 1;

    const legacyTitle =
      normalized.mode === 'no_questions'
        ? 'No questions this month'
        : `Count: ${normalized.questionCount}`;
    const legacyNote =
      normalized.note ??
      (normalized.mode === 'no_questions' ? 'No questions this month.' : '');

    let evidence: { id: string };
    try {
      evidence = await this.prisma.questionEvidence.upsert({
        where: {
          question_evidence_version_activation_unique: {
            reportVersionId: currentDraft.id,
            brandQuestionActivationId: activationId
          }
        },
        update: {
          title: legacyTitle,
          responseNote: legacyNote,
          postUrl: null
        },
        create: {
          reportVersionId: currentDraft.id,
          brandQuestionActivationId: activationId,
          title: legacyTitle,
          responseNote: legacyNote,
          postUrl: null,
          displayOrder: existing?.displayOrder ?? nextDisplayOrder
        },
        select: {
          id: true
        }
      });
    } catch (error) {
      if (this.isQuestionSchemaOutdatedError(error)) {
        throw new BadRequestException(
          'Question monitoring schema is outdated. Apply latest question migration first.'
        );
      }

      throw error;
    }
    const existingScreenshotUrls =
      normalized.screenshots !== null
        ? await this.loadScreenshotUrlsForEvidence(evidence.id)
        : [];

    try {
      await this.prisma.$executeRawUnsafe(
        'UPDATE question_evidence SET mode = ?, question_count = ? WHERE id = ?',
        normalized.mode,
        normalized.questionCount,
        evidence.id
      );
      if (normalized.screenshots !== null) {
        await this.prisma.$executeRawUnsafe(
          'DELETE FROM question_evidence_screenshots WHERE question_evidence_id = ?',
          evidence.id
        );

        for (const [index, screenshotUrl] of normalized.screenshots.entries()) {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO question_evidence_screenshots (id, question_evidence_id, display_order, screenshot_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(3), NOW(3))`,
            this.generateId(),
            evidence.id,
            index + 1,
            screenshotUrl
          );
        }
      }
    } catch (error) {
      if (this.isQuestionSchemaOutdatedError(error)) {
        throw new BadRequestException(
          'Question monitoring schema is outdated. Apply latest question migration first.'
        );
      }

      throw new BadRequestException(
        'Question screenshot table is missing. Apply latest question migration first.'
      );
    }
    if (normalized.screenshots !== null) {
      const nextScreenshotSet = new Set(
        normalized.screenshots
          .map((item) => this.normalizeMediaUrl(item))
          .filter((item): item is string => !!item)
      );
      const removedScreenshotUrls = existingScreenshotUrls.filter(
        (url) => !nextScreenshotSet.has(url)
      );
      await this.deleteRemovedScreenshotUrls(removedScreenshotUrls);
    }

    return {
      id: evidence.id,
      updated: true
    };
  }

  async saveHighlights(
    brandCode: string,
    periodId: string,
    input: SaveQuestionHighlightsInput
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
        'Create or resume a draft before editing question highlights.'
      );
    }

    const normalized = this.normalizeHighlightsInput(input);
    await this.mediaService.assertManagedPublicUrlsExist(
      normalized.screenshots,
      'Question highlight screenshot'
    );
    const existingScreenshotUrls = await this.loadHighlightScreenshotUrlsForReportVersion(
      currentDraft.id
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.reportVersion.update({
        where: {
          id: currentDraft.id
        },
        data: {
          questionHighlightNote: normalized.note
        }
      });

      await tx.questionHighlightScreenshot.deleteMany({
        where: {
          reportVersionId: currentDraft.id
        }
      });

      if (normalized.screenshots.length > 0) {
        await tx.questionHighlightScreenshot.createMany({
          data: normalized.screenshots.map((screenshotUrl, index) => ({
            reportVersionId: currentDraft.id,
            displayOrder: index + 1,
            screenshotUrl
          }))
        });
      }
    });

    const nextScreenshotSet = new Set(
      normalized.screenshots
        .map((item) => this.normalizeMediaUrl(item))
        .filter((item): item is string => !!item)
    );
    const removedScreenshotUrls = existingScreenshotUrls.filter(
      (url) => !nextScreenshotSet.has(url)
    );
    await this.deleteRemovedScreenshotUrls(removedScreenshotUrls);

    await this.auditLogService.append({
      actionKey: 'CONTENT_QUESTION_HIGHLIGHTS_UPDATED',
      entityType: 'CONTENT',
      entityId: currentDraft.id,
      entityLabel: `${period.year}-${String(period.month).padStart(2, '0')} highlights`,
      summary: `Updated question highlights for ${period.year}-${String(period.month).padStart(2, '0')}.`,
      metadata: {
        reportVersionId: currentDraft.id,
        screenshotCount: normalized.screenshots.length
      },
      actor: {
        actorName: input.actorName,
        actorEmail: input.actorEmail
      }
    });

    return {
      updated: true
    };
  }

  async getReadinessForReportVersion(reportVersionId: string) {
    const version = await this.prisma.reportVersion.findUnique({
      where: {
        id: reportVersionId
      },
      include: {
        reportingPeriod: true
      }
    });

    if (!version) {
      throw new NotFoundException('Report version not found.');
    }

    const activeAssignments = await this.getActiveAssignmentsForPeriod(
      version.reportingPeriod.brandId,
      version.reportingPeriod.id
    );

    if (activeAssignments.length === 0) {
      return {
        isComplete: false,
        detail: 'No active question categories are configured for this brand.',
        requiredQuestionCount: 0,
        completedQuestionCount: 0
      };
    }

    const entries = await this.prisma.questionEvidence.findMany({
      where: {
        reportVersionId,
        brandQuestionActivationId: {
          in: activeAssignments.map(item => item.id)
        }
      },
      select: {
        id: true,
        reportVersionId: true,
        brandQuestionActivationId: true,
        title: true,
        responseNote: true,
        postUrl: true,
        displayOrder: true
      }
    });
    const entryIds = entries.map(item => item.id);
    const modeByEvidenceId = await this.loadModeByEvidenceId(entryIds);
    const screenshotsByEvidenceId = await this.loadScreenshotsByEvidenceId(entryIds);

    const completedQuestionCount = entries.filter(entry => {
      const mode = this.resolveMode(modeByEvidenceId.get(entry.id)?.mode ?? null);
      const questionCount = this.resolveQuestionCount(
        entry,
        modeByEvidenceId.get(entry.id)?.questionCount ?? null
      );
      const note = this.normalizeOptionalText(entry.responseNote);
      const screenshotCount = (screenshotsByEvidenceId.get(entry.id) ?? []).length;

      return this.isEntryComplete({
        mode,
        questionCount,
        note,
        screenshotCount
      });
    }).length;
    const highlightScreenshotCount = await this.prisma.questionHighlightScreenshot.count({
      where: {
        reportVersionId
      }
    });
    const hasHighlightScreenshot = highlightScreenshotCount >= 1;
    const hasCompleteCounts = completedQuestionCount === activeAssignments.length;

    return {
      isComplete: hasCompleteCounts && hasHighlightScreenshot,
      detail: !hasCompleteCounts
        ? `${completedQuestionCount}/${activeAssignments.length} question categories are complete this month.`
        : !hasHighlightScreenshot
          ? 'Add at least 1 highlight screenshot before submit.'
          : 'Every active question category has complete monthly monitoring.',
      requiredQuestionCount: activeAssignments.length,
      completedQuestionCount
    };
  }

  private async getActiveAssignmentsForPeriod(brandId: string, periodId: string) {
    const period = await this.prisma.reportingPeriod.findUnique({
      where: {
        id: periodId
      },
      select: {
        currentState: true
      }
    });

    // Question assignments stay live until the period is approved.
    if (!period || period.currentState !== ReportingPeriodState.approved) {
      return this.getActiveAssignmentsForBrand(brandId);
    }

    const snapshotCaptureState = await this.getQuestionSnapshotCaptureState(periodId);
    const snapshottedAssignments = await this.loadSnapshottedAssignmentsForPeriod(periodId);

    if (
      snapshotCaptureState === 'captured' ||
      (snapshotCaptureState === 'unknown' && snapshottedAssignments.length > 0)
    ) {
      return snapshottedAssignments;
    }

    return this.getActiveAssignmentsForBrand(brandId);
  }

  private async getActiveAssignmentsForBrand(brandId: string): Promise<ResolvedQuestionAssignment[]> {
    const assignments = await this.prisma.brandQuestionActivation.findMany({
      where: {
        brandId,
        status: QuestionStatus.active
      },
      select: {
        id: true,
        questionMasterId: true,
        displayOrder: true
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }]
    });

    const questionMasterIds = Array.from(
      new Set(assignments.map(item => item.questionMasterId))
    );
    const questionMasters =
      questionMasterIds.length > 0
        ? await this.prisma.questionMaster.findMany({
            where: {
              id: {
                in: questionMasterIds
              },
              status: QuestionStatus.active
            },
            select: {
              id: true,
              questionText: true,
              status: true
            }
          })
        : [];
    const questionMasterById = new Map(questionMasters.map(item => [item.id, item]));

    const resolvedAssignments: ResolvedQuestionAssignment[] = assignments
      .map(item => {
        const questionMaster = questionMasterById.get(item.questionMasterId) ?? null;
        if (!questionMaster) {
          return null;
        }

        return {
          id: item.id,
          questionMasterId: item.questionMasterId,
          displayOrder: item.displayOrder,
          questionMaster: {
            id: questionMaster.id,
            questionText: questionMaster.questionText,
            status: questionMaster.status
          }
        } satisfies ResolvedQuestionAssignment;
      })
      .filter((item): item is ResolvedQuestionAssignment => item !== null);

    return this.deduplicateAssignments(resolvedAssignments);
  }

  private async getQuestionSnapshotCaptureState(periodId: string) {
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ question_snapshot_captured_at: Date | string | null }>
      >(
        'SELECT question_snapshot_captured_at FROM reporting_periods WHERE id = ? LIMIT 1',
        periodId
      );

      return rows[0]?.question_snapshot_captured_at ? 'captured' : 'not_captured';
    } catch {
      return 'unknown' as const;
    }
  }

  private async loadSnapshottedAssignmentsForPeriod(periodId: string): Promise<ResolvedQuestionAssignment[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          brand_question_activation_id: string;
          question_master_id: string;
          question_text_snapshot: string;
          display_order: number;
        }>
      >(
        `SELECT
           brand_question_activation_id,
           question_master_id,
           question_text_snapshot,
           display_order
         FROM reporting_period_question_assignments
         WHERE reporting_period_id = ?
         ORDER BY display_order ASC, created_at ASC`,
        periodId
      );

      return rows.map((row) => ({
        id: row.brand_question_activation_id,
        questionMasterId: row.question_master_id,
        displayOrder: Number(row.display_order ?? 0),
        questionMaster: {
          id: row.question_master_id,
          questionText: row.question_text_snapshot,
          status: QuestionStatus.active
        }
      }));
    } catch {
      return [];
    }
  }

  private async loadModeByEvidenceId(evidenceIds: string[]) {
    const map = new Map<string, { mode: QuestionMonthlyMode | null; questionCount: number | null }>();

    if (evidenceIds.length === 0) {
      return map;
    }

    try {
      const placeholders = evidenceIds.map(() => '?').join(', ');
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ id: string; mode: string | null; question_count: number | null }>
      >(
        `SELECT id, mode, question_count
         FROM question_evidence
         WHERE id IN (${placeholders})`,
        ...evidenceIds
      );

      for (const row of rows) {
        map.set(row.id, {
          mode: this.resolveMode(row.mode),
          questionCount: row.question_count ?? null
        });
      }
    } catch {
      return map;
    }

    return map;
  }

  private async loadScreenshotsByEvidenceId(evidenceIds: string[]) {
    const map = new Map<
      string,
      Array<{
        id: string;
        displayOrder: number;
        screenshotUrl: string;
      }>
    >();

    if (evidenceIds.length === 0) {
      return map;
    }

    try {
      const placeholders = evidenceIds.map(() => '?').join(', ');
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          question_evidence_id: string;
          display_order: number;
          screenshot_url: string;
        }>
      >(
        `SELECT id, question_evidence_id, display_order, screenshot_url
         FROM question_evidence_screenshots
         WHERE question_evidence_id IN (${placeholders})
         ORDER BY question_evidence_id ASC, display_order ASC`,
        ...evidenceIds
      );

      for (const row of rows) {
        const current = map.get(row.question_evidence_id) ?? [];
        current.push({
          id: row.id,
          displayOrder: row.display_order,
          screenshotUrl: row.screenshot_url
        });
        map.set(row.question_evidence_id, current);
      }
    } catch {
      return map;
    }

    return map;
  }

  private async loadHighlightScreenshotsByReportVersionId(reportVersionId: string) {
    if (!reportVersionId) {
      return [];
    }

    const rows = await this.prisma.questionHighlightScreenshot.findMany({
      where: {
        reportVersionId
      },
      orderBy: {
        displayOrder: 'asc'
      },
      select: {
        id: true,
        displayOrder: true,
        screenshotUrl: true
      }
    });

    return rows;
  }

  private async findApprovedUsedAssignmentIds(assignmentIds: string[]) {
    if (assignmentIds.length === 0) {
      return new Set<string>();
    }

    const rows = await this.prisma.questionEvidence.findMany({
      where: {
        brandQuestionActivationId: {
          in: assignmentIds
        },
        reportVersion: {
          workflowState: ReportWorkflowState.approved
        }
      },
      select: {
        brandQuestionActivationId: true
      },
      distinct: ['brandQuestionActivationId']
    });

    return new Set(rows.map(item => item.brandQuestionActivationId));
  }

  private async findApprovedUsedQuestionIds(questionIds: string[]) {
    if (questionIds.length === 0) {
      return new Set<string>();
    }

    const [approvedEvidenceRows, approvedSnapshotRows] = await Promise.all([
      this.prisma.brandQuestionActivation.findMany({
        where: {
          questionMasterId: {
            in: questionIds
          },
          questionEvidence: {
            some: {
              reportVersion: {
                workflowState: ReportWorkflowState.approved
              }
            }
          }
        },
        select: {
          questionMasterId: true
        },
        distinct: ['questionMasterId']
      }),
      this.prisma.reportingPeriodQuestionAssignment.findMany({
        where: {
          questionMasterId: {
            in: questionIds
          },
          reportingPeriod: {
            currentState: ReportingPeriodState.approved
          }
        },
        select: {
          questionMasterId: true
        },
        distinct: ['questionMasterId']
      })
    ]);

    return new Set([
      ...approvedEvidenceRows.map(item => item.questionMasterId),
      ...approvedSnapshotRows.map(item => item.questionMasterId)
    ]);
  }

  private async loadScreenshotUrlsForEvidence(evidenceId: string) {
    if (!evidenceId) {
      return [];
    }

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ screenshot_url: string }>>(
        `SELECT screenshot_url
         FROM question_evidence_screenshots
         WHERE question_evidence_id = ?`,
        evidenceId
      );

      return rows
        .map((row) => this.normalizeMediaUrl(row.screenshot_url))
        .filter((url): url is string => !!url);
    } catch {
      return [];
    }
  }

  private async loadHighlightScreenshotUrlsForReportVersion(reportVersionId: string) {
    if (!reportVersionId) {
      return [];
    }

    const rows = await this.prisma.questionHighlightScreenshot.findMany({
      where: {
        reportVersionId
      },
      select: {
        screenshotUrl: true
      }
    });

    return rows
      .map((row) => this.normalizeMediaUrl(row.screenshotUrl))
      .filter((url): url is string => !!url);
  }

  private deduplicateAssignments<
    T extends {
      questionMasterId: string;
    }
  >(assignments: T[]) {
    const seen = new Set<string>();
    const result: T[] = [];

    for (const assignment of assignments) {
      if (seen.has(assignment.questionMasterId)) {
        continue;
      }
      seen.add(assignment.questionMasterId);
      result.push(assignment);
    }

    return result;
  }

  private resolveMode(mode: string | null | undefined): QuestionMonthlyMode {
    return mode === 'no_questions' ? 'no_questions' : 'has_questions';
  }

  private resolveQuestionCount(
    entry: { title: string | null } | null,
    questionCount: number | null
  ) {
    if (questionCount !== null && Number.isInteger(questionCount) && questionCount >= 0) {
      return questionCount;
    }

    if (!entry?.title?.trim()) {
      return 0;
    }

    const fromLegacy = Number(entry.title.replace(/[^\d]/g, ''));
    if (Number.isInteger(fromLegacy) && fromLegacy >= 0) {
      return fromLegacy;
    }

    return 1;
  }

  private isEntryComplete(input: {
    mode: QuestionMonthlyMode;
    questionCount: number;
    note: string | null;
    screenshotCount: number;
  }) {
    if (input.mode === 'no_questions') {
      return input.questionCount === 0;
    }

    return input.questionCount >= 1;
  }

  private normalizeEntryInput(input: SaveQuestionEntryInput) {
    const mode = this.resolveMode(input.mode ?? null);
    const rawCount = input.questionCount;
    const note = this.normalizeOptionalText(input.note);
    const hasScreenshotsInput = Array.isArray(input.screenshots);
    const screenshots = hasScreenshotsInput
      ? (input.screenshots ?? [])
          .map(item => item.trim())
          .filter(item => item.length > 0)
      : null;
    if (screenshots) {
      for (const screenshotUrl of screenshots) {
        this.assertHttpUrl(screenshotUrl, 'Question evidence screenshot URL');
      }
    }

    if (mode === 'no_questions') {
      return {
        mode,
        questionCount: 0,
        note,
        screenshots
      };
    }

    if (!Number.isInteger(rawCount) || (rawCount ?? 0) < 0) {
      throw new BadRequestException(
        'Question count must be a whole number greater than or equal to 0.'
      );
    }

    if (screenshots && screenshots.length > 5) {
      throw new BadRequestException(
        'Evidence screenshots must include at most 5 images.'
      );
    }

    return {
      mode,
      questionCount: rawCount,
      note,
      screenshots
    };
  }

  private normalizeHighlightsInput(input: SaveQuestionHighlightsInput) {
    const note = this.normalizeOptionalText(input.note);
    const screenshots = (input.screenshots ?? [])
      .map(item => item.trim())
      .filter(item => item.length > 0);
    for (const screenshotUrl of screenshots) {
      this.assertHttpUrl(screenshotUrl, 'Question highlight screenshot URL');
    }

    if (screenshots.length > MAX_HIGHLIGHT_SCREENSHOTS) {
      throw new BadRequestException(
        `Highlight screenshots must include at most ${MAX_HIGHLIGHT_SCREENSHOTS} images.`
      );
    }

    return {
      note,
      screenshots
    };
  }

  private normalizeRequiredText(value: string | null | undefined, label: string) {
    const normalized = value?.trim() ?? '';

    if (!normalized) {
      throw new BadRequestException(`${label} is required.`);
    }

    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeMediaUrl(value: string | null | undefined) {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
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
          `Failed to delete question screenshot (${publicUrl}): ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }
  }

  private isQuestionSchemaOutdatedError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2022' && error.code !== 'P2010') {
      return false;
    }

    const message = error.message.toLowerCase();
    const missingColumn =
      typeof error.meta?.column === 'string' ? error.meta.column.toLowerCase() : '';

    return (
      missingColumn === 'mode' ||
      missingColumn === 'question_count' ||
      missingColumn.includes('question_evidence.mode') ||
      missingColumn.includes('question_evidence.question_count') ||
      message.includes('question_evidence.mode') ||
      message.includes('question_evidence.question_count') ||
      message.includes('question_evidence_screenshots')
    );
  }

  private generateId() {
    return `qs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private async buildGlobalCatalogResponse(): Promise<QuestionCatalogResponse> {
    const [catalog, assignmentCounts] = await Promise.all([
      this.prisma.questionMaster.findMany({
        orderBy: [{ status: 'asc' }, { questionText: 'asc' }]
      }),
      this.prisma.brandQuestionActivation.groupBy({
        by: ['questionMasterId'],
        _count: {
          questionMasterId: true
        }
      })
    ]);

    const assignedBrandCountByQuestionId = new Map(
      assignmentCounts.map(item => [item.questionMasterId, item._count.questionMasterId])
    );
    const approvedUsedQuestionIds = await this.findApprovedUsedQuestionIds(
      catalog.map(item => item.id)
    );

    return {
      summary: {
        totalCount: catalog.length,
        activeCount: catalog.filter(item => item.status === QuestionStatus.active).length,
        inactiveCount: catalog.filter(item => item.status === QuestionStatus.inactive).length
      },
      items: catalog.map(item => {
        const assignedBrandCount = assignedBrandCountByQuestionId.get(item.id) ?? 0;
        const hasBrandUsage = assignedBrandCount > 0;
        const hasApprovedUsage = approvedUsedQuestionIds.has(item.id);

        return {
          id: item.id,
          text: item.questionText,
          status: item.status,
          canDelete: !hasBrandUsage && !hasApprovedUsage,
          removeBlockedReason: hasBrandUsage
            ? 'Cannot delete because this category is assigned to one or more brands.'
            : hasApprovedUsage
              ? 'Cannot delete because this category is already used in an approved report.'
              : null,
          usage: {
            assignedBrandCount,
            hasApprovedUsage
          }
        };
      })
    };
  }
}
