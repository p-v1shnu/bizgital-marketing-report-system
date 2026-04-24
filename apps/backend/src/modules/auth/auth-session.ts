import { createHmac, timingSafeEqual } from 'node:crypto';

const AUTH_SESSION_COOKIE_NAME = 'bizgital-marketing-report.user-email';
const AUTH_SESSION_TOKEN_VERSION = 'v1';
const AUTH_SESSION_DEV_FALLBACK_SECRET = 'dev-insecure-auth-session-secret';

type AuthSessionPayload = {
  e: string;
  exp: number;
};

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value)?.toLowerCase() ?? null;

  if (!normalized || !normalized.includes('@') || normalized.includes(' ')) {
    return null;
  }

  return normalized;
}

function resolveAuthSessionSecret() {
  const configuredSecret = normalizeOptionalString(process.env.AUTH_SESSION_SECRET);

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SESSION_SECRET is required in production.');
  }

  return AUTH_SESSION_DEV_FALLBACK_SECRET;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function signAuthSessionPayload(payloadEncoded: string, secret: string) {
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

export function parseAuthSessionCookieValue(value: string | null | undefined) {
  const raw = normalizeOptionalString(value);

  if (!raw || !raw.startsWith(`${AUTH_SESSION_TOKEN_VERSION}.`)) {
    return null;
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
  const expectedSignature = signAuthSessionPayload(payloadEncoded, secret);

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

  return normalizeEmail(payload.e);
}

export function extractAuthSessionEmail(cookieHeader: string | null | undefined) {
  const normalizedCookieHeader = normalizeOptionalString(cookieHeader);

  if (!normalizedCookieHeader) {
    return null;
  }

  const cookieValue = normalizedCookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${AUTH_SESSION_COOKIE_NAME}=`))
    ?.slice(`${AUTH_SESSION_COOKIE_NAME}=`.length);

  if (!cookieValue) {
    return null;
  }

  return parseAuthSessionCookieValue(safeDecode(cookieValue));
}
