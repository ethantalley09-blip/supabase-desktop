import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ParsedSheet = {
  columns: string[];
  rows: Record<string, unknown>[];
};

// Parses a voter list file into structured JSON rows. This is the
// "spreadsheet replacement": the file is read once, normalized, and stored
// as queryable records -- never round-tripped through a grid UI.
export async function parseVoterFile(file: File): Promise<ParsedSheet> {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';

  if (isCsv) {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          resolve({
            columns: result.meta.fields ?? [],
            rows: result.data
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
  return { columns, rows };
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
