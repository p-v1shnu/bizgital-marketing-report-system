import { redirect } from 'next/navigation';

import { requireAnyAdmin } from '@/lib/auth';

type ColumnConfigPageProps = {
  searchParams?: Promise<{
    message?: string;
    error?: string;
  }>;
};

export default async function ColumnConfigPage({ searchParams }: ColumnConfigPageProps) {
  await requireAnyAdmin('/app/settings');
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  query.set('tab', 'columns');
  query.set('field', 'content_style');

  if (resolvedSearchParams.message) {
    query.set('message', resolvedSearchParams.message);
  }

  if (resolvedSearchParams.error) {
    query.set('error', resolvedSearchParams.error);
  }

  redirect(`/app/settings?${query.toString()}`);
}
