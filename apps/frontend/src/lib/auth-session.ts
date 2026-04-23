import { createHmac, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE_NAME = 'bizgital-marketing-report.user-email';
export const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const AUTH_SESSION_TOKEN_VERSION = 'v1';
const AUTH_SESSION_DEV_FALLBACK_SECRET = 'dev-insecure-auth-session-secret';

type AuthSessionPayload = {
  e: string;
  exp: number;
};

function normalizeEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function isLikelyLegacyEmail(value: string) {
  return value.includes('@') && !value.includes(' ');
}

function resolveAuthSessionSecret() {
  const configuredSecret = (process.env.AUTH_SESSION_SECRET ?? '').trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SESSION_SECRET is required in production.');
  }

  return AUTH_SESSION_DEV_FALLBACK_SECRET;
}

function signPayload(payloadEncoded: string, secret: string) {
  return createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
}

function safeTimingEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAuthSessionCookieValue(
  email: string,
  options?: {
    ttlSeconds?: number;
    issuedAtMs?: number;
  }
) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !isLikelyLegacyEmail(normalizedEmail)) {
    throw new Error('A valid email is required to create an auth session.');
  }

  const issuedAtMs = options?.issuedAtMs ?? Date.now();
  const ttlSeconds = Math.max(60, Math.floor(options?.ttlSeconds ?? AUTH_SESSION_TTL_SECONDS));
  const expiresAtSeconds = Math.floor(issuedAtMs / 1000) + ttlSeconds;
  const payload: AuthSessionPayload = {
    e: normalizedEmail,
    exp: expiresAtSeconds
  };
  const payloadEncoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const secret = resolveAuthSessionSecret();
  const signature = signPayload(payloadEncoded, secret);

  return `${AUTH_SESSION_TOKEN_VERSION}.${payloadEncoded}.${signature}`;
}

export function parseAuthSessionCookieValue(value: string | null | undefined) {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return null;
  }

  if (!raw.startsWith(`${AUTH_SESSION_TOKEN_VERSION}.`)) {
    const legacyEmail = normalizeEmail(raw);
    return isLikelyLegacyEmail(legacyEmail) ? legacyEmail : null;
  }

  const [version, payloadEncoded, signature] = raw.split('.');

  if (
    version !== AUTH_SESSION_TOKEN_VERSION ||
    !payloadEncoded ||
    !signature
  ) {
    return null;
  }

  const secret = resolveAuthSessionSecret();
  const expectedSignature = signPayload(payloadEncoded, secret);

  if (!safeTimingEqual(signature, expectedSignature)) {
    return null;
  }

  let payload: AuthSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8')) as AuthSessionPayload;
  } catch {
    return null;
  }

  if (!payload || typeof payload.e !== 'string' || typeof payload.exp !== 'number') {
    return null;
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const normalizedEmail = normalizeEmail(payload.e);
  return isLikelyLegacyEmail(normalizedEmail) ? normalizedEmail : null;
}
