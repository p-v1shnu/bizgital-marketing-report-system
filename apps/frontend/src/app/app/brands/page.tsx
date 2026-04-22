import Link from 'next/link';
import { Building2, Settings2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAnyAdmin } from '@/lib/auth';
import { getBrands } from '@/lib/reporting-api';

export default async function BrandsAdminPage() {
  await requireAnyAdmin('/app/brands');
  const brands = await getBrands();

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Admin configuration
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Brands</h1>
        <p className="text-sm text-muted-foreground">
          Manage brand-level settings without entering each daily workspace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Building2 className="text-primary" />
            Brand administration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {brands.map((brand) => (
            <div
              className="grid gap-4 rounded-[28px] border border-border/60 bg-background/60 p-4 md:grid-cols-[minmax(0,1.3fr)_120px_120px_auto]"
              key={brand.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold">{brand.name}</div>
                  <Badge variant="outline">{brand.code}</Badge>
                  <Badge variant="outline">{brand.status}</Badge>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Members
                </div>
                <div className="mt-2 text-lg font-semibold">{brand.memberships.length}</div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Scope
                </div>
                <div className="mt-2 text-sm font-medium">Brand-level</div>
              </div>

              <div className="flex items-center md:justify-end">
                <Button asChild size="sm">
                  <Link href={`/app/brands/${brand.code}`}>
                    <Settings2 />
                    Manage brand
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
