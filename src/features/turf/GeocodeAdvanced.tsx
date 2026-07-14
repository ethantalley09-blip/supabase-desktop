import { MapPinned, MapPinX, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { computeGeocodeHealth, needsManualFix } from './geocodeHealth';
import { useGeocodeAllRemaining, useManualGeocode } from './geocode';
import type { VoterRecord } from './useTurf';

const STATUS_LABEL: Record<string, string> = {
  ambiguous: 'Multiple matches',
  no_match: 'No match found',
  error: 'Lookup failed'
};

// Advanced geocoding: today's single "geocode 25" button treats every
// unresolved address the same, whether nobody's tried it yet or the Census
// index genuinely can't place it. This surfaces WHY (ambiguous vs no match
// vs error, tracked via geocode_status), runs the whole backlog instead of
// 25 at a time, and gives staff a manual fix -- an edited address to retry,
// or hand-typed coordinates for the addresses that will never match (rural
// routes, brand-new construction).
export function GeocodeAdvanced({ projectId, voters }: { projectId: string; voters: VoterRecord[] }) {
  const geocodeAll = useGeocodeAllRemaining();
  const manualFix = useManualGeocode();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  const health = useMemo(() => computeGeocodeHealth(voters), [voters]);
  const fixQueue = useMemo(() => needsManualFix(voters).slice(0, 25), [voters]);
  const remaining = health.unattempted;

  const runAll = () => {
    setProgress({ done: 0, total: Math.min(remaining, 300) });
    geocodeAll.mutate({
      projectId,
      voters,
      onProgress: (done, total) => setProgress({ done, total })
    });
  };

  const startEdit = (voter: VoterRecord) => {
    setEditing(voter.id);
    setEditAddress(voter.address_line ?? '');
    setManualLat('');
    setManualLng('');
  };

  const retry = (voterId: string) => {
    manualFix.mutate({ projectId, voterId, mode: 'retry', address: editAddress.trim() }, { onSuccess: () => setEditing(null) });
  };

  const saveManualPin = (voterId: string) => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    manualFix.mutate({ projectId, voterId, mode: 'manual', lat, lng }, { onSuccess: () => setEditing(null) });
  };

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <MapPinned className="h-4 w-4 text-neutral-700" />
        <h3 className="text-sm font-semibold text-neutral-900">Geocoding coverage</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Mapped" value={`${health.pctMapped}%`} sub={`${health.mapped} of ${health.total}`} />
        <Stat label="Not tried yet" value={health.unattempted} />
        <Stat label="Ambiguous" value={health.ambiguous} warn={health.ambiguous > 0} />
        <Stat label="No match" value={health.noMatch} warn={health.noMatch > 0} />
        <Stat label="Lookup failed" value={health.error} warn={health.error > 0} />
      </div>

      {remaining > 0 && (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={runAll} disabled={geocodeAll.isPending}>
            <RefreshCw className={`h-4 w-4 ${geocodeAll.isPending ? 'animate-spin' : ''}`} />
            {geocodeAll.isPending ? 'Geocoding…' : `Geocode all ${Math.min(remaining, 300)} remaining`}
          </Button>
          {progress && geocodeAll.isPending && (
            <span className="text-xs text-neutral-400">
              {progress.done} of {progress.total}
            </span>
          )}
        </div>
      )}
      {geocodeAll.data && !geocodeAll.isPending && (
        <p className="text-sm text-emerald-600">
          Resolved {geocodeAll.data.resolved} of {geocodeAll.data.attempted}
          {geocodeAll.data.ambiguous > 0 ? ` — ${geocodeAll.data.ambiguous} need a manual pick (below)` : ''}
          {geocodeAll.data.noMatch > 0 ? `, ${geocodeAll.data.noMatch} had no match` : ''}.
        </p>
      )}

      {fixQueue.length > 0 && (
        <div className="space-y-2 border-t border-neutral-100 pt-3">
          <div className="flex items-center gap-2">
            <MapPinX className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-medium text-neutral-600">
              Needs a manual fix ({fixQueue.length}{needsManualFix(voters).length > 25 ? `, showing first 25` : ''})
            </p>
          </div>
          <div className="space-y-2">
            {fixQueue.map((v) => (
              <div key={v.id} className="rounded-md border border-amber-100 bg-amber-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-800">{v.full_name ?? 'Unnamed voter'}</p>
                    <p className="text-xs text-neutral-500">
                      {v.address_line} · <span className="text-amber-700">{STATUS_LABEL[v.geocode_status] ?? v.geocode_status}</span>
                    </p>
                  </div>
                  {editing !== v.id && (
                    <Button variant="outline" size="sm" onClick={() => startEdit(v)}>
                      Fix
                    </Button>
                  )}
                </div>
                {editing === v.id && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="Corrected address"
                      />
                      <Button size="sm" onClick={() => retry(v.id)} disabled={manualFix.isPending || !editAddress.trim()}>
                        Retry lookup
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400">or drop a pin manually:</span>
                      <Input className="w-28" placeholder="lat" value={manualLat} onChange={(e) => setManualLat(e.target.value)} />
                      <Input className="w-28" placeholder="lng" value={manualLng} onChange={(e) => setManualLng(e.target.value)} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveManualPin(v.id)}
                        disabled={manualFix.isPending || !manualLat || !manualLng}
                      >
                        Save pin
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {manualFix.isError && <p className="text-sm text-red-600">{(manualFix.error as Error).message}</p>}
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-neutral-100 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`text-lg font-semibold ${warn ? 'text-amber-600' : 'text-neutral-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-400">{sub}</p>}
    </div>
  );
}
