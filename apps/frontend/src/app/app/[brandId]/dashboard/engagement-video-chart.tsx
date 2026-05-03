'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useMemo } from 'react';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';
import { DashboardMomDelta } from './dashboard-mom-delta';

export type EngagementVideoChartPoint = {
  id: string;
  year: number;
  month: number;
  label: string;
  monthYearLabel: string;
  engagementValue: number;
  videoViews3sValue: number;
  engagementMissing?: boolean;
  videoViews3sMissing?: boolean;
  total: number;
  statusLabel?: string;
};

type EngagementVideoChartProps = {
  points: EngagementVideoChartPoint[];
  monthsMissingMetrics: string[];
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

function CustomTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    payload?: EngagementVideoChartPoint;
  }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="min-w-[220px] rounded-xl border border-border/60 bg-background/95 p-3 shadow-xl backdrop-blur">
      <div className="text-sm font-semibold text-foreground">{point.monthYearLabel}</div>
      <div className="mt-2 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-emerald-500" />
            Engagement
          </div>
          <div className="font-medium text-foreground">
            {formatFullNumber(point.engagementValue)}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-amber-300" />
            3s Video Views
          </div>
          <div className="font-medium text-foreground">
            {formatFullNumber(point.videoViews3sValue)}
          </div>
        </div>
      </div>
      <div className="mt-3 border-t border-border/60 pt-2 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold text-foreground">{formatFullNumber(point.total)}</span>
        </div>
        {point.statusLabel ? (
          <div className="mt-2 flex items-center justify-between gap-4 border-t border-border/60 pt-2">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium text-foreground">{point.statusLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EngagementVideoChart({
  points,
  monthsMissingMetrics
}: EngagementVideoChartProps) {
  const {
    showGridLines,
    showLegend,
    showValueLabels,
    presentationMode,
    chartLayoutPreset,
    chartCaptureAspect,
    fontScale
  } = useDashboardGlobalKpiControls();
  const fontScaleMultiplier = fontScale === 'xl' ? 1.28 : fontScale === 'l' ? 1.15 : 1;
  const axisTickSize = Math.round((presentationMode ? 18 : 12) * fontScaleMultiplier);
  const legendTextSize = Math.round((presentationMode ? 16 : 12) * fontScaleMultiplier);
  const valueLabelFontSize = Math.round((presentationMode ? 15 : 11) * fontScaleMultiplier);
  const axisTickColor = presentationMode ? 'rgb(71 85 105)' : 'rgb(100 116 139)';
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
    <BarChart
      barCategoryGap="26%"
      data={points}
      margin={{
        top: presentationMode ? 36 : 28,
        right: presentationMode ? 18 : 12,
        left: presentationMode ? 2 : -4,
        bottom: presentationMode ? 16 : 10
      }}
      responsive
      style={{ height: '100%', width: '100%' }}
    >
      <defs>
        <linearGradient id="engagementBar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="videoViewsBar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffd39b" />
          <stop offset="100%" stopColor="#f4b76f" />
        </linearGradient>
      </defs>

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
        tickMargin={10}
        tickLine={false}
      />
      <YAxis
        axisLine={false}
        tick={{ fill: axisTickColor, fontSize: axisTickSize }}
        tickFormatter={formatCompactNumber}
        tickMargin={8}
        tickLine={false}
        width={presentationMode ? 78 : 54}
      />
      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
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
          height={presentationMode ? 40 : 34}
          iconSize={presentationMode ? 11 : 9}
          verticalAlign="top"
          wrapperStyle={{
            paddingBottom: presentationMode ? '10px' : '8px'
          }}
        />
      ) : null}
      <Bar
        dataKey="engagementValue"
        fill="url(#engagementBar)"
        name="Engagement"
        radius={[0, 0, 6, 6]}
        stackId="total"
      >
        {showValueLabels ? (
          <LabelList
            dataKey="engagementValue"
            fill="#334155"
            fontSize={valueLabelFontSize}
            fontWeight={600}
            formatter={(value) => formatFullNumber(Number(value ?? 0))}
            position="insideStart"
          />
        ) : null}
      </Bar>
      <Bar
        dataKey="videoViews3sValue"
        fill="url(#videoViewsBar)"
        name="3s Video Views"
        radius={[6, 6, 0, 0]}
        stackId="total"
      >
        {showValueLabels ? (
          <LabelList
            dataKey="total"
            fill="#334155"
            fontSize={valueLabelFontSize}
            fontWeight={700}
            formatter={(value) => formatFullNumber(Number(value ?? 0))}
            position="top"
          />
        ) : null}
      </Bar>
    </BarChart>
  );

  const deltaEntries = [
    {
      label: 'Engagement',
      currentValue: latestPoint?.engagementValue ?? null,
      previousValue: previousPoint?.engagementValue ?? null
    },
    {
      label: '3s Video Views',
      currentValue: latestPoint?.videoViews3sValue ?? null,
      previousValue: previousPoint?.videoViews3sValue ?? null
    }
  ];

  return (
    <div className="space-y-3">
      {!presentationMode ? (
        <>
          {monthsMissingMetrics.length > 0 ? (
            <div className="rounded-[20px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
              Some approved months are missing one or more chart metrics:{' '}
              {monthsMissingMetrics.join(', ')}.
            </div>
          ) : null}
        </>
      ) : null}

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
