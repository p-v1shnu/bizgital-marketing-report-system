'use client';

import { type ChangeEvent, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { evaluateFormulaExpression } from '@/lib/formula-engine';
import type {
  BrandKpiPlanResponse,
  CanonicalTargetField,
  ComputedFormulaResponse,
  ImportColumnMappingRule
} from '@/lib/reporting-api';

type KpiCheckClientProps = {
  planYear: number;
  planItems: BrandKpiPlanResponse['items'];
  formulas: ComputedFormulaResponse[];
  mappingRules: ImportColumnMappingRule[];
};

type ParsedCsv = {
  filename: string;
  headers: string[];
  dataRows: string[][];
};

type KpiCheckCard = {
  id: string;
  label: string;
  sourceLabel: string;
  sourceColumnName: string | null;
  targetValue: number | null;
  actualValue: number | null;
  varianceValue: number | null;
  rowCoverage: number;
  note: string | null;
};

const fallbackHeaderCandidatesByTarget: Record<CanonicalTargetField, string[]> = {
  views: ['Views', 'View count', 'Total views', 'Video views'],
  viewers: ['Viewers'],
  page_followers: ['Page Followers'],
  engagement: ['Engagement', 'Reactions, Comments and Shares', 'Total clicks'],
  video_views_3s: ['3-second video views', '3 second video views', '3s video views']
};

const canonicalTargets = new Set<CanonicalTargetField>([
  'views',
  'viewers',
  'page_followers',
  'engagement',
  'video_views_3s'
]);

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';

      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function parseNumber(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMetricValue(value: number | null) {
  if (value === null) {
    return 'No data';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function varianceTone(value: number | null) {
  if (value === null) {
    return 'text-muted-foreground';
  }

  if (value > 0) {
    return 'text-emerald-700 dark:text-emerald-300';
  }

  if (value < 0) {
    return 'text-rose-700 dark:text-rose-300';
  }

  return 'text-muted-foreground';
}

function formatTargetProgress(value: number) {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1
  }).format(value)}%`;
}

function buildKpiStatus(actualValue: number | null, targetValue: number | null) {
  if (targetValue === null || targetValue <= 0) {
    return {
      label: 'No target',
      badgeClass: 'border-border/60 text-muted-foreground',
      meterClass: 'bg-muted-foreground/30',
      progressPercent: null as number | null,
      progressText: 'Set yearly target'
    };
  }

  if (actualValue === null) {
    return {
      label: 'No data',
      badgeClass: 'border-amber-500/30 text-amber-700 dark:text-amber-300',
      meterClass: 'bg-amber-500/60',
      progressPercent: 0,
      progressText: 'No actual value'
    };
  }

  const ratio = actualValue / targetValue;
  const progressPercent = Math.max(0, Math.min(ratio * 100, 100));

  if (ratio >= 1) {
    return {
      label: ratio >= 1.2 ? 'Exceeded target' : 'Hit target',
      badgeClass: 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
      meterClass: 'bg-emerald-500',
      progressPercent,
      progressText:
        ratio >= 10
          ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(ratio)}x target`
          : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(ratio)}x target`
    };
  }

  if (ratio >= 0.8) {
    return {
      label: 'Near target',
      badgeClass: 'border-amber-500/30 text-amber-700 dark:text-amber-300',
      meterClass: 'bg-amber-500',
      progressPercent,
      progressText: formatTargetProgress(ratio * 100)
    };
  }

  return {
    label: 'Below target',
    badgeClass: 'border-rose-500/30 text-rose-700 dark:text-rose-300',
    meterClass: 'bg-rose-500',
    progressPercent,
    progressText: formatTargetProgress(ratio * 100)
  };
}

function parseCsvContent(content: string, filename: string): ParsedCsv {
  const normalizedContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const rows = parseCsvRows(normalizedContent).map((row) => row.map((cell) => cell.trim()));
  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => cell.trim().length > 0)
  );

  if (headerRowIndex === -1) {
    throw new Error('CSV file has no header row.');
  }

  const headers = (rows[headerRowIndex] ?? []).map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim()
  );
  const dataRows = rows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => cell.trim().length > 0));

  const nonEmptyHeaderCount = headers.filter((header) => header.length > 0).length;
  if (nonEmptyHeaderCount === 0) {
    throw new Error('CSV headers are empty.');
  }

  return {
    filename,
    headers,
    dataRows
  };
}

function toCanonicalTargetField(value: string): CanonicalTargetField | null {
  if (canonicalTargets.has(value as CanonicalTargetField)) {
    return value as CanonicalTargetField;
  }

  return null;
}

function buildHeaderCandidatesByTarget(mappingRules: ImportColumnMappingRule[]) {
  const byTarget = new Map<CanonicalTargetField, string[]>();

  for (const rule of mappingRules) {
    const targetField = toCanonicalTargetField(rule.targetField);
    if (!targetField) {
      continue;
    }

    const existing = byTarget.get(targetField) ?? [];
    const nextCandidates = Array.from(
      new Set(
        [rule.baselineHeader, rule.displayLabel, ...rule.aliases]
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0)
      )
    );
    byTarget.set(targetField, Array.from(new Set([...existing, ...nextCandidates])));
  }

  for (const targetField of Array.from(canonicalTargets.values())) {
    const existing = byTarget.get(targetField) ?? [];
    byTarget.set(targetField, [
      ...existing,
      ...fallbackHeaderCandidatesByTarget[targetField]
    ]);
  }

  return byTarget;
}

function findHeaderIndexByCandidates(headers: string[], candidates: string[]) {
  const indexByNormalizedHeader = new Map<string, number>();

  for (const [index, header] of headers.entries()) {
    const normalized = normalizeLabel(header);
    if (!normalized || indexByNormalizedHeader.has(normalized)) {
      continue;
    }
    indexByNormalizedHeader.set(normalized, index);
  }

  for (const candidate of candidates) {
    const normalized = normalizeLabel(candidate);
    if (!normalized) {
      continue;
    }

    const matchedIndex = indexByNormalizedHeader.get(normalized);
    if (matchedIndex !== undefined) {
      return matchedIndex;
    }
  }

  return -1;
}

function buildKpiCards(input: {
  parsedCsv: ParsedCsv;
  viewersManualValue: number | null;
  pageFollowersManualValue: number | null;
  planItems: BrandKpiPlanResponse['items'];
  formulas: ComputedFormulaResponse[];
  mappingRules: ImportColumnMappingRule[];
}): KpiCheckCard[] {
  const headerCandidatesByTarget = buildHeaderCandidatesByTarget(input.mappingRules);
  const formulaById = new Map(input.formulas.map((formula) => [formula.id, formula]));
  const headerIndexByTarget = new Map<CanonicalTargetField, number>();

  for (const targetField of Array.from(canonicalTargets.values())) {
    const candidates = headerCandidatesByTarget.get(targetField) ?? [];
    const index = findHeaderIndexByCandidates(input.parsedCsv.headers, candidates);
    if (index >= 0) {
      headerIndexByTarget.set(targetField, index);
    }
  }

  return input.planItems.map((item) => {
    if (item.kpi.sourceType === 'canonical_metric' && item.kpi.canonicalMetricKey) {
      const canonicalMetricKey = item.kpi.canonicalMetricKey;

      if (canonicalMetricKey === 'viewers') {
        const actualValue = input.viewersManualValue;
        return {
          id: item.id,
          label: item.kpi.label,
          sourceLabel: 'Viewers (manual check input)',
          sourceColumnName: null,
          targetValue: item.targetValue,
          actualValue,
          varianceValue:
            actualValue !== null && item.targetValue !== null
              ? actualValue - item.targetValue
              : null,
          rowCoverage: actualValue === null ? 0 : 1,
          note: actualValue === null ? 'Please input Viewers value.' : null
        };
      }

      if (canonicalMetricKey === 'page_followers') {
        const actualValue = input.pageFollowersManualValue;
        return {
          id: item.id,
          label: item.kpi.label,
          sourceLabel: 'Page Followers (manual monthly input)',
          sourceColumnName: null,
          targetValue: item.targetValue,
          actualValue,
          varianceValue:
            actualValue !== null && item.targetValue !== null
              ? actualValue - item.targetValue
              : null,
          rowCoverage: actualValue === null ? 0 : 1,
          note: actualValue === null ? 'Please input Page Followers value.' : null
        };
      }

      const sourceColumnIndex = headerIndexByTarget.get(canonicalMetricKey);
      if (sourceColumnIndex === undefined) {
        return {
          id: item.id,
          label: item.kpi.label,
          sourceLabel: item.kpi.canonicalMetricKey,
          sourceColumnName: null,
          targetValue: item.targetValue,
          actualValue: null,
          varianceValue: null,
          rowCoverage: 0,
          note: 'No matching CSV column from current mapping aliases.'
        };
      }

      let totalValue = 0;
      let rowCoverage = 0;
      for (const row of input.parsedCsv.dataRows) {
        const parsed = parseNumber(row[sourceColumnIndex] ?? null);
        if (parsed === null) {
          continue;
        }
        totalValue += parsed;
        rowCoverage += 1;
      }

      const actualValue = rowCoverage > 0 ? totalValue : null;

      return {
        id: item.id,
        label: item.kpi.label,
        sourceLabel: input.parsedCsv.headers[sourceColumnIndex] ?? item.kpi.canonicalMetricKey,
        sourceColumnName: input.parsedCsv.headers[sourceColumnIndex] ?? null,
        targetValue: item.targetValue,
        actualValue,
        varianceValue:
          actualValue !== null && item.targetValue !== null
            ? actualValue - item.targetValue
            : null,
        rowCoverage,
        note: rowCoverage === 0 ? 'Matched column has no numeric value.' : null
      };
    }

    if (item.kpi.sourceType === 'formula_column' && item.kpi.formulaId) {
      const formula = formulaById.get(item.kpi.formulaId);

      if (!formula) {
        return {
          id: item.id,
          label: item.kpi.label,
          sourceLabel: item.kpi.formulaLabel ?? 'Formula column',
          sourceColumnName: null,
          targetValue: item.targetValue,
          actualValue: null,
          varianceValue: null,
          rowCoverage: 0,
          note: 'Formula definition not found.'
        };
      }

      let totalValue = 0;
      let rowCoverage = 0;

      for (const row of input.parsedCsv.dataRows) {
        const rowMap: Record<string, string | null> = {};
        for (const [index, header] of input.parsedCsv.headers.entries()) {
          rowMap[header] = row[index] ?? null;
        }

        for (const [targetField, sourceColumnIndex] of headerIndexByTarget.entries()) {
          const sourceValue = row[sourceColumnIndex] ?? null;
          const candidates = headerCandidatesByTarget.get(targetField) ?? [];
          for (const candidate of candidates) {
            if (candidate.trim().length === 0) {
              continue;
            }
            rowMap[candidate] = sourceValue;
          }
        }

        if (input.viewersManualValue !== null) {
          rowMap.Viewers = String(input.viewersManualValue);
        }
        if (input.pageFollowersManualValue !== null) {
          rowMap['Page Followers'] = String(input.pageFollowersManualValue);
        }

        const result = evaluateFormulaExpression({
          expression: formula.expression,
          row: rowMap
        });

        if (result.error || result.value === null || !Number.isFinite(result.value)) {
          continue;
        }

        totalValue += result.value;
        rowCoverage += 1;
      }

      const actualValue = rowCoverage > 0 ? totalValue : null;
      return {
        id: item.id,
        label: item.kpi.label,
        sourceLabel: item.kpi.formulaLabel ?? formula.columnLabel ?? 'Formula column',
        sourceColumnName: null,
        targetValue: item.targetValue,
        actualValue,
        varianceValue:
          actualValue !== null && item.targetValue !== null
            ? actualValue - item.targetValue
            : null,
        rowCoverage,
        note: rowCoverage === 0 ? 'No evaluable rows for this formula.' : null
      };
    }

    return {
      id: item.id,
      label: item.kpi.label,
      sourceLabel: item.kpi.sourceType === 'formula_column' ? 'Formula column' : 'Canonical metric',
      sourceColumnName: null,
      targetValue: item.targetValue,
      actualValue: null,
      varianceValue: null,
      rowCoverage: 0,
      note: 'Unsupported KPI source in quick check.'
    };
  });
}

export function KpiCheckClient({
  planYear,
  planItems,
  formulas,
  mappingRules
}: KpiCheckClientProps) {
  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewersInput, setViewersInput] = useState('');
  const [pageFollowersInput, setPageFollowersInput] = useState('');

  const viewersManualValue = useMemo(() => parseNumber(viewersInput), [viewersInput]);
  const pageFollowersManualValue = useMemo(
    () => parseNumber(pageFollowersInput),
    [pageFollowersInput]
  );
  const hasViewersManualTarget = useMemo(
    () =>
      planItems.some(
        (item) =>
          item.kpi.sourceType === 'canonical_metric' &&
          item.kpi.canonicalMetricKey === 'viewers'
      ),
    [planItems]
  );
  const hasPageFollowersManualTarget = useMemo(
    () =>
      planItems.some(
        (item) =>
          item.kpi.sourceType === 'canonical_metric' &&
          item.kpi.canonicalMetricKey === 'page_followers'
      ),
    [planItems]
  );
  const hasAnyManualInput = hasViewersManualTarget || hasPageFollowersManualTarget;

  const cards = useMemo(() => {
    if (!parsedCsv) {
      return [] as KpiCheckCard[];
    }

    return buildKpiCards({
      parsedCsv,
      viewersManualValue,
      pageFollowersManualValue,
      planItems,
      formulas,
      mappingRules
    });
  }, [formulas, mappingRules, parsedCsv, planItems, viewersManualValue, pageFollowersManualValue]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;

    if (!file) {
      setParsedCsv(null);
      setUploadError(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParsedCsv(null);
      setUploadError('Please upload CSV file only.');
      return;
    }

    try {
      const content = await file.text();
      const parsed = parseCsvContent(content, file.name);
      setParsedCsv(parsed);
      setUploadError(null);
    } catch (error) {
      setParsedCsv(null);
      setUploadError(error instanceof Error ? error.message : 'Failed to parse CSV.');
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>KPI Check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            KPI targets are loaded from brand KPI plan year {planYear}.
          </div>

          <div className={`grid gap-3 ${hasAnyManualInput ? 'md:grid-cols-2' : ''}`}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="kpi-check-csv-file-input">
                Upload CSV
              </label>
              <Input
                accept=".csv,text/csv"
                id="kpi-check-csv-file-input"
                onChange={onFileChange}
                type="file"
              />
            </div>

            {hasViewersManualTarget ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="kpi-check-viewers-input">
                  Viewers (manual input)
                </label>
                <Input
                  id="kpi-check-viewers-input"
                  inputMode="numeric"
                  onChange={(event) => setViewersInput(event.currentTarget.value)}
                  placeholder="e.g. 500000"
                  value={viewersInput}
                />
              </div>
            ) : null}

            {hasPageFollowersManualTarget ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="kpi-check-page-followers-input">
                  Page Followers (manual input)
                </label>
                <Input
                  id="kpi-check-page-followers-input"
                  inputMode="numeric"
                  onChange={(event) => setPageFollowersInput(event.currentTarget.value)}
                  placeholder="e.g. 125000"
                  value={pageFollowersInput}
                />
              </div>
            ) : null}
          </div>

          {uploadError ? (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
              {uploadError}
            </div>
          ) : null}

          {parsedCsv ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{parsedCsv.filename}</Badge>
              <Badge variant="outline">{parsedCsv.dataRows.length} rows</Badge>
              <Badge variant="outline">{parsedCsv.headers.filter((header) => !!header).length} columns</Badge>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
              Upload CSV to see KPI result immediately.
            </div>
          )}
        </CardContent>
      </Card>

      {parsedCsv && cards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((item) => {
            const status = buildKpiStatus(item.actualValue, item.targetValue);
            return (
              <Card className="border-border/60 bg-background/60" key={item.id}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">{item.label}</div>
                      <div className="break-words text-xs text-muted-foreground">
                        Source: {item.sourceLabel}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-center text-[11px] font-medium leading-4 ${status.badgeClass}`}
                    >
                      {status.label}
                    </span>
                  </div>

                  {status.progressPercent !== null ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <span className="shrink-0">Target progress</span>
                        <span className="min-w-0 truncate text-right">{status.progressText}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-border/50">
                        <div
                          className={`h-full ${status.meterClass}`}
                          style={{ width: `${status.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">{status.progressText}</div>
                  )}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        Actual
                      </div>
                      <div className="mt-2 min-w-0 font-serif text-[clamp(1.55rem,2.1vw,2.35rem)] leading-[1.02] tracking-[-0.03em] tabular-nums">
                        {formatMetricValue(item.actualValue)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        Target
                      </div>
                      <div className="mt-2 min-w-0 font-serif text-[clamp(1.55rem,2.1vw,2.35rem)] leading-[1.02] tracking-[-0.03em] tabular-nums">
                        {formatMetricValue(item.targetValue)}
                      </div>
                    </div>
                  </div>

                  <div className={`text-sm font-medium ${varianceTone(item.varianceValue)}`}>
                    Variance: {formatMetricValue(item.varianceValue)}
                  </div>

                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
                    <span className="text-muted-foreground/80">Rows</span>
                    <span>{item.rowCoverage}</span>
                    <span className="text-muted-foreground/80">Imported</span>
                    <span className="break-words">{item.sourceColumnName ?? 'n/a'}</span>
                  </div>

                  {item.note ? (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                      {item.note}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
