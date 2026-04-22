import { redirect } from 'next/navigation';

type BrandHomePageProps = {
  params: Promise<{
    brandId: string;
  }>;
};

export default async function BrandHomePage({ params }: BrandHomePageProps) {
  const { brandId } = await params;

  redirect(`/app/${brandId}/reports`);
}
