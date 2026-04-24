import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ImportJobStatus, Prisma, ReportWorkflowState } from '@prisma/client';
import { readFile, unlink } from 'node:fs/promises';
import { extname } from 'node:path';

import { PrismaService } from '../../prisma/prisma.service';
import { BrandsService } from '../brands/brands.service';
import { ColumnConfigService } from '../column-config/column-config.service';
import {
  resolveImportStoragePath,
  toStoredImportPath
} from './import-storage';
import {
  readImportJobSnapshot,
  toImportJobSnapshot,
  toImportJobSnapshotWriteData
} from './import-snapshot';
import { parseImportDocument } from './imports.tabular';
import type { ImportJobListResponse, ImportPreviewResponse } from './imports.types';

const ALLOWED_IMPORT_EXTENSIONS = new Set(['.csv', '.xls', '.xlsx']);
const IMPORT_COLUMN_SAMPLE_MAX_LENGTH = 180;

function toStoredSampleValue(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, IMPORT_COLUMN_SAMPLE_MAX_LENGTH);
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly columnConfigService: ColumnConfigService
  ) {}

  async listImportJobs(
    brandCode: string,
    periodId: string
  ): Promise<ImportJobListResponse> {
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
    const items = (targetVersion?.importJobs ?? [])
      .map((job) => ({
        id: job.id,
        reportVersionId: job.reportVersionId,
        originalFilename: job.originalFilename,
        storedFilename: job.storedFilename,
        storagePath: job.storagePath,
        mimeType: job.mimeType,
        fileSize: job.fileSize,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString()
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

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
      items
    };
  }

  async createImportJob(
    brandCode: string,
    periodId: string,
    file: Express.Multer.File
  ) {
    if (!file) {
      throw new BadRequestException('Import file is required.');
    }

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
        'Create or resume a draft before uploading an import file.'
      );
    }

    await this.assertAllowedFile(file);

    const created = await this.prisma.importJob.create({
      data: {
        reportVersionId: currentDraft.id,
        originalFilename: file.originalname,
        storedFilename: file.filename,
        storagePath: toStoredImportPath(brand.code, period.id, file.filename),
        mimeType: file.mimetype || null,
        fileSize: file.size,
        status: ImportJobStatus.uploaded
      }
    });

    await this.profileImportJob(created.id, file);

    return this.prisma.importJob.findUniqueOrThrow({
      where: {
        id: created.id
      }
    });
  }

  async getLatestImportPreview(
    brandCode: string,
    periodId: string
  ): Promise<ImportPreviewResponse> {
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
    const latestImportJob = targetVersion?.importJobs[0] ?? null;

    if (!latestImportJob) {
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
        importJob: null,
        preview: null
      };
    }

    const resolvedStoragePath = resolveImportStoragePath({
      storagePath: latestImportJob.storagePath,
      brandCode: brand.code,
      periodId: period.id,
      storedFilename: latestImportJob.storedFilename
    });

    const latestImportJobSnapshot = readImportJobSnapshot(latestImportJob);

    if (
      latestImportJob.status !== ImportJobStatus.ready_for_mapping ||
      !latestImportJobSnapshot
    ) {
      await this.profileImportJobFromPath(
        latestImportJob.id,
        resolvedStoragePath,
        latestImportJob.originalFilename
      );
    }

    const refreshedImportJob = await this.prisma.importJob.findUniqueOrThrow({
      where: {
        id: latestImportJob.id
      }
    });

    const snapshot = readImportJobSnapshot(refreshedImportJob);
    let sourceType: 'csv' | 'excel' = snapshot?.sourceType ?? 'csv';
    let sheetName: string | null = snapshot?.sheetName ?? null;
    let headerRow = snapshot?.headerRow ?? [];
    let dataRows = snapshot?.dataRows ?? [];

    if (!snapshot) {
      let parsed;

      try {
        parsed = await parseImportDocument(
          resolvedStoragePath,
          refreshedImportJob.originalFilename
        );
      } catch {
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
          importJob: {
            id: refreshedImportJob.id,
            originalFilename: refreshedImportJob.originalFilename,
            status: refreshedImportJob.status,
            createdAt: refreshedImportJob.createdAt.toISOString(),
            sourceType: 'csv',
            sheetName: null
          },
          preview: null
        };
      }

      const parsedSnapshot = toImportJobSnapshot(parsed);
      sourceType = parsedSnapshot.sourceType;
      sheetName = parsedSnapshot.sheetName;
      headerRow = parsedSnapshot.headerRow;
      dataRows = parsedSnapshot.dataRows;
    }

    const displayLabelLookup = await this.columnConfigService.getPublishedImportColumnDisplayLabelLookup();
    const previewRows = dataRows.slice(0, 20);
    const columns = headerRow
      .map((label, index) => ({
        key: `source_${index + 1}`,
        label: this.columnConfigService.resolveImportColumnDisplayLabel(label, displayLabelLookup),
        rawLabel: label,
        sourcePosition: index + 1
      }))
      .filter((column) => column.rawLabel.trim().length > 0);

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
      importJob: {
        id: refreshedImportJob.id,
        originalFilename: refreshedImportJob.originalFilename,
        status: refreshedImportJob.status,
        createdAt: refreshedImportJob.createdAt.toISOString(),
        sourceType,
        sheetName
      },
      preview:
        columns.length === 0
          ? null
          : {
              columns,
              rows: previewRows.map((row, rowIndex) => ({
                rowNumber: rowIndex + 1,
                cells: Object.fromEntries(
                  columns.map((column) => [
                    column.key,
                    row[column.sourcePosition - 1]?.trim() || null
                  ])
                )
              })),
              totalRows: dataRows.length,
              shownRows: previewRows.length,
              truncated: dataRows.length > previewRows.length
            }
    };
  }

  private async assertAllowedFile(file: Express.Multer.File) {
    const extension = extname(file.originalname).toLowerCase();

    if (!ALLOWED_IMPORT_EXTENSIONS.has(extension)) {
      await this.deleteRejectedUpload(file.path);
      throw new BadRequestException(
        'Only CSV, XLS, and XLSX files are allowed for import.'
      );
    }

    const header = await readFile(file.path).then(buffer => buffer.subarray(0, 8192));
    const isValid =
      (extension === '.csv' && this.isCsvLike(header)) ||
      (extension === '.xlsx' && this.isZipDocument(header)) ||
      (extension === '.xls' && this.isOleCompoundDocument(header));

    if (!isValid) {
      await this.deleteRejectedUpload(file.path);
      throw new BadRequestException(
        'Import file content does not match the selected CSV, XLS, or XLSX format.'
      );
    }
  }

  private isCsvLike(header: Buffer) {
    if (header.length === 0) {
      return false;
    }

    if (header.includes(0)) {
      return false;
    }

    return !header.toString('utf8').includes('\uFFFD');
  }

  private isZipDocument(header: Buffer) {
    return (
      header.length >= 4 &&
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      (
        (header[2] === 0x03 && header[3] === 0x04) ||
        (header[2] === 0x05 && header[3] === 0x06) ||
        (header[2] === 0x07 && header[3] === 0x08)
      )
    );
  }

  private isOleCompoundDocument(header: Buffer) {
    return (
      header.length >= 8 &&
      header[0] === 0xd0 &&
      header[1] === 0xcf &&
      header[2] === 0x11 &&
      header[3] === 0xe0 &&
      header[4] === 0xa1 &&
      header[5] === 0xb1 &&
      header[6] === 0x1a &&
      header[7] === 0xe1
    );
  }

  private async deleteRejectedUpload(filePath: string | undefined) {
    if (!filePath) {
      return;
    }

    await unlink(filePath).catch(() => undefined);
  }

  private async profileImportJob(importJobId: string, file: Express.Multer.File) {
    await this.profileImportJobFromPath(importJobId, file.path, file.originalname);
  }

  private async profileImportJobFromPath(
    importJobId: string,
    storagePath: string,
    originalFilename: string
  ) {
    let parsed;

    try {
      parsed = await parseImportDocument(storagePath, originalFilename);
    } catch {
      await this.prisma.importJob.update({
        where: { id: importJobId },
        data: {
          snapshotSourceType: null,
          snapshotSheetName: null,
          snapshotHeaderRow: Prisma.DbNull,
          snapshotDataRows: Prisma.DbNull,
          snapshotCapturedAt: null,
          status: ImportJobStatus.failed
        }
      });

      return;
    }

    const headerRowIndex = parsed.headerRowIndex;

    if (headerRowIndex === -1) {
      await this.prisma.importJob.update({
        where: { id: importJobId },
        data: {
          snapshotSourceType: null,
          snapshotSheetName: null,
          snapshotHeaderRow: Prisma.DbNull,
          snapshotDataRows: Prisma.DbNull,
          snapshotCapturedAt: null,
          status: ImportJobStatus.failed
        }
      });

      return;
    }

    const headers = parsed.headerRow
      .map((value, index) => ({
        sourceColumnName: value.trim(),
        sourcePosition: index + 1,
        sampleValue: toStoredSampleValue(parsed.sampleRow?.[index] ?? null)
      }))
      .filter((value) => value.sourceColumnName.length > 0);

    if (headers.length === 0) {
      await this.prisma.importJob.update({
        where: { id: importJobId },
        data: {
          snapshotSourceType: null,
          snapshotSheetName: null,
          snapshotHeaderRow: Prisma.DbNull,
          snapshotDataRows: Prisma.DbNull,
          snapshotCapturedAt: null,
          status: ImportJobStatus.failed
        }
      });

      return;
    }

    const snapshot = toImportJobSnapshot(parsed);

    await this.prisma.$transaction(async (tx) => {
      await tx.importColumnProfile.deleteMany({
        where: {
          importJobId
        }
      });

      for (const header of headers) {
        await tx.importColumnProfile.create({
          data: {
            importJobId,
            sourceColumnName: header.sourceColumnName,
            sourcePosition: header.sourcePosition,
            sampleValue: header.sampleValue
          }
        });
      }

      await tx.importJob.update({
        where: { id: importJobId },
        data: {
          ...toImportJobSnapshotWriteData(snapshot),
          status: ImportJobStatus.ready_for_mapping
        }
      });
    });
  }
}
