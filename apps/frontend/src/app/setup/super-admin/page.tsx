import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getSuperAdminBootstrapStatus } from '@/lib/reporting-api';

import { bootstrapSuperAdminAction } from './actions';

type SetupSuperAdminPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function SetupSuperAdminPage({ searchParams }: SetupSuperAdminPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const bootstrapStatus = await getSuperAdminBootstrapStatus().catch(() => null);

  if (!bootstrapStatus) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-lg">
          <Card className="rounded-[28px] border-border/70">
            <CardHeader>
              <CardTitle>Super Admin setup unavailable</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Unable to load setup status from API. Please check backend connectivity and try
              again.
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!bootstrapStatus.setupRequired) {
    return (
      <main className="login-atmosphere relative flex min-h-screen items-center overflow-hidden px-4 py-6 md:px-8">
        <div aria-hidden className="login-orb login-orb--primary" />
        <div aria-hidden className="login-orb login-orb--accent" />
        <div aria-hidden className="login-grid-overlay" />

        <div className="relative mx-auto w-full max-w-2xl">
          <Card className="login-card rounded-[28px] border-border/70">
            <CardHeader className="space-y-2">
              <CardTitle className="flex items-center gap-2">
                <Image
                  alt="BIZGITAL logo"
                  className="size-5"
                  height={20}
                  src="/branding/bizgital-logo-2.png"
                  width={20}
                />
                <ShieldCheck className="size-5 text-primary" />
                Super Admin setup status
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Bootstrap Super Admin is already configured for this environment.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                Setup completed. Current mode: <code>{bootstrapStatus.mode}</code>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                To test setup UI/logic on existing data, set{' '}
                <code>SUPER_ADMIN_SETUP_MODE=force</code> in <code>.env</code> then restart backend
                and frontend.
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild type="button">
                  <a href="/login">Back to login</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="login-atmosphere relative flex min-h-screen items-center overflow-hidden px-4 py-6 md:px-8">
      <div aria-hidden className="login-orb login-orb--primary" />
      <div aria-hidden className="login-orb login-orb--accent" />
      <div aria-hidden className="login-grid-overlay" />

      <div className="login-rise relative mx-auto grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="mx-auto w-full max-w-2xl space-y-5 text-center lg:mx-0 lg:text-left">
          <div className="mx-auto flex w-fit items-center gap-3 lg:mx-0">
            <Image
              alt="BIZGITAL logo"
              className="size-11"
              height={44}
              priority
              src="/branding/bizgital-logo-2.png"
              width={44}
            />
            <Badge
              className="rounded-xl border-primary/35 bg-card/70 px-3 py-1 uppercase tracking-[0.18em]"
              variant="outline"
            >
              System setup
            </Badge>
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-[-0.03em] text-foreground md:text-5xl">
            Configure Bootstrap Super Admin
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Create the protected admin account for BIZGITAL Marketing Report. This account cannot
            be deleted and is used for core system administration.
          </p>
          <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
            {bootstrapStatus.reason === 'forced_for_testing'
              ? 'Test mode is enabled. You can evaluate setup flow and UI without blocking normal login.'
              : 'Setup is required before first login because no active admin account is available.'}
          </div>
        </section>

        <Card className="login-card mx-auto w-full max-w-md rounded-[28px] border-border/70">
          <CardHeader className="space-y-2 pb-4">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              Super Admin
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Use a secure email and password for your primary administrator account.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {resolvedSearchParams.error ? (
              <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                {resolvedSearchParams.error}
              </div>
            ) : null}

            <form action={bootstrapSuperAdminAction} className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Display name
                </label>
                <Input name="displayName" placeholder="BIZGITAL System Admin" required />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Email
                </label>
                <Input name="email" placeholder="admin@bizgital.com" required type="email" />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Password
                </label>
                <Input
                  minLength={8}
                  name="password"
                  placeholder="At least 8 characters"
                  required
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Confirm password
                </label>
                <Input
                  minLength={8}
                  name="confirmPassword"
                  placeholder="Repeat password"
                  required
                  type="password"
                />
              </div>

              <Button className="w-full" type="submit">
                Complete setup
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
