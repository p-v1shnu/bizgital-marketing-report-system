import { Construction, LayoutTemplate } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type PlaceholderSectionPageProps = {
  params: Promise<{
    brandId: string;
    section: string;
  }>;
};

function formatSectionName(section: string) {
  return section
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function PlaceholderSectionPage({
  params
}: PlaceholderSectionPageProps) {
  const { brandId, section } = await params;

  return (
    <section className="space-y-6">
      <div className="space-y-4">
        <Badge variant="outline">Planned surface</Badge>
        <h1 className="font-serif text-5xl leading-none tracking-[-0.06em]">
          {brandId} {formatSectionName(section)}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          This area is planned in the product roadmap, but it is not part of the
          current monthly workflow. Keep the team focused on Monthly Reports and
          Review for now.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <LayoutTemplate className="text-primary" />
              Why it exists already
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              The navigation shape is reserved now so future modules can land
              without another IA redesign later.
            </p>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Construction className="text-primary" />
              Current status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              This surface is intentionally held for a later release.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
