'use client';

import { usePathname, useRouter } from 'next/navigation';

type DashboardContentPeriodPickerProps = {
  className?: string;
  selectedPeriodId: string;
  options: Array<{
    id: string;
    label: string;
  }>;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  includeSubmittedPreview: boolean;
};

export function DashboardContentPeriodPicker({
  className,
  selectedPeriodId,
  options,
  startYear,
  startMonth,
  endYear,
  endMonth,
  includeSubmittedPreview
}: DashboardContentPeriodPickerProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      className={className}
      onChange={(event) => {
        const nextPeriodId = event.target.value;
        const query = new URLSearchParams();
        query.set('startYear', String(startYear));
        query.set('startMonth', String(startMonth));
        query.set('endYear', String(endYear));
        query.set('endMonth', String(endMonth));
        query.set('view', 'content');
        if (includeSubmittedPreview) {
          query.set('includeSubmittedPreview', '1');
        }
        if (nextPeriodId.trim().length > 0) {
          query.set('selectedPeriodId', nextPeriodId);
        }

        router.replace(`${pathname}?${query.toString()}`, { scroll: false });
      }}
      value={selectedPeriodId}
    >
      {options.map((item) => (
        <option key={`content-period-${item.id}`} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

