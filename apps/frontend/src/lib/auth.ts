import { cache } from 'react';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getBrands, getSuperAdminBootstrapStatus } from './reporting-api';
import {
  AUTH_COOKIE_NAME,
  parseAuthSessionCookieValue
} from './auth-session';

type BrandRole = 'admin' | 'content' | 'approver' | 'viewer';

export type MembershipPermissions = {
  canCreateReports: boolean;
  canApproveReports: boolean;
};

type UserMembership = {
  brandCode: string;
  brandName: string;
  role: BrandRole;
  permissions: MembershipPermissions;
};

export type AuthenticatedUser = {
  id: string;
  displayName: string;
  email: string;
  status: string;
  memberships: UserMembership[];
};

type AuthContext = {
  sessionEmail: string | null;
  user: AuthenticatedUser | null;
  canAccessAdmin: boolean;
};

type LoginAccount = {
  id: string;
  displayName: string;
  email: string;
  status: string;
  roles: BrandRole[];
  brands: string[];
};

const getBrandsForAuth = cache(async () => getBrands());

export function normalizeEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

export function defaultMembershipPermissions(role: BrandRole): MembershipPermissions {
  if (role === 'admin') {
    return {
      canCreateReports: true,
      canApproveReports: true
    };
  }

  if (role === 'content') {
    return {
      canCreateReports: true,
      canApproveReports: false
    };
  }

  if (role === 'approver') {
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

function normalizeBrandRole(value: string | null | undefined): BrandRole {
  if (value === 'admin' || value === 'content' || value === 'approver') {
    return value;
  }

  return 'viewer';
}

export function resolveMembershipPermissions(
  role: BrandRole,
  permissions:
    | {
        canCreateReports?: boolean;
        canApproveReports?: boolean;
      }
    | null
    | undefined
): MembershipPermissions {
  const defaults = defaultMembershipPermissions(role);

  return {
    canCreateReports:
      typeof permissions?.canCreateReports === 'boolean'
        ? permissions.canCreateReports
        : defaults.canCreateReports,
    canApproveReports:
      typeof permissions?.canApproveReports === 'boolean'
        ? permissions.canApproveReports
        : defaults.canApproveReports
  };
}

export function getMembershipReportAccess(
  membership: {
    role: BrandRole;
    permissions?: {
      canCreateReports?: boolean;
      canApproveReports?: boolean;
    };
  } | null
) {
  if (!membership) {
    return {
      canCreateReports: false,
      canApproveReports: false,
      isReadOnly: true
    };
  }

  const permissions = resolveMembershipPermissions(membership.role, membership.permissions);
  return {
    ...permissions,
    isReadOnly: !permissions.canCreateReports
  };
}

export function sanitizeNextPath(value: string | null | undefined) {
  const raw = (value ?? '').trim();

  if (!raw.startsWith('/')) {
    return '/app';
  }

  if (raw.startsWith('//')) {
    return '/app';
  }

  return raw;
}

async function readSessionEmail() {
  const cookieStore = await cookies();
  return normalizeEmail(
    parseAuthSessionCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value)
  );
}

export async function getAuthContext(): Promise<AuthContext> {
  const sessionEmail = await readSessionEmail();

  if (!sessionEmail) {
    return {
      sessionEmail: null,
      user: null,
      canAccessAdmin: false
    };
  }

  const brands = await getBrandsForAuth().catch(() => []);
  const memberships: UserMembership[] = [];
  let user: Omit<AuthenticatedUser, 'memberships'> | null = null;

  for (const brand of brands) {
    for (const membership of brand.memberships) {
      if (normalizeEmail(membership.user.email) !== sessionEmail) {
        continue;
      }

      if (membership.user.status !== 'active') {
        continue;
      }

      const role = normalizeBrandRole(String(membership.role ?? ''));
      memberships.push({
        brandCode: brand.code,
        brandName: brand.name,
        role,
        permissions: resolveMembershipPermissions(role, membership.permissions)
      });

      if (!user) {
        user = {
          id: membership.user.id,
          displayName: membership.user.displayName,
          email: normalizeEmail(membership.user.email),
          status: membership.user.status
        };
      }
    }
  }

  if (!user) {
    return {
      sessionEmail,
      user: null,
      canAccessAdmin: false
    };
  }

  const hasAdminMembership = memberships.some(
    (membership) => membership.role === 'admin'
  );
  const resolvedMemberships = hasAdminMembership
    ? brands.map((brand) => ({
        brandCode: brand.code,
        brandName: brand.name,
        role: 'admin' as const,
        permissions: defaultMembershipPermissions('admin')
      }))
    : memberships;

  return {
    sessionEmail,
    user: {
      ...user,
      memberships: resolvedMemberships
    },
    canAccessAdmin: hasAdminMembership
  };
}

export async function requireAuth(nextPath = '/app') {
  const context = await getAuthContext();

  if (!context.user) {
    const bootstrapStatus = await getSuperAdminBootstrapStatus().catch(() => null);
    if (bootstrapStatus?.enforceSetup) {
      redirect('/setup/super-admin');
    }
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return context as AuthContext & { user: AuthenticatedUser };
}

export async function requireAnyAdmin(nextPath = '/app') {
  const context = await requireAuth(nextPath);

  if (!context.canAccessAdmin) {
    redirect('/app');
  }

  return context as AuthContext & { user: AuthenticatedUser; canAccessAdmin: true };
}

export async function requireBrandAccess(brandCode: string, nextPath = '/app') {
  const context = await requireAuth(nextPath);
  const brandMemberships = context.user.memberships.filter(
    (membership) => membership.brandCode === brandCode
  );

  if (brandMemberships.length === 0) {
    redirect('/app');
  }

  return {
    ...context,
    brandMemberships
  };
}

export async function requireBrandAdminAccess(brandCode: string, nextPath = '/app') {
  const context = await requireBrandAccess(brandCode, nextPath);

  if (!context.brandMemberships.some((membership) => membership.role === 'admin')) {
    redirect('/app');
  }

  return context;
}

export async function findLoginAccountByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const accounts = await listLoginAccounts();

  return accounts.find((account) => account.email === normalizedEmail) ?? null;
}

export async function listLoginAccounts(): Promise<LoginAccount[]> {
  const brands = await getBrandsForAuth().catch(() => []);
  const accountsByEmail = new Map<string, LoginAccount>();

  for (const brand of brands) {
    for (const membership of brand.memberships) {
      const email = normalizeEmail(membership.user.email);
      const role = normalizeBrandRole(String(membership.role ?? ''));
      const existing = accountsByEmail.get(email);

      if (existing) {
        existing.roles = Array.from(new Set([...existing.roles, role]));
        existing.brands = Array.from(new Set([...existing.brands, brand.name]));
        continue;
      }

      accountsByEmail.set(email, {
        id: membership.user.id,
        displayName: membership.user.displayName,
        email,
        status: membership.user.status,
        roles: [role],
        brands: [brand.name]
      });
    }
  }

  return [...accountsByEmail.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}
