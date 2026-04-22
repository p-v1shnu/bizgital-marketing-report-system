import { PrismaClient, ReportCadence, ReportWorkflowState, ReportingPeriodState } from '@prisma/client';

const prisma = new PrismaClient();

const SOURCE_MONTH = 4;
const TARGET_MONTH = 3;
const TARGET_YEAR = 2026;

async function main() {
  const brand = await prisma.brand.findUnique({
    where: { code: 'demo-brand' }
  });

  if (!brand) {
    throw new Error('demo-brand was not found. Seed the demo brand first.');
  }

  const sourcePeriod = await prisma.reportingPeriod.findUnique({
    where: {
      reporting_period_brand_year_month_unique: {
        brandId: brand.id,
        cadence: ReportCadence.monthly,
        year: TARGET_YEAR,
        month: SOURCE_MONTH
      }
    },
    include: {
      reportVersions: {
        where: {
          workflowState: {
            in: [
              ReportWorkflowState.draft,
              ReportWorkflowState.submitted,
              ReportWorkflowState.approved
            ]
          }
        },
        orderBy: {
          versionNo: 'desc'
        },
        take: 1,
        include: {
          importJobs: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1,
            include: {
              columnProfiles: {
                orderBy: {
                  sourcePosition: 'asc'
                }
              },
              sourceColumnMappings: true,
              datasetRows: {
                orderBy: {
                  sourceRowNumber: 'asc'
                },
                include: {
                  cells: {
                    include: {
                      override: true
                    }
                  }
                }
              }
            }
          },
          metricSnapshot: {
            include: {
              items: true
            }
          },
          topContentCards: {
            orderBy: {
              displayOrder: 'asc'
            }
          },
          competitorEvidence: {
            orderBy: {
              displayOrder: 'asc'
            }
          },
          questionEvidence: {
            orderBy: {
              displayOrder: 'asc'
            }
          }
        }
      }
    }
  });

  const sourceVersion = sourcePeriod?.reportVersions[0];
  const sourceImportJob = sourceVersion?.importJobs[0];

  if (!sourcePeriod || !sourceVersion || !sourceImportJob) {
    throw new Error(
      'April 2026 pass-state data is missing. Prepare the ready month before generating the fail story.'
    );
  }

  await prisma.$transaction(async (tx) => {
    const targetPeriod = await tx.reportingPeriod.upsert({
      where: {
        reporting_period_brand_year_month_unique: {
          brandId: brand.id,
          cadence: ReportCadence.monthly,
          year: TARGET_YEAR,
          month: TARGET_MONTH
        }
      },
      update: {
        currentState: ReportingPeriodState.in_progress
      },
      create: {
        brandId: brand.id,
        cadence: ReportCadence.monthly,
        year: TARGET_YEAR,
        month: TARGET_MONTH,
        currentState: ReportingPeriodState.in_progress
      }
    });

    await tx.reportVersion.deleteMany({
      where: {
        reportingPeriodId: targetPeriod.id
      }
    });

    const targetVersion = await tx.reportVersion.create({
      data: {
        reportingPeriodId: targetPeriod.id,
        versionNo: 1,
        cadence: ReportCadence.monthly,
        workflowState: ReportWorkflowState.draft,
        changeSummary: 'Demo fail state for incomplete monthly review.'
      }
    });

    const targetImportJob = await tx.importJob.create({
      data: {
        reportVersionId: targetVersion.id,
        originalFilename: sourceImportJob.originalFilename,
        storedFilename: sourceImportJob.storedFilename,
        storagePath: sourceImportJob.storagePath,
        mimeType: sourceImportJob.mimeType,
        fileSize: sourceImportJob.fileSize,
        status: sourceImportJob.status
      }
    });

    const profileIdMap = new Map<string, string>();

    for (const profile of sourceImportJob.columnProfiles) {
      const createdProfile = await tx.importColumnProfile.create({
        data: {
          importJobId: targetImportJob.id,
          sourceColumnName: profile.sourceColumnName,
          sourcePosition: profile.sourcePosition,
          sampleValue: profile.sampleValue
        }
      });

      profileIdMap.set(profile.id, createdProfile.id);
    }

    for (const mapping of sourceImportJob.sourceColumnMappings) {
      const importColumnProfileId = profileIdMap.get(mapping.importColumnProfileId);

      if (!importColumnProfileId) {
        continue;
      }

      await tx.columnMapping.create({
        data: {
          reportVersionId: targetVersion.id,
          importJobId: targetImportJob.id,
          importColumnProfileId,
          targetField: mapping.targetField
        }
      });
    }

    const rowIdMap = new Map<string, string>();

    for (const row of sourceImportJob.datasetRows) {
      const createdRow = await tx.datasetRow.create({
        data: {
          reportVersionId: targetVersion.id,
          importJobId: targetImportJob.id,
          sourceRowNumber: row.sourceRowNumber
        }
      });

      rowIdMap.set(row.id, createdRow.id);

      for (const cell of row.cells) {
        const createdCell = await tx.datasetCell.create({
          data: {
            datasetRowId: createdRow.id,
            targetField: cell.targetField,
            value: cell.value
          }
        });

        if (cell.override) {
          await tx.datasetCellOverride.create({
            data: {
              datasetCellId: createdCell.id,
              overrideValue: cell.override.overrideValue
            }
          });
        }
      }
    }

    if (sourceVersion.metricSnapshot) {
      const metricSnapshot = await tx.metricSnapshot.create({
        data: {
          reportVersionId: targetVersion.id,
          generatedAt: sourceVersion.metricSnapshot.generatedAt
        }
      });

      for (const item of sourceVersion.metricSnapshot.items) {
        await tx.metricSnapshotItem.create({
          data: {
            metricSnapshotId: metricSnapshot.id,
            metricKey: item.metricKey,
            value: item.value,
            rowCoverage: item.rowCoverage,
            overrideCount: item.overrideCount,
            sourceColumnName: item.sourceColumnName,
            sourceAliasLabel: item.sourceAliasLabel
          }
        });
      }
    }

    for (const card of sourceVersion.topContentCards.slice(0, 1)) {
      const datasetRowId = rowIdMap.get(card.datasetRowId);

      if (!datasetRowId) {
        continue;
      }

      await tx.topContentCard.create({
        data: {
          reportVersionId: targetVersion.id,
          datasetRowId,
          slotKey: card.slotKey,
          metricKey: card.metricKey,
          title: card.title,
          headlineValue: card.headlineValue,
          caption: card.caption,
          externalUrl: card.externalUrl,
          selectionBasis: card.selectionBasis,
          rankPosition: card.rankPosition,
          displayOrder: card.displayOrder
        }
      });
    }

    for (const evidence of sourceVersion.competitorEvidence.slice(0, 1)) {
      await tx.competitorEvidence.create({
        data: {
          reportVersionId: targetVersion.id,
          competitorId: evidence.competitorId,
          title: evidence.title,
          postUrl: evidence.postUrl,
          note: evidence.note,
          capturedMetricValue: evidence.capturedMetricValue,
          capturedMetricLabel: evidence.capturedMetricLabel,
          displayOrder: evidence.displayOrder
        }
      });
    }

    for (const evidence of sourceVersion.questionEvidence.slice(0, 1)) {
      await tx.questionEvidence.create({
        data: {
          reportVersionId: targetVersion.id,
          brandQuestionActivationId: evidence.brandQuestionActivationId,
          title: evidence.title,
          responseNote: evidence.responseNote,
          postUrl: evidence.postUrl,
          displayOrder: evidence.displayOrder
        }
      });
    }
  });

  console.log(
    'Prepared March 2026 fail-state demo data from the April 2026 ready-to-submit month.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
