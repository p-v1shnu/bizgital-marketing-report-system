import {
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { resolveImportStoragePath } from '../imports/import-storage';
import {
  readImportJobSnapshot,
  toImportJobSnapshot,
  toImportJobSnapshotWriteData
} from '../imports/import-snapshot';
import { parseImportDocument } from '../imports/imports.tabular';

export type MaterializeDatasetResult = {
  reportVersionId: string;
  importJobId: string | null;
  rowCount: number;
  cellCount: number;
  isMaterialized: boolean;
};

@Injectable()
export class DatasetMaterializerService {
  constructor(private readonly prisma: PrismaService) {}

  async materializeReportVersion(
    reportVersionId: string
  ): Promise<MaterializeDatasetResult> {
    const version = await this.prisma.reportVersion.findUnique({
      where: { id: reportVersionId },
      include: {
        reportingPeriod: {
          include: {
            brand: {
              select: {
                code: true
              }
            }
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
    });

    if (!version) {
      throw new NotFoundException('Report version not found for dataset materialization.');
    }

    const latestImportJob = await this.prisma.importJob.findFirst({
      where: {
        reportVersionId
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
    });

    if (!latestImportJob) {
      await this.clearDatasetRows(reportVersionId);

      return {
        reportVersionId,
        importJobId: null,
        rowCount: 0,
        cellCount: 0,
        isMaterialized: false
      };
    }

    const mappedColumns = latestImportJob.columnProfiles
      .filter((profile) => profile.mappings[0])
      .map((profile) => ({
        targetField: profile.mappings[0].targetField,
        sourcePosition: profile.sourcePosition
      }))
      .filter(
        (column, index, collection) =>
          collection.findIndex((item) => item.targetField === column.targetField) === index
      );

    if (mappedColumns.length === 0) {
      await this.clearDatasetRows(reportVersionId);

      return {
        reportVersionId,
        importJobId: latestImportJob.id,
        rowCount: 0,
        cellCount: 0,
        isMaterialized: false
      };
    }

    const snapshot = readImportJobSnapshot(latestImportJob);
    let dataRows: string[][] = snapshot?.dataRows ?? [];

    if (!snapshot) {
      let parsed;

      try {
        parsed = await parseImportDocument(
          resolveImportStoragePath({
            storagePath: latestImportJob.storagePath,
            brandCode: version.reportingPeriod.brand.code,
            periodId: version.reportingPeriodId,
            storedFilename: latestImportJob.storedFilename
          }),
          latestImportJob.originalFilename
        );
      } catch (error) {
        if (isMissingImportFileError(error)) {
          throw new ConflictException(
            'Import source file is missing. Please upload the file again before saving mappings.'
          );
        }

        throw error;
      }

      const parsedSnapshot = toImportJobSnapshot(parsed);
      dataRows = parsedSnapshot.dataRows;

      await this.prisma.importJob.update({
        where: {
          id: latestImportJob.id
        },
        data: toImportJobSnapshotWriteData(parsedSnapshot)
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.datasetRow.deleteMany({
        where: {
          reportVersionId
        }
      });

      for (const [index, row] of dataRows.entries()) {
        await tx.datasetRow.create({
          data: {
            reportVersionId,
            importJobId: latestImportJob.id,
            sourceRowNumber: index + 1,
            cells: {
              create: mappedColumns.map((column) => ({
                targetField: column.targetField,
                value: row[column.sourcePosition - 1]?.trim() || null
              }))
            }
          }
        });
      }
    });

    return {
      reportVersionId,
      importJobId: latestImportJob.id,
      rowCount: dataRows.length,
      cellCount: dataRows.length * mappedColumns.length,
      isMaterialized: true
    };
  }

  private async clearDatasetRows(reportVersionId: string) {
    await this.prisma.datasetRow.deleteMany({
      where: {
        reportVersionId
      }
    });
  }
}

function isMissingImportFileError(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}
