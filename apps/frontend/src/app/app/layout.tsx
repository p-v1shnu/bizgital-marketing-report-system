import type { ReactNode } from 'react';
import { cookies } from 'next/headers';

import { requireAuth } from '@/lib/auth';
import { getSuperAdminBootstrapStatus } from '@/lib/reporting-api';

import { ClearFlashQueryParams } from './clear-flash-query-params';
import { GlobalAppShell } from './global-app-shell';

const sidebarCookieKey = 'bizgital_marketing_report_global_sidebar_collapsed';

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const context = await requireAuth('/app');
  const bootstrapStatus = await getSuperAdminBootstrapStatus().catch(() => null);
  const showSuperAdminSetupModeWarning =
    bootstrapStatus?.mode === 'force' && bootstrapStatus.hasBootstrapSuperAdmin;
  const cookieStore = await cookies();
  const initialSidebarCollapsed =
    cookieStore.get(sidebarCookieKey)?.value === 'true';

  return (
    <GlobalAppShell
      canAccessAdmin={context.canAccessAdmin}
      currentUser={{
        displayName: context.user.displayName,
        email: context.user.email
      }}
      initialSidebarCollapsed={initialSidebarCollapsed}
      showSuperAdminSetupModeWarning={showSuperAdminSetupModeWarning}
    >
      <ClearFlashQueryParams />
      {children}
    </GlobalAppShell>
  );
}
