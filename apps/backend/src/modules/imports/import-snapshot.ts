import type { ImportJob } from '@prisma/client';

import type { ParsedImportDocument } from './imports.tabular';

type ImportJobSnapshotCarrier = Pick<
  ImportJob,
  | 'snapshotSourceType'
  | 'snapshotSheetName'
  | 'snapshotHeaderRow'
  | 'snapshotDataRows'
>;

export type ImportJobSnapshot = {
  sourceType: 'csv' | 'excel';
  sheetName: string | null;
  headerRow: string[];
  dataRows: string[][];
};

export function toImportJobSnapshot(parsed: ParsedImportDocument): ImportJobSnapshot {
  return {
    sourceType: parsed.sourceType,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow.map((value) => value.trim()),
    dataRows: parsed.dataRows.map((row) => row.map((value) => value.trim()))
  };
}

export function toImportJobSnapshotWriteData(snapshot: ImportJobSnapshot) {
  return {
    snapshotSourceType: snapshot.sourceType,
    snapshotSheetName: snapshot.sheetName,
    snapshotHeaderRow: snapshot.headerRow,
    snapshotDataRows: snapshot.dataRows,
    snapshotCapturedAt: new Date()
  };
}

export function readImportJobSnapshot(
  importJob: ImportJobSnapshotCarrier
): ImportJobSnapshot | null {
  const sourceType = importJob.snapshotSourceType;

  if (sourceType !== 'csv' && sourceType !== 'excel') {
    return null;
  }

  const headerRow = readStringArray(importJob.snapshotHeaderRow);
  const dataRows = readStringMatrix(importJob.snapshotDataRows);

  if (!headerRow || !dataRows) {
    return null;
  }

  return {
    sourceType,
    sheetName: importJob.snapshotSheetName ?? null,
    headerRow,
    dataRows
  };
}

function readStringArray(input: unknown) {
  if (!Array.isArray(input)) {
    return null;
  }

  return input.map((item) => (typeof item === 'string' ? item.trim() : ''));
}

function readStringMatrix(input: unknown) {
  if (!Array.isArray(input)) {
    return null;
  }

  const rows: string[][] = [];

  for (const row of input) {
    if (!Array.isArray(row)) {
      return null;
    }

    rows.push(
      row.map((value) => (typeof value === 'string' ? value.trim() : ''))
    );
  }

  return rows;
}
