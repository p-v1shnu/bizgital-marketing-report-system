'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';
import { DashboardMomDelta } from './dashboard-mom-delta';

export type DashboardFollowersComparisonPoint = {
  id: string;
  year: number;
  month: number;
  label: string;
  monthYearLabel: string;
  brandFollowers: number;
  competitorsFollowers: number;
  statusLabel?: string;
};

type DashboardFollowersComparisonChartProps = {
  points: DashboardFollowersComparisonPoint[];
  goalByYear?: Array<{
    year: number;
    value: number | null;
  }>;
};

function formatCompactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return `${Math.round(value)}`;
}

function formatFullNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(value);
}

export function DashboardFollowersComparisonChart({
  points,
  goalByYear = []
}: DashboardFollowersComparisonChartProps) {
  const {
    showGridLines,
    showKpiGoalLines,
    showLegend,
    showValueLabels,
    selectedKpiGoalYear,
    presentationMode,
    chartLayoutPreset,
    chartCaptureAspect,
    fontScale
  } = useDashboardGlobalKpiControls();
  const fontScaleMultiplier = fontScale === 'xl' ? 1.28 : fontScale === 'l' ? 1.15 : 1;
  const axisTickSize = Math.round((presentationMode ? 18 : 12) * fontScaleMultiplier);
  const goalLabelFontSize = Math.round((presentationMode ? 16 : 11) * fontScaleMultiplier);
  const legendTextSize = Math.round((presentationMode ? 16 : 12) * fontScaleMultiplier);
  const valueLabelFontSize = Math.round((presentationMode ? 15 : 11) * fontScaleMultiplier);
  const axisTickColor = presentationMode ? 'rgb(71 85 105)' : 'rgb(100 116 139)';
  const selectedGoal = useMemo(
    () => goalByYear.find((item) => item.year === selectedKpiGoalYear)?.value ?? null,
    [goalByYear, selectedKpiGoalYear]
  );
  const goalLineColor = '#111827';
  const latestPoint = points.at(-1) ?? null;
  const previousPoint = useMemo(() => {
    if (!latestPoint) {
      return null;
    }
    const previousYear = latestPoint.month === 1 ? latestPoint.year - 1 : latestPoint.year;
    const previousMonth = latestPoint.month === 1 ? 12 : latestPoint.month - 1;
    return (
      points.find((point) => point.year === previousYear && point.month === previousMonth) ??
      null
    );
  }, [latestPoint, points]);

  const isFocusCapture = presentationMode && chartLayoutPreset === 'focus';
  const useFixedCaptureFrame = presentationMode && !isFocusCapture;
  const captureFrameStyle = useFixedCaptureFrame
    ? { aspectRatio: chartCaptureAspect === '9_16' ? '9 / 16' : '9 / 10' }
    : undefined;
  const chartContainerClassName = presentationMode
    ? isFocusCapture
      ? 'h-[340px] w-full rounded-[24px] border border-slate-200 bg-white p-3 sm:h-[380px]'
      : 'w-full rounded-[24px] border border-slate-200 bg-white p-3'
    : 'h-[340px] w-full rounded-[24px] border border-slate-200 bg-white p-3 sm:h-[380px]';

  const chartElement = (
    <ResponsiveContainer height="100%" width="100%">
      <BarChart
        data={points}
        margin={{
          top: presentationMode ? 32 : 26,
          right: presentationMode ? 16 : 10,
          left: presentationMode ? 2 : -4,
          bottom: presentationMode ? 12 : 8
        }}
      >
        {showGridLines ? (
          <CartesianGrid
            opacity={0.88}
            stroke={presentationMode ? 'rgba(148,163,184,0.58)' : 'rgba(148,163,184,0.46)'}
            strokeDasharray="4 4"
            strokeWidth={1.1}
          />
        ) : null}
        <XAxis
          axisLine={false}
          dataKey="label"
          tick={{ fill: axisTickColor, fontSize: axisTickSize, fontWeight: 500 }}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          tick={{ fill: axisTickColor, fontSize: axisTickSize }}
          tickFormatter={formatCompactNumber}
          tickLine={false}
          width={presentationMode ? 78 : 54}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) {
              return null;
            }
            const point = payload[0]?.payload as DashboardFollowersComparisonPoint | undefined;
            if (!point) {
              return null;
            }

            return (
              <div className="min-w-[240px] rounded-xl border border-border/60 bg-background/95 p-3 shadow-xl backdrop-blur">
                <div className="text-sm font-semibold text-foreground">
                  {point.monthYearLabel}
                </div>
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Brand followers</span>
                    <span className="font-medium text-foreground">
                      {formatFullNumber(point.brandFollowers)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Competitors avg followers</span>
                    <span className="font-medium text-foreground">
                      {formatFullNumber(point.competitorsFollowers)}
                    </span>
                  </div>
                </div>
                {point.statusLabel ? (
                  <div className="mt-2 border-t border-border/60 pt-2 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-medium text-foreground">{point.statusLabel}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }}
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
        />
        {showLegend ? (
          <Legend
            align="right"
            formatter={(value) => (
              <span
                className="font-medium"
                style={{ color: axisTickColor, fontSize: legendTextSize }}
              >
                {value}
              </span>
            )}
            iconSize={presentationMode ? 11 : 9}
            verticalAlign="top"
          />
        ) : null}
        {showKpiGoalLines && selectedGoal != null ? (
          <ReferenceLine
            ifOverflow="extendDomain"
            label={{
              value: `Brand goal ${formatFullNumber(selectedGoal)}`,
              position: 'insideTopLeft',
              fill: goalLineColor,
              fontSize: goalLabelFontSize,
              fontWeight: 600
            }}
            stroke={goalLineColor}
            strokeDasharray="8 5"
            strokeWidth={2}
            y={selectedGoal}
          />
        ) : null}
        <Bar dataKey="brandFollowers" fill="#60a5fa" name="Brand followers" radius={[8, 8, 0, 0]}>
          {showValueLabels ? (
            <LabelList
              dataKey="brandFollowers"
              fill="#334155"
              fontSize={valueLabelFontSize}
              fontWeight={600}
              formatter={(value) => formatFullNumber(Number(value ?? 0))}
              position="top"
            />
          ) : null}
        </Bar>
        <Bar
          dataKey="competitorsFollowers"
          fill="#a78bfa"
          name="Competitors avg followers"
          radius={[8, 8, 0, 0]}
        >
          {showValueLabels ? (
            <LabelList
              dataKey="competitorsFollowers"
              fill="#334155"
              fontSize={valueLabelFontSize}
              fontWeight={600}
              formatter={(value) => formatFullNumber(Number(value ?? 0))}
              position="top"
            />
          ) : null}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const deltaEntries = [
    {
      label: 'Brand',
      currentValue: latestPoint?.brandFollowers ?? null,
      previousValue: previousPoint?.brandFollowers ?? null
    },
    {
      label: 'Competitors',
      currentValue: latestPoint?.competitorsFollowers ?? null,
      previousValue: previousPoint?.competitorsFollowers ?? null
    }
  ];

  return (
    <div className="space-y-3">
      {useFixedCaptureFrame ? (
        <div className="w-full" style={captureFrameStyle}>
          <div className="flex h-full flex-col gap-3">
            <DashboardMomDelta entries={deltaEntries} />
            <div className="min-h-0 flex-1 rounded-[24px] border border-slate-200 bg-white p-3">
              {chartElement}
            </div>
          </div>
        </div>
      ) : (
        <>
          <DashboardMomDelta entries={deltaEntries} />
          <div className={chartContainerClassName}>{chartElement}</div>
        </>
      )}
    </div>
  );
}
