import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImportWizard } from '@/features/voter-import/ImportWizard';
import type { Project } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { supabase } from '@/lib/supabase/client';
import { useGeocodeUnmapped } from './geocode';
import { useAssignTerritory, useCreateTerritory, useTerritories, useVoterRecords } from './useTurf';

// OpenFreeMap: free OSM-derived vector tiles, no API key, production-safe
// (chosen over osm.org raster tiles, whose usage policy disallows app
// traffic at scale).
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const TERRITORY_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

export function TurfTab({ project }: { project: Project }) {
  const canManage = useHasPermission(project.org_id, 'turf.manage');
  const { data: territories } = useTerritories(project.id);
  const { data: voters } = useVoterRecords(project.id);
  const createTerritory = useCreateTerritory();
  const assignTerritory = useAssignTerritory();
  const geocode = useGeocodeUnmapped();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [importing, setImporting] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(false);
  const [draftRing, setDraftRing] = useState<[number, number][]>([]);
  const draftRingRef = useRef<[number, number][]>([]);
  const [territoryName, setTerritoryName] = useState('');
  const [lastAssignment, setLastAssignment] = useState<string | null>(null);

  const { data: members } = useQuery({
    queryKey: ['org-members', project.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_memberships')
        .select('profile_id, profiles(email, full_name)')
        .eq('org_id', project.org_id)
        .eq('status', 'active');
      if (error) throw error;
      return data as unknown as { profile_id: string; profiles: { email: string; full_name: string | null } | null }[];
    }
  });

  // Map lifecycle: one instance per mount.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [-98.5, 39.8], // continental US
      zoom: 3.5
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('voters', { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'voters-layer',
        type: 'circle',
        source: 'voters',
        paint: {
          'circle-radius': 5,
          'circle-color': ['case', ['==', ['get', 'assigned'], 1], '#16a34a', '#737373'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      });

      map.addSource('territories', { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'territories-fill',
        type: 'fill',
        source: 'territories',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 }
      });
      map.addLayer({
        id: 'territories-line',
        type: 'line',
        source: 'territories',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 }
      });

      map.addSource('draft', { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'draft-line',
        type: 'line',
        source: 'draft',
        paint: { 'line-color': '#171717', 'line-width': 2, 'line-dasharray': [2, 1] }
      });
      map.addLayer({
        id: 'draft-points',
        type: 'circle',
        source: 'draft',
        paint: { 'circle-radius': 4, 'circle-color': '#171717' },
        filter: ['==', '$type', 'Point']
      });

      setMapReady(true);
    });

    map.on('click', (e) => {
      if (!drawingRef.current) return;
      const next: [number, number][] = [...draftRingRef.current, [e.lngLat.lng, e.lngLat.lat]];
      draftRingRef.current = next;
      setDraftRing(next);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push voters into the map whenever they change.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('voters') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const mapped = (voters ?? []).filter((v) => v.lat !== null && v.lng !== null);
    source.setData({
      type: 'FeatureCollection',
      features: mapped.map((v) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.lng!, v.lat!] },
        properties: { assigned: v.territory_id ? 1 : 0 }
      }))
    });

    if (mapped.length > 0) {
      const lngs = mapped.map((v) => v.lng!);
      const lats = mapped.map((v) => v.lat!);
      mapRef.current.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)]
        ],
        { padding: 60, maxZoom: 14, duration: 500 }
      );
    }
  }, [voters, mapReady]);

  // Push saved territories into the map.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('territories') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: (territories ?? []).map((t, i) => ({
        type: 'Feature',
        geometry: t.geometry,
        properties: { color: TERRITORY_COLORS[i % TERRITORY_COLORS.length], name: t.name }
      }))
    });
  }, [territories, mapReady]);

  // Draft ring preview while drawing.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('draft') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = draftRing.map((pos) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: pos },
      properties: {}
    }));
    if (draftRing.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: draftRing },
        properties: {}
      });
    }
    source.setData({ type: 'FeatureCollection', features });
  }, [draftRing, mapReady]);

  const startDrawing = () => {
    setDrawing(true);
    drawingRef.current = true;
    draftRingRef.current = [];
    setDraftRing([]);
    setLastAssignment(null);
  };

  const cancelDrawing = () => {
    setDrawing(false);
    drawingRef.current = false;
    draftRingRef.current = [];
    setDraftRing([]);
    setTerritoryName('');
  };

  const finishTerritory = async () => {
    if (draftRing.length < 3 || territoryName.trim().length < 2) return;
    const result = await createTerritory.mutateAsync({
      projectId: project.id,
      name: territoryName.trim(),
      ring: draftRing,
      voters: voters ?? []
    });
    setLastAssignment(
      `"${territoryName.trim()}" saved — ${result.assignedCount} voter${result.assignedCount === 1 ? '' : 's'} assigned by point-in-polygon.`
    );
    cancelDrawing();
  };

  const mappedCount = (voters ?? []).filter((v) => v.lat !== null && v.lng !== null).length;
  const geocodableCount = (voters ?? []).filter((v) => v.lat === null && v.address_line).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {voters?.length ?? 0} voter records ({mappedCount} mappable) ·{' '}
          {territories?.length ?? 0} territories
        </p>
        {canManage.data && (
          <div className="flex gap-2">
            {geocodableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={geocode.isPending}
                onClick={() => geocode.mutate({ projectId: project.id, voters: voters ?? [] })}
              >
                {geocode.isPending ? 'Geocoding…' : `Geocode ${Math.min(geocodableCount, 25)} addresses`}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setImporting(!importing)}>
              {importing ? 'Close import' : 'Import voters'}
            </Button>
            {!drawing ? (
              <Button size="sm" onClick={startDrawing}>
                Draw territory
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={cancelDrawing}>
                Cancel drawing
              </Button>
            )}
          </div>
        )}
      </div>

      {importing && <ImportWizard projectId={project.id} onDone={() => setImporting(false)} />}

      {drawing && (
        <div className="flex items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex-1 space-y-1.5">
            <p className="text-xs text-neutral-500">
              Click the map to add vertices ({draftRing.length} so far — need at least 3), then name
              and save.
            </p>
            <Input
              placeholder="Territory name"
              value={territoryName}
              onChange={(e) => setTerritoryName(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            onClick={finishTerritory}
            disabled={draftRing.length < 3 || territoryName.trim().length < 2 || createTerritory.isPending}
          >
            Save territory
          </Button>
        </div>
      )}

      {lastAssignment && <p className="text-sm text-emerald-600">{lastAssignment}</p>}
      {geocode.data && (
        <p className="text-sm text-emerald-600">
          Geocoded {geocode.data.resolved} of {geocode.data.attempted} addresses via the US Census
          geocoder{geocode.data.failed > 0 ? ` (${geocode.data.failed} unmatched)` : ''}.
        </p>
      )}
      {createTerritory.isError && (
        <p className="text-sm text-red-600">{(createTerritory.error as Error).message}</p>
      )}

      <div ref={containerRef} className="h-96 w-full overflow-hidden rounded-lg border border-neutral-200" />

      {(territories?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Territory</th>
                <th className="px-4 py-2">Voters</th>
                <th className="px-4 py-2">Area</th>
                <th className="px-4 py-2">Assigned canvasser</th>
              </tr>
            </thead>
            <tbody>
              {territories!.map((t) => {
                const count = (voters ?? []).filter((v) => v.territory_id === t.id).length;
                return (
                  <tr key={t.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2 font-medium text-neutral-900">{t.name}</td>
                    <td className="px-4 py-2 text-neutral-500">{count}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {t.area_sq_meters ? `${(Number(t.area_sq_meters) / 1e6).toFixed(2)} km²` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {canManage.data ? (
                        <select
                          className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
                          value={t.assigned_to ?? ''}
                          onChange={(e) =>
                            assignTerritory.mutate({
                              territoryId: t.id,
                              projectId: project.id,
                              profileId: e.target.value || null
                            })
                          }
                        >
                          <option value="">Unassigned</option>
                          {members?.map((m) => (
                            <option key={m.profile_id} value={m.profile_id}>
                              {m.profiles?.full_name || m.profiles?.email}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-neutral-500">
                          {t.profiles?.full_name || t.profiles?.email || 'Unassigned'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
