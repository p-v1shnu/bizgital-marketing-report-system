import { redirect } from 'next/navigation';

import { requireAnyAdmin } from '@/lib/auth';

type BrandsAdminPageProps = {
  searchParams?: Promise<{
    message?: string;
    error?: string;
  }>;
};

export default async function BrandsAdminPage({ searchParams }: BrandsAdminPageProps) {
  await requireAnyAdmin('/app/settings');
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  query.set('tab', 'brands');

  if (resolvedSearchParams.message) {
    query.set('message', resolvedSearchParams.message);
  }

  if (resolvedSearchParams.error) {
    query.set('error', resolvedSearchParams.error);
  }

  redirect(`/app/settings?${query.toString()}`);
}
