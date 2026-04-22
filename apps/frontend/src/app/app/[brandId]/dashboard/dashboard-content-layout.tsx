'use client';

import type { ReactNode } from 'react';

import {
  type DashboardChartLayoutPreset,
  useDashboardGlobalKpiControls
} from './dashboard-global-kpi-controls';

type DashboardContentLayoutProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

function chartGridClassName(preset: DashboardChartLayoutPreset) {
  if (preset === 'focus') {
    return 'mx-auto grid w-full max-w-[980px] grid-cols-1 gap-5';
  }

  if (preset === 'three_columns') {
    return 'grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3';
  }

  return 'grid grid-cols-1 gap-5 xl:grid-cols-2';
}

export function DashboardContentLayout({
  sidebar,
  children
}: DashboardContentLayoutProps) {
  const { chartLayoutPreset, presentationMode } = useDashboardGlobalKpiControls();
  const chartClassName = chartGridClassName(chartLayoutPreset);

  if (presentationMode) {
    return <div className={chartClassName}>{children}</div>;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="grid gap-5">{sidebar}</div>
      <div className={chartClassName}>{children}</div>
    </div>
  );
}
