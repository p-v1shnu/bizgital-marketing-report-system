import { redirect } from 'next/navigation';

import { requireAnyAdmin } from '@/lib/auth';

type UsersPageProps = {
  searchParams?: Promise<{
    message?: string;
    error?: string;
  }>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  await requireAnyAdmin('/app/settings');
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  query.set('tab', 'users');

  if (resolvedSearchParams.message) {
    query.set('message', resolvedSearchParams.message);
  }

  if (resolvedSearchParams.error) {
    query.set('error', resolvedSearchParams.error);
  }

  redirect(`/app/settings?${query.toString()}`);
}
