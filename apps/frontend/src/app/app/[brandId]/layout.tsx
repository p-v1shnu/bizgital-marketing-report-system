import type { ReactNode } from 'react';

import { requireBrandAccess } from '@/lib/auth';
import { getBrand } from '@/lib/reporting-api';

import { BrandShell } from './brand-shell';

type BrandLayoutProps = {
  children: ReactNode;
  params: Promise<{
    brandId: string;
  }>;
};

export default async function BrandLayout({
  children,
  params
}: BrandLayoutProps) {
  const { brandId } = await params;
  const access = await requireBrandAccess(brandId, `/app/${brandId}`);
  const canManageBrand = access.brandMemberships.some(
    (membership) => membership.role === 'admin'
  );

  let brand = {
    code: brandId,
    name: brandId,
    timezone: 'Asia/Vientiane',
    logoUrl: null as string | null
  };

  try {
    const data = await getBrand(brandId);
    brand = {
      code: data.code,
      name: data.name,
      timezone: data.timezone,
      logoUrl: data.logoUrl ?? null
    };
  } catch {
    brand = {
      code: brandId,
      name: brandId,
      timezone: 'Asia/Vientiane',
      logoUrl: null
    };
  }

  return (
    <BrandShell brand={brand} canManageBrand={canManageBrand}>
      {children}
    </BrandShell>
  );
}
