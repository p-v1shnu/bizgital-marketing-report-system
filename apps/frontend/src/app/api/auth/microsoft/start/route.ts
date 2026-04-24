import { createHash, randomBytes } from 'node:crypto';

import { NextResponse } from 'next/server';

import { resolveMicrosoftRedirectUri, toAppUrl } from '@/lib/app-origin';
import { readMicrosoftAuthEnv } from '@/lib/microsoft-auth-env';

const AUTH_COOKIE_STATE = 'bizgital-marketing-report.ms.state';
const AUTH_COOKIE_VERIFIER = 'bizgital-marketing-report.ms.verifier';
const AUTH_COOKIE_NEXT = 'bizgital-marketing-report.ms.next';
const AUTH_COOKIE_NONCE = 'bizgital-marketing-report.ms.nonce';

type SuperAdminBootstrapStatus = {
  enforceSetup?: boolean;
};

function sanitizeNextPath(value: string | null | undefined) {
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

function toBase64Url(input: Buffer) {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getApiBase() {
  return (
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3003/api'
  );
}

export async function GET(request: Request) {
  const credentials = readMicrosoftAuthEnv();
  const tenantId = credentials.tenantId;
  const clientId = credentials.clientId;
  const clientSecret = credentials.clientSecret;

  if (!tenantId || !clientId || !clientSecret) {
    return NextResponse.redirect(
      toAppUrl(request, '/login?error=Microsoft+login+is+not+configured.')
    );
  }

  const bootstrapStatus = await fetch(`${getApiBase()}/users/bootstrap/status`, {
    cache: 'no-store'
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null as SuperAdminBootstrapStatus | null);
  if (bootstrapStatus?.enforceSetup) {
    return NextResponse.redirect(toAppUrl(request, '/setup/super-admin'));
  }

  const requestUrl = new URL(request.url);
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get('next'));
  const state = toBase64Url(randomBytes(32));
  const nonce = toBase64Url(randomBytes(32));
  const codeVerifier = toBase64Url(randomBytes(48));
  const codeChallenge = toBase64Url(
    createHash('sha256').update(codeVerifier).digest()
  );
  const redirectUri = resolveMicrosoftRedirectUri(request, credentials.redirectUri);

  const authorizeUrl = new URL(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`
  );
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_mode', 'query');
  authorizeUrl.searchParams.set('scope', 'openid profile email offline_access');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authorizeUrl);
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(AUTH_COOKIE_STATE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 10
  });
  response.cookies.set(AUTH_COOKIE_VERIFIER, codeVerifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 10
  });
  response.cookies.set(AUTH_COOKIE_NEXT, nextPath, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 10
  });
  response.cookies.set(AUTH_COOKIE_NONCE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 10
  });

  return response;
}
