'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

export type DashboardQuestionCategoryTrendSeries = {
  id: string;
  dataKey: string;
  label: string;
  color: string;
  total: number;
};

export type DashboardQuestionCategoryTrendPoint = {
  id: string;
  label: string;
  monthYearLabel: string;
  statusLabel?: string;
  total: number;
  [dataKey: string]: string | number | undefined;
};

type DashboardQuestionCategoryTrendChartProps = {
  points: DashboardQuestionCategoryTrendPoint[];
  series: DashboardQuestionCategoryTrendSeries[];
};

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(value);
}

export function DashboardQuestionCategoryTrendChart({
  points,
  series
}: DashboardQuestionCategoryTrendChartProps) {
  const {
    showGridLines,
    showLegend,
    showValueLabels,
    presentationMode,
    chartLayoutPreset,
    chartCaptureAspect,
    fontScale
  } =
    useDashboardGlobalKpiControls();
  const fontScaleMultiplier = fontScale === 'xl' ? 1.28 : fontScale === 'l' ? 1.15 : 1;
  const axisTickSize = Math.round((presentationMode ? 18 : 12) * fontScaleMultiplier);
  const legendTextSize = Math.round((presentationMode ? 16 : 12) * fontScaleMultiplier);
  const valueLabelFontSize = Math.round((presentationMode ? 15 : 11) * fontScaleMultiplier);
  const axisTickColor = presentationMode ? 'rgb(71 85 105)' : 'rgb(100 116 139)';
  const useWideFocusCapture = presentationMode && chartLayoutPreset === 'focus';
  const chartContainerClassName = presentationMode
    ? useWideFocusCapture
      ? 'h-[340px] w-full rounded-[24px] border border-slate-200 bg-white p-3 sm:h-[380px]'
      : 'w-full rounded-[24px] border border-slate-200 bg-white p-3'
    : 'h-[340px] w-full rounded-[24px] border border-slate-200 bg-white p-3 sm:h-[380px]';
  const chartContainerStyle =
    presentationMode && !useWideFocusCapture
      ? { aspectRatio: chartCaptureAspect === '9_16' ? '9 / 16' : '9 / 10' }
      : undefined;

  return (
    <div className={chartContainerClassName} style={chartContainerStyle}>
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          barCategoryGap="26%"
          data={points}
          margin={{
            top: presentationMode ? 36 : 28,
            right: presentationMode ? 18 : 12,
            left: presentationMode ? 2 : -4,
            bottom: presentationMode ? 16 : 10
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
            tickFormatter={(value) => formatCount(Number(value ?? 0))}
            tickLine={false}
            width={presentationMode ? 78 : 54}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) {
                return null;
              }

              const point = payload[0]?.payload as DashboardQuestionCategoryTrendPoint | undefined;
              if (!point) {
                return null;
              }

              return (
                <div className="min-w-[260px] rounded-xl border border-border/60 bg-background/95 p-3 shadow-xl backdrop-blur">
                  <div className="text-sm font-semibold text-foreground">{point.monthYearLabel}</div>
                  <div className="mt-2 space-y-1.5 text-xs">
                    {series.map((item) => {
                      const rawValue = point[item.dataKey];
                      const value = typeof rawValue === 'number' ? rawValue : 0;
                      if (value <= 0) {
                        return null;
                      }

                      return (
                        <div className="flex items-center justify-between gap-4" key={item.id}>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span
                              className="inline-block size-2 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            {item.label}
                          </div>
                          <div className="font-medium text-foreground">{formatCount(value)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 border-t border-border/60 pt-2 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold text-foreground">
                        {formatCount(point.total)}
                      </span>
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
            }}
            cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          />
          {showLegend ? (
            <Legend
              align="right"
              formatter={(value) => (
                <span className="font-medium" style={{ color: axisTickColor, fontSize: legendTextSize }}>
                  {value}
                </span>
              )}
              iconSize={presentationMode ? 11 : 9}
              verticalAlign="top"
            />
          ) : null}
          {series.map((item, index) => (
            <Bar
              dataKey={item.dataKey}
              fill={item.color}
              key={item.id}
              name={item.label}
              radius={index === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
              stackId="question-total"
            >
              {showValueLabels ? (
                <LabelList
                  dataKey={item.dataKey}
                  fill="#334155"
                  fontSize={valueLabelFontSize}
                  fontWeight={600}
                  formatter={(value) => {
                    const numericValue = Number(value ?? 0);
                    return numericValue > 0 ? formatCount(numericValue) : '';
                  }}
                  position="insideStart"
                />
              ) : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
