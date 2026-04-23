import type { ContentCountPolicyMode } from '../column-config/column-config.types';

export const TOP_CONTENT_COUNT_SNAPSHOT_SETTING_VERSION = 1 as const;

export type TopContentCountSnapshotSettingPayload = {
  version: typeof TOP_CONTENT_COUNT_SNAPSHOT_SETTING_VERSION;
  capturedAt: string;
  reportVersionId: string;
  countedContentCount: number;
  csvRowCount: number;
  manualRowCount: number;
  policy: {
    mode: ContentCountPolicyMode;
    label: string;
    excludeManualRows: boolean;
    updatedAt: string | null;
    updatedBy: string | null;
    note: string | null;
  };
};

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNonNegativeInteger(value: unknown) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return null;
  }

  return numeric;
}

function toMode(value: unknown): ContentCountPolicyMode | null {
  if (value === 'csv_only' || value === 'csv_and_manual') {
    return value;
  }

  return null;
}

export function toTopContentCountSnapshotSettingKey(reportVersionId: string) {
  return `report_top_content_count_snapshot_v1:${reportVersionId}`;
}

export function stringifyTopContentCountSnapshotSettingPayload(
  payload: TopContentCountSnapshotSettingPayload
) {
  return JSON.stringify(payload);
}

export function parseTopContentCountSnapshotSettingPayload(
  rawValueJson: string | null | undefined
): TopContentCountSnapshotSettingPayload | null {
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

  const candidate = parsed as {
    version?: unknown;
    capturedAt?: unknown;
    reportVersionId?: unknown;
    countedContentCount?: unknown;
    csvRowCount?: unknown;
    manualRowCount?: unknown;
    policy?: {
      mode?: unknown;
      label?: unknown;
      excludeManualRows?: unknown;
      updatedAt?: unknown;
      updatedBy?: unknown;
      note?: unknown;
    };
  };

  const mode = toMode(candidate.policy?.mode);
  const countedContentCount = toNonNegativeInteger(candidate.countedContentCount);
  const csvRowCount = toNonNegativeInteger(candidate.csvRowCount);
  const manualRowCount = toNonNegativeInteger(candidate.manualRowCount);
  const capturedAt = normalizeText(candidate.capturedAt);
  const reportVersionId = normalizeText(candidate.reportVersionId);
  const policyLabel = normalizeText(candidate.policy?.label);

  if (
    !mode ||
    countedContentCount === null ||
    csvRowCount === null ||
    manualRowCount === null ||
    !capturedAt ||
    !reportVersionId ||
    !policyLabel
  ) {
    return null;
  }

  return {
    version:
      Number(candidate.version) === TOP_CONTENT_COUNT_SNAPSHOT_SETTING_VERSION
        ? TOP_CONTENT_COUNT_SNAPSHOT_SETTING_VERSION
        : TOP_CONTENT_COUNT_SNAPSHOT_SETTING_VERSION,
    capturedAt,
    reportVersionId,
    countedContentCount,
    csvRowCount,
    manualRowCount,
    policy: {
      mode,
      label: policyLabel,
      excludeManualRows: candidate.policy?.excludeManualRows !== false,
      updatedAt: normalizeText(candidate.policy?.updatedAt) || null,
      updatedBy: normalizeText(candidate.policy?.updatedBy) || null,
      note: normalizeText(candidate.policy?.note) || null
    }
  };
}
