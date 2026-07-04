import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/types';
import { useAuth } from '@/providers/AuthProvider';
import { guessFieldMapping, parseVoterFile, type ParsedSheet } from './parseFile';

type FieldMapping = ReturnType<typeof guessFieldMapping>;

export function ImportWizard({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filename, setFilename] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>({
    full_name: '',
    address_line: '',
    lat: '',
    lng: ''
  });
  const [parseError, setParseError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setParseError(null);
    try {
      const parsed = await parseVoterFile(file);
      if (parsed.rows.length === 0) {
        setParseError('No rows found in the file.');
        return;
      }
      setFilename(file.name);
      setSheet(parsed);
      setMapping(guessFieldMapping(parsed.columns));
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  const importRows = useMutation({
    mutationFn: async () => {
      const { data: batch, error: batchError } = await supabase
        .from('import_batches')
        .insert({
          project_id: projectId,
          source_filename: filename,
          row_count: sheet!.rows.length,
          imported_by: user!.id
        })
        .select()
        .single();
      if (batchError) throw batchError;

      const toNumber = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && v !== '' && v !== null ? n : null;
      };

      const records = sheet!.rows.map((row) => ({
        project_id: projectId,
        import_batch_id: batch.id,
        data: row as Json,
        full_name: mapping.full_name ? String(row[mapping.full_name] ?? '') || null : null,
        address_line: mapping.address_line ? String(row[mapping.address_line] ?? '') || null : null,
        lat: mapping.lat ? toNumber(row[mapping.lat]) : null,
        lng: mapping.lng ? toNumber(row[mapping.lng]) : null
      }));

      // Chunked inserts keep payloads under PostgREST limits for big lists.
      const chunkSize = 500;
      for (let i = 0; i < records.length; i += chunkSize) {
        const { error } = await supabase.from('voter_records').insert(records.slice(i, i + chunkSize));
        if (error) throw error;
      }
      return records.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voter-records', projectId] });
      onDone();
    }
  });

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-900">Import voter list</h3>

      {!sheet && (
        <div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="text-sm"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <p className="mt-2 text-xs text-neutral-400">
            CSV or Excel. Rows are parsed into structured records — include latitude/longitude
            columns to plot voters on the map (address geocoding is a planned follow-up).
          </p>
          {parseError && <p className="mt-2 text-sm text-red-600">{parseError}</p>}
        </div>
      )}

      {sheet && (
        <>
          <p className="text-sm text-neutral-500">
            {filename} — {sheet.rows.length} rows, {sheet.columns.length} columns. Map the key
            fields; every source column is kept in the record either way.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ['full_name', 'Full name'],
                ['address_line', 'Address'],
                ['lat', 'Latitude'],
                ['lng', 'Longitude']
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                  value={mapping[key]}
                  onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                >
                  <option value="">Not in file</option>
                  {sheet.columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {importRows.isError && (
            <p className="text-sm text-red-600">{(importRows.error as Error).message}</p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={() => importRows.mutate()} disabled={importRows.isPending}>
              {importRows.isPending ? 'Importing…' : `Import ${sheet.rows.length} records`}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSheet(null)}>
              Choose different file
            </Button>
            <Button variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
