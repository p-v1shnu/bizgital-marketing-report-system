import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BrandRole, UserStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { extractAuthSessionEmail } from './auth-session';
import type { AuthenticatedRequestUser } from './current-user.decorator';
import { PUBLIC_ROUTE_METADATA_KEY } from './public.decorator';

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveInternalApiSecret() {
  return normalizeOptionalString(process.env.INTERNAL_API_AUTH_SECRET);
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_METADATA_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      method?: string;
      params?: Record<string, string | undefined>;
      originalUrl?: string;
      url?: string;
      user?: AuthenticatedRequestUser | { internal: true };
    }>();
    const internalSecretHeader = request.headers?.['x-internal-api-secret'];
    const internalSecret = Array.isArray(internalSecretHeader)
      ? internalSecretHeader[0]
      : internalSecretHeader;
    const expectedInternalSecret = resolveInternalApiSecret();

    if (
      expectedInternalSecret &&
      normalizeOptionalString(internalSecret) === expectedInternalSecret
    ) {
      request.user = { internal: true };
      return true;
    }

    const cookieHeader = request.headers?.cookie;
    const sessionEmail = (() => {
      try {
        return extractAuthSessionEmail(
          Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes('AUTH_SESSION_SECRET')) {
          throw new ServiceUnavailableException(error.message);
        }
        throw error;
      }
    })();

    if (!sessionEmail) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        email: sessionEmail
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        brandMemberships: {
          select: {
            brandId: true,
            role: true
          }
        }
      }
    });

    if (!user || user.status !== UserStatus.active) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const userContext: AuthenticatedRequestUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      hasAdminRole: user.brandMemberships.some(
        (membership) => membership.role === BrandRole.admin
      ),
      brandMemberships: user.brandMemberships
    };
    request.user = userContext;

    await this.assertAuthorizedRequest(request, userContext);

    return true;
  }

  private async assertAuthorizedRequest(
    request: {
      method?: string;
      params?: Record<string, string | undefined>;
      originalUrl?: string;
      url?: string;
    },
    user: AuthenticatedRequestUser
  ) {
    if (user.hasAdminRole) {
      return;
    }

    const method = (request.method ?? 'GET').toUpperCase();
    const path = this.normalizeRequestPath(request.originalUrl ?? request.url ?? '');

    if (this.isAdminOnlyRoute(path, method)) {
      throw new ForbiddenException('Admin access is required.');
    }

    const params = request.params ?? {};
    const brandReference = params.brandCode ?? params.brandId;

    if (brandReference && !this.isServiceEnforcedBrandReadRoute(path, method)) {
      await this.assertCanAccessBrandReference(user, brandReference);
    }

    if (params.periodId) {
      await this.assertCanAccessReportingPeriod(user, params.periodId);
    }

    if (params.versionId) {
      await this.assertCanAccessReportVersion(user, params.versionId);
    }
  }

  private normalizeRequestPath(rawUrl: string) {
    const path = rawUrl.split('?')[0] || '/';
    const apiPrefix = `/${process.env.API_PREFIX ?? 'api'}`;

    return path.startsWith(`${apiPrefix}/`)
      ? path.slice(apiPrefix.length)
      : path;
  }

  private isAdminOnlyRoute(path: string, method: string) {
    if (path.startsWith('/admin') || path.startsWith('/config')) {
      return true;
    }

    if (
      path.startsWith('/users') &&
      !path.startsWith('/users/auth/') &&
      !path.startsWith('/users/bootstrap/')
    ) {
      return true;
    }

    if (path === '/brands') {
      return method !== 'GET';
    }

    if (/^\/brands\/[^/]+$/.test(path)) {
      return method !== 'GET';
    }

    if (/^\/brands\/[^/]+\/memberships(?:\/|$)/.test(path)) {
      return true;
    }

    if (/^\/brands\/[^/]+\/internal-options(?:\/|$)/.test(path)) {
      return method !== 'GET';
    }

    return false;
  }

  private isServiceEnforcedBrandReadRoute(path: string, method: string) {
    return method === 'GET' && /^\/brands\/[^/]+$/.test(path);
  }

  private hasBrandMembership(user: AuthenticatedRequestUser, brandId: string) {
    return user.brandMemberships.some((membership) => membership.brandId === brandId);
  }

  private async assertCanAccessBrandReference(
    user: AuthenticatedRequestUser,
    brandReference: string
  ) {
    const brand = await this.prisma.brand.findFirst({
      where: {
        OR: [
          { id: brandReference },
          { code: brandReference }
        ]
      },
      select: {
        id: true
      }
    });

    if (!brand) {
      return;
    }

    if (!this.hasBrandMembership(user, brand.id)) {
      throw new ForbiddenException('You do not have access to this brand.');
    }
  }

  private async assertCanAccessReportingPeriod(
    user: AuthenticatedRequestUser,
    periodId: string
  ) {
    const period = await this.prisma.reportingPeriod.findUnique({
      where: {
        id: periodId
      },
      select: {
        brandId: true
      }
    });

    if (period && !this.hasBrandMembership(user, period.brandId)) {
      throw new ForbiddenException('You do not have access to this brand.');
    }
  }

  private async assertCanAccessReportVersion(
    user: AuthenticatedRequestUser,
    versionId: string
  ) {
    const version = await this.prisma.reportVersion.findUnique({
      where: {
        id: versionId
      },
      select: {
        reportingPeriod: {
          select: {
            brandId: true
          }
        }
      }
    });

    if (version && !this.hasBrandMembership(user, version.reportingPeriod.brandId)) {
      throw new ForbiddenException('You do not have access to this brand.');
    }
  }
}
