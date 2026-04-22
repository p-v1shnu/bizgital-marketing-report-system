import { redirect } from 'next/navigation';

type EnrichmentRedirectPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
};

export default async function EnrichmentRedirectPage({
  params
}: EnrichmentRedirectPageProps) {
  const { brandId, periodId } = await params;
  redirect(`/app/${brandId}/reports/${periodId}/import`);
}
