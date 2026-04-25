import type { ReactNode } from 'react';

import { requireAuth } from '@/lib/auth';
import { getSuperAdminBootstrapStatus } from '@/lib/reporting-api';

import { ClearFlashQueryParams } from './clear-flash-query-params';
import { GlobalAppShell } from './global-app-shell';

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const context = await requireAuth('/app');
  const bootstrapStatus = await getSuperAdminBootstrapStatus().catch(() => null);
  const showSuperAdminSetupModeWarning =
    bootstrapStatus?.mode === 'force' && bootstrapStatus.hasBootstrapSuperAdmin;

  return (
    <GlobalAppShell
      canAccessAdmin={context.canAccessAdmin}
      currentUser={{
        displayName: context.user.displayName,
        email: context.user.email
      }}
      showSuperAdminSetupModeWarning={showSuperAdminSetupModeWarning}
    >
      <ClearFlashQueryParams />
      {children}
    </GlobalAppShell>
  );
}
