export const MANUAL_SOURCE_ROWS_SETTING_VERSION = 1 as const;
const MANUAL_SOURCE_ROWS_SETTING_KEY_PREFIX = 'report_manual_source_rows_v1';

export type ManualSourceRowsByRowNumber = Record<string, Record<string, string>>;

export type ManualSourceRowsSettingPayload = {
  version: typeof MANUAL_SOURCE_ROWS_SETTING_VERSION;
  rowsByRowNumber: ManualSourceRowsByRowNumber;
};

export function toManualSourceRowsSettingKey(reportVersionId: string) {
  return `${MANUAL_SOURCE_ROWS_SETTING_KEY_PREFIX}:${reportVersionId}`;
}

export function parseManualSourceRowsSettingPayload(
  rawValueJson: string | null | undefined
): ManualSourceRowsByRowNumber {
  if (!rawValueJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValueJson) as Partial<ManualSourceRowsSettingPayload>;
    if (
      parsed?.version !== MANUAL_SOURCE_ROWS_SETTING_VERSION ||
      !parsed.rowsByRowNumber ||
      typeof parsed.rowsByRowNumber !== 'object'
    ) {
      return {};
    }

    const normalized: ManualSourceRowsByRowNumber = {};

    for (const [rowNumber, rawColumns] of Object.entries(parsed.rowsByRowNumber)) {
      if (!/^\d+$/.test(rowNumber)) {
        continue;
      }

      if (!rawColumns || typeof rawColumns !== 'object') {
        continue;
      }

      const normalizedColumns: Record<string, string> = {};
      for (const [rawLabel, rawValue] of Object.entries(rawColumns)) {
        const label = String(rawLabel ?? '').trim().replace(/\s+/g, ' ');
        const value = String(rawValue ?? '').trim();

        if (!label || !value) {
          continue;
        }

        normalizedColumns[label] = value;
      }

      if (Object.keys(normalizedColumns).length > 0) {
        normalized[rowNumber] = normalizedColumns;
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

export function stringifyManualSourceRowsSettingPayload(rowsByRowNumber: ManualSourceRowsByRowNumber) {
  const payload: ManualSourceRowsSettingPayload = {
    version: MANUAL_SOURCE_ROWS_SETTING_VERSION,
    rowsByRowNumber
  };

  return JSON.stringify(payload);
}
