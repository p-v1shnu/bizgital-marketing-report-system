'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AUTH_COOKIE_NAME, normalizeEmail } from '@/lib/auth';
import { bootstrapSuperAdmin, getSuperAdminBootstrapStatus } from '@/lib/reporting-api';

function toSetupPageWithError(message: string): never {
  redirect(`/setup/super-admin?error=${encodeURIComponent(message)}`);
}

export async function bootstrapSuperAdminAction(formData: FormData) {
  const displayName = String(formData.get('displayName') ?? '').replace(/\s+/g, ' ').trim();
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!displayName) {
    toSetupPageWithError('Display name is required.');
  }

  if (!email || !email.includes('@')) {
    toSetupPageWithError('Valid email is required.');
  }

  if (password.length < 8) {
    toSetupPageWithError('Password must be at least 8 characters.');
  }

  if (password !== confirmPassword) {
    toSetupPageWithError('Password and Confirm password do not match.');
  }

  const status = await getSuperAdminBootstrapStatus().catch(() => null);
  if (!status?.setupRequired) {
    redirect('/login?message=Super+Admin+setup+is+already+completed.');
  }

  const response = await bootstrapSuperAdmin({
    displayName,
    email,
    password
  }).catch((error) => {
    toSetupPageWithError(
      error instanceof Error ? error.message : 'Failed to setup Super Admin.'
    );
  });

  if (!response?.user?.email) {
    toSetupPageWithError('Failed to setup Super Admin.');
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, response.user.email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });

  redirect('/app');
}
