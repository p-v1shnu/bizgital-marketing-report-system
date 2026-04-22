import type { ReactNode } from 'react';

import { requireAuth } from '@/lib/auth';

import { ClearFlashQueryParams } from './clear-flash-query-params';
import { GlobalAppShell } from './global-app-shell';

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const context = await requireAuth('/app');

  return (
    <GlobalAppShell
      canAccessAdmin={context.canAccessAdmin}
      currentUser={{
        displayName: context.user.displayName,
        email: context.user.email
      }}
    >
      <ClearFlashQueryParams />
      {children}
    </GlobalAppShell>
  );
}
