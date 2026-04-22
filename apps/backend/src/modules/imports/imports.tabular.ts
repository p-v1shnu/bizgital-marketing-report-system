import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import * as XLSX from 'xlsx';

import { isNonEmptyCsvRow, parseCsvRows } from './imports.csv';

export type ParsedImportDocument = {
  sourceType: 'csv' | 'excel';
  sheetName: string | null;
  rows: string[][];
  headerRowIndex: number;
  headerRow: string[];
  sampleRow: string[] | null;
  dataRows: string[][];
};

export async function parseImportDocument(
  filePath: string,
  originalFilename: string
): Promise<ParsedImportDocument> {
  const extension = extname(originalFilename).toLowerCase();

  if (extension === '.csv') {
    return parseCsvDocument(filePath);
  }

  if (extension === '.xls' || extension === '.xlsx') {
    return parseExcelDocument(filePath);
  }

  return {
    sourceType: 'csv',
    sheetName: null,
    rows: [],
    headerRowIndex: -1,
    headerRow: [],
    sampleRow: null,
    dataRows: []
  };
}

function normalizeRow(row: unknown[]) {
  return row.map((value) => {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value).trim();
  });
}

function isNonEmptyRow(row: string[]) {
  return row.some((value) => value.trim().length > 0);
}

async function parseCsvDocument(filePath: string): Promise<ParsedImportDocument> {
  const rawContent = await readFile(filePath, 'utf8');
  const rows = parseCsvRows(rawContent).map((row) => row.map((value) => value.trim()));
  const headerRowIndex = rows.findIndex((row) => isNonEmptyCsvRow(row));

  return buildParsedDocument(rows, headerRowIndex, {
    sourceType: 'csv',
    sheetName: null
  });
}

function parseExcelDocument(filePath: string): ParsedImportDocument {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    raw: false
  });

  const sheetName =
    workbook.SheetNames.find((candidate) => {
      const sheet = workbook.Sheets[candidate];

      if (!sheet) {
        return false;
      }

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        raw: false,
        defval: ''
      }) as unknown[][];

      return rows.some((row) => normalizeRow(row).some((value) => value.length > 0));
    }) ?? workbook.SheetNames[0] ?? null;

  const rows =
    sheetName && workbook.Sheets[sheetName]
      ? (XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          blankrows: false,
          raw: false,
          defval: ''
        }) as unknown[][]).map((row) => normalizeRow(row))
      : [];
  const headerRowIndex = rows.findIndex((row) => isNonEmptyRow(row));

  return buildParsedDocument(rows, headerRowIndex, {
    sourceType: 'excel',
    sheetName
  });
}

function buildParsedDocument(
  rows: string[][],
  headerRowIndex: number,
  metadata: Pick<ParsedImportDocument, 'sourceType' | 'sheetName'>
): ParsedImportDocument {
  const headerRow = headerRowIndex === -1 ? [] : rows[headerRowIndex] ?? [];
  const sampleRow =
    headerRowIndex === -1
      ? null
      : rows.slice(headerRowIndex + 1).find((row) => isNonEmptyRow(row)) ?? null;
  const dataRows =
    headerRowIndex === -1
      ? []
      : rows.slice(headerRowIndex + 1).filter((row) => isNonEmptyRow(row));

  return {
    ...metadata,
    rows,
    headerRowIndex,
    headerRow,
    sampleRow,
    dataRows
  };
}
