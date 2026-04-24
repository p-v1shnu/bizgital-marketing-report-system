'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';

type YearOption = {
  year: number;
  isReady: boolean;
  hasReports: boolean;
};

type ReportsYearControlsProps = {
  brandId: string;
  currentYear: number;
  selectedYear: number;
  yearOptions: YearOption[];
};

export function ReportsYearControls({
  brandId,
  currentYear,
  selectedYear,
  yearOptions
}: ReportsYearControlsProps) {
  const router = useRouter();

  const handleYearChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const year = Number.parseInt(event.currentTarget.value, 10);

    if (!Number.isFinite(year)) {
      return;
    }

    router.push(`/app/${brandId}/reports?year=${year}`);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="reports-year-jump-select">
        Jump to year
      </label>
      <select
        className="h-9 min-w-[112px] rounded-full border border-input bg-background/70 px-3 text-sm text-foreground"
        id="reports-year-jump-select"
        onChange={handleYearChange}
        value={String(selectedYear)}
      >
        {yearOptions.map((option) => (
          <option key={option.year} value={option.year}>
            {option.year}
            {option.isReady ? '' : ' • setup required'}
          </option>
        ))}
      </select>
      <Button
        disabled={selectedYear === currentYear}
        onClick={() => router.push(`/app/${brandId}/reports?year=${currentYear}`)}
        size="sm"
        type="button"
        variant="outline"
      >
        Current year
      </Button>
    </div>
  );
}
