import { NextRequest, NextResponse } from 'next/server';

import { resolveAppOrigin, resolveMicrosoftRedirectUri, toAppUrl } from '@/lib/app-origin';
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_TTL_SECONDS,
  createAuthSessionCookieValue
} from '@/lib/auth-session';
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

  if (!raw.startsWith('/')) {
    return '/app';
  }

  if (raw.startsWith('//')) {
    return '/app';
  }

  return raw;
}

function getApiBase() {
  return (
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3003/api'
  );
}

function decodeJwtPayload(idToken: string) {
  const parts = idToken.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid id_token format.');
  }

  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payload) as Record<string, unknown>;
}

function withTemporaryCookiesCleared(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_STATE, '', { path: '/', maxAge: 0 });
  response.cookies.set(AUTH_COOKIE_VERIFIER, '', { path: '/', maxAge: 0 });
  response.cookies.set(AUTH_COOKIE_NEXT, '', { path: '/', maxAge: 0 });
  response.cookies.set(AUTH_COOKIE_NONCE, '', { path: '/', maxAge: 0 });
  return response;
}

function loginRedirect(request: NextRequest, nextPath: string, error: string) {
  const target = new URL(
    `/login?next=${encodeURIComponent(nextPath)}&error=${encodeURIComponent(error)}`,
    resolveAppOrigin(request)
  );
  const response = NextResponse.redirect(target);
  return withTemporaryCookiesCleared(response);
}

export async function GET(request: NextRequest) {
  const credentials = readMicrosoftAuthEnv();
  const tenantId = credentials.tenantId;
  const clientId = credentials.clientId;
  const clientSecret = credentials.clientSecret;

  if (!tenantId || !clientId || !clientSecret) {
    return NextResponse.redirect(
      toAppUrl(request, '/login?error=Microsoft+login+is+not+configured.')
    );
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const providerError = request.nextUrl.searchParams.get('error');
  const providerErrorDescription = request.nextUrl.searchParams.get('error_description');
  const expectedState = request.cookies.get(AUTH_COOKIE_STATE)?.value ?? '';
  const codeVerifier = request.cookies.get(AUTH_COOKIE_VERIFIER)?.value ?? '';
  const nextPath = sanitizeNextPath(request.cookies.get(AUTH_COOKIE_NEXT)?.value);
  const expectedNonce = request.cookies.get(AUTH_COOKIE_NONCE)?.value ?? '';

  const bootstrapStatus = await fetch(`${getApiBase()}/users/bootstrap/status`, {
    cache: 'no-store'
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null as SuperAdminBootstrapStatus | null);
  if (bootstrapStatus?.enforceSetup) {
    const response = NextResponse.redirect(
      toAppUrl(request, '/setup/super-admin')
    );
    return withTemporaryCookiesCleared(response);
  }

  if (providerError) {
    return loginRedirect(
      request,
      nextPath,
      providerErrorDescription || providerError || 'Microsoft login failed.'
    );
  }

  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    return loginRedirect(request, nextPath, 'Invalid Microsoft login state.');
  }

  const redirectUri = resolveMicrosoftRedirectUri(request, credentials.redirectUri);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    }
  );
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as
    | {
        id_token?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!tokenResponse.ok || !tokenPayload?.id_token) {
    return loginRedirect(
      request,
      nextPath,
      tokenPayload?.error_description ||
        tokenPayload?.error ||
        'Microsoft token exchange failed.'
    );
  }

  let jwtPayload: Record<string, unknown>;
  try {
    jwtPayload = decodeJwtPayload(tokenPayload.id_token);
  } catch {
    return loginRedirect(request, nextPath, 'Unable to validate Microsoft identity token.');
  }

  if (
    expectedNonce &&
    typeof jwtPayload.nonce === 'string' &&
    jwtPayload.nonce !== expectedNonce
  ) {
    return loginRedirect(request, nextPath, 'Microsoft nonce mismatch.');
  }

  const oid =
    (typeof jwtPayload.oid === 'string' && jwtPayload.oid) ||
    (typeof jwtPayload.sub === 'string' && jwtPayload.sub) ||
    '';
  const emailCandidates = [
    jwtPayload.preferred_username,
    jwtPayload.email,
    jwtPayload.upn
  ];
  const email =
    emailCandidates.find(value => typeof value === 'string' && value.trim().length > 0) ?? '';
  const displayName =
    (typeof jwtPayload.name === 'string' && jwtPayload.name) ||
    (typeof jwtPayload.given_name === 'string' && jwtPayload.given_name) ||
    '';

  if (!oid) {
    return loginRedirect(request, nextPath, 'Microsoft account id is missing.');
  }

  const backendResponse = await fetch(`${getApiBase()}/users/auth/microsoft-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      oid,
      email,
      displayName
    }),
    cache: 'no-store'
  });
  const backendPayload = (await backendResponse.json().catch(() => null)) as
    | {
        email?: string;
        message?: string | string[];
      }
    | null;

  if (!backendResponse.ok || !backendPayload?.email) {
    const message = Array.isArray(backendPayload?.message)
      ? backendPayload?.message.join(', ')
      : backendPayload?.message || 'Microsoft account is not linked to any user.';
    return loginRedirect(request, nextPath, message);
  }

  const response = NextResponse.redirect(new URL(nextPath, resolveAppOrigin(request)));
  const secure = process.env.NODE_ENV === 'production';

  response.cookies.set(AUTH_COOKIE_NAME, createAuthSessionCookieValue(backendPayload.email), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: AUTH_SESSION_TTL_SECONDS
  });

  return withTemporaryCookiesCleared(response);
}
