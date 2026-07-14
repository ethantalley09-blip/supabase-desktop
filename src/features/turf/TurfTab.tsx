import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImportWizard } from '@/features/voter-import/ImportWizard';
import type { Project } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { supabase } from '@/lib/supabase/client';
import { useGeocodeUnmapped } from './geocode';
import { BallotChase } from './BallotChase';
import { TurfInsights } from './TurfInsights';
import {
  isKnockable,
  optimizeWalkOrder,
  splitIntoWalkLists,
  useAssignTerritory,
  useCreateTerritory,
  useCreateTerritoryFromVoters,
  useTerritories,
  useVoterRecords,
  voterCity,
  voterWard,
  type WalkRoute
} from './useTurf';

// OpenFreeMap: free OSM-derived vector tiles, no API key, production-safe
// (chosen over osm.org raster tiles, whose usage policy disallows app
// traffic at scale).
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const TERRITORY_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

export function TurfTab({ project }: { project: Project }) {
  const canManage = useHasPermission(project.org_id, 'turf.manage');
  const canUseAi = useHasPermission(project.org_id, 'ai.use');
  const { data: territories } = useTerritories(project.id);
  const { data: voters } = useVoterRecords(project.id);
  const createTerritory = useCreateTerritory();
  const createFromSelection = useCreateTerritoryFromVoters();
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
  const [cityFilter, setCityFilter] = useState('');
  const [wardFilter, setWardFilter] = useState('');
  const [skipAssigned, setSkipAssigned] = useState(false);
  const [route, setRoute] = useState<(WalkRoute & { territoryId: string; name: string }) | null>(null);
  const [view, setView] = useState<'map' | 'chase'>('map');
  const [splitInfo, setSplitInfo] = useState<string | null>(null);

  // A territory's knockable, mapped doors — the set both routing and splitting
  // operate on (dead doors are already excluded here).
  const territoryDoors = (territoryId: string) =>
    (voters ?? []).filter(
      (v) => v.territory_id === territoryId && v.lat !== null && v.lng !== null && isKnockable(v)
    );

  const optimizeRoute = (territoryId: string, name: string) => {
    const doors = territoryDoors(territoryId);
    if (doors.length === 0) return;
    setRoute({ territoryId, name, ...optimizeWalkOrder(doors) });
  };

  // Cut a territory into k balanced, optimized walk lists, each saved as its
  // own territory. The source territory is left in place but emptied of the
  // split doors (which move into the new lists).
  const splitTerritory = async (territoryId: string, name: string, k: number) => {
    const doors = territoryDoors(territoryId);
    if (doors.length < 2) return;
    const lists = splitIntoWalkLists(doors, k);
    setSplitInfo(null);
    setRoute(null);
    for (let i = 0; i < lists.length; i++) {
      await createFromSelection.mutateAsync({
        projectId: project.id,
        name: `${name} — List ${i + 1}`,
        voters: lists[i].ordered
      });
    }
    const sizes = lists.map((l) => l.ordered.length).join(' / ');
    setSplitInfo(`"${name}" split into ${lists.length} walk lists (${sizes} doors).`);
  };

  // Distinct cities present in the loaded voter file (blank when the file has
  // no city column).
  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const v of voters ?? []) {
      const c = voterCity(v);
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [voters]);

  // Wards narrow to the selected city so a canvasser picks a ward within a
  // town, not a ward number colliding across towns.
  const wards = useMemo(() => {
    const set = new Set<string>();
    for (const v of voters ?? []) {
      if (cityFilter && voterCity(v) !== cityFilter) continue;
      const w = voterWard(v);
      if (w) set.add(w);
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [voters, cityFilter]);

  const filteredVoters = useMemo(() => {
    return (voters ?? []).filter((v) => {
      if (cityFilter && voterCity(v) !== cityFilter) return false;
      if (wardFilter && voterWard(v) !== wardFilter) return false;
      return true;
    });
  }, [voters, cityFilter, wardFilter]);

  const hasGeography = cities.length > 0 || wards.length > 0;
  const hasSelection = Boolean(cityFilter || wardFilter);
  const mappableInSelection = filteredVoters.filter((v) => v.lat !== null && v.lng !== null);
  // Walk lists only include knockable doors; what the toggle would actually
  // assign is those (optionally minus voters already in a territory).
  const knockableInSelection = mappableInSelection.filter(isKnockable);
  const filteredAssignable = skipAssigned
    ? knockableInSelection.filter((v) => !v.territory_id).length
    : knockableInSelection.length;

  const selectionName = () =>
    [cityFilter, wardFilter && `Ward ${wardFilter}`].filter(Boolean).join(' — ') || 'Selection';

  const knockSelection = async () => {
    const result = await createFromSelection.mutateAsync({
      projectId: project.id,
      name: selectionName(),
      voters: filteredVoters,
      skipAssigned
    });
    const skipNote =
      result.skippedCount > 0 ? ` (${result.skippedCount} already-assigned skipped)` : '';
    setLastAssignment(
      `"${result.territory.name}" walk list saved — ${result.assignedCount} voter${
        result.assignedCount === 1 ? '' : 's'
      } assigned${skipNote}.`
    );
  };

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

      map.addSource('route', { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#db2777', 'line-width': 3 }
      });
      map.addLayer({
        id: 'route-stops',
        type: 'circle',
        source: 'route',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 10, 'circle-color': '#db2777', 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' }
      });
      map.addLayer({
        id: 'route-labels',
        type: 'symbol',
        source: 'route',
        filter: ['==', '$type', 'Point'],
        layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#ffffff' }
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

  // Push voters into the map whenever they (or the city/ward filter) change.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('voters') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const mapped = filteredVoters.filter((v) => v.lat !== null && v.lng !== null);
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
  }, [filteredVoters, mapReady]);

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

  // The map lives in a display:none container while the chase view is open,
  // which zeroes its size; resize once it's visible again so tiles fill it.
  useEffect(() => {
    if (view === 'map' && mapReady && mapRef.current) {
      mapRef.current.resize();
    }
  }, [view, mapReady]);

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

  // Render the optimized walk route: a line through the doors in order, plus a
  // numbered stop at each one.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    if (!route) {
      source.setData(emptyFC());
      return;
    }
    const coords = route.ordered.map((v) => [v.lng!, v.lat!] as [number, number]);
    const features: GeoJSON.Feature[] = [];
    if (coords.length >= 2) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
    }
    route.ordered.forEach((v, i) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.lng!, v.lat!] },
        properties: { label: String(i + 1) }
      });
    });
    source.setData({ type: 'FeatureCollection', features });

    if (coords.length > 0) {
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      mapRef.current.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)]
        ],
        { padding: 60, maxZoom: 15, duration: 500 }
      );
    }
  }, [route, mapReady]);

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

      {/* Anchors match TOOL_LOCATIONS: field coach + note digest both live in
          TurfInsights, so both ids point at this block */}
      <div id="tool-field_coach">
        <div id="tool-note_digest">
          <TurfInsights
            orgId={project.org_id}
            projectId={project.id}
            voters={voters ?? []}
            territories={territories ?? []}
            canUseAi={Boolean(canUseAi.data)}
          />
        </div>
      </div>

      <div className="inline-flex gap-1 rounded-lg bg-neutral-100 p-1">
        <button
          type="button"
          onClick={() => setView('map')}
          className={`rounded-md px-3 py-1 text-sm ${view === 'map' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
        >
          Map &amp; walk lists
        </button>
        <button
          type="button"
          onClick={() => setView('chase')}
          className={`rounded-md px-3 py-1 text-sm ${view === 'chase' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}
        >
          Ballot chase &amp; hygiene
        </button>
      </div>

      <div id="tool-import_mapping">
        {importing && (
          <ImportWizard projectId={project.id} orgId={project.org_id} onDone={() => setImporting(false)} />
        )}
      </div>

      {hasGeography && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-neutral-500">City</label>
            <select
              className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
              value={cityFilter}
              onChange={(e) => {
                setCityFilter(e.target.value);
                setWardFilter('');
              }}
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-neutral-500">Ward / precinct</label>
            <select
              className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm disabled:opacity-50"
              value={wardFilter}
              disabled={wards.length === 0}
              onChange={(e) => setWardFilter(e.target.value)}
            >
              <option value="">All wards</option>
              {wards.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <p className="flex-1 text-xs text-neutral-500">
            {filteredVoters.length} voter{filteredVoters.length === 1 ? '' : 's'} in selection (
            {mappableInSelection.length} mapped
            {skipAssigned && hasSelection ? `, ${filteredAssignable} unassigned` : ''})
          </p>
          {canManage.data && (
            <label className="flex items-center gap-1.5 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={skipAssigned}
                onChange={(e) => setSkipAssigned(e.target.checked)}
              />
              Skip voters already in a territory
            </label>
          )}
          {hasSelection && (
            <Button variant="outline" size="sm" onClick={() => { setCityFilter(''); setWardFilter(''); }}>
              Clear
            </Button>
          )}
          {canManage.data && (
            <Button
              size="sm"
              onClick={knockSelection}
              disabled={!hasSelection || filteredAssignable === 0 || createFromSelection.isPending}
            >
              {createFromSelection.isPending ? 'Saving…' : 'Create walk list'}
            </Button>
          )}
        </div>
      )}
      {createFromSelection.isError && (
        <p className="text-sm text-red-600">{(createFromSelection.error as Error).message}</p>
      )}
      {splitInfo && <p className="text-sm text-emerald-600">{splitInfo}</p>}

      {view === 'chase' && (
        <BallotChase
          orgId={project.org_id}
          projectId={project.id}
          voters={voters ?? []}
          visibleVoters={filteredVoters}
          canManage={Boolean(canManage.data)}
          canUseAi={Boolean(canUseAi.data)}
        />
      )}

      {/* Always mounted: maplibre keeps a handle to this node and its init
          effect runs once, so unmounting on view switch would blank the map.
          Hidden (not removed) when the chase view is active. */}
      <div
        ref={containerRef}
        className={
          view === 'map'
            ? 'h-96 w-full overflow-hidden rounded-lg border border-neutral-200'
            : 'hidden'
        }
      />

      {view === 'map' && (
        <>
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

      {route && (
        <div className="overflow-hidden rounded-lg border border-pink-200 bg-white">
          <div className="flex items-center justify-between border-b border-pink-100 bg-pink-50 px-4 py-2">
            <p className="text-sm font-medium text-pink-900">
              Optimized walk order — {route.name}: {route.ordered.length} stop
              {route.ordered.length === 1 ? '' : 's'} ·{' '}
              {(route.meters / 1000).toFixed(2)} km ·{' '}
              ~{Math.max(1, Math.round((route.meters / 1000 / 5) * 60))} min walking
            </p>
            <Button variant="outline" size="sm" onClick={() => setRoute(null)}>
              Clear route
            </Button>
          </div>
          <ol className="max-h-64 divide-y divide-neutral-100 overflow-y-auto text-sm">
            {route.ordered.map((v, i) => (
              <li key={v.id} className="flex gap-3 px-4 py-1.5">
                <span className="w-6 shrink-0 font-medium text-pink-700">{i + 1}.</span>
                <span className="font-medium text-neutral-900">{v.full_name || '—'}</span>
                <span className="text-neutral-500">{v.address_line || ''}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(territories?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Territory</th>
                <th className="px-4 py-2">Voters</th>
                <th className="px-4 py-2">Area</th>
                <th className="px-4 py-2">Assigned canvasser</th>
                <th className="px-4 py-2">Walk order</th>
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
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={count === 0}
                          onClick={() => optimizeRoute(t.id, t.name)}
                        >
                          Optimize
                        </Button>
                        {canManage.data && (
                          <select
                            aria-label={`Split ${t.name} into N walk lists`}
                            className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm disabled:opacity-50"
                            value=""
                            disabled={count < 2 || createFromSelection.isPending}
                            onChange={(e) => {
                              const k = Number(e.target.value);
                              if (k >= 2) void splitTerritory(t.id, t.name, k);
                              e.target.value = '';
                            }}
                          >
                            <option value="">Split…</option>
                            {[2, 3, 4, 5, 6].map((k) => (
                              <option key={k} value={k}>
                                {k} lists
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
