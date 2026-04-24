'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  normalizeEmail,
  sanitizeNextPath
} from '@/lib/auth';
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_TTL_SECONDS,
  createAuthSessionCookieValue
} from '@/lib/auth-session';
import { getSuperAdminBootstrapStatus, loginWithPassword } from '@/lib/reporting-api';

function redirectToLogin(nextPath: string, error: string): never {
  redirect(`/login?next=${encodeURIComponent(nextPath)}&error=${encodeURIComponent(error)}`);
}

export async function loginAction(formData: FormData) {
  const requestedNext = String(formData.get('next') ?? '/app');
  const nextPath = sanitizeNextPath(requestedNext);
  const bootstrapStatus = await getSuperAdminBootstrapStatus().catch(() => null);
  if (bootstrapStatus?.enforceSetup) {
    redirect('/setup/super-admin');
  }
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirectToLogin(nextPath, 'Email and password are required.');
  }

  const account = await loginWithPassword({
    email,
    password
  }).catch(error => {
    redirectToLogin(
      nextPath,
      error instanceof Error ? error.message : 'Invalid email or password.'
    );
  });

  if (!account) {
    redirectToLogin(nextPath, 'Unable to login with this account.');
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, createAuthSessionCookieValue(account.email), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_SESSION_TTL_SECONDS
  });

  redirect(nextPath);
}
