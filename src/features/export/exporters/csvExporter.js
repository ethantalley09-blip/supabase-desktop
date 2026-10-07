import Papa from 'papaparse';
import { saveFile } from '../download';
export async function exportCsv(filename, rows) {
    const csv = Papa.unparse(rows);
    await saveFile(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
