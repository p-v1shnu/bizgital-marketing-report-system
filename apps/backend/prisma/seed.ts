import {
  BrandCompetitorStatus,
  BrandRole,
  BrandStatus,
  PrismaClient,
  QuestionStatus,
  UserStatus
} from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();
const PASSWORD_HASH_PREFIX = 's1';

function assertDemoSeedAllowed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run demo seed while NODE_ENV=production.');
  }
}

function hashPassword(plainPassword: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plainPassword, salt, 64).toString('hex');
  return `${PASSWORD_HASH_PREFIX}$${salt}$${derived}`;
}

async function ensureAuthStorage() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_auth_credentials (
      user_id VARCHAR(191) NOT NULL,
      password_hash TEXT NULL,
      microsoft_oid VARCHAR(191) NULL,
      allow_password TINYINT(1) NULL,
      allow_microsoft TINYINT(1) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id),
      UNIQUE KEY user_auth_credentials_microsoft_oid_key (microsoft_oid)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `);

  const ensureColumn = async (columnName: string, afterColumn: string) => {
    try {
      await prisma.$executeRawUnsafe(
        `
        ALTER TABLE user_auth_credentials
        ADD COLUMN ${columnName} TINYINT(1) NULL AFTER ${afterColumn}
        `
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (!message.includes('duplicate column name')) {
        throw error;
      }
    }
  };

  await ensureColumn('allow_password', 'password_hash');
  await ensureColumn('allow_microsoft', 'microsoft_oid');
}

async function main() {
  assertDemoSeedAllowed();
  await ensureAuthStorage();

  const demoBrand = await prisma.brand.upsert({
    where: { code: 'demo-brand' },
    update: {
      name: 'Demo Brand',
      timezone: 'Asia/Vientiane',
      status: BrandStatus.active
    },
    create: {
      code: 'demo-brand',
      name: 'Demo Brand',
      timezone: 'Asia/Vientiane',
      status: BrandStatus.active
    }
  });

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@demo-brand.local' },
      update: {
        displayName: 'Demo Admin',
        status: UserStatus.active
      },
      create: {
        email: 'admin@demo-brand.local',
        displayName: 'Demo Admin',
        status: UserStatus.active
      }
    }),
    prisma.user.upsert({
      where: { email: 'content@demo-brand.local' },
      update: {
        displayName: 'Demo Content',
        status: UserStatus.active
      },
      create: {
        email: 'content@demo-brand.local',
        displayName: 'Demo Content',
        status: UserStatus.active
      }
    }),
    prisma.user.upsert({
      where: { email: 'approver@demo-brand.local' },
      update: {
        displayName: 'Demo Approver',
        status: UserStatus.active
      },
      create: {
        email: 'approver@demo-brand.local',
        displayName: 'Demo Approver',
        status: UserStatus.active
      }
    })
  ]);

  const memberships = [
    { userId: users[0].id, role: BrandRole.admin },
    { userId: users[1].id, role: BrandRole.content },
    { userId: users[2].id, role: BrandRole.approver }
  ];

  const defaultPasswordByEmail = new Map<string, string>([
    ['admin@demo-brand.local', 'admin1234'],
    ['content@demo-brand.local', 'content1234'],
    ['approver@demo-brand.local', 'approver1234']
  ]);

  for (const user of users) {
    const defaultPassword = defaultPasswordByEmail.get(user.email);
    if (!defaultPassword) {
      continue;
    }

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO user_auth_credentials (user_id, password_hash, allow_password, allow_microsoft)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        allow_password = VALUES(allow_password),
        allow_microsoft = VALUES(allow_microsoft),
        updated_at = CURRENT_TIMESTAMP(3)
      `,
      user.id,
      hashPassword(defaultPassword),
      1,
      1
    );
  }

  for (const membership of memberships) {
    await prisma.brandMembership.upsert({
      where: {
        brand_membership_brand_user_role_unique: {
          brandId: demoBrand.id,
          userId: membership.userId,
          role: membership.role
        }
      },
      update: {},
      create: {
        brandId: demoBrand.id,
        userId: membership.userId,
        role: membership.role
      }
    });
  }

  const competitors = await Promise.all([
    prisma.competitor.upsert({
      where: { name: 'Sample Competitor A' },
      update: {
        primaryPlatform: 'Facebook',
        facebookUrl: 'https://facebook.com/sample-competitor-a'
      },
      create: {
        name: 'Sample Competitor A',
        primaryPlatform: 'Facebook',
        facebookUrl: 'https://facebook.com/sample-competitor-a'
      }
    }),
    prisma.competitor.upsert({
      where: { name: 'Sample Competitor B' },
      update: {
        primaryPlatform: 'Instagram',
        instagramUrl: 'https://instagram.com/samplecompetitorb'
      },
      create: {
        name: 'Sample Competitor B',
        primaryPlatform: 'Instagram',
        instagramUrl: 'https://instagram.com/samplecompetitorb'
      }
    })
  ]);

  for (const [index, competitor] of competitors.entries()) {
    await prisma.brandCompetitor.upsert({
      where: {
        brand_competitor_brand_competitor_year_unique: {
          brandId: demoBrand.id,
          competitorId: competitor.id,
          activeFromYear: new Date().getUTCFullYear()
        }
      },
      update: {
        status: BrandCompetitorStatus.active,
        displayOrder: index + 1
      },
      create: {
        brandId: demoBrand.id,
        competitorId: competitor.id,
        activeFromYear: new Date().getUTCFullYear(),
        displayOrder: index + 1,
        status: BrandCompetitorStatus.active
      }
    });
  }

  const questionMasters = await Promise.all([
    prisma.questionMaster.upsert({
      where: {
        questionText: 'What content angle or audience signal stood out this month?'
      },
      update: {
        status: QuestionStatus.active
      },
      create: {
        questionText: 'What content angle or audience signal stood out this month?',
        status: QuestionStatus.active
      }
    }),
    prisma.questionMaster.upsert({
      where: {
        questionText: 'Which post or conversation should the team follow up next month?'
      },
      update: {
        status: QuestionStatus.active
      },
      create: {
        questionText: 'Which post or conversation should the team follow up next month?',
        status: QuestionStatus.active
      }
    })
  ]);

  const currentYear = new Date().getUTCFullYear();

  for (const [index, questionMaster] of questionMasters.entries()) {
    await prisma.brandQuestionActivation.upsert({
      where: {
        brand_question_activation_brand_question_from_unique: {
          brandId: demoBrand.id,
          questionMasterId: questionMaster.id,
          activeFromDate: new Date(Date.UTC(currentYear, 0, 1))
        }
      },
      update: {
        displayOrder: index + 1,
        status: QuestionStatus.active,
        activeToDate: null
      },
      create: {
        brandId: demoBrand.id,
        questionMasterId: questionMaster.id,
        activeFromDate: new Date(Date.UTC(currentYear, 0, 1)),
        displayOrder: index + 1,
        status: QuestionStatus.active
      }
    });
  }

  console.log('Seeded demo brand, memberships, and baseline auth credentials.');
  console.log('Login credentials (local seed):');
  console.log('- admin@demo-brand.local / admin1234');
  console.log('- content@demo-brand.local / content1234');
  console.log('- approver@demo-brand.local / approver1234');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
