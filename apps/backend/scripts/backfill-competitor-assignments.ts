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

type CandidateAssignment = {
  competitorId: string;
  displayOrder: number;
  createdAt: Date;
};

type LegacyRow = {
  brandId: string;
  brandCode: string;
  competitorId: string;
  displayOrder: number;
  activeFromYear: number;
  activeToYear: number | null;
  createdAt: Date;
};

type ParsedArgs = {
  dryRun: boolean;
  brandCode: string | null;
  year: number | null;
  showHelp: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const dryRun = argv.includes('--dry-run');
  const showHelp = argv.includes('--help') || argv.includes('-h');
  const brandArg = argv.find((value) => value.startsWith('--brand='));
  const yearArg = argv.find((value) => value.startsWith('--year='));

  let year: number | null = null;

  if (yearArg) {
    const parsed = Number(yearArg.split('=')[1] || 0);
    if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 3000) {
      year = parsed;
    }
  }

  return {
    dryRun,
    brandCode: brandArg ? brandArg.split('=')[1] || null : null,
    year,
    showHelp
  };
}

function sortAssignments(left: CandidateAssignment, right: CandidateAssignment) {
  if (left.displayOrder !== right.displayOrder) {
    return left.displayOrder - right.displayOrder;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}

function betterCandidate(left: CandidateAssignment, right: CandidateAssignment) {
  if (left.displayOrder !== right.displayOrder) {
    return left.displayOrder < right.displayOrder ? left : right;
  }

  return left.createdAt.getTime() <= right.createdAt.getTime() ? left : right;
}

function printHelp() {
  console.log(`
Backfill brand_competitors -> brand_competitor_assignments

Usage:
  npx tsx scripts/backfill-competitor-assignments.ts [--dry-run] [--brand=BRAND_CODE] [--year=YYYY]

Examples:
  npx tsx scripts/backfill-competitor-assignments.ts --dry-run
  npx tsx scripts/backfill-competitor-assignments.ts --brand=ACME --year=2026
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
        brand: {
          code: args.brandCode
        }
      }
    : undefined;

  const nowYear = new Date().getUTCFullYear();

  const [legacyRowsRaw, periodYearsRaw] = await Promise.all([
    prisma.brandCompetitor.findMany({
      where: {
        status: 'active',
        ...(whereBrand ? whereBrand : {})
      },
      include: {
        brand: {
          select: {
            id: true,
            code: true
          }
        }
      },
      orderBy: [{ brandId: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.reportingPeriod.findMany({
      where: whereBrand ? whereBrand : undefined,
      select: {
        brandId: true,
        year: true
      },
      distinct: ['brandId', 'year']
    })
  ]);

  const legacyRows: LegacyRow[] = legacyRowsRaw.map((row) => ({
    brandId: row.brandId,
    brandCode: row.brand.code,
    competitorId: row.competitorId,
    displayOrder: row.displayOrder,
    activeFromYear: row.activeFromYear,
    activeToYear: row.activeToYear,
    createdAt: row.createdAt
  }));

  const yearsByBrand = new Map<string, Set<number>>();
  for (const period of periodYearsRaw) {
    if (!yearsByBrand.has(period.brandId)) {
      yearsByBrand.set(period.brandId, new Set());
    }
    yearsByBrand.get(period.brandId)!.add(period.year);
  }
  for (const row of legacyRows) {
    if (!yearsByBrand.has(row.brandId)) {
      yearsByBrand.set(row.brandId, new Set());
    }
    yearsByBrand.get(row.brandId)!.add(nowYear);
  }

  const candidateByBrandYear = new Map<
    string,
    {
      brandId: string;
      brandCode: string;
      year: number;
      byCompetitor: Map<string, CandidateAssignment>;
    }
  >();

  for (const row of legacyRows) {
    const candidateYears = Array.from(yearsByBrand.get(row.brandId) ?? []);

    for (const year of candidateYears) {
      if (args.year !== null && year !== args.year) {
        continue;
      }

      if (year < row.activeFromYear) {
        continue;
      }

      if (row.activeToYear !== null && year > row.activeToYear) {
        continue;
      }

      const key = `${row.brandId}:${year}`;

      if (!candidateByBrandYear.has(key)) {
        candidateByBrandYear.set(key, {
          brandId: row.brandId,
          brandCode: row.brandCode,
          year,
          byCompetitor: new Map()
        });
      }

      const bucket = candidateByBrandYear.get(key)!;
      const nextCandidate: CandidateAssignment = {
        competitorId: row.competitorId,
        displayOrder: row.displayOrder,
        createdAt: row.createdAt
      };
      const existing = bucket.byCompetitor.get(row.competitorId);

      if (!existing) {
        bucket.byCompetitor.set(row.competitorId, nextCandidate);
      } else {
        bucket.byCompetitor.set(
          row.competitorId,
          betterCandidate(existing, nextCandidate)
        );
      }
    }
  }

  const brandIds = Array.from(
    new Set(Array.from(candidateByBrandYear.values()).map((item) => item.brandId))
  );
  const years = Array.from(
    new Set(Array.from(candidateByBrandYear.values()).map((item) => item.year))
  );

  const assignmentTableExists = await hasTable('brand_competitor_assignments');

  if (!assignmentTableExists && !args.dryRun) {
    throw new Error(
      'Table brand_competitor_assignments does not exist. Apply migration first, then rerun.'
    );
  }

  const existingAssignments = !assignmentTableExists
    ? []
    : await prisma.brandCompetitorAssignment.findMany({
        where:
          brandIds.length === 0 || years.length === 0
            ? undefined
            : {
                brandId: {
                  in: brandIds
                },
                year: {
                  in: years
                }
              },
        select: {
          brandId: true,
          year: true
        }
      });

  const existingBrandYearSet = new Set(
    existingAssignments.map((item) => `${item.brandId}:${item.year}`)
  );

  let createdYearCount = 0;
  let createdAssignmentCount = 0;
  let skippedBrandYearBecauseExists = 0;

  for (const bucket of Array.from(candidateByBrandYear.values()).sort((left, right) => {
    if (left.brandCode !== right.brandCode) {
      return left.brandCode.localeCompare(right.brandCode);
    }

    return left.year - right.year;
  })) {
    const key = `${bucket.brandId}:${bucket.year}`;
    const sorted = Array.from(bucket.byCompetitor.values())
      .sort(sortAssignments)
      .map((item) => item.competitorId);

    if (sorted.length === 0) {
      continue;
    }

    if (existingBrandYearSet.has(key)) {
      skippedBrandYearBecauseExists += 1;
      continue;
    }

    if (!args.dryRun) {
      await prisma.brandCompetitorAssignment.createMany({
        data: sorted.map((competitorId, index) => ({
          brandId: bucket.brandId,
          year: bucket.year,
          competitorId,
          displayOrder: index + 1
        }))
      });
    }

    createdYearCount += 1;
    createdAssignmentCount += sorted.length;
  }

  const elapsedMs = Date.now() - startedAt;

  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? 'dry-run' : 'apply',
        filter: {
          brandCode: args.brandCode,
          year: args.year
        },
        prerequisites: {
          assignmentTableExists
        },
        elapsedMs,
        totals: {
          legacyRows: legacyRows.length,
          candidateBrandYears: candidateByBrandYear.size,
          createdYearCount,
          createdAssignmentCount,
          skippedBrandYearBecauseExists
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
