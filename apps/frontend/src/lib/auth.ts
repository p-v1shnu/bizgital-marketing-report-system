import { cache } from 'react';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  getBrands,
  getCurrentUser,
  getSuperAdminBootstrapStatus,
  getUsers
} from './reporting-api';
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

  if (!raw || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) {
    return '/app';
  }

  let parsed: URL;
  try {
    parsed = new URL(raw, 'https://app.local');
  } catch {
    return '/app';
  }

  if (parsed.origin !== 'https://app.local') {
    return '/app';
  }

  if (parsed.pathname !== '/app' && !parsed.pathname.startsWith('/app/')) {
    return '/app';
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
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
  let hasBootstrapSuperAdminAccess = false;

  const currentUser = await getCurrentUser().catch(() => null);
  if (currentUser && normalizeEmail(currentUser.email) === sessionEmail) {
    user = {
      id: currentUser.id,
      displayName: currentUser.displayName,
      email: normalizeEmail(currentUser.email),
      status: currentUser.status
    };
    hasBootstrapSuperAdminAccess = currentUser.isBootstrapSuperAdmin === true;

    for (const membership of currentUser.memberships) {
      const role = normalizeBrandRole(String(membership.role ?? ''));
      memberships.push({
        brandCode: membership.brand.code,
        brandName: membership.brand.name,
        role,
        permissions: resolveMembershipPermissions(role, membership.permissions)
      });
    }
  }

  if (!user) {
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
  }
  const hasAdminMembershipFromBrandLoop = memberships.some(
    (membership) => membership.role === 'admin'
  );

  if (!user || !hasAdminMembershipFromBrandLoop) {
    const users = await getUsers().catch(() => []);
    const matchedUser = users.find(
      (candidate) =>
        normalizeEmail(candidate.email) === sessionEmail && candidate.status === 'active'
    );

    if (matchedUser) {
      user = {
        id: matchedUser.id,
        displayName: matchedUser.displayName,
        email: normalizeEmail(matchedUser.email),
        status: matchedUser.status
      };
      hasBootstrapSuperAdminAccess = matchedUser.isBootstrapSuperAdmin === true;

      if (memberships.length === 0) {
        for (const membership of matchedUser.memberships) {
          const role = normalizeBrandRole(String(membership.role ?? ''));
          memberships.push({
            brandCode: membership.brand.code,
            brandName: membership.brand.name,
            role,
            permissions: resolveMembershipPermissions(role, membership.permissions)
          });
        }
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
  const hasGlobalAdminAccess = hasAdminMembership || hasBootstrapSuperAdminAccess;
  const resolvedMemberships = hasGlobalAdminAccess
    ? (brands.length > 0
        ? brands.map((brand) => ({
            brandCode: brand.code,
            brandName: brand.name,
            role: 'admin' as const,
            permissions: defaultMembershipPermissions('admin')
          }))
        : memberships.map((membership) => ({
            ...membership,
            role: 'admin' as const,
            permissions: defaultMembershipPermissions('admin')
          })))
    : memberships;

  return {
    sessionEmail,
    user: {
      ...user,
      memberships: resolvedMemberships
    },
    canAccessAdmin: hasGlobalAdminAccess
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

  if (brandMemberships.length === 0 && context.canAccessAdmin) {
    return {
      ...context,
      brandMemberships: [
        {
          brandCode,
          brandName: brandCode,
          role: 'admin' as const,
          permissions: defaultMembershipPermissions('admin')
        }
      ]
    };
  }

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
