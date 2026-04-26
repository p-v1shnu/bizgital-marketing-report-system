import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { BrandRole, Prisma, UserStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedRequestUser } from '../auth/current-user.decorator';
import type {
  BootstrapSetupMode,
  BootstrapStatusResponse,
  BootstrapSuperAdminInput,
  CreateUserInput,
  DeleteUserInput,
  MicrosoftLoginInput,
  PasswordLoginInput,
  UserSignInMethod,
  UpdateUserInput,
  UserMembershipInput
} from './users.types';

type RawAuthCredentialRow = {
  user_id: string;
  password_hash: string | null;
  microsoft_oid: string | null;
  allow_password: number | null;
  allow_microsoft: number | null;
};

type RawMembershipPermissionRow = {
  brand_id: string;
  user_id: string;
  can_create_reports: number | null;
  can_approve_reports: number | null;
};

type MembershipPermissionSnapshot = {
  canCreateReports: boolean;
  canApproveReports: boolean;
};

type AuthPolicySnapshot = {
  allowPassword: boolean;
  allowMicrosoft: boolean;
  signInMethod: UserSignInMethod;
};

type RawBootstrapSuperAdminRow = {
  id: number;
  user_id: string;
};

type RawGlobalAdminRow = {
  user_id: string;
};

type BootstrapStatusSnapshot = {
  mode: BootstrapSetupMode;
  setupRequired: boolean;
  enforceSetup: boolean;
  hasBootstrapSuperAdmin: boolean;
  bootstrapSuperAdminUserId: string | null;
  activeAdminCount: number;
  reason: BootstrapStatusResponse['reason'];
};

const PASSWORD_HASH_PREFIX = 's1';
const MIN_PASSWORD_LENGTH = 8;
const LOCAL_SEED_EMAILS = new Set([
  'admin@demo-brand.local',
  'content@demo-brand.local',
  'approver@demo-brand.local'
]);

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function isTrueFlag(value: string | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

function isLocalSeedEmail(email: string) {
  return LOCAL_SEED_EMAILS.has(normalizeEmail(email));
}

function assertAllowedStatus(value: string | undefined): UserStatus | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Object.values(UserStatus).includes(value as UserStatus)) {
    throw new BadRequestException('Invalid user status.');
  }

  return value as UserStatus;
}

function assertAllowedRole(value: string): BrandRole {
  const allowedRoles: BrandRole[] = [
    BrandRole.admin,
    BrandRole.content,
    BrandRole.approver,
    BrandRole.viewer
  ];

  if (!allowedRoles.includes(value as BrandRole)) {
    throw new BadRequestException('Invalid brand role.');
  }

  return value as BrandRole;
}

function assertAllowedSignInMethod(
  value: string | undefined
): UserSignInMethod | undefined {
  if (value === undefined) {
    return undefined;
  }

  const allowed: UserSignInMethod[] = [
    'microsoft_only',
    'password_only',
    'microsoft_and_password'
  ];

  if (!allowed.includes(value as UserSignInMethod)) {
    throw new BadRequestException('Invalid sign-in method.');
  }

  return value as UserSignInMethod;
}

function defaultPermissionsForRole(role: BrandRole): MembershipPermissionSnapshot {
  if (role === BrandRole.admin) {
    return {
      canCreateReports: true,
      canApproveReports: true
    };
  }

  if (role === BrandRole.content) {
    return {
      canCreateReports: true,
      canApproveReports: false
    };
  }

  if (role === BrandRole.approver) {
    return {
      canCreateReports: false,
      canApproveReports: true
    };
  }

  return {
    canCreateReports: false,
    canApproveReports: false
  };
}

function resolveMembershipPermissions(options: {
  role: BrandRole;
  overrideCanCreateReports: number | null | undefined;
  overrideCanApproveReports: number | null | undefined;
}): MembershipPermissionSnapshot {
  const defaults = defaultPermissionsForRole(options.role);

  return {
    canCreateReports:
      options.overrideCanCreateReports === null ||
      options.overrideCanCreateReports === undefined
        ? defaults.canCreateReports
        : options.overrideCanCreateReports === 1,
    canApproveReports:
      options.overrideCanApproveReports === null ||
      options.overrideCanApproveReports === undefined
        ? defaults.canApproveReports
        : options.overrideCanApproveReports === 1
  };
}

function hashPassword(plainPassword: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plainPassword, salt, 64).toString('hex');
  return `${PASSWORD_HASH_PREFIX}$${salt}$${derived}`;
}

function verifyPassword(plainPassword: string, storedHash: string) {
  const [prefix, salt, hashed] = storedHash.split('$');

  if (!prefix || !salt || !hashed || prefix !== PASSWORD_HASH_PREFIX) {
    return false;
  }

  const candidate = scryptSync(plainPassword, salt, 64);
  const source = Buffer.from(hashed, 'hex');

  if (candidate.length !== source.length) {
    return false;
  }

  return timingSafeEqual(candidate, source);
}

function resolveSignInMethodFromFlags(
  allowPassword: boolean,
  allowMicrosoft: boolean
): UserSignInMethod {
  if (allowPassword && allowMicrosoft) {
    return 'microsoft_and_password';
  }

  if (allowPassword) {
    return 'password_only';
  }

  if (allowMicrosoft) {
    return 'microsoft_only';
  }

  throw new BadRequestException(
    'At least one sign-in method must stay enabled for this account.'
  );
}

function authPolicyFromSignInMethod(signInMethod: UserSignInMethod): {
  allowPassword: boolean;
  allowMicrosoft: boolean;
} {
  if (signInMethod === 'microsoft_and_password') {
    return {
      allowPassword: true,
      allowMicrosoft: true
    };
  }

  if (signInMethod === 'password_only') {
    return {
      allowPassword: true,
      allowMicrosoft: false
    };
  }

  return {
    allowPassword: false,
    allowMicrosoft: true
  };
}

function toTinyIntFlag(value: boolean) {
  return value ? 1 : 0;
}

function normalizeBooleanInput(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  return false;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService
  ) {}

  async listUsers() {
    await this.ensureAuthStorage();
    await this.ensureMembershipPermissionStorage();
    await this.ensureBootstrapSuperAdminStorage();
    await this.ensureGlobalAdminStorage();
    const bootstrapStatus = await this.resolveBootstrapStatus();
    const users = await this.prisma.user.findMany({
      include: {
        brandMemberships: {
          include: {
            brand: true
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
        }
      },
      orderBy: [{ displayName: 'asc' }, { email: 'asc' }]
    });
    const authByUserId = await this.getAuthByUserId(users.map(user => user.id));
    const globalAdminUserIdSet = await this.getGlobalAdminUserIdSet(
      users.map(user => user.id)
    );
    const permissionByMembershipKey = await this.getMembershipPermissionByPairs(
      users.flatMap(user =>
        user.brandMemberships.map(membership => ({
          brandId: membership.brandId,
          userId: membership.userId
        }))
      )
    );

    return users.map(user => {
      const auth = authByUserId.get(user.id);
      const authPolicy = this.resolveAuthPolicy(auth);
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
        hasPassword: !!auth?.password_hash,
        microsoftLinked: !!auth?.microsoft_oid,
        allowPassword: authPolicy.allowPassword,
        allowMicrosoft: authPolicy.allowMicrosoft,
        signInMethod: authPolicy.signInMethod,
        memberships: user.brandMemberships.map(membership => ({
          id: membership.id,
          role: membership.role,
          permissions: resolveMembershipPermissions({
            role: membership.role,
            overrideCanCreateReports: permissionByMembershipKey.get(
              this.membershipPermissionKey(membership.brandId, membership.userId)
            )?.can_create_reports,
            overrideCanApproveReports: permissionByMembershipKey.get(
              this.membershipPermissionKey(membership.brandId, membership.userId)
            )?.can_approve_reports
          }),
          brand: {
            id: membership.brand.id,
            code: membership.brand.code,
            name: membership.brand.name,
            status: membership.brand.status
          }
        })),
        isGlobalAdmin: globalAdminUserIdSet.has(user.id),
        isBootstrapSuperAdmin: bootstrapStatus.bootstrapSuperAdminUserId === user.id,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      };
    });
  }

  async getCurrentUser(userId: string) {
    await this.ensureAuthStorage();
    await this.ensureMembershipPermissionStorage();
    await this.ensureBootstrapSuperAdminStorage();
    await this.ensureGlobalAdminStorage();

    const bootstrapStatus = await this.resolveBootstrapStatus();
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId
      },
      include: {
        brandMemberships: {
          include: {
            brand: true
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const auth = (await this.getAuthByUserId([user.id])).get(user.id);
    const globalAdminUserIdSet = await this.getGlobalAdminUserIdSet([user.id]);
    const permissionByMembershipKey = await this.getMembershipPermissionByPairs(
      user.brandMemberships.map(membership => ({
        brandId: membership.brandId,
        userId: membership.userId
      }))
    );
    const authPolicy = this.resolveAuthPolicy(auth);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      hasPassword: !!auth?.password_hash,
      microsoftLinked: !!auth?.microsoft_oid,
      allowPassword: authPolicy.allowPassword,
      allowMicrosoft: authPolicy.allowMicrosoft,
      signInMethod: authPolicy.signInMethod,
      memberships: user.brandMemberships.map(membership => ({
        id: membership.id,
        role: membership.role,
        permissions: resolveMembershipPermissions({
          role: membership.role,
          overrideCanCreateReports: permissionByMembershipKey.get(
            this.membershipPermissionKey(membership.brandId, membership.userId)
          )?.can_create_reports,
          overrideCanApproveReports: permissionByMembershipKey.get(
            this.membershipPermissionKey(membership.brandId, membership.userId)
          )?.can_approve_reports
        }),
        brand: {
          id: membership.brand.id,
          code: membership.brand.code,
          name: membership.brand.name,
          status: membership.brand.status
        }
      })),
      isGlobalAdmin: globalAdminUserIdSet.has(user.id),
      isBootstrapSuperAdmin: bootstrapStatus.bootstrapSuperAdminUserId === user.id,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }

  async getBootstrapStatus(): Promise<BootstrapStatusResponse> {
    await this.ensureBootstrapSuperAdminStorage();
    await this.ensureGlobalAdminStorage();
    const status = await this.resolveBootstrapStatus();

    return {
      mode: status.mode,
      setupRequired: status.setupRequired,
      enforceSetup: status.enforceSetup,
      hasBootstrapSuperAdmin: status.hasBootstrapSuperAdmin,
      activeAdminCount: status.activeAdminCount,
      reason: status.reason
    };
  }

  async bootstrapSuperAdmin(input: BootstrapSuperAdminInput) {
    await this.ensureAuthStorage();
    await this.ensureMembershipPermissionStorage();
    await this.ensureBootstrapSuperAdminStorage();
    await this.ensureGlobalAdminStorage();

    const status = await this.resolveBootstrapStatus();
    if (status.hasBootstrapSuperAdmin) {
      throw new ConflictException('Bootstrap Super Admin is already configured.');
    }

    if (!status.setupRequired) {
      throw new ConflictException('Super Admin setup is not required right now.');
    }

    const email = normalizeEmail(String(input.email ?? ''));
    const displayName = normalizeText(String(input.displayName ?? ''));
    const password = String(input.password ?? '').trim();

    if (!email || !email.includes('@')) {
      throw new BadRequestException('Valid email is required.');
    }

    if (!displayName) {
      throw new BadRequestException('Display name is required.');
    }

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      );
    }

    const brands = await this.prisma.brand.findMany({
      select: {
        id: true,
        code: true
      },
      orderBy: {
        code: 'asc'
      }
    });

    const bootstrapResult = await this.prisma.$transaction(async tx => {
      const existingBootstrapRows = await tx.$queryRawUnsafe<RawBootstrapSuperAdminRow[]>(
        `
        SELECT id, user_id
        FROM system_bootstrap_super_admin
        WHERE id = 1
        LIMIT 1
        `
      );
      if (existingBootstrapRows.length > 0) {
        const existingBootstrapUser = await tx.user.findUnique({
          where: {
            id: existingBootstrapRows[0].user_id
          },
          select: {
            status: true
          }
        });
        if (existingBootstrapUser?.status === UserStatus.active) {
          throw new ConflictException('Bootstrap Super Admin is already configured.');
        }

        await tx.$executeRawUnsafe(
          `
          DELETE FROM system_bootstrap_super_admin
          WHERE id = 1
          `
        );
      }

      const existingUserByEmail = await tx.user.findUnique({
        where: {
          email
        },
        select: {
          id: true,
          displayName: true,
          status: true
        }
      });

      const recoveredExistingUser = existingUserByEmail !== null;
      let userId = existingUserByEmail?.id ?? null;
      if (!userId) {
        const user = await tx.user.create({
          data: {
            email,
            displayName,
            status: UserStatus.active
          }
        });
        userId = user.id;
      } else if (
        existingUserByEmail?.displayName !== displayName ||
        existingUserByEmail?.status !== UserStatus.active
      ) {
        await tx.user.update({
          where: {
            id: userId
          },
          data: {
            displayName,
            status: UserStatus.active
          }
        });
      }

      await this.upsertAuthCredentialWithClient(tx, {
        userId,
        passwordHash: hashPassword(password),
        allowPassword: true,
        allowMicrosoft: false
      });
      await this.setGlobalAdminWithClient(tx, {
        userId,
        isGlobalAdmin: true
      });

      if (brands.length > 0) {
        for (const brand of brands) {
          await tx.brandMembership.upsert({
            where: {
              brand_membership_brand_user_role_unique: {
                brandId: brand.id,
                userId,
                role: BrandRole.admin
              }
            },
            update: {},
            create: {
              brandId: brand.id,
              userId,
              role: BrandRole.admin
            }
          });

          await this.upsertMembershipPermissionWithClient(tx, {
            brandId: brand.id,
            userId,
            canCreateReports: true,
            canApproveReports: true
          });
        }
      }

      await tx.$executeRawUnsafe(
        `
        INSERT INTO system_bootstrap_super_admin (id, user_id)
        VALUES (1, ?)
        ON DUPLICATE KEY UPDATE
          user_id = VALUES(user_id),
          updated_at = CURRENT_TIMESTAMP(3)
        `,
        userId
      );

      return {
        userId,
        recoveredExistingUser
      };
    }).catch((error) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This email is already used by another user.');
      }
      throw error;
    });

    const createdUser = await this.getUserByIdOrThrow(bootstrapResult.userId);

    await this.auditLogService.append({
      actionKey: 'SUPER_ADMIN_BOOTSTRAPPED',
      entityType: 'USER',
      entityId: createdUser.id,
      entityLabel: createdUser.displayName,
      summary: `Created Bootstrap Super Admin "${createdUser.displayName}".`,
      metadata: {
        email: createdUser.email,
        brandCount: brands.length,
        mode: status.mode,
        recoveredExistingUser: bootstrapResult.recoveredExistingUser
      }
    });

    return {
      user: createdUser,
      bootstrapCompleted: true
    };
  }

  async createUser(input: CreateUserInput) {
    await this.ensureAuthStorage();
    await this.ensureMembershipPermissionStorage();
    await this.ensureGlobalAdminStorage();

    const email = normalizeEmail(String(input.email ?? ''));
    const displayName = normalizeText(String(input.displayName ?? ''));
    const status = assertAllowedStatus(input.status) ?? UserStatus.active;
    const signInMethod =
      assertAllowedSignInMethod(input.signInMethod) ??
      (String(input.password ?? '').trim()
        ? 'microsoft_and_password'
        : 'microsoft_only');
    const password = String(input.password ?? '').trim();
    const authPolicy = authPolicyFromSignInMethod(signInMethod);
    const shouldBeGlobalAdmin = normalizeBooleanInput(input.globalAdmin);
    const memberships = await this.expandMembershipsByRole(
      this.normalizeMembershipInput(input.memberships ?? [])
    );

    if (!email || !email.includes('@')) {
      throw new BadRequestException('Valid email is required.');
    }

    if (!displayName) {
      throw new BadRequestException('Display name is required.');
    }

    if (authPolicy.allowPassword) {
      if (!password) {
        throw new BadRequestException(
          'Password is required for Password only or Microsoft + Password accounts.'
        );
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new BadRequestException(
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        );
      }
    } else if (password) {
      throw new BadRequestException('Password is not allowed for Microsoft only accounts.');
    }

    const membershipBrandMap = await this.resolveMembershipBrands(memberships);
    let createdUserId: string | null = null;

    try {
      await this.prisma.$transaction(async tx => {
        const user = await tx.user.create({
          data: {
            email,
            displayName,
            status
          }
        });
        createdUserId = user.id;

        await this.upsertAuthCredentialWithClient(tx, {
          userId: user.id,
          passwordHash: authPolicy.allowPassword ? hashPassword(password) : null,
          allowPassword: authPolicy.allowPassword,
          allowMicrosoft: authPolicy.allowMicrosoft
        });
        await this.setGlobalAdminWithClient(tx, {
          userId: user.id,
          isGlobalAdmin: shouldBeGlobalAdmin
        });

        if (memberships.length > 0) {
          await tx.brandMembership.createMany({
            data: memberships.map(membership => ({
              userId: user.id,
              brandId: membershipBrandMap.get(membership.brandCode)!,
              role: membership.role
            }))
          });

          for (const membership of memberships) {
            await this.upsertMembershipPermissionWithClient(tx, {
              brandId: membershipBrandMap.get(membership.brandCode)!,
              userId: user.id,
              canCreateReports: membership.permissions?.canCreateReports,
              canApproveReports: membership.permissions?.canApproveReports
            });
          }
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This email is already used by another user.');
      }

      throw error;
    }

    if (!createdUserId) {
      throw new BadRequestException('Unable to create user.');
    }

    const createdUser = await this.getUserByIdOrThrow(createdUserId);
    const primaryRole = createdUser.memberships[0]?.role ?? 'viewer';

    await this.auditLogService.append({
      actionKey: 'USER_CREATED',
      entityType: 'USER',
      entityId: createdUser.id,
      entityLabel: createdUser.displayName,
      summary: `Created user "${createdUser.displayName}" (${primaryRole}).`,
      metadata: {
        email: createdUser.email,
        status: createdUser.status,
        signInMethod: createdUser.signInMethod,
        membershipCount: createdUser.memberships.length
      },
      actor: {
        actorName: input.actorName,
        actorEmail: input.actorEmail
      }
    });

    return createdUser;
  }

  async updateUser(
    userId: string,
    input: UpdateUserInput,
    actorUser?: AuthenticatedRequestUser
  ) {
    await this.ensureAuthStorage();
    await this.ensureMembershipPermissionStorage();
    await this.ensureBootstrapSuperAdminStorage();
    await this.ensureGlobalAdminStorage();
    const existing = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existing) {
      throw new NotFoundException('User was not found.');
    }
    const bootstrapStatus = await this.resolveBootstrapStatus();
    const isBootstrapSuperAdmin = bootstrapStatus.bootstrapSuperAdminUserId === userId;

    const existingAuth = (await this.getAuthByUserId([userId])).get(userId);
    const existingGlobalAdminSet = await this.getGlobalAdminUserIdSet([userId]);
    const existingIsGlobalAdmin = existingGlobalAdminSet.has(userId);
    const currentAuthPolicy = this.resolveAuthPolicy(existingAuth);

    const nextEmail =
      input.email !== undefined ? normalizeEmail(input.email) : undefined;
    const nextDisplayName =
      input.displayName !== undefined
        ? normalizeText(input.displayName)
        : undefined;
    const nextStatus = assertAllowedStatus(input.status);
    const nextSignInMethod = assertAllowedSignInMethod(input.signInMethod);
    const password = input.password !== undefined ? input.password.trim() : undefined;
    const nextAuthPolicy = nextSignInMethod
      ? authPolicyFromSignInMethod(nextSignInMethod)
      : password && !currentAuthPolicy.allowPassword
        ? {
            allowPassword: true,
            allowMicrosoft: currentAuthPolicy.allowMicrosoft
          }
        : currentAuthPolicy;
    const nextResolvedSignInMethod = resolveSignInMethodFromFlags(
      nextAuthPolicy.allowPassword,
      nextAuthPolicy.allowMicrosoft
    );
    const requestedNextGlobalAdmin =
      input.globalAdmin !== undefined
        ? normalizeBooleanInput(input.globalAdmin)
        : existingIsGlobalAdmin;
    const nextGlobalAdmin = isBootstrapSuperAdmin ? true : requestedNextGlobalAdmin;
    const replaceMemberships = input.replaceMemberships === true;
    const memberships =
      input.memberships !== undefined
        ? await this.expandMembershipsByRole(
            this.normalizeMembershipInput(input.memberships)
          )
        : undefined;
    const membershipBrandMap =
      memberships !== undefined
        ? await this.resolveMembershipBrands(memberships)
        : new Map<string, string>();
    const statusChanged = nextStatus !== undefined && nextStatus !== existing.status;
    const signInMethodChanged =
      nextResolvedSignInMethod !== currentAuthPolicy.signInMethod;
    const changedFields: string[] = [];
    if (nextDisplayName !== undefined && nextDisplayName !== existing.displayName) {
      changedFields.push('displayName');
    }
    if (nextEmail !== undefined && nextEmail !== existing.email) {
      changedFields.push('email');
    }
    if (memberships !== undefined) {
      changedFields.push(replaceMemberships ? 'memberships(replaced)' : 'memberships');
    }
    if (nextGlobalAdmin !== existingIsGlobalAdmin) {
      changedFields.push('globalAdmin');
    }
    if (password !== undefined) {
      changedFields.push('password');
    }
    const hasGeneralUpdate = changedFields.length > 0;

    if (nextEmail !== undefined && (!nextEmail || !nextEmail.includes('@'))) {
      throw new BadRequestException('Valid email is required.');
    }

    if (nextDisplayName !== undefined && !nextDisplayName) {
      throw new BadRequestException('Display name cannot be empty.');
    }

    if (password && password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      );
    }

    const nextPasswordHash =
      password !== undefined
        ? password
          ? hashPassword(password)
          : null
        : nextAuthPolicy.allowPassword
          ? existingAuth?.password_hash ?? null
          : null;

    if (nextAuthPolicy.allowPassword && !nextPasswordHash) {
      throw new BadRequestException(
        'Password is required for Password only or Microsoft + Password accounts.'
      );
    }

    if (!nextAuthPolicy.allowPassword && password) {
      throw new BadRequestException('Password is not allowed for Microsoft only accounts.');
    }

    if (
      actorUser?.id === userId &&
      nextStatus !== undefined &&
      nextStatus !== UserStatus.active
    ) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    if (isBootstrapSuperAdmin && nextStatus && nextStatus !== UserStatus.active) {
      throw new BadRequestException('Bootstrap Super Admin account must remain active.');
    }

    if (
      isBootstrapSuperAdmin &&
      (!nextAuthPolicy.allowPassword || nextAuthPolicy.allowMicrosoft)
    ) {
      throw new BadRequestException(
        'Bootstrap Super Admin must remain Password only.'
      );
    }

    if (isBootstrapSuperAdmin && memberships !== undefined) {
      const hasAdminRole = memberships.some((membership) => membership.role === BrandRole.admin);
      if (!hasAdminRole) {
        throw new BadRequestException('Bootstrap Super Admin must retain admin role.');
      }
    }

    try {
      await this.prisma.$transaction(async tx => {
        const updatePayload: {
          email?: string;
          displayName?: string;
          status?: UserStatus;
        } = {};

        if (nextEmail !== undefined) {
          updatePayload.email = nextEmail;
        }

        if (nextDisplayName !== undefined) {
          updatePayload.displayName = nextDisplayName;
        }

        if (nextStatus !== undefined) {
          updatePayload.status = nextStatus;
        }

        if (Object.keys(updatePayload).length > 0) {
          await tx.user.update({
            where: { id: userId },
            data: updatePayload
          });
        }

        if (password !== undefined || nextSignInMethod !== undefined || existingAuth) {
          await this.upsertAuthCredentialWithClient(tx, {
            userId,
            passwordHash: nextPasswordHash,
            allowPassword: nextAuthPolicy.allowPassword,
            allowMicrosoft: nextAuthPolicy.allowMicrosoft
          });
        }
        await this.setGlobalAdminWithClient(tx, {
          userId,
          isGlobalAdmin: nextGlobalAdmin
        });

        if (memberships !== undefined) {
          if (replaceMemberships) {
            await tx.brandMembership.deleteMany({
              where: { userId }
            });
            await tx.$executeRawUnsafe(
              `
              DELETE FROM brand_membership_permissions
              WHERE user_id = ?
              `,
              userId
            );
          }

          for (const membership of memberships) {
            const brandId = membershipBrandMap.get(membership.brandCode)!;
            await tx.brandMembership.upsert({
              where: {
                brand_membership_brand_user_role_unique: {
                  brandId,
                  userId,
                  role: membership.role
                }
              },
              update: {},
              create: {
                brandId,
                userId,
                role: membership.role
              }
            });

            await this.upsertMembershipPermissionWithClient(tx, {
              brandId,
              userId,
              canCreateReports: membership.permissions?.canCreateReports,
              canApproveReports: membership.permissions?.canApproveReports
            });
          }
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This email is already used by another user.');
      }

      throw error;
    }

    const updatedUser = await this.getUserByIdOrThrow(userId);
    const actor = {
      actorName: input.actorName,
      actorEmail: input.actorEmail
    };

    if (statusChanged) {
      await this.auditLogService.append({
        actionKey: 'USER_STATUS_CHANGED',
        entityType: 'USER',
        entityId: updatedUser.id,
        entityLabel: updatedUser.displayName,
        summary: `Changed user status for "${updatedUser.displayName}" from ${existing.status} to ${updatedUser.status}.`,
        metadata: {
          from: existing.status,
          to: updatedUser.status
        },
        actor
      });
    }

    if (signInMethodChanged) {
      await this.auditLogService.append({
        actionKey: 'USER_SIGNIN_METHOD_CHANGED',
        entityType: 'USER',
        entityId: updatedUser.id,
        entityLabel: updatedUser.displayName,
        summary: `Changed sign-in method for "${updatedUser.email}" from ${currentAuthPolicy.signInMethod} to ${updatedUser.signInMethod}.`,
        metadata: {
          from: currentAuthPolicy.signInMethod,
          to: updatedUser.signInMethod
        },
        actor
      });
    }

    if (hasGeneralUpdate) {
      await this.auditLogService.append({
        actionKey: 'USER_UPDATED',
        entityType: 'USER',
        entityId: updatedUser.id,
        entityLabel: updatedUser.displayName,
        summary: `Updated user "${updatedUser.displayName}".`,
        metadata: {
          changedFields
        },
        actor
      });
    }

    return updatedUser;
  }

  async deleteUser(userId: string, input?: DeleteUserInput) {
    await this.ensureAuthStorage();
    await this.ensureBootstrapSuperAdminStorage();
    await this.ensureGlobalAdminStorage();
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User was not found.');
    }
    const bootstrapStatus = await this.resolveBootstrapStatus();
    if (bootstrapStatus.bootstrapSuperAdminUserId === userId) {
      throw new BadRequestException('Bootstrap Super Admin account cannot be deleted.');
    }

    await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        `
        DELETE FROM brand_membership_permissions
        WHERE user_id = ?
        `,
        userId
      );

      await tx.$executeRawUnsafe(
        `
        DELETE FROM user_auth_credentials
        WHERE user_id = ?
        `,
        userId
      );
      await tx.$executeRawUnsafe(
        `
        DELETE FROM system_global_admin_users
        WHERE user_id = ?
        `,
        userId
      );

      await tx.user.delete({
        where: { id: userId }
      });
    });

    await this.auditLogService.append({
      actionKey: 'USER_DELETED',
      entityType: 'USER',
      entityId: user.id,
      entityLabel: user.displayName,
      summary: `Deleted user "${user.displayName}".`,
      metadata: {
        email: user.email
      },
      actor: {
        actorName: input?.actorName,
        actorEmail: input?.actorEmail
      }
    });

    return {
      deleted: true
    };
  }

  async passwordLogin(input: PasswordLoginInput) {
    await this.ensureAuthStorage();
    const email = normalizeEmail(String(input.email ?? ''));
    const password = String(input.password ?? '');

    if (!email || !password) {
      throw new BadRequestException('Email and password are required.');
    }

    if (isProductionRuntime() && isLocalSeedEmail(email)) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status !== UserStatus.active) {
      throw new ConflictException('This account is not active.');
    }

    const authRows = await this.prisma.$queryRawUnsafe<RawAuthCredentialRow[]>(
      `
      SELECT user_id, password_hash, microsoft_oid, allow_password, allow_microsoft
      FROM user_auth_credentials
      WHERE user_id = ?
      LIMIT 1
      `,
      user.id
    );
    const auth = authRows[0] ?? null;
    const authPolicy = this.resolveAuthPolicy(auth);

    if (!authPolicy.allowPassword) {
      throw new UnauthorizedException(
        'Password sign-in is disabled for this account.'
      );
    }

    if (!auth?.password_hash) {
      throw new UnauthorizedException('Password login is not configured for this account.');
    }

    if (!verifyPassword(password, auth.password_hash)) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status
    };
  }

  async microsoftLogin(input: MicrosoftLoginInput) {
    await this.ensureAuthStorage();
    const oid = normalizeText(String(input.oid ?? ''));
    const email = normalizeEmail(String(input.email ?? ''));
    const displayName = normalizeText(String(input.displayName ?? ''));

    if (!oid) {
      throw new BadRequestException('Microsoft OID is required.');
    }

    if (isProductionRuntime() && email && isLocalSeedEmail(email)) {
      throw new UnauthorizedException('This Microsoft account is not linked yet.');
    }

    const linkedRows = await this.prisma.$queryRawUnsafe<RawAuthCredentialRow[]>(
      `
      SELECT user_id, password_hash, microsoft_oid, allow_password, allow_microsoft
      FROM user_auth_credentials
      WHERE microsoft_oid = ?
      LIMIT 1
      `,
      oid
    );
    const linked = linkedRows[0] ?? null;

    if (linked) {
      const user = await this.prisma.user.findUnique({
        where: { id: linked.user_id }
      });

      if (!user) {
        throw new UnauthorizedException('Linked user account no longer exists.');
      }

      if (isProductionRuntime() && isLocalSeedEmail(user.email)) {
        throw new UnauthorizedException('This Microsoft account is not linked yet.');
      }

      if (user.status !== UserStatus.active) {
        throw new ConflictException('This account is not active.');
      }

      if (!this.resolveAuthPolicy(linked).allowMicrosoft) {
        throw new UnauthorizedException(
          'Microsoft sign-in is disabled for this account.'
        );
      }

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        status: user.status
      };
    }

    if (!email) {
      throw new UnauthorizedException('This Microsoft account is not linked yet.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new UnauthorizedException('This Microsoft account is not linked yet.');
    }

    if (user.status !== UserStatus.active) {
      throw new ConflictException('This account is not active.');
    }

    const auth = (await this.getAuthByUserId([user.id])).get(user.id);
    const authPolicy = this.resolveAuthPolicy(auth);

    if (!authPolicy.allowMicrosoft) {
      throw new UnauthorizedException('Microsoft sign-in is disabled for this account.');
    }

    await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        `
        INSERT INTO user_auth_credentials (
          user_id,
          microsoft_oid,
          allow_password,
          allow_microsoft
        ) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          microsoft_oid = VALUES(microsoft_oid),
          allow_password = VALUES(allow_password),
          allow_microsoft = VALUES(allow_microsoft),
          updated_at = CURRENT_TIMESTAMP(3)
        `,
        user.id,
        oid,
        toTinyIntFlag(authPolicy.allowPassword),
        toTinyIntFlag(authPolicy.allowMicrosoft)
      );

      if (displayName && displayName !== user.displayName) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            displayName
          }
        });
      }
    });

    return {
      id: user.id,
      email: user.email,
      displayName: displayName || user.displayName,
      status: user.status
    };
  }

  private async getUserByIdOrThrow(userId: string) {
    const users = await this.listUsers();
    const user = users.find(item => item.id === userId) ?? null;

    if (!user) {
      throw new NotFoundException('User was not found.');
    }

    return user;
  }

  private resolveAuthPolicy(auth: RawAuthCredentialRow | null | undefined): AuthPolicySnapshot {
    const allowPassword =
      auth?.allow_password === null || auth?.allow_password === undefined
        ? !!auth?.password_hash
        : auth.allow_password === 1;
    const allowMicrosoft =
      auth?.allow_microsoft === null || auth?.allow_microsoft === undefined
        ? true
        : auth.allow_microsoft === 1;

    return {
      allowPassword,
      allowMicrosoft,
      signInMethod: resolveSignInMethodFromFlags(allowPassword, allowMicrosoft)
    };
  }

  private async upsertAuthCredentialWithClient(
    client: Prisma.TransactionClient,
    input: {
      userId: string;
      passwordHash: string | null;
      allowPassword: boolean;
      allowMicrosoft: boolean;
    }
  ) {
    await client.$executeRawUnsafe(
      `
      INSERT INTO user_auth_credentials (
        user_id,
        password_hash,
        allow_password,
        allow_microsoft
      ) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        allow_password = VALUES(allow_password),
        allow_microsoft = VALUES(allow_microsoft),
        updated_at = CURRENT_TIMESTAMP(3)
      `,
      input.userId,
      input.passwordHash,
      toTinyIntFlag(input.allowPassword),
      toTinyIntFlag(input.allowMicrosoft)
    );
  }

  private normalizeMembershipInput(memberships: UserMembershipInput[]) {
    const normalized = memberships
      .map(membership => ({
        brandCode: normalizeText(String(membership.brandCode ?? '')),
        role: assertAllowedRole(String(membership.role ?? '')),
        permissions: {
          canCreateReports:
            typeof membership.permissions?.canCreateReports === 'boolean'
              ? membership.permissions.canCreateReports
              : undefined,
          canApproveReports:
            typeof membership.permissions?.canApproveReports === 'boolean'
              ? membership.permissions.canApproveReports
              : undefined
        }
      }))
      .filter(membership => membership.brandCode);

    const deduped = new Map<
      string,
      {
        brandCode: string;
        role: BrandRole;
        permissions: {
          canCreateReports?: boolean;
          canApproveReports?: boolean;
        };
      }
    >();
    for (const membership of normalized) {
      deduped.set(`${membership.brandCode}::${membership.role}`, {
        ...membership,
        permissions: this.normalizePermissionsByRole(
          membership.role,
          membership.permissions
        )
      });
    }

    return Array.from(deduped.values());
  }

  private normalizePermissionsByRole(
    role: BrandRole,
    permissions: {
      canCreateReports?: boolean;
      canApproveReports?: boolean;
    }
  ) {
    const defaults = defaultPermissionsForRole(role);
    const createCandidate =
      typeof permissions.canCreateReports === 'boolean'
        ? permissions.canCreateReports
        : defaults.canCreateReports;
    const approveCandidate =
      typeof permissions.canApproveReports === 'boolean'
        ? permissions.canApproveReports
        : defaults.canApproveReports;

    if (role === BrandRole.admin) {
      return {
        canCreateReports: true,
        canApproveReports: true
      };
    }

    if (role === BrandRole.content) {
      return {
        canCreateReports: createCandidate,
        canApproveReports: false
      };
    }

    if (role === BrandRole.approver) {
      return {
        canCreateReports: createCandidate,
        canApproveReports: approveCandidate
      };
    }

    return {
      canCreateReports: false,
      canApproveReports: false
    };
  }

  private async expandMembershipsByRole(
    memberships: Array<{
      brandCode: string;
      role: BrandRole;
      permissions: {
        canCreateReports?: boolean;
        canApproveReports?: boolean;
      };
    }>
  ) {
    const hasAdminRole = memberships.some(
      (membership) => membership.role === BrandRole.admin
    );

    if (!hasAdminRole) {
      return memberships;
    }

    const brands = await this.prisma.brand.findMany({
      select: {
        code: true
      },
      orderBy: {
        code: 'asc'
      }
    });
    const adminPermissions = this.normalizePermissionsByRole(BrandRole.admin, {});

    return brands.map((brand) => ({
      brandCode: brand.code,
      role: BrandRole.admin,
      permissions: adminPermissions
    }));
  }

  private async resolveMembershipBrands(
    memberships: Array<{
      brandCode: string;
      role: BrandRole;
      permissions: {
        canCreateReports?: boolean;
        canApproveReports?: boolean;
      };
    }>
  ) {
    const uniqueCodes = Array.from(new Set(memberships.map(membership => membership.brandCode)));

    if (uniqueCodes.length === 0) {
      return new Map<string, string>();
    }

    const brands = await this.prisma.brand.findMany({
      where: {
        code: {
          in: uniqueCodes
        }
      },
      select: {
        id: true,
        code: true
      }
    });
    const brandMap = new Map(brands.map(brand => [brand.code, brand.id]));

    for (const code of uniqueCodes) {
      if (!brandMap.has(code)) {
        throw new BadRequestException(`Brand "${code}" was not found.`);
      }
    }

    return brandMap;
  }

  private async getAuthByUserId(userIds: string[]) {
    if (userIds.length === 0) {
      return new Map<string, RawAuthCredentialRow>();
    }

    const placeholders = userIds.map(() => '?').join(', ');
    const rows = await this.prisma.$queryRawUnsafe<RawAuthCredentialRow[]>(
      `
      SELECT user_id, password_hash, microsoft_oid, allow_password, allow_microsoft
      FROM user_auth_credentials
      WHERE user_id IN (${placeholders})
      `,
      ...userIds
    );

    return new Map(rows.map(row => [row.user_id, row]));
  }

  private membershipPermissionKey(brandId: string, userId: string) {
    return `${brandId}::${userId}`;
  }

  private async getMembershipPermissionByPairs(
    pairs: Array<{
      brandId: string;
      userId: string;
    }>
  ) {
    if (pairs.length === 0) {
      return new Map<string, RawMembershipPermissionRow>();
    }

    const uniqueUserIds = Array.from(new Set(pairs.map(pair => pair.userId)));
    const userIdPlaceholders = uniqueUserIds.map(() => '?').join(', ');
    const rows = await this.prisma.$queryRawUnsafe<RawMembershipPermissionRow[]>(
      `
      SELECT brand_id, user_id, can_create_reports, can_approve_reports
      FROM brand_membership_permissions
      WHERE user_id IN (${userIdPlaceholders})
      `,
      ...uniqueUserIds
    );
    const allowedKeys = new Set(
      pairs.map(pair => this.membershipPermissionKey(pair.brandId, pair.userId))
    );

    return new Map(
      rows
        .filter(row => allowedKeys.has(this.membershipPermissionKey(row.brand_id, row.user_id)))
        .map(row => [this.membershipPermissionKey(row.brand_id, row.user_id), row] as const)
    );
  }

  private async upsertMembershipPermissionWithClient(
    client: Prisma.TransactionClient,
    input: {
      brandId: string;
      userId: string;
      canCreateReports: boolean | undefined;
      canApproveReports: boolean | undefined;
    }
  ) {
    await client.$executeRawUnsafe(
      `
      INSERT INTO brand_membership_permissions (
        brand_id,
        user_id,
        can_create_reports,
        can_approve_reports
      ) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        can_create_reports = VALUES(can_create_reports),
        can_approve_reports = VALUES(can_approve_reports),
        updated_at = CURRENT_TIMESTAMP(3)
      `,
      input.brandId,
      input.userId,
      input.canCreateReports === undefined ? null : input.canCreateReports ? 1 : 0,
      input.canApproveReports === undefined ? null : input.canApproveReports ? 1 : 0
    );
  }

  private resolveBootstrapSetupMode(): BootstrapSetupMode {
    const raw = normalizeText(String(process.env.SUPER_ADMIN_SETUP_MODE ?? '')).toLowerCase();

    if (raw === 'force') {
      return 'force';
    }

    if (raw === 'disabled') {
      return 'disabled';
    }

    if (isTrueFlag(process.env.SUPER_ADMIN_SETUP_FORCE)) {
      return 'force';
    }

    return 'auto';
  }

  private async resolveBootstrapStatus(): Promise<BootstrapStatusSnapshot> {
    const mode = this.resolveBootstrapSetupMode();
    const activeAdminUserIds = await this.listActiveAdminUserIds();
    const activeAdminCount = activeAdminUserIds.length;
    const rows = await this.prisma.$queryRawUnsafe<RawBootstrapSuperAdminRow[]>(
      `
      SELECT id, user_id
      FROM system_bootstrap_super_admin
      WHERE id = 1
      LIMIT 1
      `
    );
    let bootstrapUserId: string | null = rows[0]?.user_id ?? null;
    if (bootstrapUserId) {
      const bootstrapUser = await this.prisma.user.findUnique({
        where: {
          id: bootstrapUserId
        },
        select: {
          id: true,
          status: true
        }
      });
      if (!bootstrapUser || bootstrapUser.status !== UserStatus.active) {
        bootstrapUserId = null;
      }
    }
    const hasBootstrapSuperAdmin = !!bootstrapUserId;

    if (mode === 'disabled') {
      return {
        mode,
        setupRequired: false,
        enforceSetup: false,
        hasBootstrapSuperAdmin,
        bootstrapSuperAdminUserId: bootstrapUserId,
        activeAdminCount,
        reason: 'disabled'
      };
    }

    if (mode === 'force' && !hasBootstrapSuperAdmin) {
      return {
        mode,
        setupRequired: true,
        enforceSetup: false,
        hasBootstrapSuperAdmin: false,
        bootstrapSuperAdminUserId: null,
        activeAdminCount,
        reason: 'forced_for_testing'
      };
    }

    if (!hasBootstrapSuperAdmin && activeAdminCount === 0) {
      return {
        mode,
        setupRequired: true,
        enforceSetup: true,
        hasBootstrapSuperAdmin: false,
        bootstrapSuperAdminUserId: null,
        activeAdminCount,
        reason: 'missing_bootstrap_super_admin'
      };
    }

    return {
      mode,
      setupRequired: false,
      enforceSetup: false,
      hasBootstrapSuperAdmin,
      bootstrapSuperAdminUserId: bootstrapUserId,
      activeAdminCount,
      reason: 'ready'
    };
  }

  private async listActiveAdminUserIds() {
    const adminMemberships = await this.prisma.brandMembership.findMany({
      where: {
        role: BrandRole.admin
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });
    const globalAdminRows = await this.prisma.$queryRawUnsafe<RawGlobalAdminRow[]>(
      `
      SELECT user_id
      FROM system_global_admin_users
      `
    );
    const userIds = Array.from(
      new Set([
        ...adminMemberships.map((membership) => membership.userId),
        ...globalAdminRows.map((row) => row.user_id)
      ])
    );

    if (userIds.length === 0) {
      return [];
    }

    const activeUsers = await this.prisma.user.findMany({
      where: {
        id: {
          in: userIds
        },
        status: UserStatus.active
      },
      select: {
        id: true
      }
    });

    return activeUsers.map((user) => user.id);
  }

  private async getGlobalAdminUserIdSet(userIds: string[]) {
    if (userIds.length === 0) {
      return new Set<string>();
    }

    const placeholders = userIds.map(() => '?').join(', ');
    const rows = await this.prisma.$queryRawUnsafe<RawGlobalAdminRow[]>(
      `
      SELECT user_id
      FROM system_global_admin_users
      WHERE user_id IN (${placeholders})
      `,
      ...userIds
    );

    return new Set(rows.map((row) => row.user_id));
  }

  private async setGlobalAdminWithClient(
    client: Prisma.TransactionClient,
    input: {
      userId: string;
      isGlobalAdmin: boolean;
    }
  ) {
    if (input.isGlobalAdmin) {
      await client.$executeRawUnsafe(
        `
        INSERT INTO system_global_admin_users (user_id)
        VALUES (?)
        ON DUPLICATE KEY UPDATE
          updated_at = CURRENT_TIMESTAMP(3)
        `,
        input.userId
      );
      return;
    }

    await client.$executeRawUnsafe(
      `
      DELETE FROM system_global_admin_users
      WHERE user_id = ?
      `,
      input.userId
    );
  }

  private async ensureGlobalAdminStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS system_global_admin_users (
        user_id VARCHAR(191) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  private async ensureBootstrapSuperAdminStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS system_bootstrap_super_admin (
        id TINYINT UNSIGNED NOT NULL,
        user_id VARCHAR(191) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY system_bootstrap_super_admin_user_id_key (user_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  private async ensureAuthStorage() {
    await this.prisma.$executeRawUnsafe(`
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

    await this.ensureAuthPolicyColumn('allow_password', 'password_hash');
    await this.ensureAuthPolicyColumn('allow_microsoft', 'microsoft_oid');
  }

  private async ensureMembershipPermissionStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS brand_membership_permissions (
        brand_id VARCHAR(191) NOT NULL,
        user_id VARCHAR(191) NOT NULL,
        can_create_reports TINYINT(1) NULL,
        can_approve_reports TINYINT(1) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (brand_id, user_id),
        KEY brand_membership_permissions_user_id_idx (user_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  private async ensureAuthPolicyColumn(columnName: string, afterColumn: string) {
    try {
      await this.prisma.$executeRawUnsafe(
        `
        ALTER TABLE user_auth_credentials
        ADD COLUMN ${columnName} TINYINT(1) NULL AFTER ${afterColumn}
        `
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('duplicate column name')) {
        return;
      }
      throw error;
    }
  }
}
