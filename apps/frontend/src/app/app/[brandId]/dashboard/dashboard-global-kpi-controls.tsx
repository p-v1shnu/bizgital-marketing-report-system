'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Camera, Settings2, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type DashboardGlobalKpiControlsContextValue = {
  showKpiGoalLines: boolean;
  showValueLabels: boolean;
  showLegend: boolean;
  showGridLines: boolean;
  showMomDelta: boolean;
  selectedKpiGoalYear: number;
  goalYears: number[];
  chartLayoutPreset: DashboardChartLayoutPreset;
  chartCaptureAspect: DashboardChartCaptureAspect;
  presentationMode: boolean;
  fontScale: DashboardFontScale;
  contentChartTextScale: DashboardChartTextScale;
  momDisplayMode: DashboardMomDisplayMode;
  contentPreset: DashboardContentPreset;
  contentMetricScale: DashboardContentMetricScale;
  contentFollowerScale: DashboardContentFollowerScale;
  contentBadgeScale: DashboardContentBadgeScale;
  contentCardAspect: DashboardContentCardAspect;
  contentCanvasRatio: DashboardContentCanvasRatio;
  contentSpacing: DashboardContentSpacing;
  contentShowDatasetRow: boolean;
  contentShowSourceLink: boolean;
  contentCaptureBackground: DashboardContentCaptureBackground;
  contentNoteScale: DashboardContentNoteScale;
  setShowKpiGoalLines: (value: boolean) => void;
  setShowValueLabels: (value: boolean) => void;
  setShowLegend: (value: boolean) => void;
  setShowGridLines: (value: boolean) => void;
  setShowMomDelta: (value: boolean) => void;
  setSelectedKpiGoalYear: (year: number) => void;
  setChartLayoutPreset: (preset: DashboardChartLayoutPreset) => void;
  setChartCaptureAspect: (value: DashboardChartCaptureAspect) => void;
  setPresentationMode: (value: boolean) => void;
  setFontScale: (value: DashboardFontScale) => void;
  setContentChartTextScale: (value: DashboardChartTextScale) => void;
  setMomDisplayMode: (value: DashboardMomDisplayMode) => void;
  setContentPreset: (value: DashboardContentPreset) => void;
  setContentMetricScale: (value: DashboardContentMetricScale) => void;
  setContentFollowerScale: (value: DashboardContentFollowerScale) => void;
  setContentBadgeScale: (value: DashboardContentBadgeScale) => void;
  setContentCardAspect: (value: DashboardContentCardAspect) => void;
  setContentCanvasRatio: (value: DashboardContentCanvasRatio) => void;
  setContentSpacing: (value: DashboardContentSpacing) => void;
  setContentShowDatasetRow: (value: boolean) => void;
  setContentShowSourceLink: (value: boolean) => void;
  setContentCaptureBackground: (value: DashboardContentCaptureBackground) => void;
  setContentNoteScale: (value: DashboardContentNoteScale) => void;
  resetDashboardControls: () => void;
};

export type DashboardChartLayoutPreset = 'focus' | 'two_columns' | 'three_columns';
export type DashboardChartCaptureAspect = '9_16' | '9_10';
export type DashboardFontScale = 'm' | 'l' | 'xl';
export type DashboardChartTextScale = 100 | 125 | 150 | 175 | 200 | 250 | 300;
export type DashboardMomDisplayMode = 'both' | 'value' | 'percent';
export type DashboardContentPreset = 'standard' | 'presentation' | 'compact';
export type DashboardContentMetricScale = 's' | 'm' | 'l';
export type DashboardContentFollowerScale = 'm' | 'l' | 'xl';
export type DashboardContentBadgeScale = 'm' | 'l' | 'xl';
export type DashboardContentCardAspect = '4_5' | '1_1' | '9_16';
export type DashboardContentCanvasRatio = '16_9' | '13_9' | '4_3';
export type DashboardContentSpacing = 'compact' | 'normal' | 'relaxed';
export type DashboardContentCaptureBackground = 'transparent' | 'white';
export type DashboardContentNoteScale = 100 | 200 | 300 | 500 | 800 | 1000;

const DashboardGlobalKpiControlsContext =
  createContext<DashboardGlobalKpiControlsContextValue | null>(null);

type DashboardGlobalKpiControlsProviderProps = {
  children: React.ReactNode;
  availableGoalYears: number[];
  defaultGoalYear: number;
};

export function DashboardGlobalKpiControlsProvider({
  children,
  availableGoalYears,
  defaultGoalYear
}: DashboardGlobalKpiControlsProviderProps) {
  const [showKpiGoalLines, setShowKpiGoalLines] = useState(true);
  const [showValueLabels, setShowValueLabels] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showMomDelta, setShowMomDelta] = useState(true);
  const [selectedKpiGoalYear, setSelectedKpiGoalYear] = useState(defaultGoalYear);
  const [chartLayoutPreset, setChartLayoutPreset] =
    useState<DashboardChartLayoutPreset>('three_columns');
  const [chartCaptureAspect, setChartCaptureAspect] =
    useState<DashboardChartCaptureAspect>('9_16');
  const [presentationMode, setPresentationMode] = useState(false);
  const [fontScale, setFontScale] = useState<DashboardFontScale>('m');
  const [contentChartTextScale, setContentChartTextScale] = useState<DashboardChartTextScale>(250);
  const [momDisplayMode, setMomDisplayMode] = useState<DashboardMomDisplayMode>('both');
  const [contentPreset, setContentPresetState] = useState<DashboardContentPreset>('standard');
  const [contentMetricScale, setContentMetricScale] =
    useState<DashboardContentMetricScale>('m');
  const [contentFollowerScale, setContentFollowerScale] =
    useState<DashboardContentFollowerScale>('l');
  const [contentBadgeScale, setContentBadgeScale] =
    useState<DashboardContentBadgeScale>('l');
  const [contentCardAspect, setContentCardAspect] =
    useState<DashboardContentCardAspect>('4_5');
  const [contentCanvasRatio, setContentCanvasRatio] =
    useState<DashboardContentCanvasRatio>('16_9');
  const [contentSpacing, setContentSpacing] =
    useState<DashboardContentSpacing>('normal');
  const [contentShowDatasetRow, setContentShowDatasetRow] = useState(false);
  const [contentShowSourceLink, setContentShowSourceLink] = useState(false);
  const [contentCaptureBackground, setContentCaptureBackground] =
    useState<DashboardContentCaptureBackground>('transparent');
  const [contentNoteScale, setContentNoteScale] =
    useState<DashboardContentNoteScale>(1000);

  const setContentPreset = (value: DashboardContentPreset) => {
    setContentPresetState(value);

    if (value === 'presentation') {
      setContentMetricScale('l');
      setContentFollowerScale('xl');
      setContentBadgeScale('xl');
      setContentCardAspect('4_5');
      setContentCanvasRatio('16_9');
      setContentSpacing('relaxed');
      setContentShowDatasetRow(false);
      setContentShowSourceLink(false);
      setContentCaptureBackground('transparent');
      setContentNoteScale(1000);
      setContentChartTextScale(250);
      return;
    }

    if (value === 'compact') {
      setContentMetricScale('s');
      setContentFollowerScale('m');
      setContentBadgeScale('m');
      setContentCardAspect('1_1');
      setContentCanvasRatio('16_9');
      setContentSpacing('compact');
      setContentShowDatasetRow(false);
      setContentShowSourceLink(false);
      setContentCaptureBackground('white');
      setContentNoteScale(300);
      setContentChartTextScale(150);
      return;
    }

    setContentMetricScale('m');
    setContentFollowerScale('l');
    setContentBadgeScale('l');
    setContentCardAspect('4_5');
    setContentCanvasRatio('16_9');
    setContentSpacing('normal');
    setContentShowDatasetRow(false);
    setContentShowSourceLink(false);
    setContentCaptureBackground('transparent');
    setContentNoteScale(1000);
    setContentChartTextScale(200);
  };

  const goalYears = useMemo(
    () => [...new Set(availableGoalYears)].sort((left, right) => right - left),
    [availableGoalYears]
  );

  const fallbackYear = useMemo(() => goalYears[0] ?? defaultGoalYear, [defaultGoalYear, goalYears]);
  const preferredDefaultYear = useMemo(
    () => (goalYears.includes(defaultGoalYear) ? defaultGoalYear : fallbackYear),
    [defaultGoalYear, fallbackYear, goalYears]
  );

  useEffect(() => {
    setSelectedKpiGoalYear((current) =>
      goalYears.length === 0 || goalYears.includes(current) ? current : preferredDefaultYear
    );
  }, [goalYears, preferredDefaultYear]);

  useEffect(() => {
    const savedPreset = window.localStorage.getItem('dashboard-chart-layout-preset');
    const savedPresentationMode = window.localStorage.getItem('dashboard-presentation-mode');
    const savedChartCaptureAspect = window.localStorage.getItem('dashboard-chart-capture-aspect');
    const savedShowKpi = window.localStorage.getItem('dashboard-show-kpi-goal-lines');
    const savedShowValues = window.localStorage.getItem('dashboard-show-value-labels');
    const savedShowLegend = window.localStorage.getItem('dashboard-show-legend');
    const savedShowGrid = window.localStorage.getItem('dashboard-show-grid-lines');
    const savedShowMom = window.localStorage.getItem('dashboard-show-mom-delta');
    const savedFontScale = window.localStorage.getItem('dashboard-font-scale');
    const savedContentChartTextScale =
      window.localStorage.getItem('dashboard-content-chart-text-scale') ??
      window.localStorage.getItem('dashboard-chart-text-scale');
    const savedMomDisplayMode = window.localStorage.getItem('dashboard-mom-display-mode');
    const savedContentPreset = window.localStorage.getItem('dashboard-content-preset');
    const savedContentMetricScale = window.localStorage.getItem('dashboard-content-metric-scale');
    const savedContentFollowerScale = window.localStorage.getItem(
      'dashboard-content-follower-scale'
    );
    const savedContentBadgeScale = window.localStorage.getItem('dashboard-content-badge-scale');
    const savedContentCardAspect = window.localStorage.getItem('dashboard-content-card-aspect');
    const savedContentCanvasRatio = window.localStorage.getItem('dashboard-content-canvas-ratio');
    const savedContentSpacing = window.localStorage.getItem('dashboard-content-spacing');
    const savedContentShowDatasetRow = window.localStorage.getItem(
      'dashboard-content-show-dataset-row'
    );
    const savedContentShowSourceLink = window.localStorage.getItem(
      'dashboard-content-show-source-link'
    );
    const savedContentCaptureBackground = window.localStorage.getItem(
      'dashboard-content-capture-background'
    );
    const savedContentNoteScale = window.localStorage.getItem('dashboard-content-note-scale');

    if (
      savedPreset === 'focus' ||
      savedPreset === 'two_columns' ||
      savedPreset === 'three_columns'
    ) {
      setChartLayoutPreset(savedPreset);
    }
    if (savedChartCaptureAspect === '9_16' || savedChartCaptureAspect === '9_10') {
      setChartCaptureAspect(savedChartCaptureAspect);
    }
    if (savedPresentationMode === 'true' || savedPresentationMode === 'false') {
      setPresentationMode(savedPresentationMode === 'true');
    }
    if (savedShowKpi === 'true' || savedShowKpi === 'false') {
      setShowKpiGoalLines(savedShowKpi === 'true');
    }
    if (savedShowValues === 'true' || savedShowValues === 'false') {
      setShowValueLabels(savedShowValues === 'true');
    }
    if (savedShowLegend === 'true' || savedShowLegend === 'false') {
      setShowLegend(savedShowLegend === 'true');
    }
    if (savedShowGrid === 'true' || savedShowGrid === 'false') {
      setShowGridLines(savedShowGrid === 'true');
    }
    if (savedShowMom === 'true' || savedShowMom === 'false') {
      setShowMomDelta(savedShowMom === 'true');
    }
    if (savedFontScale === 'm' || savedFontScale === 'l' || savedFontScale === 'xl') {
      setFontScale(savedFontScale);
    }
    if (
      savedContentChartTextScale === '100' ||
      savedContentChartTextScale === '125' ||
      savedContentChartTextScale === '150' ||
      savedContentChartTextScale === '175' ||
      savedContentChartTextScale === '200' ||
      savedContentChartTextScale === '250' ||
      savedContentChartTextScale === '300'
    ) {
      setContentChartTextScale(Number(savedContentChartTextScale) as DashboardChartTextScale);
    }
    if (
      savedMomDisplayMode === 'both' ||
      savedMomDisplayMode === 'value' ||
      savedMomDisplayMode === 'percent'
    ) {
      setMomDisplayMode(savedMomDisplayMode);
    }
    if (
      savedContentPreset === 'standard' ||
      savedContentPreset === 'presentation' ||
      savedContentPreset === 'compact'
    ) {
      setContentPresetState(savedContentPreset);
    }
    if (
      savedContentMetricScale === 's' ||
      savedContentMetricScale === 'm' ||
      savedContentMetricScale === 'l'
    ) {
      setContentMetricScale(savedContentMetricScale);
    }
    if (
      savedContentFollowerScale === 'm' ||
      savedContentFollowerScale === 'l' ||
      savedContentFollowerScale === 'xl'
    ) {
      setContentFollowerScale(savedContentFollowerScale);
    }
    if (
      savedContentBadgeScale === 'm' ||
      savedContentBadgeScale === 'l' ||
      savedContentBadgeScale === 'xl'
    ) {
      setContentBadgeScale(savedContentBadgeScale);
    }
    if (
      savedContentCardAspect === '4_5' ||
      savedContentCardAspect === '1_1' ||
      savedContentCardAspect === '9_16'
    ) {
      setContentCardAspect(savedContentCardAspect);
    }
    if (
      savedContentCanvasRatio === '16_9' ||
      savedContentCanvasRatio === '13_9' ||
      savedContentCanvasRatio === '4_3'
    ) {
      setContentCanvasRatio(savedContentCanvasRatio);
    }
    if (
      savedContentSpacing === 'compact' ||
      savedContentSpacing === 'normal' ||
      savedContentSpacing === 'relaxed'
    ) {
      setContentSpacing(savedContentSpacing);
    }
    if (savedContentShowDatasetRow === 'true' || savedContentShowDatasetRow === 'false') {
      setContentShowDatasetRow(savedContentShowDatasetRow === 'true');
    }
    if (savedContentShowSourceLink === 'true' || savedContentShowSourceLink === 'false') {
      setContentShowSourceLink(savedContentShowSourceLink === 'true');
    }
    if (
      savedContentCaptureBackground === 'transparent' ||
      savedContentCaptureBackground === 'white'
    ) {
      setContentCaptureBackground(savedContentCaptureBackground);
    }
    if (
      savedContentNoteScale === '100' ||
      savedContentNoteScale === '200' ||
      savedContentNoteScale === '300' ||
      savedContentNoteScale === '500' ||
      savedContentNoteScale === '800' ||
      savedContentNoteScale === '1000'
    ) {
      setContentNoteScale(Number(savedContentNoteScale) as DashboardContentNoteScale);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('dashboard-chart-layout-preset', chartLayoutPreset);
  }, [chartLayoutPreset]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-chart-capture-aspect', chartCaptureAspect);
  }, [chartCaptureAspect]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-presentation-mode', String(presentationMode));
  }, [presentationMode]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-show-kpi-goal-lines', String(showKpiGoalLines));
  }, [showKpiGoalLines]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-show-value-labels', String(showValueLabels));
  }, [showValueLabels]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-show-legend', String(showLegend));
  }, [showLegend]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-show-grid-lines', String(showGridLines));
  }, [showGridLines]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-show-mom-delta', String(showMomDelta));
  }, [showMomDelta]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-font-scale', fontScale);
  }, [fontScale]);

  useEffect(() => {
    window.localStorage.setItem(
      'dashboard-content-chart-text-scale',
      String(contentChartTextScale)
    );
  }, [contentChartTextScale]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-mom-display-mode', momDisplayMode);
  }, [momDisplayMode]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-content-preset', contentPreset);
  }, [contentPreset]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-content-metric-scale', contentMetricScale);
  }, [contentMetricScale]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-content-follower-scale', contentFollowerScale);
  }, [contentFollowerScale]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-content-badge-scale', contentBadgeScale);
  }, [contentBadgeScale]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-content-card-aspect', contentCardAspect);
  }, [contentCardAspect]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-content-canvas-ratio', contentCanvasRatio);
  }, [contentCanvasRatio]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-content-spacing', contentSpacing);
  }, [contentSpacing]);

  useEffect(() => {
    window.localStorage.setItem(
      'dashboard-content-show-dataset-row',
      String(contentShowDatasetRow)
    );
  }, [contentShowDatasetRow]);

  useEffect(() => {
    window.localStorage.setItem(
      'dashboard-content-show-source-link',
      String(contentShowSourceLink)
    );
  }, [contentShowSourceLink]);

  useEffect(() => {
    window.localStorage.setItem(
      'dashboard-content-capture-background',
      contentCaptureBackground
    );
  }, [contentCaptureBackground]);

  useEffect(() => {
    window.localStorage.setItem('dashboard-content-note-scale', String(contentNoteScale));
  }, [contentNoteScale]);

  const resetDashboardControls = () => {
    setShowKpiGoalLines(true);
    setShowValueLabels(true);
    setShowLegend(true);
    setShowGridLines(true);
    setShowMomDelta(true);
    setChartLayoutPreset('three_columns');
    setChartCaptureAspect('9_16');
    setPresentationMode(false);
    setFontScale('m');
    setContentChartTextScale(250);
    setMomDisplayMode('both');
    setContentPresetState('standard');
    setContentMetricScale('m');
    setContentFollowerScale('l');
    setContentBadgeScale('l');
    setContentCardAspect('4_5');
    setContentCanvasRatio('16_9');
    setContentSpacing('normal');
    setContentShowDatasetRow(false);
    setContentShowSourceLink(false);
    setContentCaptureBackground('transparent');
    setContentNoteScale(1000);
    setSelectedKpiGoalYear(preferredDefaultYear);
  };

  const contextValue = useMemo(
    () => ({
      showKpiGoalLines,
      showValueLabels,
      showLegend,
      showGridLines,
      showMomDelta,
      selectedKpiGoalYear,
      goalYears,
      chartLayoutPreset,
      chartCaptureAspect,
      presentationMode,
      fontScale,
      contentChartTextScale,
      momDisplayMode,
      contentPreset,
      contentMetricScale,
      contentFollowerScale,
      contentBadgeScale,
      contentCardAspect,
      contentCanvasRatio,
      contentSpacing,
      contentShowDatasetRow,
      contentShowSourceLink,
      contentCaptureBackground,
      contentNoteScale,
      setShowKpiGoalLines,
      setShowValueLabels,
      setShowLegend,
      setShowGridLines,
      setShowMomDelta,
      setSelectedKpiGoalYear,
      setChartLayoutPreset,
      setChartCaptureAspect,
      setPresentationMode,
      setFontScale,
      setContentChartTextScale,
      setMomDisplayMode,
      setContentPreset,
      setContentMetricScale,
      setContentFollowerScale,
      setContentBadgeScale,
      setContentCardAspect,
      setContentCanvasRatio,
      setContentSpacing,
      setContentShowDatasetRow,
      setContentShowSourceLink,
      setContentCaptureBackground,
      setContentNoteScale,
      resetDashboardControls
    }),
    [
      chartLayoutPreset,
      chartCaptureAspect,
      contentBadgeScale,
      contentCaptureBackground,
      contentCardAspect,
      contentCanvasRatio,
      contentFollowerScale,
      contentMetricScale,
      contentPreset,
      contentShowDatasetRow,
      contentShowSourceLink,
      contentSpacing,
      contentNoteScale,
      fontScale,
      contentChartTextScale,
      goalYears,
      momDisplayMode,
      presentationMode,
      selectedKpiGoalYear,
      showGridLines,
      showKpiGoalLines,
      showLegend,
      showMomDelta,
      showValueLabels
    ]
  );

  return (
    <DashboardGlobalKpiControlsContext.Provider value={contextValue}>
      {children}
    </DashboardGlobalKpiControlsContext.Provider>
  );
}

export function useDashboardGlobalKpiControls() {
  const context = useContext(DashboardGlobalKpiControlsContext);

  if (!context) {
    throw new Error(
      'useDashboardGlobalKpiControls must be used inside DashboardGlobalKpiControlsProvider.'
    );
  }

  return context;
}

export function DashboardGlobalKpiControls({
  dashboardView = 'charts'
}: {
  dashboardView?: 'charts' | 'content';
}) {
  const {
    showKpiGoalLines,
    showValueLabels,
    showLegend,
    showGridLines,
    showMomDelta,
    selectedKpiGoalYear,
    goalYears,
    chartLayoutPreset,
    chartCaptureAspect,
    presentationMode,
    fontScale,
    contentChartTextScale,
    momDisplayMode,
    contentMetricScale,
    contentFollowerScale,
    contentBadgeScale,
    contentCardAspect,
    contentCanvasRatio,
    contentSpacing,
    contentShowDatasetRow,
    contentShowSourceLink,
    contentCaptureBackground,
    contentNoteScale,
    setShowKpiGoalLines,
    setShowValueLabels,
    setShowLegend,
    setShowGridLines,
    setShowMomDelta,
    setSelectedKpiGoalYear,
    setChartLayoutPreset,
    setChartCaptureAspect,
    setPresentationMode,
    setFontScale,
    setContentChartTextScale,
    setMomDisplayMode,
    setContentMetricScale,
    setContentFollowerScale,
    setContentBadgeScale,
    setContentCardAspect,
    setContentCanvasRatio,
    setContentSpacing,
    setContentShowDatasetRow,
    setContentShowSourceLink,
    setContentCaptureBackground,
    setContentNoteScale,
    resetDashboardControls
  } = useDashboardGlobalKpiControls();
  const [showContentAdvancedMenu, setShowContentAdvancedMenu] = useState(false);

  useEffect(() => {
    if (dashboardView !== 'content') {
      setShowContentAdvancedMenu(false);
    }
  }, [dashboardView]);

  const chartsControls = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
        <div className="flex shrink-0 items-center gap-2">
        <label
          className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
          htmlFor="dashboard-chart-layout-preset"
        >
          Chart layout
        </label>
        <select
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring/60"
          id="dashboard-chart-layout-preset"
          onChange={(event) =>
            setChartLayoutPreset(event.target.value as DashboardChartLayoutPreset)
          }
          value={chartLayoutPreset}
        >
          <option value="focus">Focus (1 column)</option>
          <option value="two_columns">Presentation (2 columns)</option>
          <option value="three_columns">Summary (3 columns)</option>
        </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
        <label
          className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
          htmlFor="dashboard-chart-capture-aspect"
        >
          Capture ratio
        </label>
        <select
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring/60"
          id="dashboard-chart-capture-aspect"
          onChange={(event) =>
            setChartCaptureAspect(event.target.value as DashboardChartCaptureAspect)
          }
          value={chartCaptureAspect}
        >
          <option value="9_16">9:16</option>
          <option value="9_10">4.5:5</option>
        </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
        <label
          className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
          htmlFor="dashboard-kpi-goal-year"
        >
          KPI year
        </label>
        <select
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring/60"
          disabled={goalYears.length === 0}
          id="dashboard-kpi-goal-year"
          onChange={(event) => setSelectedKpiGoalYear(Number(event.target.value))}
          value={selectedKpiGoalYear}
        >
          {goalYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        </div>

        <label className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm">
        <input
          checked={showKpiGoalLines}
          className="size-4 accent-primary"
          onChange={(event) => setShowKpiGoalLines(event.target.checked)}
          type="checkbox"
        />
        Show KPI
        </label>

        <label className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm">
        <input
          checked={showValueLabels}
          className="size-4 accent-primary"
          onChange={(event) => setShowValueLabels(event.target.checked)}
          type="checkbox"
        />
        Show values
        </label>

        <label className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm">
        <input
          checked={showLegend}
          className="size-4 accent-primary"
          onChange={(event) => setShowLegend(event.target.checked)}
          type="checkbox"
        />
        Show legend
        </label>

        <label className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm">
        <input
          checked={showGridLines}
          className="size-4 accent-primary"
          onChange={(event) => setShowGridLines(event.target.checked)}
          type="checkbox"
        />
        Show grid
        </label>

        <label className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm">
        <input
          checked={showMomDelta}
          className="size-4 accent-primary"
          onChange={(event) => setShowMomDelta(event.target.checked)}
          type="checkbox"
        />
        Show monthly change
        </label>

        <div className="flex shrink-0 items-center gap-2">
        <label
          className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
          htmlFor="dashboard-font-scale"
        >
          Font scale
        </label>
        <select
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring/60"
          id="dashboard-font-scale"
          onChange={(event) => setFontScale(event.target.value as DashboardFontScale)}
          value={fontScale}
        >
          <option value="m">M</option>
          <option value="l">L</option>
          <option value="xl">XL</option>
        </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
        <label
          className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
          htmlFor="dashboard-mom-display-mode"
        >
          Change format
        </label>
        <select
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring/60"
          id="dashboard-mom-display-mode"
          onChange={(event) =>
            setMomDisplayMode(event.target.value as DashboardMomDisplayMode)
          }
          value={momDisplayMode}
        >
          <option value="both">Both</option>
          <option value="value">Value</option>
          <option value="percent">Percent</option>
        </select>
      </div>
      </div>
    </div>
  );

  const controlLabelClassName = 'text-xs uppercase tracking-[0.14em] text-muted-foreground';
  const controlSelectClassName =
    'h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring/60';
  const controlToggleClassName =
    'flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm';

  const contentControls = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
        <div className="flex shrink-0 items-center gap-2">
          <label className={controlLabelClassName} htmlFor="dashboard-content-chart-text-scale">
            Chart text
          </label>
          <select
            className={`${controlSelectClassName} w-[110px]`}
            id="dashboard-content-chart-text-scale"
            onChange={(event) =>
              setContentChartTextScale(Number(event.target.value) as DashboardChartTextScale)
            }
            value={contentChartTextScale}
          >
            <option value={100}>100%</option>
            <option value={125}>125%</option>
            <option value={150}>150%</option>
            <option value={175}>175%</option>
            <option value={200}>200%</option>
            <option value={250}>250%</option>
            <option value={300}>300%</option>
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className={controlLabelClassName} htmlFor="dashboard-content-metric-size">
            Metric size
          </label>
          <select
            className={`${controlSelectClassName} w-[80px]`}
            id="dashboard-content-metric-size"
            onChange={(event) =>
              setContentMetricScale(event.target.value as DashboardContentMetricScale)
            }
            value={contentMetricScale}
          >
            <option value="s">S</option>
            <option value="m">M</option>
            <option value="l">L</option>
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className={controlLabelClassName} htmlFor="dashboard-content-follower-size">
            Follower size
          </label>
          <select
            className={`${controlSelectClassName} w-[80px]`}
            id="dashboard-content-follower-size"
            onChange={(event) =>
              setContentFollowerScale(event.target.value as DashboardContentFollowerScale)
            }
            value={contentFollowerScale}
          >
            <option value="m">M</option>
            <option value="l">L</option>
            <option value="xl">XL</option>
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className={controlLabelClassName} htmlFor="dashboard-content-note-scale">
            Note size
          </label>
          <select
            className={`${controlSelectClassName} w-[95px]`}
            id="dashboard-content-note-scale"
            onChange={(event) =>
              setContentNoteScale(Number(event.target.value) as DashboardContentNoteScale)
            }
            value={contentNoteScale}
          >
            <option value={100}>100%</option>
            <option value={200}>200%</option>
            <option value={300}>300%</option>
            <option value={500}>500%</option>
            <option value={800}>800%</option>
            <option value={1000}>1000%</option>
          </select>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className={controlLabelClassName} htmlFor="dashboard-content-canvas-ratio">
            Canvas ratio
          </label>
          <select
            className={`${controlSelectClassName} w-[170px]`}
            id="dashboard-content-canvas-ratio"
            onChange={(event) =>
              setContentCanvasRatio(event.target.value as DashboardContentCanvasRatio)
            }
            value={contentCanvasRatio}
          >
            <option value="16_9">16:9 (Slide)</option>
            <option value="13_9">13:9 (Left panel)</option>
            <option value="4_3">4:3 (Classic)</option>
          </select>
        </div>
      </div>

      <div className="relative shrink-0">
        <Button
          aria-expanded={showContentAdvancedMenu}
          aria-label="Advanced options"
          className="h-9 rounded-xl px-3"
          onClick={() => setShowContentAdvancedMenu((current) => !current)}
          size="sm"
          type="button"
          variant={showContentAdvancedMenu ? 'default' : 'outline'}
        >
          <Settings2 className="size-4" />
        </Button>

        {showContentAdvancedMenu ? (
          <div className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-2xl border border-border/70 bg-background p-3 shadow-xl">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Advanced options
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3">
                <label className={controlLabelClassName} htmlFor="dashboard-content-badge-size">
                  Badge size
                </label>
                <select
                  className={`${controlSelectClassName} w-[120px]`}
                  id="dashboard-content-badge-size"
                  onChange={(event) =>
                    setContentBadgeScale(event.target.value as DashboardContentBadgeScale)
                  }
                  value={contentBadgeScale}
                >
                  <option value="m">M</option>
                  <option value="l">L</option>
                  <option value="xl">XL</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className={controlLabelClassName} htmlFor="dashboard-content-aspect">
                  Card aspect
                </label>
                <select
                  className={`${controlSelectClassName} w-[120px]`}
                  id="dashboard-content-aspect"
                  onChange={(event) =>
                    setContentCardAspect(event.target.value as DashboardContentCardAspect)
                  }
                  value={contentCardAspect}
                >
                  <option value="4_5">4:5</option>
                  <option value="1_1">1:1</option>
                  <option value="9_16">9:16</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <label className={controlLabelClassName} htmlFor="dashboard-content-capture-bg">
                  Capture bg
                </label>
                <select
                  className={`${controlSelectClassName} w-[140px]`}
                  id="dashboard-content-capture-bg"
                  onChange={(event) =>
                    setContentCaptureBackground(
                      event.target.value as DashboardContentCaptureBackground
                    )
                  }
                  value={contentCaptureBackground}
                >
                  <option value="transparent">Transparent</option>
                  <option value="white">White</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <label className={controlLabelClassName} htmlFor="dashboard-content-spacing">
                  Card spacing
                </label>
                <select
                  className={`${controlSelectClassName} w-[140px]`}
                  id="dashboard-content-spacing"
                  onChange={(event) => setContentSpacing(event.target.value as DashboardContentSpacing)}
                  value={contentSpacing}
                >
                  <option value="compact">Compact</option>
                  <option value="normal">Normal</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className={controlToggleClassName}>
                <input
                  checked={contentShowDatasetRow}
                  className="size-4 accent-primary"
                  onChange={(event) => setContentShowDatasetRow(event.target.checked)}
                  type="checkbox"
                />
                Show dataset row
              </label>

              <label className={controlToggleClassName}>
                <input
                  checked={contentShowSourceLink}
                  className="size-4 accent-primary"
                  onChange={(event) => setContentShowSourceLink(event.target.checked)}
                  type="checkbox"
                />
                Show source link
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const actionButtons = (
    <>
      <Button
        className="h-9 rounded-xl px-3"
        onClick={() => {
          const next = !presentationMode;
          if (next) {
            // Keep slide capture mode on the PPT-friendly ratio by default.
            setChartCaptureAspect('9_10');
          }
          setPresentationMode(next);
        }}
        size="sm"
        type="button"
        variant={presentationMode ? 'default' : 'outline'}
      >
        <Camera className="mr-1.5 size-4" />
        {presentationMode ? 'Capture mode: On' : 'Slide capture mode'}
      </Button>

      <Button onClick={resetDashboardControls} size="sm" type="button" variant="outline">
        Reset view
      </Button>
    </>
  );

  return (
    <Card className="sticky top-3 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      {dashboardView === 'content' ? (
        <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="size-4 text-primary" />
            Dashboard controls
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {contentControls}
            <div className="ml-auto flex shrink-0 items-center gap-2">{actionButtons}</div>
          </div>
        </CardContent>
      ) : (
        <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="size-4 text-primary" />
            Dashboard controls
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            {chartsControls}
            <div className="ml-auto flex shrink-0 items-center gap-2">{actionButtons}</div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
