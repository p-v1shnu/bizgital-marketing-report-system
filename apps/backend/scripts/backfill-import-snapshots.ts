import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { ImportJobStatus, PrismaClient } from '@prisma/client';

import { resolveImportStoragePath } from '../src/modules/imports/import-storage';
import {
  toImportJobSnapshot,
  toImportJobSnapshotWriteData
} from '../src/modules/imports/import-snapshot';
import { parseImportDocument } from '../src/modules/imports/imports.tabular';

const prisma = new PrismaClient();

for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env')
]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

type BackfillResult = {
  totalCandidates: number;
  success: number;
  skippedMissingFile: number;
  skippedInvalidHeader: number;
  failed: number;
  missingFileJobIds: string[];
};

function toStoredSampleValue(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, 180);
}

async function main() {
  const startedAt = Date.now();
  const dryRun = process.argv.includes('--dry-run');
  const limit = readLimitArg(process.argv);

  const jobs = await prisma.importJob.findMany({
    where: {
      snapshotCapturedAt: null
    },
    orderBy: {
      createdAt: 'asc'
    },
    ...(limit ? { take: limit } : {}),
    include: {
      reportVersion: {
        select: {
          reportingPeriodId: true,
          reportingPeriod: {
            select: {
              brand: {
                select: {
                  code: true
                }
              }
            }
          }
        }
      },
      columnProfiles: {
        orderBy: {
          sourcePosition: 'asc'
        }
      }
    }
  });

  const result: BackfillResult = {
    totalCandidates: jobs.length,
    success: 0,
    skippedMissingFile: 0,
    skippedInvalidHeader: 0,
    failed: 0,
    missingFileJobIds: []
  };

  for (const job of jobs) {
    const storagePath = resolveImportStoragePath({
      storagePath: job.storagePath,
      brandCode: job.reportVersion.reportingPeriod.brand.code,
      periodId: job.reportVersion.reportingPeriodId,
      storedFilename: job.storedFilename
    });

    let parsed;

    try {
      parsed = await parseImportDocument(storagePath, job.originalFilename);
    } catch (error) {
      if (isMissingFileError(error)) {
        result.skippedMissingFile += 1;
        result.missingFileJobIds.push(job.id);
        continue;
      }

      result.failed += 1;
      console.error(`[failed] ${job.id}: ${(error as Error).message}`);
      continue;
    }

    const snapshot = toImportJobSnapshot(parsed);
    const headers = snapshot.headerRow
      .map((value, index) => ({
        sourceColumnName: value.trim(),
        sourcePosition: index + 1,
        sampleValue: toStoredSampleValue(parsed.sampleRow?.[index] ?? null)
      }))
      .filter((value) => value.sourceColumnName.length > 0);

    if (headers.length === 0) {
      result.skippedInvalidHeader += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        if (job.columnProfiles.length === 0) {
          for (const header of headers) {
            await tx.importColumnProfile.create({
              data: {
                importJobId: job.id,
                sourceColumnName: header.sourceColumnName,
                sourcePosition: header.sourcePosition,
                sampleValue: header.sampleValue
              }
            });
          }
        }

        await tx.importJob.update({
          where: {
            id: job.id
          },
          data: {
            ...toImportJobSnapshotWriteData(snapshot),
            status: ImportJobStatus.ready_for_mapping
          }
        });
      });
    }

    result.success += 1;
  }

  const elapsedMs = Date.now() - startedAt;

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'apply',
        elapsedMs,
        ...result
      },
      null,
      2
    )
  );
}

function readLimitArg(argv: string[]) {
  const entry = argv.find((value) => value.startsWith('--limit='));

  if (!entry) {
    return null;
  }

  const parsed = Number(entry.split('=')[1] || 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function isMissingFileError(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
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
