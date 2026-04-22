'use client';

import { useMemo } from 'react';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type DashboardMomDeltaEntry = {
  label: string;
  currentValue: number | null;
  previousValue: number | null;
};

type DashboardMomDeltaProps = {
  entries: DashboardMomDeltaEntry[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function arrowForDelta(value: number) {
  if (value > 0) {
    return '↑';
  }
  if (value < 0) {
    return '↓';
  }
  return '→';
}

function formatDeltaValue(value: number) {
  if (value > 0) {
    return `+${formatNumber(value)}`;
  }
  if (value < 0) {
    return `-${formatNumber(Math.abs(value))}`;
  }
  return '0';
}

function formatDeltaPercent(value: number) {
  if (value > 0) {
    return `+${formatPercent(value)}`;
  }
  if (value < 0) {
    return `-${formatPercent(Math.abs(value))}`;
  }
  return '0.0%';
}

type CalculatedDelta = {
  valueText: string;
  percentText: string;
  arrow: string;
  available: boolean;
};

function calculateDelta(currentValue: number | null, previousValue: number | null): CalculatedDelta {
  if (
    currentValue == null ||
    previousValue == null ||
    !Number.isFinite(currentValue) ||
    !Number.isFinite(previousValue)
  ) {
    return { valueText: 'N/A', percentText: 'N/A', arrow: '→', available: false };
  }

  const delta = currentValue - previousValue;
  if (previousValue === 0) {
    return {
      valueText: formatDeltaValue(delta),
      percentText: 'N/A',
      arrow: arrowForDelta(delta),
      available: true
    };
  }

  const percent = (delta / previousValue) * 100;
  return {
    valueText: formatDeltaValue(delta),
    percentText: formatDeltaPercent(percent),
    arrow: arrowForDelta(delta),
    available: true
  };
}

export function DashboardMomDelta({ entries }: DashboardMomDeltaProps) {
  const { showMomDelta, momDisplayMode, fontScale, presentationMode } = useDashboardGlobalKpiControls();

  const calculatedEntries = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        delta: calculateDelta(entry.currentValue, entry.previousValue)
      })),
    [entries]
  );

  if (!showMomDelta || calculatedEntries.length === 0) {
    return null;
  }

  const labelSizeClass = presentationMode
    ? fontScale === 'xl'
      ? 'text-xl'
      : fontScale === 'l'
        ? 'text-lg'
        : 'text-[17px]'
    : fontScale === 'xl'
      ? 'text-sm'
      : fontScale === 'l'
        ? 'text-[13px]'
        : 'text-xs';
  const valueSizeClass = presentationMode
    ? fontScale === 'xl'
      ? 'text-[26px]'
      : fontScale === 'l'
        ? 'text-2xl'
        : 'text-[22px]'
    : fontScale === 'xl'
      ? 'text-base'
      : fontScale === 'l'
        ? 'text-[15px]'
        : 'text-sm';
  const containerClassName = presentationMode ? 'px-4 py-3.5' : 'px-3 py-2';
  const itemGapClassName = presentationMode ? 'gap-x-5 gap-y-3' : 'gap-x-4 gap-y-2';

  return (
    <div className={`rounded-xl border border-slate-300 bg-white ${containerClassName}`}>
      <div className={`flex flex-wrap items-center ${itemGapClassName}`}>
        <div className={`font-semibold text-slate-700 ${labelSizeClass}`}>
          Change From Previous Month
        </div>
        {calculatedEntries.map((entry) => {
          const content =
            momDisplayMode === 'value'
              ? entry.delta.valueText
              : momDisplayMode === 'percent'
                ? entry.delta.percentText
                : `${entry.delta.valueText} (${entry.delta.percentText})`;

          const statusToneClass = !entry.delta.available
            ? 'text-slate-500'
            : entry.delta.arrow === '↑'
              ? 'text-emerald-700'
              : entry.delta.arrow === '↓'
                ? 'text-amber-700'
                : 'text-slate-700';

          return (
            <div className="flex items-center gap-1.5" key={entry.label}>
              <span className={`font-medium text-slate-600 ${labelSizeClass}`}>{entry.label}:</span>
              <span className={`font-semibold ${valueSizeClass} ${statusToneClass}`}>
                {content}
              </span>
              <span className={`font-semibold ${valueSizeClass} ${statusToneClass}`}>
                {entry.delta.available ? entry.delta.arrow : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
