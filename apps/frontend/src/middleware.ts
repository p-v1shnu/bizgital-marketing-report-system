import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostHeader = (request.headers.get('host') ?? '').toLowerCase();
  const isLoopbackHost =
    hostHeader.startsWith('127.0.0.1:') ||
    hostHeader === '127.0.0.1' ||
    hostHeader.startsWith('[::1]:') ||
    hostHeader === '[::1]' ||
    hostHeader.startsWith('::1:') ||
    hostHeader === '::1';

  if (!isLoopbackHost) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.hostname = 'localhost';

  return NextResponse.redirect(redirectUrl, 307);
}

export const config = {
  matcher: '/:path*'
};
