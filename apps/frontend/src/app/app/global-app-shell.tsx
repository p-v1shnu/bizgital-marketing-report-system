'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LogOut,
  Settings2,
  UserCircle2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const sidebarStorageKey = 'bizgital-marketing-report.global-sidebar-collapsed';

const navigation: Array<{
  href: string;
  label: string;
  description: string;
  icon: (typeof Building2);
  exact?: boolean;
  adminOnly?: boolean;
}> = [
  {
    href: '/app',
    label: 'Brand Workspaces',
    description: 'Daily reporting entry',
    icon: FolderKanban,
    exact: true
  },
  {
    href: '/app/settings',
    label: 'Settings',
    description: 'Admin system configuration',
    icon: Settings2,
    adminOnly: true
  }
] as const;

type GlobalAppShellProps = {
  children: ReactNode;
  currentUser: {
    displayName: string;
    email: string;
  };
  canAccessAdmin: boolean;
};

export function GlobalAppShell({
  children,
  currentUser,
  canAccessAdmin
}: GlobalAppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const visibleNavigation = navigation.filter(
    (item) => !item.adminOnly || canAccessAdmin
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(sidebarStorageKey);
    setCollapsed(saved === 'true');
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarStorageKey, String(next));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside
        className={cn(
          'border-b border-border/70 bg-card/45 transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0',
          collapsed ? 'lg:w-24' : 'lg:w-72'
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5">
          <Link className="min-w-0" href="/app">
            <div className={cn('text-sm font-semibold', collapsed && 'lg:hidden')}>
              BIZGITAL Marketing Report
            </div>
            <div
              className={cn(
                'text-xs uppercase tracking-[0.18em] text-muted-foreground',
                collapsed && 'lg:hidden'
              )}
            >
              Internal reporting platform
            </div>
            <div className={cn('hidden text-sm font-semibold lg:block', !collapsed && 'lg:hidden')}>
              BMR
            </div>
          </Link>

          <Button
            aria-expanded={!collapsed}
            onClick={toggleSidebar}
            size="icon"
            type="button"
            variant="ghost"
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>

        <div className="space-y-5 px-4 pb-4 lg:px-5">
          <nav aria-label="Global navigation" className="grid gap-2">
            {visibleNavigation.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  className={cn(
                    'group flex items-center gap-3 rounded-[24px] border px-3 py-3 transition',
                    isActive
                      ? 'border-primary/25 bg-primary/10 text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground',
                    collapsed && 'justify-center lg:px-0'
                  )}
                  href={item.href}
                  key={item.href}
                  title={collapsed ? item.label : undefined}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/70">
                    <item.icon className="size-4 text-primary" />
                  </div>
                  <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </div>
                </Link>
              );
            })}
          </nav>
          <div
            className={cn(
              'rounded-[24px] border border-border/60 bg-background/70 px-4 py-4',
              collapsed && 'hidden'
            )}
          >
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Signed in as
            </div>
            <div className="mt-2 flex items-start gap-2">
              <UserCircle2 className="mt-0.5 size-4 text-primary" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {currentUser.displayName}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {currentUser.email}
                </div>
              </div>
            </div>
            <Button asChild className="mt-4 w-full" size="sm" variant="outline">
              <Link href="/api/auth/logout">
                <LogOut />
                Sign out
              </Link>
            </Button>
          </div>

          <div
            className={cn(
              'rounded-[24px] border border-border/60 bg-background/70 px-4 py-4',
              collapsed && 'hidden'
            )}
          >
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Workspace model
            </div>
            <div className="mt-2 text-sm text-foreground">
              Daily reporting stays inside brand workspaces. Brand setup lives in the
              admin layer.
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}
