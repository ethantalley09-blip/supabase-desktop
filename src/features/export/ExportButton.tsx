import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { exportCsv } from './exporters/csvExporter';
import { exportPdf } from './exporters/pdfExporter';
import type { ExportDataset } from './types';

export function ExportButton({ datasets, filePrefix }: { datasets: ExportDataset[]; filePrefix: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (dataset: ExportDataset, format: 'csv' | 'pdf') => {
    setBusy(true);
    try {
      const rows = await dataset.getRows();
      const filename = `${filePrefix}-${dataset.id}.${format}`;
      if (format === 'csv') {
        await exportCsv(filename, rows);
      } else {
        await exportPdf(filename, dataset.label, rows);
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (datasets.length === 0) return null;

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} disabled={busy}>
        <Download className="h-4 w-4" />
        {busy ? 'Exporting…' : 'Export'}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-neutral-200 bg-white p-1 shadow-md">
          {datasets.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded px-2 py-1.5 text-sm">
              <span className="text-neutral-700">{d.label}</span>
              <span className="flex gap-1">
                <button
                  className="rounded px-1.5 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                  onClick={() => run(d, 'csv')}
                >
                  CSV
                </button>
                <button
                  className="rounded px-1.5 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                  onClick={() => run(d, 'pdf')}
                >
                  PDF
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
