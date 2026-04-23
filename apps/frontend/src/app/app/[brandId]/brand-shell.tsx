'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Settings2,
  Target,
  TableProperties
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toProtectedMediaUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';

const navigation = [
  {
    href: 'reports',
    label: 'Reports',
    description: 'Operational default',
    icon: TableProperties
  },
  {
    href: 'dashboard',
    label: 'Dashboard',
    description: 'Approved reporting view',
    icon: LayoutDashboard
  },
  {
    href: 'kpi-check',
    label: 'KPI Check',
    description: 'Quick CSV target check',
    icon: Target
  }
] as const;

type BrandShellProps = {
  brand: {
    code: string;
    name: string;
    timezone: string;
    logoUrl: string | null;
  };
  canManageBrand: boolean;
  children: ReactNode;
};

export function BrandShell({ brand, canManageBrand, children }: BrandShellProps) {
  const pathname = usePathname();
  const protectedBrandLogoUrl = toProtectedMediaUrl(brand.logoUrl);

  return (
    <section className="space-y-6">
      <header className="rounded-[28px] border border-border/70 bg-card/70 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Brand workspace</Badge>
            </div>
            <div className="flex items-center gap-3">
              {protectedBrandLogoUrl ? (
                <div className="size-10 overflow-hidden rounded-xl border border-border/60 bg-background/70">
                  <img
                    alt={`${brand.name} logo`}
                    className="h-full w-full object-cover"
                    src={protectedBrandLogoUrl}
                  />
                </div>
              ) : null}
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
                {brand.name}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageBrand ? (
              <Button asChild variant="outline">
                <Link href={`/app/brands/${brand.code}`}>
                  <Settings2 />
                  Manage brand
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <nav
          aria-label="Brand workspace navigation"
          className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-5"
        >
          {navigation.map((item) => {
            const href = `/app/${brand.code}/${item.href}`;
            const isActive =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                className={cn(
                  'flex items-center gap-3 rounded-[22px] border px-4 py-3 transition',
                  isActive
                    ? 'border-primary/25 bg-primary/10 text-foreground'
                    : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-background/80 hover:text-foreground'
                )}
                href={href}
                key={item.href}
              >
                <item.icon className="size-4 text-primary" />
                <span className="text-sm font-medium">{item.label}</span>
                <span className="hidden text-xs text-muted-foreground xl:inline">
                  {item.description}
                </span>
              </Link>
            );
          })}
        </nav>
      </header>

      <div>{children}</div>
    </section>
  );
}
