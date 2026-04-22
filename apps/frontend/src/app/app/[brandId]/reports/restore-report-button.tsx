'use client';

import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

import { restoreReportingPeriodAction } from './actions';

type RestoreReportButtonProps = {
  brandId: string;
  periodId: string;
  year: number;
  className?: string;
};

function RestoreReportSubmitButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button className={className} disabled={pending} size="sm" type="submit" variant="outline">
      {pending ? 'Restoring...' : 'Restore'}
    </Button>
  );
}

export function RestoreReportButton({
  brandId,
  periodId,
  year,
  className
}: RestoreReportButtonProps) {
  return (
    <form action={restoreReportingPeriodAction}>
      <input name="brandId" type="hidden" value={brandId} />
      <input name="periodId" type="hidden" value={periodId} />
      <input name="year" type="hidden" value={year} />
      <RestoreReportSubmitButton className={className} />
    </form>
  );
}
