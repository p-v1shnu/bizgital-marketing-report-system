import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env')
]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

const prisma = new PrismaClient();

type ParsedArgs = {
  dryRun: boolean;
  brandCode: string | null;
  limit: number | null;
  showHelp: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const dryRun = argv.includes('--dry-run');
  const showHelp = argv.includes('--help') || argv.includes('-h');
  const brandArg = argv.find((value) => value.startsWith('--brand='));
  const limitArg = argv.find((value) => value.startsWith('--limit='));

  let limit: number | null = null;
  if (limitArg) {
    const parsed = Number(limitArg.split('=')[1] || 0);
    if (Number.isInteger(parsed) && parsed > 0) {
      limit = parsed;
    }
  }

  return {
    dryRun,
    brandCode: brandArg ? brandArg.split('=')[1] || null : null,
    limit,
    showHelp
  };
}

function printHelp() {
  console.log(`
Backfill competitor_evidence -> competitor_monitoring

Usage:
  npx tsx scripts/backfill-competitor-monitoring.ts [--dry-run] [--brand=BRAND_CODE] [--limit=N]

Notes:
  - This script creates monitoring records only when missing.
  - It maps status as "has_posts" conservatively, but does not create post rows
    because legacy competitor_evidence has no screenshot field to map reliably.
`);
}

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));

  if (args.showHelp) {
    printHelp();
    return;
  }

  const whereBrand = args.brandCode
    ? {
        reportVersion: {
          reportingPeriod: {
            brand: {
              code: args.brandCode
            }
          }
        }
      }
    : undefined;

  const evidenceRows = await prisma.competitorEvidence.findMany({
    where: whereBrand ? whereBrand : undefined,
    orderBy: {
      createdAt: 'asc'
    },
    ...(args.limit ? { take: args.limit } : {}),
    select: {
      id: true,
      reportVersionId: true,
      competitorId: true,
      title: true,
      note: true,
      postUrl: true,
      reportVersion: {
        select: {
          reportingPeriod: {
            select: {
              year: true,
              month: true,
              brand: {
                select: {
                  code: true
                }
              }
            }
          }
        }
      }
    }
  });

  const versionIds = Array.from(
    new Set(evidenceRows.map((item) => item.reportVersionId))
  );

  const monitoringTableExists = await hasTable('competitor_monitoring');

  if (!monitoringTableExists && !args.dryRun) {
    throw new Error(
      'Table competitor_monitoring does not exist. Apply migration first, then rerun.'
    );
  }

  const monitoringRows =
    !monitoringTableExists || versionIds.length === 0
      ? []
      : await prisma.competitorMonitoring.findMany({
          where: {
            reportVersionId: {
              in: versionIds
            }
          },
          select: {
            reportVersionId: true,
            competitorId: true
          }
        });

  const monitoringKeySet = new Set(
    monitoringRows.map((item) => `${item.reportVersionId}:${item.competitorId}`)
  );

  const candidates = evidenceRows.filter(
    (item) => !monitoringKeySet.has(`${item.reportVersionId}:${item.competitorId}`)
  );

  let createdCount = 0;
  let skippedBecauseExists = evidenceRows.length - candidates.length;
  let withLegacySignalCount = 0;
  let skippedRaceDuplicate = 0;

  for (const row of candidates) {
    if (
      row.title.trim().length > 0 ||
      row.note.trim().length > 0 ||
      (row.postUrl ?? '').trim().length > 0
    ) {
      withLegacySignalCount += 1;
    }

    if (!args.dryRun) {
      try {
        await prisma.competitorMonitoring.create({
          data: {
            reportVersionId: row.reportVersionId,
            competitorId: row.competitorId,
            status: 'has_posts',
            followerCount: null,
            noActivityNote: null,
            noActivityEvidenceImageUrl: null
          }
        });
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002'
        ) {
          skippedRaceDuplicate += 1;
          continue;
        }

        throw error;
      }
    }

    createdCount += 1;
  }

  const elapsedMs = Date.now() - startedAt;

  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? 'dry-run' : 'apply',
        filter: {
          brandCode: args.brandCode,
          limit: args.limit
        },
        prerequisites: {
          monitoringTableExists
        },
        elapsedMs,
        totals: {
          competitorEvidenceRows: evidenceRows.length,
          candidatesWithoutMonitoring: candidates.length,
          createdCount,
          skippedBecauseExists,
          skippedRaceDuplicate,
          withLegacySignalCount,
          postBackfillSkippedReason:
            'Legacy competitor_evidence has no screenshot field, so monitoring posts are not auto-created.'
        }
      },
      null,
      2
    )
  );
}

async function hasTable(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ${tableName}
    LIMIT 1
  `;

  return rows.length > 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
