import { Card, CardContent, CardHeader } from '@/components/ui/card';

const tabs = ['Overview', 'Members', 'Year Setup', 'Campaigns', 'Questions', 'Columns'];

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-muted/55 ${className}`} />;
}

export default function BrandAdminLoading() {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <SkeletonBar className="h-6 w-40" />
          <SkeletonBar className="h-10 w-60" />
        </div>
        <SkeletonBar className="h-11 w-40 rounded-2xl" />
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Brand admin navigation loading">
        {tabs.map((tab) => (
          <div
            className="rounded-[22px] border border-border/50 bg-background/55 px-4 py-3"
            key={tab}
          >
            <SkeletonBar className="h-4 w-20" />
          </div>
        ))}
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <Card>
          <CardHeader>
            <SkeletonBar className="h-6 w-44" />
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-border/50 bg-background/55 p-4 space-y-3">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-8 w-16" />
            </div>
            <div className="rounded-[24px] border border-border/50 bg-background/55 p-4 space-y-3">
              <SkeletonBar className="h-3 w-28" />
              <SkeletonBar className="h-8 w-16" />
            </div>
            <div className="rounded-[24px] border border-border/50 bg-background/55 p-4 space-y-3">
              <SkeletonBar className="h-3 w-24" />
              <SkeletonBar className="h-8 w-16" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SkeletonBar className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <SkeletonBar className="h-4 w-full rounded-md" />
            <SkeletonBar className="h-4 w-11/12 rounded-md" />
            <SkeletonBar className="h-4 w-3/4 rounded-md" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
