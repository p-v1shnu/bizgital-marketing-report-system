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
  const rawBuffer = await readFile(filePath);
  const rawContent = decodeCsvBuffer(rawBuffer);
  const rows = parseCsvRows(rawContent).map((row) => row.map((value) => value.trim()));
  const headerRowIndex = rows.findIndex((row) => isNonEmptyCsvRow(row));

  return buildParsedDocument(rows, headerRowIndex, {
    sourceType: 'csv',
    sheetName: null
  });
}

function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length === 0) {
    return '';
  }

  // UTF-8 BOM
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.subarray(3).toString('utf8');
  }

  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }

  // UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return decodeUtf16Be(buffer.subarray(2));
  }

  if (looksLikeUtf16Le(buffer)) {
    return buffer.toString('utf16le');
  }

  if (looksLikeUtf16Be(buffer)) {
    return decodeUtf16Be(buffer);
  }

  return buffer.toString('utf8');
}

function decodeUtf16Be(buffer: Buffer): string {
  const usableLength = buffer.length - (buffer.length % 2);
  const swapped = Buffer.allocUnsafe(usableLength);

  for (let index = 0; index < usableLength; index += 2) {
    swapped[index] = buffer[index + 1];
    swapped[index + 1] = buffer[index];
  }

  return swapped.toString('utf16le');
}

function looksLikeUtf16Le(buffer: Buffer): boolean {
  const inspectLength = Math.min(buffer.length, 512);
  if (inspectLength < 4) {
    return false;
  }

  let evenNulls = 0;
  let oddNulls = 0;
  let evenCount = 0;
  let oddCount = 0;

  for (let index = 0; index < inspectLength; index += 1) {
    const value = buffer[index];
    if (index % 2 === 0) {
      evenCount += 1;
      if (value === 0x00) {
        evenNulls += 1;
      }
    } else {
      oddCount += 1;
      if (value === 0x00) {
        oddNulls += 1;
      }
    }
  }

  const evenNullRatio = evenCount === 0 ? 0 : evenNulls / evenCount;
  const oddNullRatio = oddCount === 0 ? 0 : oddNulls / oddCount;

  return oddNullRatio > 0.4 && evenNullRatio < 0.2;
}

function looksLikeUtf16Be(buffer: Buffer): boolean {
  const inspectLength = Math.min(buffer.length, 512);
  if (inspectLength < 4) {
    return false;
  }

  let evenNulls = 0;
  let oddNulls = 0;
  let evenCount = 0;
  let oddCount = 0;

  for (let index = 0; index < inspectLength; index += 1) {
    const value = buffer[index];
    if (index % 2 === 0) {
      evenCount += 1;
      if (value === 0x00) {
        evenNulls += 1;
      }
    } else {
      oddCount += 1;
      if (value === 0x00) {
        oddNulls += 1;
      }
    }
  }

  const evenNullRatio = evenCount === 0 ? 0 : evenNulls / evenCount;
  const oddNullRatio = oddCount === 0 ? 0 : oddNulls / oddCount;

  return evenNullRatio > 0.4 && oddNullRatio < 0.2;
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
