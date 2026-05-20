'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CheckCircle2, Circle, Copy, Loader2, UsersRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import type {
  BrandKpiPlanResponse,
  CompetitorReportingMode,
  CompetitorYearSetupResponse,
  KpiCatalogItem,
  ReportingListResponse,
  ReportingYearSetupStatus
} from '@/lib/reporting-api';
import {
  buildRollingYearValues,
  REPORTING_YEAR_LOOKAHEAD
} from '@/lib/year-options';

import { CompetitorSetupManager } from '../../[brandId]/competitor-setup/competitor-setup-manager';
import { BrandKpiPlanManager } from './brand-kpi-plan-manager';

type Props = {
  brandCode: string;
  initialYear: number;
  initialYearOptions: ReportingListResponse['yearOptions'];
  initialSetup: ReportingYearSetupStatus;
  initialKpiCatalog: KpiCatalogItem[];
  initialKpiPlan: BrandKpiPlanResponse;
  initialCompetitorSetup: CompetitorYearSetupResponse;
  initialEditorTab?: EditorTab;
  hasExplicitYear: boolean;
};

type EditorTab = 'kpi' | 'competitors';
type CopyMode = 'kpi' | 'competitors' | 'both' | null;

function parseErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    Array.isArray((payload as { message?: unknown }).message)
  ) {
    return ((payload as { message: string[] }).message).join(', ');
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof (payload as { message?: unknown }).message === 'string'
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
}

function buildYearOptionLabel(option: ReportingListResponse['yearOptions'][number]) {
  if (option.isReady) {
    return String(option.year);
  }

  return `${option.year} · setup required`;
}

function competitorModeLabel(mode: CompetitorReportingMode) {
  return mode === 'with_competitors' ? 'With Competitors' : 'Without Competitors';
}

const DEFAULT_COMPETITOR_MODE: ReportingYearSetupStatus['competitorMode'] = {
  mode: 'with_competitors',
  label: 'With Competitors'
};

function normalizeSetupStatus(
  setup: ReportingYearSetupStatus | null | undefined,
  fallbackYear: number
): ReportingYearSetupStatus {
  return {
    year: setup?.year ?? fallbackYear,
    canCreateReport: setup?.canCreateReport ?? false,
    summary:
      setup?.summary ?? 'Complete year setup before creating reports.',
    checks: setup?.checks ?? [],
    competitorMode: setup?.competitorMode ?? DEFAULT_COMPETITOR_MODE
  };
}

export function BrandYearSetupManager({
  brandCode,
  initialYear,
  initialYearOptions,
  initialSetup,
  initialKpiCatalog,
  initialKpiPlan,
  initialCompetitorSetup,
  initialEditorTab = 'kpi',
  hasExplicitYear
}: Props) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  const currentYear = new Date().getUTCFullYear();

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [yearOptions, setYearOptions] = useState(initialYearOptions ?? []);
  const [setup, setSetup] = useState<ReportingYearSetupStatus>(
    normalizeSetupStatus(initialSetup, initialYear)
  );
  const [kpiPlan, setKpiPlan] = useState(initialKpiPlan);
  const [competitorSetup, setCompetitorSetup] = useState(initialCompetitorSetup);
  const [editorTab, setEditorTab] = useState<EditorTab>(initialEditorTab);
  const [copyMode, setCopyMode] = useState<CopyMode>(null);
  const [copyTargetYear, setCopyTargetYear] = useState<number | null>(null);
  const [pendingModeChange, setPendingModeChange] = useState<CompetitorReportingMode | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const setupWorkspaceRef = useRef<HTMLDivElement | null>(null);

  function replaceWorkbenchUrl(nextTab: EditorTab, year = selectedYear) {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set('tab', nextTab);
    params.set('year', String(year));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }

  function selectEditorTab(nextTab: EditorTab) {
    setEditorTab(nextTab);
    replaceWorkbenchUrl(nextTab);
  }

  function jumpToEditorTab(nextTab: EditorTab) {
    selectEditorTab(nextTab);
    window.requestAnimationFrame(() => {
      setupWorkspaceRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }

  function readinessTargetHref(checkKey: ReportingYearSetupStatus['checks'][number]['key']) {
    if (checkKey === 'question_assignments') {
      return `/app/brands/${brandCode}?tab=questions`;
    }

    if (checkKey === 'related_product_options') {
      return `/app/brands/${brandCode}?tab=columns`;
    }

    return null;
  }

  const appliedDefaultYearRef = useRef(false);
  const displayYearOptions = useMemo(() => {
    const optionByYear = new Map(yearOptions.map((option) => [option.year, option]));
    const years = buildRollingYearValues([...optionByYear.keys(), selectedYear]);

    return years.map((year) => {
      return (
        optionByYear.get(year) ?? {
          year,
          isReady: false,
          hasReports: false
        }
      );
    });
  }, [selectedYear, yearOptions]);

  const preferredDefaultYear = useMemo(() => {
    const currentYearOption = displayYearOptions.find((option) => option.year === currentYear);
    if (currentYearOption?.isReady) {
      return currentYear;
    }

    const latestReadyYear = displayYearOptions
      .filter((option) => option.isReady)
      .reduce<number | null>((max, option) => {
        if (max === null) {
          return option.year;
        }
        return Math.max(max, option.year);
      }, null);

    return latestReadyYear ?? currentYear;
  }, [currentYear, displayYearOptions]);

  const copyTargetYearOptions = useMemo(() => {
    return buildRollingYearValues(
      [...displayYearOptions.map((option) => option.year), selectedYear + 1],
      {
        lookahead: REPORTING_YEAR_LOOKAHEAD
      }
    )
      .filter((year) => year !== selectedYear)
      .sort((left, right) => right - left);
  }, [displayYearOptions, selectedYear]);

  useEffect(() => {
    if (appliedDefaultYearRef.current) {
      return;
    }

    if (hasExplicitYear) {
      appliedDefaultYearRef.current = true;
      return;
    }

    if (preferredDefaultYear === selectedYear) {
      appliedDefaultYearRef.current = true;
      return;
    }

    appliedDefaultYearRef.current = true;
    void loadYear(preferredDefaultYear);
  }, [hasExplicitYear, preferredDefaultYear, selectedYear]);

  async function fetchReportingYearSetup(year: number) {
    const response = await fetch(`${apiBase}/brands/${brandCode}/reporting-periods?year=${year}`, {
      cache: 'no-store'
    });
    const payload = (await response
      .json()
      .catch(() => null)) as ReportingListResponse | { message?: string | string[] } | null;

    if (!response.ok) {
      throw new Error(parseErrorMessage(payload, `Failed to load year setup for ${year}.`));
    }

    return payload as ReportingListResponse;
  }

  async function fetchKpiPlan(year: number) {
    const response = await fetch(`${apiBase}/brands/${brandCode}/kpi-plans/${year}`, {
      cache: 'no-store'
    });
    const payload = (await response
      .json()
      .catch(() => null)) as BrandKpiPlanResponse | { message?: string | string[] } | null;

    if (!response.ok) {
      throw new Error(parseErrorMessage(payload, `Failed to load KPI plan for ${year}.`));
    }

    return payload as BrandKpiPlanResponse;
  }

  async function fetchCompetitorSetup(year: number) {
    const response = await fetch(`${apiBase}/brands/${brandCode}/competitor-setup/${year}`, {
      cache: 'no-store'
    });
    const payload = (await response
      .json()
      .catch(() => null)) as
      | CompetitorYearSetupResponse
      | { message?: string | string[] }
      | null;

    if (!response.ok) {
      throw new Error(
        parseErrorMessage(payload, `Failed to load competitor setup for year ${year}.`)
      );
    }

    return payload as CompetitorYearSetupResponse;
  }

  async function fetchYearBundle(year: number) {
    const [reportingYear, loadedKpiPlan, loadedCompetitorSetup] = await Promise.all([
      fetchReportingYearSetup(year),
      fetchKpiPlan(year),
      fetchCompetitorSetup(year)
    ]);

    return {
      reportingYear,
      loadedKpiPlan,
      loadedCompetitorSetup
    };
  }

  function applyBundle(bundle: {
    reportingYear: ReportingListResponse;
    loadedKpiPlan: BrandKpiPlanResponse;
    loadedCompetitorSetup: CompetitorYearSetupResponse;
  }) {
    setSelectedYear(bundle.reportingYear.year);
    setYearOptions(bundle.reportingYear.yearOptions ?? []);
    setSetup(
      normalizeSetupStatus(
        bundle.reportingYear.selectedYearSetup,
        bundle.reportingYear.year
      )
    );
    setKpiPlan(bundle.loadedKpiPlan);
    setCompetitorSetup(bundle.loadedCompetitorSetup);
    replaceWorkbenchUrl(editorTab, bundle.reportingYear.year);
  }

  async function loadYear(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      setStatusError('Year must be between 2000 and 3000.');
      return;
    }

    setPendingKey('load-year');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const bundle = await fetchYearBundle(year);
      applyBundle(bundle);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : `Failed to load year setup for ${year}.`
      );
    } finally {
      setPendingKey(null);
    }
  }

  async function refreshSetupStatusForYear(year: number) {
    try {
      const refreshed = await fetchReportingYearSetup(year);
      setYearOptions(refreshed.yearOptions ?? []);
      if (year === selectedYear) {
        setSetup(normalizeSetupStatus(refreshed.selectedYearSetup, refreshed.year));
      }
    } catch {
      // Ignore silent refresh failures from background sync hooks.
    }
  }

  function handleKpiPlanChanged(nextPlan: BrandKpiPlanResponse) {
    setKpiPlan(nextPlan);
    void refreshSetupStatusForYear(nextPlan.year);
  }

  function handleCompetitorSetupChanged(nextSetup: CompetitorYearSetupResponse) {
    setCompetitorSetup(nextSetup);
    void refreshSetupStatusForYear(nextSetup.year);
  }

  function openCopyModal(mode: Exclude<CopyMode, null>) {
    setCopyMode(mode);
    setStatusError(null);
    setStatusMessage(null);

    const defaultTarget =
      copyTargetYearOptions.find((year) => year === selectedYear + 1) ??
      copyTargetYearOptions[0] ??
      null;
    setCopyTargetYear(defaultTarget);
  }

  function closeCopyModal() {
    setCopyMode(null);
    setCopyTargetYear(null);
  }

  async function copyKpi(sourceYear: number, targetYear: number) {
    const sourcePlan = await fetchKpiPlan(sourceYear);

    const response = await fetch(`${apiBase}/brands/${brandCode}/kpi-plans/${targetYear}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: sourcePlan.items.map((item, index) => ({
          kpiCatalogId: item.kpi.id,
          targetValue: item.targetValue,
          note: item.note,
          sortOrder: item.sortOrder ?? index + 1
        }))
      })
    });
    const payload = (await response
      .json()
      .catch(() => null)) as BrandKpiPlanResponse | { message?: string | string[] } | null;

    if (!response.ok) {
      throw new Error(
        parseErrorMessage(payload, `Failed to copy KPI from ${sourceYear} to ${targetYear}.`)
      );
    }

    return sourcePlan.items.length;
  }

  async function copyCompetitors(sourceYear: number, targetYear: number) {
    const response = await fetch(
      `${apiBase}/brands/${brandCode}/competitor-setup/${targetYear}/copy-from/${sourceYear}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    const payload = (await response
      .json()
      .catch(() => null)) as { copiedCount?: number; message?: string | string[] } | null;

    if (!response.ok) {
      throw new Error(
        parseErrorMessage(
          payload,
          `Failed to copy competitors from ${sourceYear} to ${targetYear}.`
        )
      );
    }

    return payload?.copiedCount ?? 0;
  }

  async function updateCompetitorMode(mode: CompetitorReportingMode) {
    setPendingKey('competitor-mode');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(
        `${apiBase}/brands/${brandCode}/competitor-setup/${selectedYear}/mode`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ mode })
        }
      );
      const payload = (await response
        .json()
        .catch(() => null)) as
        | CompetitorYearSetupResponse
        | { message?: string | string[] }
        | null;

      if (!response.ok) {
        throw new Error(parseErrorMessage(payload, 'Failed to update competitor mode.'));
      }

      const updatedCompetitorSetup = payload as CompetitorYearSetupResponse;
      const refreshed = await fetchReportingYearSetup(selectedYear);
      setCompetitorSetup(updatedCompetitorSetup);
      setYearOptions(refreshed.yearOptions ?? []);
      setSetup(normalizeSetupStatus(refreshed.selectedYearSetup, refreshed.year));
      setStatusMessage(
        `Competitor mode updated to ${competitorModeLabel(mode)} for ${selectedYear}.`
      );
      setPendingModeChange(null);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : 'Failed to update competitor mode.'
      );
    } finally {
      setPendingKey(null);
    }
  }

  async function confirmCopy() {
    if (!copyMode || copyTargetYear === null) {
      return;
    }

    if (copyTargetYear === selectedYear) {
      setStatusError('Target year must be different from source year.');
      return;
    }

    setPendingKey('copy');
    setStatusError(null);
    setStatusMessage(null);

    try {
      if (copyMode === 'kpi') {
        const count = await copyKpi(selectedYear, copyTargetYear);
        const refreshed = await fetchReportingYearSetup(selectedYear);
        setYearOptions(refreshed.yearOptions ?? []);
        setSetup(normalizeSetupStatus(refreshed.selectedYearSetup, refreshed.year));
        setStatusMessage(`Copied ${count} KPI items to ${copyTargetYear}.`);
      } else if (copyMode === 'competitors') {
        const count = await copyCompetitors(selectedYear, copyTargetYear);
        const refreshed = await fetchReportingYearSetup(selectedYear);
        setYearOptions(refreshed.yearOptions ?? []);
        setSetup(normalizeSetupStatus(refreshed.selectedYearSetup, refreshed.year));
        setStatusMessage(`Copied ${count} competitors to ${copyTargetYear}.`);
      } else {
        const [kpiCount, competitorCount] = await Promise.all([
          copyKpi(selectedYear, copyTargetYear),
          copyCompetitors(selectedYear, copyTargetYear)
        ]);
        await loadYear(copyTargetYear);
        setStatusMessage(
          `Copied KPI (${kpiCount}) and competitors (${competitorCount}) to ${copyTargetYear}.`
        );
      }

      closeCopyModal();
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Copy failed.');
    } finally {
      setPendingKey(null);
    }
  }

  const copyModalTitle =
    copyMode === 'kpi'
      ? 'Copy KPI'
      : copyMode === 'competitors'
        ? 'Copy competitors'
        : 'Copy KPI and competitors';

  return (
    <div className="space-y-5">
      {statusMessage && !copyMode ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}

      {statusError && !copyMode ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}

      <div className="rounded-[24px] border border-border/60 bg-background/60 p-4 shadow-sm shadow-black/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-base font-semibold text-foreground">Year setup</div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Choose the reporting year and copy setup data when you need a faster start.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant="outline">{setup.competitorMode.label}</Badge>
            <Badge variant="outline">
              {setup.canCreateReport ? 'Ready for reporting' : 'Setup required'}
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,260px)_auto] xl:items-end">
          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="year-setup-selected-year"
            >
              Selected year
            </label>
            <Select
              className="h-11"
              disabled={pendingKey !== null}
              id="year-setup-selected-year"
              onChange={(event) => void loadYear(Number(event.currentTarget.value))}
              value={String(selectedYear)}
            >
              {displayYearOptions.map((option) => (
                <option key={option.year} value={option.year}>
                  {buildYearOptionLabel(option)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pendingKey !== null}
              onClick={() => openCopyModal('kpi')}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy />
              Copy KPI
            </Button>
            <Button
              disabled={pendingKey !== null}
              onClick={() => openCopyModal('competitors')}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy />
              Copy competitors
            </Button>
            <Button
              disabled={pendingKey !== null}
              onClick={() => openCopyModal('both')}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy />
              Copy KPI + competitors
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-border/60 bg-background/60 p-4" ref={setupWorkspaceRef}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-base font-semibold text-foreground">Setup workbench</div>
          <Badge variant="outline">Year {selectedYear}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            aria-pressed={editorTab === 'kpi'}
            className={`border px-4 ${
              editorTab === 'kpi'
                ? 'border-primary/40 bg-primary/10 text-foreground shadow-sm shadow-primary/10 hover:bg-primary/12'
                : 'border-border/70 bg-transparent text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground'
            }`}
            disabled={pendingKey !== null}
            onClick={() => selectEditorTab('kpi')}
            size="sm"
            type="button"
            variant="outline"
          >
            <BarChart3 className="text-primary" />
            KPI
          </Button>
          <Button
            aria-pressed={editorTab === 'competitors'}
            className={`border px-4 ${
              editorTab === 'competitors'
                ? 'border-primary/40 bg-primary/10 text-foreground shadow-sm shadow-primary/10 hover:bg-primary/12'
                : 'border-border/70 bg-transparent text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground'
            }`}
            disabled={pendingKey !== null}
            onClick={() => selectEditorTab('competitors')}
            size="sm"
            type="button"
            variant="outline"
          >
            <UsersRound className="text-primary" />
            Competitors
          </Button>
        </div>

        <div className="mt-4">
          {editorTab === 'kpi' ? (
            <BrandKpiPlanManager
              brandCode={brandCode}
              catalog={initialKpiCatalog}
              initialYear={selectedYear}
              key={`year-setup-kpi-${selectedYear}`}
              onPlanChanged={handleKpiPlanChanged}
              plan={kpiPlan}
              showYearPicker={false}
            />
          ) : (
            <CompetitorSetupManager
              brandId={brandCode}
              initialSetup={competitorSetup}
              initialYear={selectedYear}
              key={`year-setup-competitor-${selectedYear}`}
              modeChangePending={pendingKey === 'competitor-mode'}
              modeChangePendingTarget={
                pendingKey === 'competitor-mode' ? pendingModeChange : null
              }
              onModeChangeRequest={setPendingModeChange}
              onSetupChanged={handleCompetitorSetupChanged}
              showYearPicker={false}
            />
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-border/60 bg-background/60 p-4">
        <div className="space-y-2">
          <div className="text-base font-semibold text-foreground">Readiness for {setup.year}</div>
          <div className="text-sm text-muted-foreground">{setup.summary}</div>
        </div>

        <div className="mt-4 space-y-2">
          {setup.checks.map((check) => (
            <div
              className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/55 px-3 py-2"
              key={check.key}
            >
              <div className="pt-0.5">
                {check.passed ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  <span>{check.label}</span>
                  <Badge variant="outline">{check.required ? 'Required' : 'Optional'}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{check.detail}</div>
              </div>
              <div className="pt-0.5">
                {check.key === 'kpi_plan' ? (
                  <Button
                    onClick={() => jumpToEditorTab('kpi')}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Go to section
                  </Button>
                ) : check.key === 'competitor_assignments' ? (
                  <Button
                    onClick={() => jumpToEditorTab('competitors')}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Go to section
                  </Button>
                ) : readinessTargetHref(check.key) ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={readinessTargetHref(check.key) ?? '#'}>
                      Go to section
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/${brandCode}/reports?year=${selectedYear}`}>Open reports</Link>
        </Button>
      </div>

      {copyMode ? (
        <ModalShell
          description={`Copy data from ${selectedYear} to another year.`}
          error={statusError}
          message={statusMessage}
          onClose={closeCopyModal}
          title={copyModalTitle}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="copy-target-year">
                Target year
              </label>
              <Select
                disabled={pendingKey !== null}
                id="copy-target-year"
                onChange={(event) => setCopyTargetYear(Number(event.currentTarget.value))}
                value={copyTargetYear === null ? '' : String(copyTargetYear)}
              >
                {copyTargetYear === null ? (
                  <option value="">Select target year</option>
                ) : null}
                {copyTargetYearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={pendingKey !== null}
                onClick={closeCopyModal}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={pendingKey !== null || copyTargetYear === null}
                onClick={() => void confirmCopy()}
                type="button"
              >
                Confirm copy
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {pendingModeChange ? (
        <ModalShell
          description={`This change will apply from month ${
            competitorSetup.summary.nextModeChangeEffectiveMonth ?? 1
          } of ${selectedYear}. Existing reports keep their current mode.`}
          error={statusError}
          onClose={() => setPendingModeChange(null)}
          showCloseButton={false}
          title={`Switch to ${competitorModeLabel(pendingModeChange)}?`}
        >
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              {pendingModeChange === 'with_competitors'
                ? 'The workflow will require active competitor assignments and monthly competitor monitoring from the effective month.'
                : 'The workflow will skip competitor monitoring from the effective month. Existing competitor assignments and monitoring data will stay stored.'}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={pendingKey !== null}
                onClick={() => setPendingModeChange(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={pendingKey !== null}
                onClick={() => void updateCompetitorMode(pendingModeChange)}
                type="button"
              >
                {pendingKey === 'competitor-mode' ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                Confirm change
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

