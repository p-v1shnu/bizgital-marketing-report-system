import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getAuthContext, sanitizeNextPath } from '@/lib/auth';
import { isMicrosoftAuthConfigured } from '@/lib/microsoft-auth-env';
import { getSuperAdminBootstrapStatus } from '@/lib/reporting-api';

import { loginAction } from './actions';

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const context = await getAuthContext();
  const bootstrapStatus = await getSuperAdminBootstrapStatus().catch(() => null);
  const resolved = searchParams ? await searchParams : {};
  const nextPath = sanitizeNextPath(resolved.next);

  if (context.user) {
    redirect(nextPath || '/app');
  }

  if (bootstrapStatus?.enforceSetup) {
    redirect('/setup/super-admin');
  }

  const microsoftEnabled = isMicrosoftAuthConfigured();

  return (
    <main className="login-atmosphere relative flex min-h-screen items-center overflow-hidden px-4 py-6 md:px-8">
      <div aria-hidden className="login-orb login-orb--primary" />
      <div aria-hidden className="login-orb login-orb--accent" />
      <div aria-hidden className="login-grid-overlay" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-10">
        <section className="login-rise mx-auto w-full max-w-2xl space-y-5 text-center lg:mx-0 lg:text-left">
          <Badge className="mx-auto rounded-xl border-primary/35 bg-card/70 px-3 py-1 uppercase tracking-[0.18em] lg:mx-0" variant="outline">
            BIZGITAL
          </Badge>
          <h1 className="text-balance text-3xl font-semibold tracking-[-0.03em] text-foreground md:text-5xl">
            One hub for tracking, reviewing, and approving your BIZGITAL Marketing Report.
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Connect campaign data, monitor competitor activity, and deliver monthly insights in a
            single workflow built for your internal team.
          </p>
          <p className="text-xs text-muted-foreground">
            Sign in with Microsoft Entra ID for company access, or use local password login when
            enabled by your administrator.
          </p>
        </section>

        <Card className="login-rise login-card mx-auto w-full max-w-md rounded-[28px] border-border/70">
          <CardHeader className="space-y-2 pb-4">
            <CardTitle>Log in</CardTitle>
            <p className="text-sm text-muted-foreground">
              Welcome back to BIZGITAL Marketing Report.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {resolved.message ? (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                {resolved.message}
              </div>
            ) : null}
            {resolved.error ? (
              <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                {resolved.error}
              </div>
            ) : null}

            {microsoftEnabled ? (
              <Button asChild className="w-full">
                <a href={`/api/auth/microsoft/start?next=${encodeURIComponent(nextPath)}`}>
                  Continue with Microsoft
                </a>
              </Button>
            ) : (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Microsoft sign-in is disabled. Add Microsoft credentials in <code>.env</code>.
              </div>
            )}

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border/60" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Alternative sign-in
              </span>
              <span className="h-px flex-1 bg-border/60" />
            </div>

            <details
              className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2"
              open={!microsoftEnabled || !!resolved.error}
            >
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                Sign in with password
              </summary>

              <form action={loginAction} className="mt-3 space-y-3">
                <input name="next" type="hidden" value={nextPath} />
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Email
                  </label>
                  <Input name="email" placeholder="you@bizgital.com" required type="email" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Password
                  </label>
                  <Input name="password" placeholder="Password" required type="password" />
                </div>
                <Button className="w-full" type="submit" variant="outline">
                  Sign in with password
                </Button>
              </form>
            </details>

            {process.env.NODE_ENV !== 'production' ? (
              <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Local seed test accounts</div>
                <div className="mt-1">admin@demo-brand.local / admin1234</div>
                <div>content@demo-brand.local / content1234</div>
                <div>approver@demo-brand.local / approver1234</div>
              </div>
            ) : null}

            <p className="text-center text-xs text-muted-foreground">
              Need access? Contact your BIZGITAL system administrator.
            </p>
            {bootstrapStatus?.setupRequired && !bootstrapStatus.enforceSetup ? (
              <p className="text-center text-xs text-amber-700 dark:text-amber-300">
                Super Admin setup test mode is enabled. Open{' '}
                <Link className="underline underline-offset-2" href="/setup/super-admin">
                  Setup Wizard
                </Link>
                .
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
