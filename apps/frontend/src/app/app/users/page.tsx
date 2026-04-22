import { Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAnyAdmin } from '@/lib/auth';
import { getBrands } from '@/lib/reporting-api';

type UserRow = {
  id: string;
  displayName: string;
  email: string;
  status: string;
  brands: string[];
  roles: string[];
};

export default async function UsersPage() {
  await requireAnyAdmin('/app/users');
  const brands = await getBrands();
  const usersById = new Map<string, UserRow>();

  for (const brand of brands) {
    for (const membership of brand.memberships) {
      const existing = usersById.get(membership.user.id);

      if (existing) {
        existing.brands = Array.from(new Set([...existing.brands, brand.name]));
        existing.roles = Array.from(new Set([...existing.roles, membership.role]));
        continue;
      }

      usersById.set(membership.user.id, {
        id: membership.user.id,
        displayName: membership.user.displayName,
        email: membership.user.email,
        status: membership.user.status,
        brands: [brand.name],
        roles: [membership.role]
      });
    }
  }

  const rows = [...usersById.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Admin configuration
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Users</h1>
        <p className="text-sm text-muted-foreground">
          Membership overview across brand workspaces.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Users className="text-primary" />
            User access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row) => (
            <div
              className="grid gap-4 rounded-[28px] border border-border/60 bg-background/60 p-4 md:grid-cols-[minmax(0,1.1fr)_180px_180px_120px]"
              key={row.id}
            >
              <div className="min-w-0">
                <div className="text-lg font-semibold">{row.displayName}</div>
                <div className="mt-1 text-sm text-muted-foreground">{row.email}</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Brands
                </div>
                <div className="mt-2 text-sm font-medium">{row.brands.join(', ')}</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Roles
                </div>
                <div className="mt-2 text-sm font-medium">{row.roles.join(', ')}</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Status
                </div>
                <div className="mt-2 text-sm font-medium">{row.status}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
