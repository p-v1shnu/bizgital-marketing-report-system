export const MANUAL_FORMULA_ROWS_SETTING_VERSION = 1 as const;
const MANUAL_FORMULA_ROWS_SETTING_KEY_PREFIX = 'report_manual_formula_rows_v1';

export type ManualFormulaRowsByRowNumber = Record<string, Record<string, string>>;

export type ManualFormulaRowsSettingPayload = {
  version: typeof MANUAL_FORMULA_ROWS_SETTING_VERSION;
  rowsByRowNumber: ManualFormulaRowsByRowNumber;
};

export function toManualFormulaRowsSettingKey(reportVersionId: string) {
  return `${MANUAL_FORMULA_ROWS_SETTING_KEY_PREFIX}:${reportVersionId}`;
}

export function parseManualFormulaRowsSettingPayload(
  rawValueJson: string | null | undefined
): ManualFormulaRowsByRowNumber {
  if (!rawValueJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValueJson) as Partial<ManualFormulaRowsSettingPayload>;
    if (
      parsed?.version !== MANUAL_FORMULA_ROWS_SETTING_VERSION ||
      !parsed.rowsByRowNumber ||
      typeof parsed.rowsByRowNumber !== 'object'
    ) {
      return {};
    }

    const normalized: ManualFormulaRowsByRowNumber = {};

    for (const [rowNumber, rawFormulas] of Object.entries(parsed.rowsByRowNumber)) {
      if (!/^\d+$/.test(rowNumber)) {
        continue;
      }

      if (!rawFormulas || typeof rawFormulas !== 'object') {
        continue;
      }

      const normalizedFormulas: Record<string, string> = {};
      for (const [rawFormulaId, rawValue] of Object.entries(rawFormulas)) {
        const formulaId = String(rawFormulaId ?? '').trim();
        const value = String(rawValue ?? '').trim();

        if (!formulaId || !value) {
          continue;
        }

        normalizedFormulas[formulaId] = value;
      }

      if (Object.keys(normalizedFormulas).length > 0) {
        normalized[rowNumber] = normalizedFormulas;
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

export function stringifyManualFormulaRowsSettingPayload(rowsByRowNumber: ManualFormulaRowsByRowNumber) {
  const payload: ManualFormulaRowsSettingPayload = {
    version: MANUAL_FORMULA_ROWS_SETTING_VERSION,
    rowsByRowNumber
  };

  return JSON.stringify(payload);
}
