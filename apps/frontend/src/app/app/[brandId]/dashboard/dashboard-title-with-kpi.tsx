'use client';

import { useMemo } from 'react';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type GoalByYearItem = {
  year: number;
  value: number | null;
};

type DashboardTitleWithKpiProps = {
  title: string;
  goalByYear?: GoalByYearItem[];
  totalValue: number;
  className?: string;
};

export function DashboardTitleWithKpi({
  title,
  goalByYear = [],
  totalValue,
  className
}: DashboardTitleWithKpiProps) {
  const { selectedKpiGoalYear, showKpiGoalLines, presentationMode, fontScale } = useDashboardGlobalKpiControls();
  const selectedGoal = useMemo(
    () => goalByYear.find((item) => item.year === selectedKpiGoalYear)?.value ?? null,
    [goalByYear, selectedKpiGoalYear]
  );

  const status =
    selectedGoal == null
      ? 'No goal'
      : totalValue >= selectedGoal
        ? 'On target'
        : 'Below target';
  const goalValueLabel =
    selectedGoal == null
      ? null
      : new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 0
        }).format(selectedGoal);

  const titleClassName = presentationMode
    ? fontScale === 'xl'
      ? 'truncate text-[26px] font-semibold'
      : fontScale === 'l'
        ? 'truncate text-[24px] font-semibold'
        : 'truncate text-[22px] font-semibold'
    : fontScale === 'xl'
      ? 'truncate text-lg font-semibold'
      : fontScale === 'l'
        ? 'truncate text-[17px] font-semibold'
        : 'truncate';

  const badgeClassName =
    presentationMode || fontScale === 'xl'
      ? 'rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-semibold text-white'
      : fontScale === 'l'
        ? 'rounded-full border border-slate-700 bg-slate-900 px-3 py-0.5 text-xs font-semibold text-white'
        : 'rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold text-white';

  return (
    <div className={className ?? 'flex min-w-0 flex-wrap items-center gap-2'}>
      <span className={titleClassName}>{title}</span>
      {showKpiGoalLines && selectedGoal != null ? (
        <span className={badgeClassName}>
          KPI {goalValueLabel} · {status}
        </span>
      ) : null}
    </div>
  );
}
