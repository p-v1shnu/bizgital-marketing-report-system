import { NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME } from '@/lib/auth';
import { toAppUrl } from '@/lib/app-origin';

export async function GET(request: Request) {
  const loginUrl = toAppUrl(request, '/login?message=You have signed out.');
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
