import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;
const buckets = new Map<string, RateLimitBucket>();

function normalizeString(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      body?: Record<string, unknown>;
      ip?: string;
      socket?: {
        remoteAddress?: string;
      };
      headers?: Record<string, string | string[] | undefined>;
      route?: {
        path?: string;
      };
    }>();
    const forwardedFor = request.headers?.['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0];
    const ip = normalizeString(
      forwardedIp || request.ip || request.socket?.remoteAddress || 'unknown'
    );
    const accountHint = normalizeString(
      request.body?.email || request.body?.oid || 'unknown-account'
    );
    const routePath = normalizeString(request.route?.path || 'auth');
    const key = `${routePath}:${ip}:${accountHint}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + WINDOW_MS
      });
      return true;
    }

    existing.count += 1;

    if (existing.count > MAX_ATTEMPTS_PER_WINDOW) {
      throw new HttpException(
        'Too many login attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }
}
