import type { KpiSourceType, MappingTargetField } from '@prisma/client';

export const KPI_PLAN_SNAPSHOT_SETTING_VERSION = 1 as const;

export type KpiPlanSnapshotSettingPayload = {
  version: typeof KPI_PLAN_SNAPSHOT_SETTING_VERSION;
  capturedAt: string;
  year: number;
  plan: {
    id: string | null;
    itemCount: number;
    updatedAt: string | null;
  };
  items: Array<{
    id: string;
    sortOrder: number;
    targetValue: number | null;
    note: string | null;
    kpi: {
      id: string;
      key: string;
      label: string;
      description: string | null;
      sourceType: KpiSourceType;
      canonicalMetricKey: MappingTargetField | null;
      formulaId: string | null;
      formulaLabel: string | null;
      isActive: boolean;
    };
  }>;
};

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toFiniteNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
}

export function toKpiPlanSnapshotSettingKey(reportVersionId: string) {
  return `report_kpi_plan_snapshot_v1:${reportVersionId}`;
}

export function stringifyKpiPlanSnapshotSettingPayload(
  payload: KpiPlanSnapshotSettingPayload
) {
  return JSON.stringify(payload);
}

export function parseKpiPlanSnapshotSettingPayload(
  rawValueJson: string | null | undefined
): KpiPlanSnapshotSettingPayload | null {
  if (!rawValueJson) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValueJson);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const payload = parsed as {
    version?: unknown;
    capturedAt?: unknown;
    year?: unknown;
    plan?: {
      id?: unknown;
      itemCount?: unknown;
      updatedAt?: unknown;
    };
    items?: unknown;
  };

  const year = Number(payload.year);
  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    return null;
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items: KpiPlanSnapshotSettingPayload['items'] = rawItems
    .map((item) => {
      const row = item as {
        id?: unknown;
        sortOrder?: unknown;
        targetValue?: unknown;
        note?: unknown;
        kpi?: {
          id?: unknown;
          key?: unknown;
          label?: unknown;
          description?: unknown;
          sourceType?: unknown;
          canonicalMetricKey?: unknown;
          formulaId?: unknown;
          formulaLabel?: unknown;
          isActive?: unknown;
        };
      };
      const kpi = row.kpi;
      const sourceType =
        kpi?.sourceType === 'canonical_metric' || kpi?.sourceType === 'formula_column'
          ? kpi.sourceType
          : null;
      const canonicalMetricKey =
        typeof kpi?.canonicalMetricKey === 'string' ? kpi.canonicalMetricKey : null;
      const formulaId = normalizeText(kpi?.formulaId);
      const formulaLabel = normalizeText(kpi?.formulaLabel);

      if (!sourceType) {
        return null;
      }

      if (sourceType === 'canonical_metric' && !canonicalMetricKey) {
        return null;
      }

      if (sourceType === 'formula_column' && !formulaId) {
        return null;
      }

      const sortOrder = Number(row.sortOrder);
      return {
        id: normalizeText(row.id) || `snapshot-${Math.random().toString(36).slice(2, 10)}`,
        sortOrder: Number.isInteger(sortOrder) && sortOrder > 0 ? sortOrder : 0,
        targetValue: toFiniteNumberOrNull(row.targetValue),
        note: normalizeText(row.note) || null,
        kpi: {
          id: normalizeText(kpi?.id) || '',
          key: normalizeText(kpi?.key) || '',
          label: normalizeText(kpi?.label) || '',
          description: normalizeText(kpi?.description) || null,
          sourceType,
          canonicalMetricKey: sourceType === 'canonical_metric' ? (canonicalMetricKey as MappingTargetField) : null,
          formulaId: sourceType === 'formula_column' ? formulaId : null,
          formulaLabel: sourceType === 'formula_column' ? (formulaLabel || null) : null,
          isActive: kpi?.isActive !== false
        }
      };
    })
    .filter(
      (
        row
      ): row is {
        id: string;
        sortOrder: number;
        targetValue: number | null;
        note: string | null;
        kpi: {
          id: string;
          key: string;
          label: string;
          description: string | null;
          sourceType: KpiSourceType;
          canonicalMetricKey: MappingTargetField | null;
          formulaId: string | null;
          formulaLabel: string | null;
          isActive: boolean;
        };
      } => !!row && !!row.kpi.id && !!row.kpi.key && !!row.kpi.label
    )
    .sort((left, right) => left.sortOrder - right.sortOrder || left.kpi.label.localeCompare(right.kpi.label))
    .map((row, index) => ({
      ...row,
      sortOrder: index + 1
    }));

  const capturedAt = normalizeText(payload.capturedAt);
  const normalizedVersion = Number(payload.version);

  return {
    version:
      normalizedVersion === KPI_PLAN_SNAPSHOT_SETTING_VERSION
        ? KPI_PLAN_SNAPSHOT_SETTING_VERSION
        : KPI_PLAN_SNAPSHOT_SETTING_VERSION,
    capturedAt: capturedAt || new Date(0).toISOString(),
    year,
    plan: {
      id: normalizeText(payload.plan?.id) || null,
      itemCount:
        Number.isInteger(Number(payload.plan?.itemCount)) && Number(payload.plan?.itemCount) >= 0
          ? Number(payload.plan?.itemCount)
          : items.length,
      updatedAt: normalizeText(payload.plan?.updatedAt) || null
    },
    items
  };
}
