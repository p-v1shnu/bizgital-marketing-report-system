'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useDebouncedRefresh } from '@/hooks/use-debounced-refresh';
import { evaluateFormulaExpression } from '@/lib/formula-engine';
import type {
  ComputedFormulaResponse,
  DatasetOverviewResponse,
  GlobalCompanyFormatOptionsResponse,
  ImportPreviewResponse
} from '@/lib/reporting-api';

type SourceColumn = NonNullable<ImportPreviewResponse['preview']>['columns'][number];
type SourceRow = NonNullable<ImportPreviewResponse['preview']>['rows'][number];
type DatasetPreview = DatasetOverviewResponse['preview'];
type CompanyOption = GlobalCompanyFormatOptionsResponse['fields'][number]['options'][number];
type RowKey = string;
type ManualKey =
  | 'content_style'
  | 'related_product'
  | 'media_format'
  | 'campaign_base'
  | 'campaign_name'
  | 'content_objective';

type ManualColumn =
  | {
      key: Exclude<ManualKey, 'campaign_name' | 'campaign_base'>;
      label: string;
      type: 'select';
      dropdownFieldKey: GlobalCompanyFormatOptionsResponse['fields'][number]['key'];
    }
  | { key: 'campaign_name'; label: string; type: 'text' }
  | { key: 'campaign_base'; label: string; type: 'boolean' };

type OrderedTableColumn =
  | {
      kind: 'source';
      key: string;
      label: string;
      rawLabel: string;
      sequence: number;
    }
  | ({
      kind: 'internal';
      sequence: number;
    } & ManualColumn)
  | {
      kind: 'formula';
      id: string;
      label: string;
      expression: string;
      sequence: number;
    };

type SourceCellPreview = {
  rowNumber: number;
  columnLabel: string;
  value: string;
  kind: 'text' | 'url' | 'embed_url';
  anchorTop: number;
  anchorLeft: number;
};

type ManualDatasetRowUpdate = {
  rowNumber: number;
  values: Record<string, string | null>;
};

type ManualSourceRowUpdate = {
  rowNumber: number;
  values: Record<string, string | null>;
};

type ManualFormulaRowUpdate = {
  rowNumber: number;
  values: Record<string, string | null>;
};

declare global {
  interface Window {
    FB?: {
      XFBML?: {
        parse: (node?: Element) => void;
      };
    };
  }
}

type Props = {
  activeFormulas: ComputedFormulaResponse[];
  brandId: string;
  campaignOptions: string[];
  periodId: string;
  uploadedFilename: string | null;
  sourcePreview: NonNullable<ImportPreviewResponse['preview']>;
  datasetPreview: DatasetPreview;
  manualHeader: {
    viewers: string | null;
    pageFollowers: string | null;
    pageVisit: string | null;
  } | null;
  contentCount: DatasetOverviewResponse['contentCount'] | null;
  companyFormatFields: GlobalCompanyFormatOptionsResponse['fields'];
  initialVisibleSourceKeys: string[];
  isWorkingTableEditable: boolean;
  isReadOnly: boolean;
  readOnlyReason: string | null;
  topContentManualRowsExcluded: boolean;
};

const manualStoragePrefix = 'bizgital-marketing-report.import.manual-values';
const manualHeaderMaxValue = 999_999_999_999_999;
const MANUAL_CONTENT_STYLE_SOURCE_LABEL = 'Content Style';
const sourcePreviewPopoverPadding = 12;
const sourcePreviewPopoverWidth = 480;
const sourcePreviewPopoverHeight = 680;
const preferredColumnOrder = [
  'Title',
  'Permalink',
  'Publish time',
  'Content Objective',
  'Content Style',
  'Media Format',
  'Related Product',
  'Is campaign content',
  'Campaign Name',
  'Reactions, comments and shares',
  'Total clicks',
  'Engagement'
];

type ManualRowsStoragePayload = {
  version: 3;
  manualValues: Record<RowKey, Partial<Record<ManualKey, string>>>;
  manualRowIds: string[];
  manualRowNumbers: Record<string, number>;
  manualSourceValues: Record<RowKey, Record<string, string>>;
  manualFormulaValues: Record<RowKey, Record<string, string>>;
};

type ManualRowsStoragePayloadV2 = Omit<ManualRowsStoragePayload, 'version' | 'manualRowNumbers'> & {
  version: 2;
};

function isManualRowsStoragePayload(value: unknown): value is ManualRowsStoragePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ManualRowsStoragePayload>;
  return (
    candidate.version === 3 &&
    !!candidate.manualValues &&
    typeof candidate.manualValues === 'object' &&
    Array.isArray(candidate.manualRowIds) &&
    !!candidate.manualRowNumbers &&
    typeof candidate.manualRowNumbers === 'object' &&
    !!candidate.manualSourceValues &&
    typeof candidate.manualSourceValues === 'object' &&
    !!candidate.manualFormulaValues &&
    typeof candidate.manualFormulaValues === 'object'
  );
}

function isManualRowsStoragePayloadV2(value: unknown): value is ManualRowsStoragePayloadV2 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ManualRowsStoragePayloadV2>;
  return (
    candidate.version === 2 &&
    !!candidate.manualValues &&
    typeof candidate.manualValues === 'object' &&
    Array.isArray(candidate.manualRowIds) &&
    !!candidate.manualSourceValues &&
    typeof candidate.manualSourceValues === 'object' &&
    !!candidate.manualFormulaValues &&
    typeof candidate.manualFormulaValues === 'object'
  );
}

function buildManualColumns(): ManualColumn[] {
  return [
    { key: 'content_style', label: 'Content Style', type: 'select', dropdownFieldKey: 'content_style' },
    { key: 'related_product', label: 'Related Product', type: 'select', dropdownFieldKey: 'related_product' },
    { key: 'media_format', label: 'Media Format', type: 'select', dropdownFieldKey: 'media_format' },
    { key: 'campaign_base', label: 'Is campaign content', type: 'boolean' },
    { key: 'campaign_name', label: 'Campaign Name', type: 'text' },
    {
      key: 'content_objective',
      label: 'Content Objective',
      type: 'select',
      dropdownFieldKey: 'content_objective'
    }
  ];
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const dateTimeColumnLabelKeywords = [
  'publish time',
  'published time',
  'published at',
  'date time',
  'datetime',
  'timestamp'
] as const;

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function padTwoDigits(value: number) {
  return String(value).padStart(2, '0');
}

function isValidDateTimeParts(parts: DateTimeParts) {
  if (!Number.isInteger(parts.year) || parts.year < 1000 || parts.year > 9999) {
    return false;
  }

  if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12) {
    return false;
  }

  if (!Number.isInteger(parts.day) || parts.day < 1 || parts.day > 31) {
    return false;
  }

  if (!Number.isInteger(parts.hour) || parts.hour < 0 || parts.hour > 23) {
    return false;
  }

  if (!Number.isInteger(parts.minute) || parts.minute < 0 || parts.minute > 59) {
    return false;
  }

  const candidate = new Date(parts.year, parts.month - 1, parts.day);
  return (
    candidate.getFullYear() === parts.year &&
    candidate.getMonth() === parts.month - 1 &&
    candidate.getDate() === parts.day
  );
}

function parseDateTimeParts(value: string): DateTimeParts | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2})?)?$/
  );
  if (isoMatch) {
    const parts: DateTimeParts = {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
      hour: Number(isoMatch[4] ?? '0'),
      minute: Number(isoMatch[5] ?? '0')
    };
    return isValidDateTimeParts(parts) ? parts : null;
  }

  const dayMonthYearMatch = trimmed.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
  );
  if (dayMonthYearMatch) {
    const parts: DateTimeParts = {
      year: Number(dayMonthYearMatch[3]),
      month: Number(dayMonthYearMatch[2]),
      day: Number(dayMonthYearMatch[1]),
      hour: Number(dayMonthYearMatch[4] ?? '0'),
      minute: Number(dayMonthYearMatch[5] ?? '0')
    };
    return isValidDateTimeParts(parts) ? parts : null;
  }

  return null;
}

function formatDateTimeLocalValue(value: string) {
  const parsed = parseDateTimeParts(value);
  if (!parsed) {
    return '';
  }

  return `${parsed.year}-${padTwoDigits(parsed.month)}-${padTwoDigits(parsed.day)}T${padTwoDigits(parsed.hour)}:${padTwoDigits(parsed.minute)}`;
}

function formatManualDateTimeStorageValue(value: string) {
  const parsed = parseDateTimeParts(value);
  if (!parsed) {
    return value;
  }

  return `${padTwoDigits(parsed.day)}/${padTwoDigits(parsed.month)}/${parsed.year} ${padTwoDigits(parsed.hour)}:${padTwoDigits(parsed.minute)}`;
}

function isDateTimeSourceColumn(column: Extract<OrderedTableColumn, { kind: 'source' }>) {
  const normalized = normalizeLabel(`${column.label} ${column.rawLabel}`);
  return dateTimeColumnLabelKeywords.some(keyword => normalized.includes(keyword));
}

function parseNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value: string | null | undefined) {
  if (!value) return '-';
  const numeric = parseNumber(value);
  return numeric !== null && Number.isInteger(numeric)
    ? new Intl.NumberFormat('en-US').format(numeric)
    : value;
}

function formatFormulaResult(value: number | null, error: string | null) {
  if (error || value === null || !Number.isFinite(value)) {
    return '-';
  }

  if (Number.isInteger(value)) {
    return new Intl.NumberFormat('en-US').format(value);
  }

  return value.toFixed(2);
}

function shouldShowInlinePreviewAction(value: string) {
  return value.trim().length > 56;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveEmbedSourceUrl(value: string) {
  let candidate = value.trim();

  for (let hop = 0; hop < 2; hop += 1) {
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      const isFacebookRedirect =
        (host === 'l.facebook.com' || host === 'lm.facebook.com') && path === '/l.php';

      if (!isFacebookRedirect) {
        return candidate;
      }

      const redirected = parsed.searchParams.get('u');
      if (!redirected) {
        return candidate;
      }

      candidate = safeDecodeURIComponent(redirected).trim();
    } catch {
      return candidate;
    }
  }

  return candidate;
}

function isFacebookPermalink(value: string) {
  const normalized = resolveEmbedSourceUrl(value).toLowerCase();
  return normalized.includes('facebook.com') || normalized.includes('fb.watch');
}

function isFacebookEventUrl(value: string) {
  const normalized = resolveEmbedSourceUrl(value).toLowerCase();

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const isFacebookHost = host.includes('facebook.com') || host === 'fb.me';

    if (!isFacebookHost) {
      return false;
    }

    return (
      path === '/events' ||
      path.startsWith('/events/') ||
      path.startsWith('/share/e/') ||
      path.startsWith('/event/')
    );
  } catch {
    return normalized.includes('facebook.com/events/') || normalized.includes('facebook.com/share/e/');
  }
}

function buildFacebookEmbedUrl(value: string) {
  const href = encodeURIComponent(resolveEmbedSourceUrl(value));
  return `https://www.facebook.com/plugins/post.php?href=${href}&show_text=true&width=680`;
}

function buildDefaultManualRowValues() {
  return {
    campaign_base: 'false'
  } satisfies Partial<Record<ManualKey, string>>;
}

function normalizeCampaignFields(values: Partial<Record<ManualKey, string>>) {
  const isCampaignContent = values.campaign_base === 'true';
  return {
    ...values,
    campaign_base: isCampaignContent ? 'true' : 'false',
    campaign_name: isCampaignContent ? values.campaign_name ?? '' : ''
  } satisfies Partial<Record<ManualKey, string>>;
}

function buildInitialManualValues(rows: SourceRow[]) {
  return Object.fromEntries(
    rows.map(row => [
      `source:${row.rowNumber}`,
      normalizeCampaignFields(buildDefaultManualRowValues())
    ])
  ) as Record<
    RowKey,
    Partial<Record<ManualKey, string>>
  >;
}

function buildSourceRowKey(rowNumber: number): RowKey {
  return `source:${rowNumber}`;
}

function buildManualRowKey(manualRowId: string): RowKey {
  return `manual:${manualRowId}`;
}

function parseRowNumberFromRowKey(rowKey: RowKey, expectedPrefix: 'source:' | 'manual:') {
  if (!rowKey.startsWith(expectedPrefix)) {
    return null;
  }

  const parsed = Number(rowKey.slice(expectedPrefix.length));
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function toManualHeaderInputValues(
  manualHeader: Props['manualHeader']
) {
  return {
    viewers: manualHeader?.viewers ?? '',
    pageFollowers: manualHeader?.pageFollowers ?? '',
    pageVisit: manualHeader?.pageVisit ?? ''
  };
}

function isManualHeaderInputValuesEqual(
  left: ReturnType<typeof toManualHeaderInputValues>,
  right: ReturnType<typeof toManualHeaderInputValues>
) {
  return (
    left.viewers === right.viewers &&
    left.pageFollowers === right.pageFollowers &&
    left.pageVisit === right.pageVisit
  );
}

function toManualHeaderPayload(values: {
  viewers: string;
  pageFollowers: string;
  pageVisit: string;
}) {
  return {
    viewers: values.viewers.trim() || null,
    pageFollowers: values.pageFollowers.trim() || null,
    pageVisit: values.pageVisit.trim() || null
  };
}

function normalizeManualHeaderInput(value: string) {
  return value.replace(/[^\d]/g, '');
}

function validateManualHeaderValue(value: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    return 'Enter a whole number.';
  }

  if (parsed < 0) {
    return 'Enter 0 or more.';
  }

  if (parsed > manualHeaderMaxValue) {
    return `Enter ${new Intl.NumberFormat('en-US').format(manualHeaderMaxValue)} or less.`;
  }

  return null;
}

function readErrorMessage(payload: unknown, fallback: string) {
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

function sortOptions(options: CompanyOption[]) {
  return [...options].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
  );
}

function resolveFields(fields: GlobalCompanyFormatOptionsResponse['fields']) {
  return fields.map(field => ({
    ...field,
    options: sortOptions(field.options)
  }));
}

function buildSourceRowMap(row: SourceRow, columns: SourceColumn[]) {
  const entries: Array<[string, string | null]> = [];

  for (const column of columns) {
    const value = row.cells[column.key] ?? null;
    entries.push([column.label, value]);
    if (normalizeLabel(column.rawLabel) !== normalizeLabel(column.label)) {
      entries.push([column.rawLabel, value]);
    }
  }

  return Object.fromEntries(entries);
}

function normalizeInputValue(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function inferMetricTargetFieldFromLabel(label: string) {
  const normalized = normalizeLabel(label);

  if (
    normalized === '3-second video views' ||
    normalized === '3 second video views' ||
    normalized === 'video views 3s' ||
    /\b3\s*[-]?\s*second\b/.test(normalized)
  ) {
    return 'video_views_3s' as const;
  }

  if (
    normalized === 'engagement' ||
    /\bengagement\b/.test(normalized)
  ) {
    return 'engagement' as const;
  }

  if (
    normalized === 'reach' ||
    normalized === 'viewer' ||
    normalized === 'viewers' ||
    /\breach\b/.test(normalized) ||
    /\breached\b/.test(normalized) ||
    /\bviewers?\b/.test(normalized)
  ) {
    return 'viewers' as const;
  }

  if (
    normalized === 'view' ||
    normalized === 'views' ||
    /\bviews?\b/.test(normalized)
  ) {
    return 'views' as const;
  }

  return null;
}

function allocateNextManualRowNumber(currentValues: number[], floor: number) {
  const maxCurrent = currentValues.reduce(
    (max, value) => (Number.isInteger(value) && value > max ? value : max),
    floor
  );
  return maxCurrent + 1;
}

function buildManualRowNumbersMap(
  manualRowIds: string[],
  candidate: Record<string, number> | null | undefined,
  floor: number
) {
  const next: Record<string, number> = {};
  const used = new Set<number>();

  for (const manualRowId of manualRowIds) {
    const rowNumber = candidate?.[manualRowId];
    if (
      typeof rowNumber !== 'number' ||
      !Number.isInteger(rowNumber) ||
      rowNumber <= floor ||
      used.has(rowNumber)
    ) {
      continue;
    }

    next[manualRowId] = rowNumber;
    used.add(rowNumber);
  }

  for (const manualRowId of manualRowIds) {
    if (next[manualRowId]) {
      continue;
    }

    const nextNumber = allocateNextManualRowNumber(
      Object.values(next),
      floor
    );
    next[manualRowId] = nextNumber;
    used.add(nextNumber);
  }

  return next;
}

export function ImportWorkingTable({
  activeFormulas,
  brandId,
  campaignOptions,
  periodId,
  uploadedFilename,
  sourcePreview,
  datasetPreview,
  manualHeader,
  contentCount,
  companyFormatFields,
  initialVisibleSourceKeys,
  isWorkingTableEditable,
  isReadOnly,
  readOnlyReason,
  topContentManualRowsExcluded
}: Props) {
  const scheduleRefresh = useDebouncedRefresh(1200);
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  const [manualValues, setManualValues] = useState(() =>
    buildInitialManualValues(sourcePreview.rows)
  );
  const [manualRowIds, setManualRowIds] = useState<string[]>([]);
  const [manualRowNumbers, setManualRowNumbers] = useState<Record<string, number>>({});
  const [isManualStorageHydrated, setIsManualStorageHydrated] = useState(false);
  const [manualSourceValues, setManualSourceValues] = useState<
    Record<RowKey, Record<string, string>>
  >({});
  const [manualFormulaValues, setManualFormulaValues] = useState<
    Record<RowKey, Record<string, string>>
  >({});
  const [manualHeaderValues, setManualHeaderValues] = useState(() =>
    toManualHeaderInputValues(manualHeader)
  );
  const [manualHeaderSaveStatus, setManualHeaderSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [sourceCellPreview, setSourceCellPreview] = useState<SourceCellPreview | null>(null);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [embedFrameLoaded, setEmbedFrameLoaded] = useState(false);
  const [embedFrameBlocked, setEmbedFrameBlocked] = useState(false);
  const [facebookSdkReady, setFacebookSdkReady] = useState(false);
  const [manualHeaderSaveMode, setManualHeaderSaveMode] = useState<'auto' | 'manual'>('auto');
  const [manualHeaderSavedAt, setManualHeaderSavedAt] = useState<string | null>(null);
  const [manualHeaderSaveError, setManualHeaderSaveError] = useState<string | null>(null);
  const autosaveRequestSequence = useRef(0);
  const manualRowsAutosaveRequestSequence = useRef(0);
  const lastPersistedManualHeaderValuesRef = useRef(
    toManualHeaderInputValues(manualHeader)
  );
  const lastPersistedManualRowsFingerprintRef = useRef<string>('');
  const persistedManualRowNumbersRef = useRef<number[]>([]);
  const legacyManualRowNumbersToClearRef = useRef<number[]>([]);
  const facebookEmbedContainerRef = useRef<HTMLDivElement | null>(null);
  const sourcePreviewPopoverRef = useRef<HTMLDivElement | null>(null);
  const tableFullscreenRootRef = useRef<HTMLDivElement | null>(null);
  const manualColumns = useMemo(() => buildManualColumns(), []);
  const [dropdownFields, setDropdownFields] = useState(() =>
    resolveFields(companyFormatFields)
  );
  const formulas = useMemo(
    () => activeFormulas.filter(formula => formula.isActive),
    [activeFormulas]
  );
  const formulaTargetFieldById = useMemo(() => {
    const metricByFormula = new Map<
      string,
      'views' | 'viewers' | 'engagement' | 'video_views_3s'
    >();

    for (const formula of formulas) {
      const targetField = inferMetricTargetFieldFromLabel(formula.columnLabel);
      if (targetField) {
        metricByFormula.set(formula.id, targetField);
      }
    }

    return metricByFormula;
  }, [formulas]);

  useEffect(() => {
    setDropdownFields(resolveFields(companyFormatFields));
  }, [companyFormatFields]);

  useEffect(() => {
    setIsManualStorageHydrated(false);

    const fallback = buildInitialManualValues(sourcePreview.rows);
    const storageKey = `${manualStoragePrefix}.${brandId}.${periodId}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setIsManualStorageHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as
        | ManualRowsStoragePayload
        | ManualRowsStoragePayloadV2
        | Record<string, Partial<Record<ManualKey, string>>>;

      const merged: Record<RowKey, Partial<Record<ManualKey, string>>> = { ...fallback };

      if (isManualRowsStoragePayload(parsed)) {
        for (const [rowKey, values] of Object.entries(parsed.manualValues ?? {})) {
          merged[rowKey] = normalizeCampaignFields({
            ...buildDefaultManualRowValues(),
            ...fallback[rowKey],
            ...values
          });
        }
        setManualValues(merged);
        setManualRowIds(parsed.manualRowIds ?? []);
        setManualRowNumbers(
          buildManualRowNumbersMap(
            parsed.manualRowIds ?? [],
            parsed.manualRowNumbers ?? {},
            sourcePreview.totalRows
          )
        );
        setManualSourceValues(parsed.manualSourceValues ?? {});
        setManualFormulaValues(parsed.manualFormulaValues ?? {});
        legacyManualRowNumbersToClearRef.current = [];
      } else if (isManualRowsStoragePayloadV2(parsed)) {
        for (const [rowKey, values] of Object.entries(parsed.manualValues ?? {})) {
          merged[rowKey] = normalizeCampaignFields({
            ...buildDefaultManualRowValues(),
            ...fallback[rowKey],
            ...values
          });
        }
        const rowIds = parsed.manualRowIds ?? [];
        setManualValues(merged);
        setManualRowIds(rowIds);
        setManualRowNumbers(buildManualRowNumbersMap(rowIds, null, sourcePreview.totalRows));
        setManualSourceValues(parsed.manualSourceValues ?? {});
        setManualFormulaValues(parsed.manualFormulaValues ?? {});
        legacyManualRowNumbersToClearRef.current =
          sourcePreview.totalRows > sourcePreview.rows.length
            ? rowIds.map((_, index) => sourcePreview.rows.length + index + 1)
            : [];
      } else {
        for (const [rowNumber, values] of Object.entries(parsed)) {
          const rowKey = buildSourceRowKey(Number(rowNumber));
          merged[rowKey] = normalizeCampaignFields({
            ...buildDefaultManualRowValues(),
            ...fallback[rowKey],
            ...values
          });
        }
        setManualValues(merged);
        setManualRowIds([]);
        setManualRowNumbers({});
        setManualSourceValues({});
        setManualFormulaValues({});
        legacyManualRowNumbersToClearRef.current = [];
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setIsManualStorageHydrated(true);
    }
  }, [brandId, periodId, sourcePreview.rows, sourcePreview.totalRows]);

  useEffect(() => {
    if (!isManualStorageHydrated) {
      return;
    }

    const payload: ManualRowsStoragePayload = {
      version: 3,
      manualValues,
      manualRowIds,
      manualRowNumbers,
      manualSourceValues,
      manualFormulaValues
    };
    window.localStorage.setItem(
      `${manualStoragePrefix}.${brandId}.${periodId}`,
      JSON.stringify(payload)
    );
  }, [
    brandId,
    isManualStorageHydrated,
    manualFormulaValues,
    manualRowIds,
    manualRowNumbers,
    manualSourceValues,
    manualValues,
    periodId
  ]);

  useEffect(() => {
    const nextValues = toManualHeaderInputValues(manualHeader);
    setManualHeaderValues(nextValues);
    setManualHeaderSaveStatus('idle');
    setManualHeaderSaveMode('auto');
    setManualHeaderSavedAt(null);
    setManualHeaderSaveError(null);
    lastPersistedManualHeaderValuesRef.current = nextValues;
    autosaveRequestSequence.current += 1;
    manualRowsAutosaveRequestSequence.current += 1;
    lastPersistedManualRowsFingerprintRef.current = '';
    persistedManualRowNumbersRef.current = [];
    legacyManualRowNumbersToClearRef.current = [];
  }, [brandId, periodId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.FB?.XFBML) {
      setFacebookSdkReady(true);
      return;
    }

    const existing = document.getElementById('facebook-jssdk') as HTMLScriptElement | null;
    if (existing) {
      const onLoad = () => setFacebookSdkReady(true);
      existing.addEventListener('load', onLoad);
      return () => {
        existing.removeEventListener('load', onLoad);
      };
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v23.0';
    script.onload = () => setFacebookSdkReady(true);
    script.onerror = () => setEmbedFrameBlocked(true);
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (
      !sourceCellPreview ||
      sourceCellPreview.kind !== 'embed_url' ||
      isFacebookEventUrl(sourceCellPreview.value)
    ) {
      setEmbedFrameLoaded(false);
      setEmbedFrameBlocked(false);
      return;
    }

    setEmbedFrameLoaded(false);
    setEmbedFrameBlocked(false);

    const timeout = window.setTimeout(() => {
      setEmbedFrameBlocked(true);
    }, 2000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [sourceCellPreview]);

  useEffect(() => {
    if (!sourceCellPreview || sourceCellPreview.kind !== 'embed_url') {
      return;
    }

    if (isFacebookEventUrl(sourceCellPreview.value)) {
      return;
    }

    if (!isFacebookPermalink(sourceCellPreview.value)) {
      return;
    }

    const mountNode = facebookEmbedContainerRef.current;
    if (!mountNode || !facebookSdkReady || !window.FB?.XFBML) {
      return;
    }

    mountNode.innerHTML = '';
    const embedNode = document.createElement('div');
    embedNode.className = 'fb-post';
    embedNode.setAttribute('data-href', resolveEmbedSourceUrl(sourceCellPreview.value));
    embedNode.setAttribute('data-show-text', 'true');
    embedNode.setAttribute('data-width', '560');
    mountNode.appendChild(embedNode);

    window.FB.XFBML.parse(mountNode);

    let attempts = 0;
    const interval = window.setInterval(() => {
      const renderedIframe = mountNode.querySelector('iframe');
      attempts += 1;

      if (renderedIframe) {
        renderedIframe.setAttribute('style', 'display:block; margin:0 auto; max-width:560px; width:100%;');
        setEmbedFrameLoaded(true);
        setEmbedFrameBlocked(false);
        window.clearInterval(interval);
        return;
      }

      if (attempts >= 20) {
        setEmbedFrameBlocked(true);
        window.clearInterval(interval);
      }
    }, 180);

    return () => {
      window.clearInterval(interval);
    };
  }, [facebookSdkReady, sourceCellPreview]);

  useEffect(() => {
    if (!sourceCellPreview) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && sourcePreviewPopoverRef.current?.contains(target)) {
        return;
      }
      setSourceCellPreview(null);
    };
    const handleViewportChange = () => {
      setSourceCellPreview(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [sourceCellPreview]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsTableFullscreen(document.fullscreenElement === tableFullscreenRootRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (sourceCellPreview) {
        event.preventDefault();
        event.stopPropagation();
        setSourceCellPreview(null);
      }
    };

    window.addEventListener('keydown', handleEscape, true);

    return () => {
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [sourceCellPreview]);

  const visibleSourceKeySet = useMemo(() => {
    const keys = initialVisibleSourceKeys.filter(key =>
      sourcePreview.columns.some(column => column.key === key)
    );

    if (keys.length > 0) {
      return new Set(keys);
    }

    return new Set(sourcePreview.columns.slice(0, 6).map(column => column.key));
  }, [initialVisibleSourceKeys, sourcePreview.columns]);
  const visibleSourceColumns = sourcePreview.columns.filter(column =>
    visibleSourceKeySet.has(column.key)
  );
  const preferredColumnRank = useMemo(
    () => new Map(preferredColumnOrder.map((label, index) => [normalizeLabel(label), index])),
    []
  );
  const orderedColumns = useMemo(() => {
    const sourceColumns: OrderedTableColumn[] = visibleSourceColumns.map((column, index) => ({
      kind: 'source',
      key: column.key,
      label: column.label,
      rawLabel: column.rawLabel,
      sequence: index
    }));
    const internalColumns: OrderedTableColumn[] = manualColumns.map((column, index) => ({
      kind: 'internal',
      ...column,
      sequence: visibleSourceColumns.length + index
    }));
    const formulaColumns: OrderedTableColumn[] = formulas.map((formula, index) => ({
      kind: 'formula',
      id: formula.id,
      label: formula.columnLabel,
      expression: formula.expression,
      sequence: visibleSourceColumns.length + manualColumns.length + index
    }));
    const combined = [...sourceColumns, ...internalColumns, ...formulaColumns];

    combined.sort((left, right) => {
      const leftRank = preferredColumnRank.get(normalizeLabel(left.label));
      const rightRank = preferredColumnRank.get(normalizeLabel(right.label));

      if (leftRank !== undefined || rightRank !== undefined) {
        const normalizedLeftRank = leftRank ?? Number.MAX_SAFE_INTEGER;
        const normalizedRightRank = rightRank ?? Number.MAX_SAFE_INTEGER;
        if (normalizedLeftRank !== normalizedRightRank) {
          return normalizedLeftRank - normalizedRightRank;
        }
      }

      return left.sequence - right.sequence;
    });

    return combined;
  }, [formulas, manualColumns, preferredColumnRank, visibleSourceColumns]);
  const datasetRows = new Map((datasetPreview?.rows ?? []).map(row => [row.rowNumber, row]));
  const isCompanyFormatEditable = isWorkingTableEditable && !isReadOnly;
  const activeOptionLabelsByField = useMemo(() => {
    const map = new Map<GlobalCompanyFormatOptionsResponse['fields'][number]['key'], string[]>();
    for (const field of dropdownFields) {
      map.set(
        field.key,
        field.options.filter(option => option.status === 'active').map(option => option.label)
      );
    }
    return map;
  }, [dropdownFields]);
  const campaignOptionLabels = useMemo(
    () =>
      Array.from(
        new Set(
          campaignOptions
            .map(option => option.trim())
            .filter(option => option.length > 0)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [campaignOptions]
  );
  const manualTargetFields = useMemo(
    () => Array.from(new Set((datasetPreview?.columns ?? []).map((column) => column.targetField))),
    [datasetPreview?.columns]
  );
  const sourceColumnKeyToTargetField = useMemo(() => {
    const map = new Map<string, string>();
    const datasetColumnBySourcePosition = new Map(
      (datasetPreview?.columns ?? []).map((column) => [column.sourcePosition, column])
    );

    for (const sourceColumn of sourcePreview.columns) {
      const datasetColumn = datasetColumnBySourcePosition.get(sourceColumn.sourcePosition);
      if (!datasetColumn) {
        continue;
      }

      map.set(sourceColumn.key, datasetColumn.targetField);
    }

    return map;
  }, [datasetPreview?.columns, sourcePreview.columns]);
  const sourceColumnLabelByKey = useMemo(
    () => new Map(sourcePreview.columns.map((column) => [column.key, column.label])),
    [sourcePreview.columns]
  );
  const sourceMetricTargetFieldByKey = useMemo(() => {
    const map = new Map<
      string,
      'views' | 'viewers' | 'engagement' | 'video_views_3s'
    >();

    for (const sourceColumn of sourcePreview.columns) {
      const targetField = inferMetricTargetFieldFromLabel(sourceColumn.rawLabel);
      if (!targetField) {
        continue;
      }

      map.set(sourceColumn.key, targetField);
    }

    return map;
  }, [sourcePreview.columns]);
  const manualDatasetRowUpdates = useMemo<ManualDatasetRowUpdate[]>(() => {
    if (!isCompanyFormatEditable) {
      return [];
    }

    return manualRowIds.map((manualRowId, index) => {
      const rowKey = buildManualRowKey(manualRowId);
      const rowNumber =
        manualRowNumbers[manualRowId] ??
        sourcePreview.totalRows + index + 1;
      const sourceValues = manualSourceValues[rowKey] ?? {};
      const formulaValues = manualFormulaValues[rowKey] ?? {};
      const values: Record<string, string | null> = {};

      for (const targetField of manualTargetFields) {
        values[targetField] = null;
      }

      for (const [sourceColumnKey, rawValue] of Object.entries(sourceValues)) {
        const targetField =
          sourceColumnKeyToTargetField.get(sourceColumnKey) ??
          sourceMetricTargetFieldByKey.get(sourceColumnKey);
        if (!targetField) {
          continue;
        }

        values[targetField] = normalizeInputValue(rawValue);
      }

      for (const [formulaId, rawValue] of Object.entries(formulaValues)) {
        const targetField = formulaTargetFieldById.get(formulaId);
        if (!targetField) {
          continue;
        }

        const normalized = normalizeInputValue(rawValue);
        if (normalized !== null) {
          values[targetField] = normalized;
        }
      }

      return {
        rowNumber,
        values
      };
    });
  }, [
    formulaTargetFieldById,
    isCompanyFormatEditable,
    manualFormulaValues,
    manualRowIds,
    manualRowNumbers,
    manualSourceValues,
    manualTargetFields,
    sourceMetricTargetFieldByKey,
    sourceColumnKeyToTargetField,
    sourcePreview.totalRows
  ]);
  const manualSourceRowUpdates = useMemo<ManualSourceRowUpdate[]>(() => {
    if (!isCompanyFormatEditable) {
      return [];
    }

    const sourceRows = Object.entries(manualSourceValues).flatMap(([rowKey, sourceValues]) => {
      const rowNumber = parseRowNumberFromRowKey(rowKey, 'source:');
      if (!rowNumber) {
        return [];
      }

      const values: Record<string, string | null> = {};

      for (const [sourceColumnKey, rawValue] of Object.entries(sourceValues)) {
        const sourceLabel = sourceColumnLabelByKey.get(sourceColumnKey)?.trim() ?? '';
        if (!sourceLabel) {
          continue;
        }

        values[sourceLabel] = normalizeInputValue(rawValue);
      }

      return [
        {
          rowNumber,
          values
        } satisfies ManualSourceRowUpdate
      ];
    });

    const manualRows = manualRowIds.map((manualRowId, index) => {
      const rowKey = buildManualRowKey(manualRowId);
      const rowNumber =
        manualRowNumbers[manualRowId] ??
        sourcePreview.totalRows + index + 1;
      const sourceValues = manualSourceValues[rowKey] ?? {};
      const values: Record<string, string | null> = {};

      for (const [sourceColumnKey, rawValue] of Object.entries(sourceValues)) {
        const sourceLabel = sourceColumnLabelByKey.get(sourceColumnKey)?.trim() ?? '';
        if (!sourceLabel) {
          continue;
        }

        values[sourceLabel] = normalizeInputValue(rawValue);
      }

      return {
        rowNumber,
        values
      };
    });

    return [...sourceRows, ...manualRows];
  }, [
    isCompanyFormatEditable,
    manualSourceValues,
    manualRowIds,
    manualRowNumbers,
    sourceColumnLabelByKey,
    sourcePreview.totalRows
  ]);
  const manualFormulaRowUpdates = useMemo<ManualFormulaRowUpdate[]>(() => {
    if (!isCompanyFormatEditable) {
      return [];
    }

    const sourceRows = Object.entries(manualFormulaValues).flatMap(([rowKey, formulaValues]) => {
      const rowNumber = parseRowNumberFromRowKey(rowKey, 'source:');
      if (!rowNumber) {
        return [];
      }

      const values: Record<string, string | null> = {};
      for (const [formulaId, rawValue] of Object.entries(formulaValues)) {
        values[formulaId] = normalizeInputValue(rawValue);
      }

      return [
        {
          rowNumber,
          values
        } satisfies ManualFormulaRowUpdate
      ];
    });

    const manualRows = manualRowIds.map((manualRowId, index) => {
      const rowKey = buildManualRowKey(manualRowId);
      const rowNumber =
        manualRowNumbers[manualRowId] ??
        sourcePreview.totalRows + index + 1;
      const formulaValues = manualFormulaValues[rowKey] ?? {};
      const values: Record<string, string | null> = {};

      for (const [formulaId, rawValue] of Object.entries(formulaValues)) {
        values[formulaId] = normalizeInputValue(rawValue);
      }

      return {
        rowNumber,
        values
      };
    });

    return [...sourceRows, ...manualRows];
  }, [
    isCompanyFormatEditable,
    manualFormulaValues,
    manualRowIds,
    manualRowNumbers,
    sourcePreview.totalRows
  ]);
  const manualHeaderValidationErrors = useMemo(
    () => ({
      viewers: validateManualHeaderValue(manualHeaderValues.viewers),
      pageFollowers: validateManualHeaderValue(manualHeaderValues.pageFollowers),
      pageVisit: validateManualHeaderValue(manualHeaderValues.pageVisit)
    }),
    [manualHeaderValues]
  );
  const manualHeaderValidationMessage =
    manualHeaderValidationErrors.viewers ??
    manualHeaderValidationErrors.pageFollowers ??
    manualHeaderValidationErrors.pageVisit;
  const hasManualHeaderValidationError = !!manualHeaderValidationMessage;
  const tableRows = useMemo(
    () => [
      ...sourcePreview.rows.map(row => ({
        kind: 'source' as const,
        rowKey: buildSourceRowKey(row.rowNumber),
        rowNumber: row.rowNumber,
        sourceRow: row
      })),
      ...manualRowIds.map((manualRowId, index) => ({
        kind: 'manual' as const,
        rowKey: buildManualRowKey(manualRowId),
        rowNumber:
          manualRowNumbers[manualRowId] ??
          sourcePreview.totalRows + index + 1,
        sourceRow: null
      }))
    ],
    [manualRowIds, manualRowNumbers, sourcePreview.rows, sourcePreview.totalRows]
  );

  function updateManualValue(rowKey: RowKey, key: ManualKey, value: string) {
    if (!isCompanyFormatEditable) {
      return;
    }

    let nextManualValues: Record<RowKey, Partial<Record<ManualKey, string>>> | null = null;
    setManualValues(current => {
      const currentRowValues = {
        ...buildDefaultManualRowValues(),
        ...(current[rowKey] ?? {})
      };

      if (key === 'campaign_base') {
        const nextCampaignBase = value === 'true' ? 'true' : 'false';
        const normalizedValues = normalizeCampaignFields({
          ...currentRowValues,
          campaign_base: nextCampaignBase
        });
        nextManualValues = {
          ...current,
          [rowKey]: normalizedValues
        };
        return nextManualValues;
      }

      if (key === 'campaign_name' && currentRowValues.campaign_base !== 'true') {
        nextManualValues = current;
        return current;
      }

      nextManualValues = {
        ...current,
        [rowKey]: normalizeCampaignFields({ ...currentRowValues, [key]: value })
      };
      return nextManualValues;
    });

    if (key === 'content_style' && nextManualValues) {
      void saveManualRowsValues(
        manualDatasetRowUpdates,
        manualSourceRowUpdates,
        manualFormulaRowUpdates,
        {
          manualValuesOverride: nextManualValues
        }
      );
    }
  }

  function updateManualSourceValue(rowKey: RowKey, sourceColumnKey: string, value: string) {
    if (!isCompanyFormatEditable) {
      return;
    }

    setManualSourceValues(current => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] ?? {}),
        [sourceColumnKey]: value
      }
    }));
  }

  function updateManualFormulaValue(rowKey: RowKey, formulaId: string, value: string) {
    if (!isCompanyFormatEditable) {
      return;
    }

    setManualFormulaValues(current => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] ?? {}),
        [formulaId]: value
      }
    }));
  }

  function addManualRow() {
    if (!isCompanyFormatEditable) {
      return;
    }

    const manualId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rowKey = buildManualRowKey(manualId);

    setManualRowIds(current => [...current, manualId]);
    setManualRowNumbers((current) => ({
      ...current,
      [manualId]: allocateNextManualRowNumber(
        Object.values(current),
        sourcePreview.totalRows
      )
    }));
    setManualValues(current => ({
      ...current,
      [rowKey]: buildDefaultManualRowValues()
    }));
    setManualSourceValues(current => ({
      ...current,
      [rowKey]: {}
    }));
    setManualFormulaValues(current => ({
      ...current,
      [rowKey]: {}
    }));
  }

  function removeManualRow(rowKey: RowKey) {
    if (!isCompanyFormatEditable || !rowKey.startsWith('manual:')) {
      return;
    }

    const manualId = rowKey.slice('manual:'.length);
    setManualRowIds(current => current.filter(item => item !== manualId));
    setManualRowNumbers(current => {
      const next = { ...current };
      delete next[manualId];
      return next;
    });
    setManualValues(current => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
    setManualSourceValues(current => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
    setManualFormulaValues(current => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
  }

  function openSourceCellPreview(
    preview: Omit<SourceCellPreview, 'anchorTop' | 'anchorLeft'>,
    anchorElement: HTMLElement
  ) {
    const rect = anchorElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const panelHeight = Math.min(
      sourcePreviewPopoverHeight,
      viewportHeight - sourcePreviewPopoverPadding * 2
    );
    const nextLeft = sourcePreviewPopoverPadding;

    let nextTop = rect.top - 24;
    if (nextTop + panelHeight > viewportHeight - sourcePreviewPopoverPadding) {
      nextTop = viewportHeight - panelHeight - sourcePreviewPopoverPadding;
    }
    nextTop = Math.max(sourcePreviewPopoverPadding, nextTop);

    setSourceCellPreview({
      ...preview,
      anchorTop: Math.round(nextTop),
      anchorLeft: Math.round(nextLeft)
    });
  }

  async function toggleTableFullscreen() {
    setSourceCellPreview(null);

    const fullscreenRoot = tableFullscreenRootRef.current;
    if (!fullscreenRoot) {
      return;
    }

    if (document.fullscreenElement === fullscreenRoot) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    await fullscreenRoot.requestFullscreen().catch(() => undefined);
  }

  function updateManualHeaderValue(
    key: keyof ReturnType<typeof toManualHeaderInputValues>,
    rawValue: string
  ) {
    if (isReadOnly) {
      return;
    }

    setManualHeaderValues(current => ({
      ...current,
      [key]: normalizeManualHeaderInput(rawValue)
    }));
  }

  async function saveManualHeaderValues(
    values: typeof manualHeaderValues,
    mode: 'auto' | 'manual' = 'auto'
  ) {
    if (isReadOnly || hasManualHeaderValidationError) {
      return;
    }

    const requestSequence = ++autosaveRequestSequence.current;

    setManualHeaderSaveStatus('saving');
    setManualHeaderSaveMode(mode);
    setManualHeaderSaveError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/brands/${brandId}/reporting-periods/${periodId}/dataset`,
        {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            rows: [],
            manualHeader: toManualHeaderPayload(values)
          })
        }
      );

      if (requestSequence !== autosaveRequestSequence.current) {
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(readErrorMessage(payload, 'Failed to auto-save manual inputs.'));
      }

      setManualHeaderSaveStatus('saved');
      setManualHeaderSavedAt(
        new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit'
        }).format(new Date())
      );
      setManualHeaderSaveError(null);
      lastPersistedManualHeaderValuesRef.current = values;
      scheduleRefresh();
    } catch (error) {
      if (requestSequence !== autosaveRequestSequence.current) {
        return;
      }

      setManualHeaderSaveStatus('error');
      setManualHeaderSaveMode(mode);
      setManualHeaderSaveError(
        error instanceof Error ? error.message : 'Failed to auto-save manual inputs.'
      );
    }
  }

  async function saveManualRowsValues(
    rows: ManualDatasetRowUpdate[],
    sourceRows: ManualSourceRowUpdate[],
    formulaRows: ManualFormulaRowUpdate[],
    options?: {
      manualValuesOverride?: Record<RowKey, Partial<Record<ManualKey, string>>>;
    }
  ) {
    if (isReadOnly || !isCompanyFormatEditable || !datasetPreview) {
      return;
    }

    const manualValuesForPersist = options?.manualValuesOverride ?? manualValues;
    const currentManualRowNumbers = rows.map((row) => row.rowNumber);
    const removedRowNumbers = persistedManualRowNumbersRef.current.filter(
      (rowNumber) => !currentManualRowNumbers.includes(rowNumber)
    );
    const legacyRowNumbersToClear = legacyManualRowNumbersToClearRef.current.filter(
      (rowNumber) => !currentManualRowNumbers.includes(rowNumber)
    );
    const rowNumbersToClear = Array.from(
      new Set([...removedRowNumbers, ...legacyRowNumbersToClear])
    );
    const rowsToPersist = [
      ...rows,
      ...rowNumbersToClear.map((rowNumber) => ({
        rowNumber,
        values: Object.fromEntries(manualTargetFields.map((field) => [field, null])) as Record<
          string,
          string | null
        >
      }))
    ];
    const sourceRowsByRowNumber = new Map(
      sourceRows.map((row) => [row.rowNumber, { ...row.values }])
    );
    const contentStyleManagedRowNumbers: number[] = [];
    for (const [rowKey, rowValues] of Object.entries(manualValuesForPersist)) {
      if (!Object.prototype.hasOwnProperty.call(rowValues, 'content_style')) {
        continue;
      }

      let rowNumber = parseRowNumberFromRowKey(rowKey, 'source:');
      if (!rowNumber && rowKey.startsWith('manual:')) {
        const manualRowId = rowKey.slice('manual:'.length);
        rowNumber =
          manualRowNumbers[manualRowId] ??
          (() => {
            const index = manualRowIds.findIndex((id) => id === manualRowId);
            if (index < 0) {
              return null;
            }

            return sourcePreview.totalRows + index + 1;
          })();
      }

      if (!rowNumber || !Number.isInteger(rowNumber) || rowNumber < 1) {
        continue;
      }

      const mergedValues = {
        ...(sourceRowsByRowNumber.get(rowNumber) ?? {})
      };
      const normalizedContentStyle = normalizeInputValue(rowValues.content_style ?? null);
      if (normalizedContentStyle !== null) {
        mergedValues[MANUAL_CONTENT_STYLE_SOURCE_LABEL] = normalizedContentStyle;
      } else {
        delete mergedValues[MANUAL_CONTENT_STYLE_SOURCE_LABEL];
      }

      if (Object.keys(mergedValues).length === 0) {
        sourceRowsByRowNumber.delete(rowNumber);
      } else {
        sourceRowsByRowNumber.set(rowNumber, mergedValues);
      }

      contentStyleManagedRowNumbers.push(rowNumber);
    }
    const sourceRowNumbers = [
      ...sourceRows.map((row) => row.rowNumber),
      ...contentStyleManagedRowNumbers
    ];
    const manualSourceRowsToPersist = Array.from(
      new Set([...sourceRowNumbers, ...currentManualRowNumbers, ...rowNumbersToClear])
    ).map((rowNumber) => ({
      rowNumber,
      values: sourceRowsByRowNumber.get(rowNumber) ?? {}
    }));
    const formulaRowsByRowNumber = new Map(formulaRows.map((row) => [row.rowNumber, row.values]));
    const formulaRowNumbers = formulaRows.map((row) => row.rowNumber);
    const manualFormulaRowsToPersist = Array.from(
      new Set([...formulaRowNumbers, ...currentManualRowNumbers, ...rowNumbersToClear])
    ).map((rowNumber) => ({
      rowNumber,
      values: formulaRowsByRowNumber.get(rowNumber) ?? {}
    }));

    if (
      rowsToPersist.length === 0 &&
      manualSourceRowsToPersist.length === 0 &&
      manualFormulaRowsToPersist.length === 0
    ) {
      lastPersistedManualRowsFingerprintRef.current = '';
      persistedManualRowNumbersRef.current = [];
      return;
    }

    const fingerprint = JSON.stringify({
      rows: rowsToPersist,
      manualSourceRows: manualSourceRowsToPersist,
      manualFormulaRows: manualFormulaRowsToPersist
    });
    if (fingerprint === lastPersistedManualRowsFingerprintRef.current) {
      return;
    }

    const requestSequence = ++manualRowsAutosaveRequestSequence.current;

    try {
      const response = await fetch(
        `${apiBaseUrl}/brands/${brandId}/reporting-periods/${periodId}/dataset`,
        {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            rows: rowsToPersist,
            manualSourceRows: manualSourceRowsToPersist,
            manualFormulaRows: manualFormulaRowsToPersist
          })
        }
      );

      if (requestSequence !== manualRowsAutosaveRequestSequence.current) {
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(readErrorMessage(payload, 'Failed to auto-save manual rows.'));
      }

      lastPersistedManualRowsFingerprintRef.current = fingerprint;
      persistedManualRowNumbersRef.current = currentManualRowNumbers;
      legacyManualRowNumbersToClearRef.current = [];
      scheduleRefresh();
    } catch {
      if (requestSequence !== manualRowsAutosaveRequestSequence.current) {
        return;
      }
    }
  }

  useEffect(() => {
    if (isReadOnly || hasManualHeaderValidationError) {
      return;
    }

    if (
      isManualHeaderInputValuesEqual(
        manualHeaderValues,
        lastPersistedManualHeaderValuesRef.current
      )
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveManualHeaderValues(manualHeaderValues);
    }, 700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [hasManualHeaderValidationError, isReadOnly, manualHeaderValues]);

  useEffect(() => {
    if (isReadOnly || !isCompanyFormatEditable || !datasetPreview) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveManualRowsValues(
        manualDatasetRowUpdates,
        manualSourceRowUpdates,
        manualFormulaRowUpdates
      );
    }, 700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    datasetPreview,
    isCompanyFormatEditable,
    isReadOnly,
    manualDatasetRowUpdates,
    manualFormulaRowUpdates,
    manualValues,
    manualSourceRowUpdates,
    manualTargetFields.length
  ]);

  const manualHeaderStatus = (() => {
    if (isReadOnly) {
      return readOnlyReason ?? 'Read-only (locked)';
    }

    if (manualHeaderValidationMessage) {
      return manualHeaderValidationMessage;
    }

    if (manualHeaderSaveStatus === 'saving') {
      return manualHeaderSaveMode === 'manual'
        ? 'Manual save: saving...'
        : 'Auto-save: saving...';
    }

    if (manualHeaderSaveStatus === 'saved') {
      if (manualHeaderSaveMode === 'manual') {
        return manualHeaderSavedAt
          ? `Saved manually at ${manualHeaderSavedAt}`
          : 'Saved manually';
      }

      return manualHeaderSavedAt
        ? `Auto-save: saved at ${manualHeaderSavedAt}`
        : 'Auto-save: saved';
    }

    if (manualHeaderSaveStatus === 'error') {
      if (manualHeaderSaveMode === 'manual') {
        return `Manual save failed${manualHeaderSaveError ? `: ${manualHeaderSaveError}` : '.'}`;
      }

      return `Auto-save failed${manualHeaderSaveError ? `: ${manualHeaderSaveError}` : '.'}`;
    }

    return 'Auto-save is on';
  })();

  const approvedContentCountSnapshot = contentCount?.approvedSnapshot ?? null;
  const previewContentCount = contentCount?.preview ?? null;
  const hasDraftPreviewAgainstApprovedSnapshot =
    !!approvedContentCountSnapshot &&
    !!previewContentCount &&
    approvedContentCountSnapshot.reportVersionId !== previewContentCount.reportVersionId;
  const activeContentCount = hasDraftPreviewAgainstApprovedSnapshot
    ? previewContentCount
    : approvedContentCountSnapshot ?? previewContentCount;
  const contentCountTitle = 'Content count';
  const contentCountTooltip = activeContentCount
    ? hasDraftPreviewAgainstApprovedSnapshot
      ? `Preview count uses current policy: ${activeContentCount.policyLabel}. It currently counts ${activeContentCount.csvRowCount} CSV row(s) and ${activeContentCount.manualRowCount} manual row(s). Latest approved snapshot stays locked and is not recalculated.`
      : approvedContentCountSnapshot
        ? `Approved snapshot is locked. Count at approval: ${activeContentCount.countedContentCount} (${activeContentCount.csvRowCount} CSV + ${activeContentCount.manualRowCount} manual) using policy "${activeContentCount.policyLabel}".`
        : `Preview count uses current policy: ${activeContentCount.policyLabel}. It currently counts ${activeContentCount.csvRowCount} CSV row(s) and ${activeContentCount.manualRowCount} manual row(s).`
    : 'Content count preview is unavailable.';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {uploadedFilename ?? 'Working table'}
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`text-xs ${
              manualHeaderSaveStatus === 'error'
                ? 'text-rose-500'
                : manualHeaderSaveStatus === 'saving'
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
            }`}
          >
            {manualHeaderStatus}
          </div>
          {!isReadOnly ? (
            <Button
              disabled={hasManualHeaderValidationError || manualHeaderSaveStatus === 'saving'}
              onClick={() => void saveManualHeaderValues(manualHeaderValues, 'manual')}
              size="sm"
              type="button"
              variant="outline"
            >
              Save now
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/45 px-4 py-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Source shown
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {visibleSourceColumns.length} / {sourcePreview.columns.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Rows
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {sourcePreview.totalRows}
              {manualRowIds.length > 0 ? ` (+${manualRowIds.length} manual)` : ''}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Formula columns
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {formulas.length}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Internal
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {manualColumns.length} columns
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>{contentCountTitle}</span>
              <span
                aria-label="Count policy details"
                className="inline-flex items-center text-muted-foreground/80"
                role="img"
                title={contentCountTooltip}
              >
                <CircleHelp className="size-3.5" />
              </span>
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {activeContentCount
                ? formatValue(String(activeContentCount.countedContentCount))
                : '-'}
            </div>
          </div>
        </div>
      </div>

      {!isWorkingTableEditable ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Source rows are ready. Standardized fields unlock after the latest import maps to draft dataset rows.
        </div>
      ) : null}

      {isReadOnly ? (
        <div className="rounded-2xl border border-slate-500/25 bg-slate-500/8 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
          {readOnlyReason ?? 'Read-only (locked): this report cannot be edited in the current mode.'}
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/55 px-4 py-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">Manual monthly inputs</div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Viewers
            </label>
            <Input
              aria-invalid={!!manualHeaderValidationErrors.viewers}
              disabled={isReadOnly}
              inputMode="numeric"
              max={manualHeaderMaxValue}
              min={0}
              name="manual__header__viewers"
              onChange={event => updateManualHeaderValue('viewers', event.currentTarget.value)}
              placeholder="0"
              type="text"
              value={manualHeaderValues.viewers}
            />
            {manualHeaderValidationErrors.viewers ? (
              <div className="text-xs text-rose-500">{manualHeaderValidationErrors.viewers}</div>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Page Followers
            </label>
            <Input
              aria-invalid={!!manualHeaderValidationErrors.pageFollowers}
              disabled={isReadOnly}
              inputMode="numeric"
              max={manualHeaderMaxValue}
              min={0}
              name="manual__header__followers"
              onChange={event => updateManualHeaderValue('pageFollowers', event.currentTarget.value)}
              placeholder="0"
              type="text"
              value={manualHeaderValues.pageFollowers}
            />
            {manualHeaderValidationErrors.pageFollowers ? (
              <div className="text-xs text-rose-500">{manualHeaderValidationErrors.pageFollowers}</div>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Page Visit
            </label>
            <Input
              aria-invalid={!!manualHeaderValidationErrors.pageVisit}
              disabled={isReadOnly}
              inputMode="numeric"
              max={manualHeaderMaxValue}
              min={0}
              name="manual__header__page_visit"
              onChange={event => updateManualHeaderValue('pageVisit', event.currentTarget.value)}
              placeholder="0"
              type="text"
              value={manualHeaderValues.pageVisit}
            />
            {manualHeaderValidationErrors.pageVisit ? (
              <div className="text-xs text-rose-500">{manualHeaderValidationErrors.pageVisit}</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {topContentManualRowsExcluded
            ? 'Manual rows are fully user-entered, including Engagement. Manual rows are excluded from Top Content by current policy.'
            : 'Manual rows are fully user-entered, including Engagement. Manual rows can be included in Top Content by current policy.'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void toggleTableFullscreen()} size="sm" type="button" variant="outline">
            {isTableFullscreen ? 'Exit full screen' : 'Full screen table'}
          </Button>
          {!isReadOnly ? (
            <Button
              disabled={!isCompanyFormatEditable}
              onClick={addManualRow}
              size="sm"
              type="button"
              variant="outline"
            >
              Add manual row
            </Button>
          ) : null}
        </div>
      </div>

      <div
        ref={tableFullscreenRootRef}
        className={
          isTableFullscreen
            ? 'z-40 flex h-full min-h-[calc(100vh-24px)] flex-col gap-3 bg-background p-3'
            : 'space-y-3'
        }
      >
        {isTableFullscreen ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Table Focus Mode
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isReadOnly ? (
                <Button
                  disabled={!isCompanyFormatEditable}
                  onClick={addManualRow}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Add manual row
                </Button>
              ) : null}
              <Button onClick={() => void toggleTableFullscreen()} size="sm" type="button" variant="outline">
                Exit full screen
              </Button>
            </div>
          </div>
        ) : null}
        <div
          className={
            isTableFullscreen
              ? 'min-h-0 flex-1 overflow-auto rounded-2xl border border-border/60 bg-background/50'
              : 'overflow-x-auto rounded-2xl border border-border/60 bg-background/50'
          }
        >
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/80">
            <tr>
              <th className="sticky top-0 z-20 bg-background/95 px-4 py-3 font-medium text-foreground">
                <div className="flex min-h-[52px] flex-col justify-between">
                  <div>#</div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-transparent">
                    Meta
                  </div>
                </div>
              </th>
              {orderedColumns.map(column => (
                <th
                  className="sticky top-0 z-20 min-w-40 bg-background/95 px-4 py-3 font-medium text-foreground"
                  key={column.kind === 'formula' ? column.id : column.key}
                >
                  <div className="flex min-h-[52px] flex-col justify-between">
                    <div className="leading-tight">{column.label}</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {column.kind === 'source'
                        ? 'Source'
                        : column.kind === 'formula'
                          ? 'Formula'
                          : 'Internal'}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map(rowItem => {
              const localRowValues = {
                ...buildDefaultManualRowValues(),
                ...(manualValues[rowItem.rowKey] ?? {})
              };
              const normalizedLocalRowValues = normalizeCampaignFields(localRowValues);
              const sourceRow = rowItem.sourceRow;
              const datasetRow =
                rowItem.kind === 'source' ? (datasetRows.get(rowItem.rowNumber) ?? null) : null;
              const sourceRowMap = sourceRow ? buildSourceRowMap(sourceRow, sourcePreview.columns) : {};

              return (
                <tr className="border-b border-border/50 last:border-b-0" key={rowItem.rowKey}>
                  <td className="px-4 py-3 align-top text-xs font-medium text-muted-foreground">
                    <div className="space-y-1">
                      <div>{rowItem.rowNumber}</div>
                      <span className="inline-flex rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {rowItem.kind === 'source' ? 'Source' : 'Manual'}
                      </span>
                      {rowItem.kind === 'manual' ? (
                        !isReadOnly ? (
                          <button
                            className="block text-[11px] text-rose-500 hover:text-rose-400"
                            onClick={() => removeManualRow(rowItem.rowKey)}
                            type="button"
                          >
                            Remove
                          </button>
                        ) : null
                      ) : null}
                    </div>
                    {datasetRow
                      ? Object.entries(datasetRow.cells).map(([targetField, value]) => (
                          <input
                            key={`${rowItem.rowNumber}-${targetField}`}
                            name={`cell__${rowItem.rowNumber}__${targetField}`}
                            type="hidden"
                            value={value.effectiveValue ?? ''}
                          />
                        ))
                      : null}
                  </td>

                  {orderedColumns.map((column) => {
                    if (column.kind === 'source') {
                      const isPermalinkColumn =
                        normalizeLabel(column.rawLabel) === normalizeLabel('Permalink');

                      if (rowItem.kind === 'manual') {
                        const currentValue = manualSourceValues[rowItem.rowKey]?.[column.key] ?? '';
                        const isDateTimeInput = isDateTimeSourceColumn(column);

                        return (
                          <td className="px-4 py-3 align-middle" key={`${rowItem.rowKey}-${column.key}`}>
                            <div className="min-w-52 space-y-2">
                              <Input
                                className="min-w-44"
                                disabled={!isCompanyFormatEditable}
                                onChange={event =>
                                  updateManualSourceValue(
                                    rowItem.rowKey,
                                    column.key,
                                    isDateTimeInput
                                      ? formatManualDateTimeStorageValue(event.currentTarget.value)
                                      : event.currentTarget.value
                                  )
                                }
                                placeholder={isDateTimeInput ? undefined : 'Type here'}
                                step={isDateTimeInput ? 60 : undefined}
                                type={isDateTimeInput ? 'datetime-local' : 'text'}
                                value={
                                  isDateTimeInput
                                    ? formatDateTimeLocalValue(currentValue)
                                    : currentValue
                                }
                              />
                              {isPermalinkColumn && currentValue.trim().length > 0 ? (
                                <button
                                  className="text-xs text-primary underline"
                                  onClick={event =>
                                    openSourceCellPreview({
                                      rowNumber: rowItem.rowNumber,
                                      columnLabel: column.label,
                                      value: currentValue,
                                      kind: 'embed_url'
                                    }, event.currentTarget)
                                  }
                                  type="button"
                                >
                                  Preview post
                                </button>
                              ) : null}
                            </div>
                          </td>
                        );
                      }

                      const value = sourceRow?.cells[column.key] ?? null;
                      const displayValue = isPermalinkColumn ? (value ?? '-') : formatValue(value);
                      const canPreview =
                        displayValue !== '-' && shouldShowInlinePreviewAction(displayValue);

                      return (
                        <td className="px-4 py-3 align-middle text-muted-foreground" key={column.key}>
                          {isPermalinkColumn && value ? (
                            <div className="flex max-w-64 items-center gap-2">
                              <a
                                className="block min-w-0 flex-1 truncate whitespace-nowrap text-primary underline"
                                href={value}
                                rel="noreferrer"
                                onClick={(event) => {
                                  if (
                                    event.metaKey ||
                                    event.ctrlKey ||
                                    event.shiftKey ||
                                    event.altKey ||
                                    event.button !== 0
                                  ) {
                                    return;
                                  }

                                  event.preventDefault();
                                  openSourceCellPreview({
                                    rowNumber: rowItem.rowNumber,
                                    columnLabel: column.label,
                                    value,
                                    kind: 'embed_url'
                                  }, event.currentTarget);
                                }}
                                target="_blank"
                              >
                                {value}
                              </a>
                              <button
                                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                                onClick={event =>
                                  openSourceCellPreview({
                                    rowNumber: rowItem.rowNumber,
                                    columnLabel: column.label,
                                    value,
                                    kind: 'url'
                                  }, event.currentTarget)
                                }
                                type="button"
                              >
                                View
                              </button>
                            </div>
                          ) : (
                            <div className="flex max-w-64 items-center gap-2">
                              <span className="block min-w-0 flex-1 truncate whitespace-nowrap text-foreground">
                                {displayValue}
                              </span>
                              {canPreview ? (
                                <button
                                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={event =>
                                    openSourceCellPreview({
                                      rowNumber: rowItem.rowNumber,
                                      columnLabel: column.label,
                                      value: displayValue,
                                      kind: 'text'
                                    }, event.currentTarget)
                                  }
                                  type="button"
                                >
                                  View
                                </button>
                              ) : null}
                            </div>
                          )}
                        </td>
                      );
                    }

                    if (column.kind === 'formula') {
                      if (rowItem.kind === 'manual') {
                        const currentValue =
                          manualFormulaValues[rowItem.rowKey]?.[column.id] ?? '';

                        return (
                          <td className="px-4 py-3 align-middle" key={`${rowItem.rowKey}-${column.id}`}>
                            <Input
                              className="min-w-44"
                              disabled={!isCompanyFormatEditable}
                              onChange={event =>
                                updateManualFormulaValue(
                                  rowItem.rowKey,
                                  column.id,
                                  event.currentTarget.value
                                )
                              }
                              placeholder="Manual value"
                              type="text"
                              value={currentValue}
                            />
                          </td>
                        );
                      }

                      const evaluated = evaluateFormulaExpression({
                        expression: column.expression,
                        row: sourceRowMap
                      });

                      return (
                        <td
                          className="px-4 py-3 align-middle text-foreground"
                          key={`${rowItem.rowKey}-${column.id}`}
                        >
                          {formatFormulaResult(evaluated.value, evaluated.error)}
                        </td>
                      );
                    }

                    const currentValue = normalizedLocalRowValues[column.key] ?? '';

                    if (column.type === 'select') {
                      const activeLabels =
                        activeOptionLabelsByField.get(column.dropdownFieldKey) ?? [];
                      const hasLegacyValue =
                        !!currentValue && !activeLabels.includes(currentValue);

                      return (
                        <td className="px-4 py-3 align-middle" key={column.key}>
                          <Select
                            className="min-w-44"
                            disabled={!isCompanyFormatEditable}
                            onChange={event =>
                              updateManualValue(
                                rowItem.rowKey,
                                column.key,
                                event.currentTarget.value
                              )
                            }
                            value={currentValue}
                          >
                            <option value="">Choose...</option>
                            {hasLegacyValue ? (
                              <option value={currentValue}>{currentValue} (Legacy)</option>
                            ) : null}
                            {activeLabels.map(label => (
                              <option key={label} value={label}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </td>
                      );
                    }

                    if (column.type === 'boolean') {
                      const checked = normalizedLocalRowValues.campaign_base === 'true';

                      return (
                        <td className="px-4 py-3 align-middle" key={column.key}>
                          <label className="inline-flex h-10 min-w-44 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                            <input
                              checked={checked}
                              className="size-4"
                              disabled={!isCompanyFormatEditable}
                              onChange={event =>
                                updateManualValue(
                                  rowItem.rowKey,
                                  column.key,
                                  event.currentTarget.checked ? 'true' : 'false'
                                )
                              }
                              type="checkbox"
                            />
                            {checked ? 'Yes' : 'No'}
                          </label>
                        </td>
                      );
                    }

                    return (
                      <td className="px-4 py-3 align-middle" key={column.key}>
                        <Select
                          className="min-w-44"
                          disabled={
                            !isCompanyFormatEditable ||
                            normalizedLocalRowValues.campaign_base !== 'true'
                          }
                          onChange={event =>
                            updateManualValue(
                              rowItem.rowKey,
                              column.key,
                              event.currentTarget.value
                            )
                          }
                          value={currentValue}
                        >
                          <option value="">
                            {campaignOptionLabels.length > 0
                              ? 'Choose...'
                              : 'No campaigns for this year'}
                          </option>
                          {!!currentValue &&
                          !campaignOptionLabels.includes(currentValue) ? (
                            <option value={currentValue}>{currentValue} (Legacy)</option>
                          ) : null}
                          {campaignOptionLabels.map((campaignName) => (
                            <option key={campaignName} value={campaignName}>
                              {campaignName}
                            </option>
                          ))}
                        </Select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sourceCellPreview ? (
        <div
          className="fixed z-50 w-[min(480px,calc(100vw-24px))] max-h-[calc(100vh-24px)] overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur"
          ref={sourcePreviewPopoverRef}
          style={{
            left: `${sourceCellPreview.anchorLeft}px`,
            top: `${sourceCellPreview.anchorTop}px`
          }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border/60 px-3 py-2">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-foreground">
                {sourceCellPreview.kind === 'embed_url' ? 'Post preview' : 'Source preview'}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Row {sourceCellPreview.rowNumber} • {sourceCellPreview.columnLabel}
              </div>
            </div>
            <button
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              onClick={() => setSourceCellPreview(null)}
              type="button"
            >
              Close
            </button>
          </div>
          <div className="max-h-[calc(100vh-88px)] space-y-2 overflow-y-auto p-3 text-sm">
            {sourceCellPreview.kind === 'embed_url' ? (
              <>
                {isFacebookEventUrl(sourceCellPreview.value) ? (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-border/60 bg-background/60 p-3 text-[12px] text-muted-foreground">
                      Facebook Event links are opened in a new tab for a reliable preview.
                    </div>
                  </div>
                ) : isFacebookPermalink(sourceCellPreview.value) ? (
                  <div className="space-y-2">
                    <div className="relative h-[430px] overflow-auto rounded-xl border border-border/60 bg-background/70 p-2">
                      <div className="mx-auto w-full max-w-[430px]" ref={facebookEmbedContainerRef} />
                      {!embedFrameLoaded ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 px-4 text-center text-[11px] text-muted-foreground">
                          Loading preview...
                        </div>
                      ) : null}
                    </div>
                    {embedFrameBlocked && !embedFrameLoaded ? (
                      <div className="rounded-xl border border-border/60 bg-background/60 p-2 text-[11px] text-muted-foreground">
                        Facebook blocked in-app embed. Use Open in new tab.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-xl border border-border/60 bg-background/70">
                      <iframe
                        className="h-[430px] w-full"
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        src={resolveEmbedSourceUrl(sourceCellPreview.value)}
                        title="Post preview"
                      />
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 p-2 text-[11px] text-muted-foreground">
                      If blank, this page does not allow embed. Use Open in new tab.
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" type="button" variant="outline">
                    <a href={sourceCellPreview.value} rel="noreferrer" target="_blank">
                      Open in new tab
                    </a>
                  </Button>
                </div>
                <div className="max-h-16 overflow-auto break-all text-[11px] text-muted-foreground">
                  {sourceCellPreview.value}
                </div>
              </>
            ) : sourceCellPreview.kind === 'url' ? (
              <>
                <div className="max-h-72 overflow-auto break-all rounded-xl border border-border/60 bg-background/50 p-3 text-foreground">
                  {sourceCellPreview.value}
                </div>
                <Button asChild size="sm" type="button" variant="outline">
                  <a href={sourceCellPreview.value} rel="noreferrer" target="_blank">
                    Open in new tab
                  </a>
                </Button>
              </>
            ) : (
              <div className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/60 bg-background/50 p-3 text-sm text-foreground">
                {sourceCellPreview.value}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {sourcePreview.truncated ? (
        <div className="text-sm text-muted-foreground">
          Showing {sourcePreview.shownRows} of {sourcePreview.totalRows} rows.
        </div>
      ) : null}
      </div>
    </div>
  );
}

