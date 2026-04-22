import { redirect } from 'next/navigation';

type ReportDetailPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
};

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
  const { brandId, periodId } = await params;
  redirect(`/app/${brandId}/reports/${periodId}/import`);
}
