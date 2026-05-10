'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { cn } from '@/lib/utils';

import { getDashboardContentCanvasAspectClass } from './dashboard-content-canvas-ratio';
import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

export type DashboardQuestionCategoryDistributionPoint = {
  id: string;
  label: string;
  count: number;
};

type DashboardQuestionCategoryDistributionChartProps = {
  points: DashboardQuestionCategoryDistributionPoint[];
  periodLabel?: string | null;
  captureTargetId?: string;
};

type WrappedLabel = {
  lines: [string, string?];
  truncated: boolean;
};

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(value);
}

function wrapLabelToTwoLines(label: string, maxCharsPerLine: number): WrappedLabel {
  const normalized = label.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { lines: [''], truncated: false };
  }

  const safeLimit = Math.max(8, maxCharsPerLine);
  const words = normalized.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  let truncated = false;

  const pushLine = () => {
    lines.push(currentLine.trim());
    currentLine = '';
  };

  for (const rawWord of words) {
    const word = rawWord.trim();
    if (!word) {
      continue;
    }

    if (word.length > safeLimit) {
      if (currentLine) {
        pushLine();
      }
      lines.push(word.slice(0, safeLimit));
      if (lines.length >= 2) {
        truncated = true;
        break;
      }
      const remaining = word.slice(safeLimit);
      if (remaining.length > 0) {
        lines.push(remaining.slice(0, safeLimit));
        if (remaining.length > safeLimit) {
          truncated = true;
          break;
        }
        if (lines.length >= 2) {
          continue;
        }
      }
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= safeLimit) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      pushLine();
    }

    if (lines.length >= 2) {
      truncated = true;
      break;
    }

    currentLine = word;
  }

  if (!truncated && currentLine) {
    lines.push(currentLine);
  }

  if (lines.length > 2) {
    truncated = true;
    lines.length = 2;
  }

  if (truncated || lines.join(' ').length < normalized.length) {
    truncated = true;
    const lastIndex = Math.min(lines.length, 2) - 1;
    if (lastIndex >= 0) {
      const base = lines[lastIndex].replace(/\.{3,}$/, '').trimEnd();
      lines[lastIndex] =
        base.length >= safeLimit
          ? `${base.slice(0, Math.max(0, safeLimit - 1)).trimEnd()}…`
          : `${base}…`;
    }
  }

  if (lines.length === 0) {
    lines.push(normalized.slice(0, safeLimit));
  }

  return { lines: [lines[0], lines[1]], truncated };
}

export function DashboardQuestionCategoryDistributionChart({
  points,
  periodLabel,
  captureTargetId
}: DashboardQuestionCategoryDistributionChartProps) {
  const {
    showGridLines,
    showValueLabels,
    presentationMode,
    fontScale,
    contentChartTextScale,
    contentCanvasRatio
  } = useDashboardGlobalKpiControls();
  const fontScaleMultiplier = fontScale === 'xl' ? 1.28 : fontScale === 'l' ? 1.15 : 1;
  const chartTextScaleMultiplier = contentChartTextScale / 100;
  const effectiveTextScaleMultiplier = fontScaleMultiplier * chartTextScaleMultiplier;
  const isCaptureCanvas = Boolean(captureTargetId);
  const axisTickSize = Math.round((presentationMode ? 20 : 15) * effectiveTextScaleMultiplier);
  const valueLabelFontSize = Math.round((presentationMode ? 18 : 14) * effectiveTextScaleMultiplier);
  const chartTitleFontSize = Math.round((presentationMode ? 24 : 18) * effectiveTextScaleMultiplier);
  const chartSubTitleFontSize = Math.round((presentationMode ? 16 : 13) * effectiveTextScaleMultiplier);
  const axisTickColor = presentationMode ? 'rgb(71 85 105)' : 'rgb(100 116 139)';
  const labelTextSize = Math.max(11, Math.round(axisTickSize * 0.92));
  const labelMaxCharsPerLine = presentationMode ? 52 : 42;
  const chartBottomMargin = Math.max(presentationMode ? 18 : 14, Math.round(axisTickSize * 1.15));
  const chartRightMargin = Math.max(
    presentationMode ? 56 : 40,
    Math.round(valueLabelFontSize * 2.8)
  );
  const xAxisTickMargin = Math.max(10, Math.round(axisTickSize * 0.5));
  const chartHeight = Math.max(300, points.length * (presentationMode ? 84 : 70));
  const chartContainerClassName = cn(
    'w-full rounded-[24px] border border-slate-200 bg-white p-4 pb-5',
    isCaptureCanvas ? getDashboardContentCanvasAspectClass(contentCanvasRatio) : null
  );
  const barSize = Math.max(
    18,
    Math.min(
      presentationMode ? 50 : 42,
      Math.floor((isCaptureCanvas ? 300 : 240) / Math.max(points.length, 1))
    )
  );

  return (
    <div className={chartContainerClassName} id={captureTargetId}>
      <div className={cn('flex flex-col gap-3', isCaptureCanvas ? 'h-full min-h-0' : null)}>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h4
              className="font-semibold leading-tight text-slate-900"
              style={{ fontSize: chartTitleFontSize }}
            >
              Question category distribution
            </h4>
            {periodLabel ? (
              <p className="mt-1 text-slate-600" style={{ fontSize: chartSubTitleFontSize }}>
                {periodLabel}
              </p>
            ) : null}
          </div>
        </div>
        <div className={cn(isCaptureCanvas ? 'min-h-0 flex-1' : null)} style={isCaptureCanvas ? undefined : { height: chartHeight }}>
          <BarChart
            data={points}
            layout="vertical"
            margin={{
              top: presentationMode ? 18 : 14,
              right: chartRightMargin,
              left: presentationMode ? 12 : 8,
              bottom: chartBottomMargin
            }}
            responsive
            style={{ height: '100%', width: '100%' }}
          >
            {showGridLines ? (
              <CartesianGrid
                horizontal={false}
                opacity={0.88}
                stroke={presentationMode ? 'rgba(148,163,184,0.58)' : 'rgba(148,163,184,0.46)'}
                strokeDasharray="4 4"
                strokeWidth={1.1}
              />
            ) : null}
            <XAxis
              axisLine={false}
              minTickGap={Math.max(16, Math.round(axisTickSize * 1.6))}
              tick={{ fill: axisTickColor, fontSize: axisTickSize, fontWeight: 700 }}
              tickFormatter={(value) => formatCount(Number(value ?? 0))}
              tickMargin={xAxisTickMargin}
              tickLine={false}
              type="number"
            />
            <YAxis
              axisLine={false}
              dataKey="id"
              hide
              tickLine={false}
              type="category"
              width={0}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) {
                  return null;
                }

                const point = payload[0]?.payload as
                  | DashboardQuestionCategoryDistributionPoint
                  | undefined;
                if (!point) {
                  return null;
                }

                return (
                  <div className="min-w-[220px] rounded-xl border border-border/60 bg-background/95 p-3 shadow-xl backdrop-blur">
                    <div className="text-base font-semibold text-foreground">{point.label}</div>
                    <div className="mt-2 flex items-center justify-between gap-4 text-sm">
                      <div className="text-muted-foreground">Questions</div>
                      <div className="font-semibold text-foreground">{formatCount(point.count)}</div>
                    </div>
                  </div>
                );
              }}
              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
            />
            <Bar
              barSize={barSize}
              dataKey="count"
              fill="#10b981"
              radius={[0, 12, 12, 0]}
            >
              <LabelList
                content={(labelProps: any) => {
                  const rawX = Number(labelProps?.x);
                  const rawY = Number(labelProps?.y);
                  const rawHeight = Number(labelProps?.height);
                  if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawHeight)) {
                    return null;
                  }

                  const point = labelProps?.payload as
                    | DashboardQuestionCategoryDistributionPoint
                    | undefined;
                  const categoryLabel = String(labelProps?.value ?? point?.label ?? '');
                  if (!categoryLabel) {
                    return null;
                  }

                  const { lines } = wrapLabelToTwoLines(categoryLabel, labelMaxCharsPerLine);
                  const hasSecondLine = !!lines[1];
                  const lineHeight = Math.max(11, Math.round(labelTextSize * 0.95));
                  const gapAboveBar = Math.max(8, Math.round(labelTextSize * 0.55));
                  const labelX = rawX + 4;
                  const labelY = hasSecondLine
                    ? rawY - gapAboveBar - lineHeight
                    : rawY - gapAboveBar;

                  return (
                    <g transform={`translate(${labelX},${labelY})`}>
                      <title>{categoryLabel}</title>
                      <text
                        fill={axisTickColor}
                        fontSize={labelTextSize}
                        fontWeight={700}
                        textAnchor="start"
                      >
                        <tspan x={0}>
                          {lines[0]}
                        </tspan>
                        {hasSecondLine ? (
                          <tspan dy={lineHeight} x={0}>
                            {lines[1]}
                          </tspan>
                        ) : null}
                      </text>
                    </g>
                  );
                }}
                dataKey="label"
              />
              {showValueLabels ? (
                <LabelList
                  content={(valueProps: any) => {
                    const rawX = Number(valueProps?.x);
                    const rawY = Number(valueProps?.y);
                    const rawWidth = Number(valueProps?.width);
                    const rawHeight = Number(valueProps?.height);
                    if (
                      !Number.isFinite(rawX) ||
                      !Number.isFinite(rawY) ||
                      !Number.isFinite(rawWidth) ||
                      !Number.isFinite(rawHeight)
                    ) {
                      return null;
                    }

                    const numericValue = Number(valueProps.value ?? 0) || 0;
                    const safeWidth = Number.isFinite(rawWidth) ? rawWidth : 0;
                    const labelX = rawX + Math.max(safeWidth, 0) + Math.max(8, Math.round(valueLabelFontSize * 0.38));
                    const labelY = rawY + rawHeight / 2;

                    return (
                      <text
                        fill="#334155"
                        fontSize={valueLabelFontSize}
                        fontWeight={700}
                        textAnchor="start"
                        x={labelX}
                        y={labelY}
                        dominantBaseline="middle"
                      >
                        {formatCount(numericValue)}
                      </text>
                    );
                  }}
                  dataKey="count"
                />
              ) : null}
            </Bar>
          </BarChart>
        </div>
      </div>
    </div>
  );
}
