import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ParsedSheet = {
  columns: string[];
  rows: Record<string, unknown>[];
  // Rows Papaparse flagged as malformed (wrong field count, etc.) but still
  // did its best to parse -- surfaced so staff know to spot-check them,
  // rather than silently importing possibly-misaligned data.
  parseWarnings: { row: number; message: string }[];
};

// Parses a voter list file into structured JSON rows. This is the
// "spreadsheet replacement": the file is read once, normalized, and stored
// as queryable records -- never round-tripped through a grid UI.
export async function parseVoterFile(file: File): Promise<ParsedSheet> {
  // Papaparse auto-detects the delimiter when unset, so it handles
  // comma/tab-delimited exports alike -- more reliable than SheetJS's
  // plain-text format sniffing for .tsv/.txt. Everything else (actual
  // spreadsheet binaries: xlsx/xls/xlsm/xlsb/ods) goes through SheetJS,
  // which detects the real format from file content, not the extension.
  const name = file.name.toLowerCase();
  const isDelimited = ['.csv', '.tsv', '.txt'].some((ext) => name.endsWith(ext)) || file.type === 'text/csv';

  if (isDelimited) {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          resolve({
            columns: result.meta.fields ?? [],
            rows: result.data,
            parseWarnings: result.errors.map((e) => ({ row: (e.row ?? -1) + 1, message: e.message }))
          });
        },
        error: reject
      });
    });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { columns, rows, parseWarnings: [] };
}

// A row with nothing usable in it -- every column blank/whitespace. Filtered
// out before insert so it doesn't count as a "successfully imported" record.
export function isBlankRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => v === null || v === undefined || String(v).trim() === '');
}

// Best-effort auto-detection of common voter-file column names, editable by
// the user before import.
export function guessFieldMapping(columns: string[]) {
  const lower = columns.map((c) => c.toLowerCase());
  const find = (...candidates: string[]) => {
    for (const cand of candidates) {
      const idx = lower.findIndex((c) => c.includes(cand));
      if (idx >= 0) return columns[idx];
    }
    return '';
  };

  return {
    full_name: find('full name', 'full_name', 'name'),
    address_line: find('address', 'street'),
    lat: find('latitude', 'lat'),
    lng: find('longitude', 'lng', 'lon')
  };
}
