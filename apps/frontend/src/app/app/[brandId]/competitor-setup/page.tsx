import { redirect } from 'next/navigation';

type CompetitorSetupPageProps = {
  params: Promise<{
    brandId: string;
  }>;
  searchParams?: Promise<{
    year?: string;
  }>;
};

function resolveYear(rawYear: string | undefined) {
  const currentYear = new Date().getUTCFullYear();

  if (!rawYear) {
    return currentYear;
  }

  const parsed = Number(rawYear);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 3000) {
    return currentYear;
  }

  return parsed;
}

export default async function CompetitorSetupPage({
  params,
  searchParams
}: CompetitorSetupPageProps) {
  const { brandId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const year = resolveYear(resolvedSearchParams?.year);

  redirect(`/app/brands/${brandId}?tab=competitors&year=${year}`);
}
