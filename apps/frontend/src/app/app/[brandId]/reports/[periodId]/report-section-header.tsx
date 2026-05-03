import type { ReactNode } from 'react';

type ReportSectionHeaderProps = {
  badges?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  supplementary?: ReactNode;
  actions?: ReactNode;
};

export function ReportSectionHeader({
  badges,
  title,
  description,
  supplementary,
  actions
}: ReportSectionHeaderProps) {
  return (
    <div className="space-y-4">
      {badges ? <div className="flex min-h-8 flex-wrap items-center gap-2">{badges}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <h1 className="font-serif text-5xl leading-none tracking-[-0.06em]">{title}</h1>
          {description ? (
            <div className="max-w-3xl text-base leading-7 text-muted-foreground">{description}</div>
          ) : null}
          {supplementary ? <div className="space-y-3">{supplementary}</div> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
    </div>
  );
}
