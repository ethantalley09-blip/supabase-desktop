import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import type { DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { supabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/types';
import { useAuth } from '@/providers/AuthProvider';
import { guessFieldMapping, parseVoterFile, type ParsedSheet } from './parseFile';

type FieldMapping = ReturnType<typeof guessFieldMapping>;

export function ImportWizard({
  projectId,
  orgId,
  onDone
}: {
  projectId: string;
  orgId?: string;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const aiEnabled = useEntitlement(orgId, 'ai_module');
  const canUseAi = useHasPermission(orgId, 'ai.use');
  const suggest = useAiAssist();
  const [aiNotes, setAiNotes] = useState<string | null>(null);
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
  const [dragActive, setDragActive] = useState(false);

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

  const showAiSuggest = Boolean(orgId && aiEnabled.data && canUseAi.data);

  // parseVoterFile's binary branch (SheetJS) auto-detects the real format
  // from file content, not the extension -- xlsx/xls/xlsm/xlsb/ods/tsv/txt
  // all work already. This just widens the drop target/picker to say so.
  const stopDefault = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    stopDefault(e);
    if (!dragActive) setDragActive(true);
  };
  const onDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    stopDefault(e);
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragActive(false);
  };
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    stopDefault(e);
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  // AI column-mapping: send the headers + a few sample rows, apply the
  // suggested mapping (only columns that actually exist), and surface any
  // data-quality note. Exploits the rigidity of importers that just reject
  // files a beginner can't hand-map.
  const suggestMapping = async () => {
    if (!sheet || !orgId) return;
    setAiNotes(null);
    const result = await suggest.mutateAsync({
      orgId,
      projectId,
      purpose: 'import_mapping',
      context: JSON.stringify({ columns: sheet.columns, sampleRows: sheet.rows.slice(0, 5) })
    });
    const parsed = extractJson(result.text);
    if (!parsed) {
      setAiNotes('Could not read the AI suggestion — map the fields manually below.');
      return;
    }
    const pick = (v: unknown) => (typeof v === 'string' && sheet.columns.includes(v) ? v : '');
    setMapping({
      full_name: pick(parsed.full_name),
      address_line: pick(parsed.address_line),
      lat: pick(parsed.lat),
      lng: pick(parsed.lng)
    });
    if (typeof parsed.notes === 'string' && parsed.notes.trim()) setAiNotes(parsed.notes.trim());
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
          <label
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragActive ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-300 hover:border-neutral-400'
            }`}
          >
            <UploadCloud className={`h-6 w-6 ${dragActive ? 'text-neutral-900' : 'text-neutral-400'}`} />
            <p className="text-sm font-medium text-neutral-700">
              {dragActive ? 'Drop it here' : 'Drag a voter file here, or click to browse'}
            </p>
            <p className="text-xs text-neutral-400">
              CSV, Excel (.xlsx/.xls/.xlsm), OpenDocument (.ods), or tab-delimited (.tsv/.txt) —
              whatever your voter file export already is, no reformatting needed.
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,.xlsb,.ods,.tsv,.txt"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <p className="mt-2 text-xs text-neutral-400">
            Rows are parsed into structured records — include latitude/longitude columns to plot
            voters on the map immediately, or geocode addresses afterward from the Turf tab.
          </p>
          {parseError && <p className="mt-2 text-sm text-red-600">{parseError}</p>}
        </div>
      )}

      {sheet && (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-neutral-500">
              {filename} — {sheet.rows.length} rows, {sheet.columns.length} columns. Map the key
              fields; every source column is kept in the record either way.
            </p>
            {showAiSuggest && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={suggestMapping}
                disabled={suggest.isPending}
              >
                <Sparkles className="h-4 w-4" />
                {suggest.isPending ? 'Reading…' : 'Suggest with AI'}
              </Button>
            )}
          </div>
          {suggest.isError && (
            <p className="text-sm text-red-600">{(suggest.error as Error).message}</p>
          )}
          {aiNotes && (
            <p className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
              {aiNotes}
            </p>
          )}

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
