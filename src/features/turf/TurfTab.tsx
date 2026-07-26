import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImportWizard } from '@/features/voter-import/ImportWizard';
import type { Project } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { supabase } from '@/lib/supabase/client';
import { findVotersInRing } from './areaSelect';
import { BallotChase } from './BallotChase';
import { DoorstepDonations } from './DoorstepDonations';
import { GeocodeAdvanced } from './GeocodeAdvanced';
import { GotvSprintPlan } from './GotvSprintPlan';
import { groupIntoHouseholds, type Household } from './households';
import { TurfBriefing } from './TurfBriefing';
import { TurfInsights } from './TurfInsights';
import {
  buildBriefingSnapshot,
  classifyPersuadability,
  heatmapWeight,
  PARTY_COLORS,
  PARTY_LABELS,
  PERSUADABILITY_COLORS,
  PERSUADABILITY_LABELS,
  voterParty,
  type HeatmapMode
} from './turfBriefingMath';
import { DEFAULT_TURF_PREFERENCES, type TurfPreferences } from './turfPreferences';
import { VolunteerPipeline } from './VolunteerPipeline';
import {
  isKnockable,
  optimizeWalkOrder,
  splitIntoWalkLists,
  useAssignTerritory,
  useCreateTerritory,
  useCreateTerritoryFromVoters,
  useTerritories,
  useTurfPreferences,
  useVoterRecords,
  voterCity,
  voterWard,
  type VoterRecord,
  type WalkRoute
} from './useTurf';

// OpenFreeMap: free OSM-derived vector tiles, no API key, production-safe
// (chosen over osm.org raster tiles, whose usage policy disallows app
// traffic at scale). Every Turf Briefing layer — the heatmap (voters-heat),
// party/persuadability/assignment pin colors (voters-layer), and Household
// Rollup badges (household-count) — reads from the same 'voters' GeoJSON
// source on this one OpenStreetMap-based map instance, so all of it is
// already OSM-native; there is no separate non-OSM basemap anywhere in Turf.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const TERRITORY_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

// One color per pin, driven by the active color MODE — modes are always
// single-select (never blended) so the map never turns into the cluttered,
// legend-less mess field staff complain about with static VAN exports.
function colorForVoter(v: VoterRecord, mode: 'assignment' | 'party' | 'persuadability'): string {
  if (mode === 'party') return PARTY_COLORS[voterParty(v) ?? 'unknown'];
  if (mode === 'persuadability') return PERSUADABILITY_COLORS[classifyPersuadability(v).bucket];
  return v.territory_id ? '#16a34a' : '#737373';
}

// Household Rollup color: when every member of a household would render the
// same color individually, the household pin gets that color; otherwise a
// dedicated "mixed" slate — an explicit, explainable simplification rather
// than a hidden average or a majority vote a captain can't see the logic of.
const MIXED_HOUSEHOLD_COLOR = '#64748b';
function colorForHousehold(h: Household, mode: 'assignment' | 'party' | 'persuadability'): string {
  const colors = new Set(h.members.map((v) => colorForVoter(v, mode)));
  return colors.size === 1 ? [...colors][0] : MIXED_HOUSEHOLD_COLOR;
}

// The pin-color modes double as a highlight FILTER: when a party or
// persuadability value is selected in the Customize panel, non-matching
// pins dim (circle-opacity) instead of disappearing — a filter you can
// still see the surrounding context through, not a destructive hide.
function matchesHighlight(v: VoterRecord, filter: TurfPreferences['highlightFilter']): boolean {
  if (filter.mode === 'none' || !filter.value) return true;
  if (filter.mode === 'party') return (voterParty(v) ?? 'unknown') === filter.value;
  return classifyPersuadability(v).bucket === filter.value;
}

function opacityForHousehold(h: Household, filter: TurfPreferences['highlightFilter']): number {
  if (filter.mode === 'none' || !filter.value) return 1;
  return h.members.every((v) => matchesHighlight(v, filter)) ? 1 : 0.15;
}

// Household heatmap weight: 'density' reflects household SIZE (more
// registered voters at one door is more reason to prioritize it, normalized
// against a 5-person household as "full heat"); every other mode takes the
// MAX across members — a household is worth the knock if any one member
// scores high, not just on average.
function weightForHousehold(h: Household, mode: HeatmapMode): number {
  if (mode === 'density') return Math.min(1, h.memberCount / 5);
  return Math.max(...h.members.map((v) => heatmapWeight(v, mode)));
}

export function TurfTab({ project }: { project: Project }) {
  const canManage = useHasPermission(project.org_id, 'turf.manage');
  const canUseAi = useHasPermission(project.org_id, 'ai.use');
  const { data: territories } = useTerritories(project.id);
  const { data: voters } = useVoterRecords(project.id);
  // Shared query key with TurfBriefing.tsx's own useTurfPreferences call —
  // React Query dedupes the fetch, so both read the same cached settings
  // without prop-drilling a settings object down.
  const { data: preferences } = useTurfPreferences(project.id);
  const prefs = preferences ?? DEFAULT_TURF_PREFERENCES;
  const createTerritory = useCreateTerritory();
  const createFromSelection = useCreateTerritoryFromVoters();
  const assignTerritory = useAssignTerritory();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [importing, setImporting] = useState(false);
  // 'territory' draws a permanent, saved Territory (existing flow); 'ask'
  // draws a throwaway shape for one Draw-an-Area AI Briefing question —
  // same click-to-add-vertex mechanics, different finish action.
  const [drawMode, setDrawMode] = useState<'off' | 'territory' | 'ask'>('off');
  const drawModeRef = useRef<'off' | 'territory' | 'ask'>('off');
  const [draftRing, setDraftRing] = useState<[number, number][]>([]);
  const draftRingRef = useRef<[number, number][]>([]);
  const [territoryName, setTerritoryName] = useState('');
  const [lastAssignment, setLastAssignment] = useState<string | null>(null);
  const areaAi = useAiAssist();
  const [areaBriefing, setAreaBriefing] = useState<{ headline: string; focus_areas: { area: string; why: string; action: string }[] } | null>(
    null
  );
  const [areaVoterCount, setAreaVoterCount] = useState<number | null>(null);
  // Click-to-Ask Door Popup: clicking any pin sets this, which TurfBriefing
  // prefers over its own auto-picked top-priority door for Door Prep.
  const [mapSelectedVoterId, setMapSelectedVoterId] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState('');
  const [wardFilter, setWardFilter] = useState('');
  const [skipAssigned, setSkipAssigned] = useState(false);
  const [route, setRoute] = useState<(WalkRoute & { territoryId: string; name: string }) | null>(null);
  const [view, setView] = useState<'map' | 'chase'>('map');
  const [splitInfo, setSplitInfo] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<'assignment' | 'party' | 'persuadability'>('assignment');
  const [heatmapMode, setHeatmapMode] = useState<'off' | HeatmapMode>('off');
  const [groupBy, setGroupBy] = useState<'individual' | 'household'>('individual');

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

      // Heatmap layer added BEFORE the pin layer so it renders underneath —
      // a live density/persuadability/fundraising/staleness read on the
      // shift that a static VAN walk-list export has no equivalent for.
      // Off by default; visibility toggles with heatmapMode, weight comes
      // from each point's precomputed `weight` property.
      map.addLayer({
        id: 'voters-heat',
        type: 'heatmap',
        source: 'voters',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 1,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, '#fef08a',
            0.4, '#fde047',
            0.6, '#fb923c',
            0.8, '#ea580c',
            1, '#b91c1c'
          ],
          'heatmap-radius': 24,
          'heatmap-opacity': 0.75
        }
      });

      map.addLayer({
        id: 'voters-layer',
        type: 'circle',
        source: 'voters',
        paint: {
          'circle-radius': 5,
          'circle-color': ['get', 'color'],
          // Drives the highlight filter (Customize panel -> highlightFilter):
          // 1 for a matching/unfiltered pin, dimmed for a non-matching one —
          // a filter you can still see the surrounding context through.
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Household Rollup member-count badge — off by default, shown only in
      // "Household" grouping mode. Every pushed point carries a
      // `memberCount` property regardless of mode (1 in individual mode),
      // so this layer never needs its own conditional data.
      map.addLayer({
        id: 'household-count',
        type: 'symbol',
        source: 'voters',
        layout: {
          'text-field': ['to-string', ['get', 'memberCount']],
          'text-size': 10,
          'text-font': ['Noto Sans Regular'],
          visibility: 'none'
        },
        paint: { 'text-color': '#ffffff' }
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
      if (drawModeRef.current === 'off') return;
      const next: [number, number][] = [...draftRingRef.current, [e.lngLat.lng, e.lngLat.lat]];
      draftRingRef.current = next;
      setDraftRing(next);
    });

    // Click-to-Ask Door Popup: clicking any pin (outside drawing mode)
    // selects that real voter for Turf Briefing's Door Prep card, instead
    // of only ever being able to inspect the algorithm's auto-picked top
    // priority door.
    map.on('click', 'voters-layer', (e) => {
      if (drawModeRef.current !== 'off') return;
      const feature = e.features?.[0];
      const voterId = feature?.properties?.voterId as string | undefined;
      if (!voterId) return;
      setMapSelectedVoterId(voterId);
    });
    map.on('mouseenter', 'voters-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'voters-layer', () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push voters into the map whenever they (or the city/ward filter, color
  // mode, heatmap mode, grouping, or Customize panel settings) change.
  // `color`/`weight`/`opacity` are precomputed per point here rather than as
  // map-expression logic so colorForVoter/heatmapWeight/matchesHighlight and
  // their household equivalents (the same pure functions covered by
  // turfBriefingMath.test.ts/households.test.ts) stay the single source of
  // truth for both the legend and the pins. In Household mode, one point
  // renders per unique address with at least prefs.household.minSize
  // members (memberCount > 1 shows the count badge) instead of one per
  // voter — so a 3-voter household reads as one door, not three overlapping
  // pins, and a minSize filter can hide single-voter addresses entirely.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('voters') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const mapped = filteredVoters.filter((v) => v.lat !== null && v.lng !== null);

    // A raw heatmap weight below the Customize panel's noise floor
    // (prefs.heatmap.minWeightToShow) contributes nothing — the point just
    // doesn't show up hot, it isn't removed from the pin layer.
    const clampWeight = (raw: number) => (raw < prefs.heatmap.minWeightToShow ? 0 : raw);

    const features: GeoJSON.Feature[] =
      groupBy === 'household'
        ? groupIntoHouseholds(mapped)
            .filter((h) => h.memberCount >= prefs.household.minSize)
            .map((h) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
              properties: {
                color: colorForHousehold(h, colorMode),
                weight: heatmapMode === 'off' ? 0 : clampWeight(weightForHousehold(h, heatmapMode)),
                opacity: opacityForHousehold(h, prefs.highlightFilter),
                memberCount: h.memberCount,
                // Click-to-Ask Door Popup: a household pin selects its first
                // real member as the representative door for Door Prep.
                voterId: h.members[0]?.id,
                name: h.memberCount > 1 ? `${h.members[0]?.full_name || 'Voter'} +${h.memberCount - 1} more` : h.members[0]?.full_name,
                address: h.address
              }
            }))
        : mapped.map((v) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [v.lng!, v.lat!] },
            properties: {
              color: colorForVoter(v, colorMode),
              weight: heatmapMode === 'off' ? 0 : clampWeight(heatmapWeight(v, heatmapMode)),
              opacity: matchesHighlight(v, prefs.highlightFilter) ? 1 : 0.15,
              memberCount: 1,
              voterId: v.id,
              name: v.full_name,
              address: v.address_line
            }
          }));
    source.setData({ type: 'FeatureCollection', features });

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
  }, [filteredVoters, mapReady, colorMode, heatmapMode, groupBy, prefs]);

  // Heatmap layer visibility follows heatmapMode independently of the data
  // push above (no need to refetch/refit the map just to toggle it).
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setLayoutProperty('voters-heat', 'visibility', heatmapMode === 'off' ? 'none' : 'visible');
  }, [heatmapMode, mapReady]);

  // Household count badges only make sense in Household grouping mode.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setLayoutProperty('household-count', 'visibility', groupBy === 'household' ? 'visible' : 'none');
  }, [groupBy, mapReady]);

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

  const startDrawingTerritory = () => {
    setDrawMode('territory');
    drawModeRef.current = 'territory';
    draftRingRef.current = [];
    setDraftRing([]);
    setLastAssignment(null);
  };

  const startAskingArea = () => {
    setDrawMode('ask');
    drawModeRef.current = 'ask';
    draftRingRef.current = [];
    setDraftRing([]);
    setAreaBriefing(null);
    setAreaVoterCount(null);
  };

  const cancelDrawing = () => {
    setDrawMode('off');
    drawModeRef.current = 'off';
    draftRingRef.current = [];
    setDraftRing([]);
    setTerritoryName('');
  };

  const getAreaBriefing = () => {
    if (draftRing.length < 3) return;
    const votersInArea = findVotersInRing(voters ?? [], draftRing);
    setAreaVoterCount(votersInArea.length);
    setAreaBriefing(null);
    if (votersInArea.length === 0) return;
    const snapshot = buildBriefingSnapshot(votersInArea, territories ?? []);
    areaAi.mutate(
      { orgId: project.org_id, projectId: project.id, purpose: 'map_area_briefing', context: JSON.stringify(snapshot) },
      { onSuccess: (res) => setAreaBriefing(extractJson(res.text)) }
    );
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {voters?.length ?? 0} voter records ({mappedCount} mappable) ·{' '}
          {territories?.length ?? 0} territories
        </p>
        {canManage.data && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImporting(!importing)}>
              {importing ? 'Close import' : 'Import voters'}
            </Button>
            {drawMode === 'off' ? (
              <>
                <Button size="sm" onClick={startDrawingTerritory}>
                  Draw territory
                </Button>
                <Button variant="outline" size="sm" onClick={startAskingArea}>
                  Ask about area
                </Button>
              </>
            ) : (
              <Button variant="destructive" size="sm" onClick={cancelDrawing}>
                Cancel drawing
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Turf Briefing: the real-time tactical read on today's shift — live
          stats, an AI-narrated briefing, and a one-click rebalance over
          whatever doors are still remaining. Sits first because it's meant
          to be the thing a captain checks before anything else. */}
      <div id="tool-turf_briefing">
        <TurfBriefing
          orgId={project.org_id}
          projectId={project.id}
          // The existing city/ward filter now reaches every Turf Briefing
          // feature, not just the map — previously this passed the
          // unfiltered `voters` list.
          voters={filteredVoters}
          territories={territories ?? []}
          canUseAi={Boolean(canUseAi.data)}
          onRebalance={(r) => setRoute({ ...r, territoryId: 'live-rebalance', name: "Today's remaining doors" })}
          heatmapMode={heatmapMode}
          mapSelectedVoterId={mapSelectedVoterId}
          onClearMapSelection={() => setMapSelectedVoterId(null)}
        />
      </div>

      {/* Doorstep fundraising: warm doors from real canvass notes + the
          20-second ask + canvasser leaderboard */}
      <div id="tool-doorstep_donations">
        <DoorstepDonations
          orgId={project.org_id}
          projectId={project.id}
          voters={voters ?? []}
          canUseAi={Boolean(canUseAi.data)}
        />
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

      {canUseAi.data && (
        <div id="tool-volunteer_pipeline">
          <VolunteerPipeline orgId={project.org_id} projectId={project.id} />
        </div>
      )}
      {canUseAi.data && (
        <div id="tool-gotv_sprint_plan">
          <GotvSprintPlan orgId={project.org_id} projectId={project.id} voters={voters ?? []} />
        </div>
      )}

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

      {view === 'map' && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs font-medium text-neutral-500">Pin color:</span>
              {(
                [
                  ['assignment', 'Assignment'],
                  ['party', 'Party'],
                  ['persuadability', 'Persuadability']
                ] as const
              ).map(([mode, label]) => (
                <ModeButton key={mode} active={colorMode === mode} onClick={() => setColorMode(mode)}>
                  {label}
                </ModeButton>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs font-medium text-neutral-500">Heatmap:</span>
              {(
                [
                  ['off', 'Off'],
                  ['density', 'Density'],
                  ['persuadability', 'Persuadable'],
                  ['fundraising', 'Fundraising signal'],
                  ['staleness', 'Staleness']
                ] as const
              ).map(([mode, label]) => (
                <ModeButton key={mode} active={heatmapMode === mode} onClick={() => setHeatmapMode(mode)}>
                  {label}
                </ModeButton>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs font-medium text-neutral-500">Grouping:</span>
              {(
                [
                  ['individual', 'Individual'],
                  ['household', 'Household']
                ] as const
              ).map(([mode, label]) => (
                <ModeButton key={mode} active={groupBy === mode} onClick={() => setGroupBy(mode)}>
                  {label}
                </ModeButton>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
            {colorMode === 'assignment' && (
              <>
                <LegendChip color="#16a34a" label="In a territory" />
                <LegendChip color="#737373" label="Unassigned" />
              </>
            )}
            {colorMode === 'party' &&
              (Object.keys(PARTY_LABELS) as (keyof typeof PARTY_LABELS)[]).map((k) => (
                <LegendChip key={k} color={PARTY_COLORS[k]} label={PARTY_LABELS[k]} />
              ))}
            {colorMode === 'persuadability' &&
              (Object.keys(PERSUADABILITY_LABELS) as (keyof typeof PERSUADABILITY_LABELS)[]).map((k) => (
                <LegendChip key={k} color={PERSUADABILITY_COLORS[k]} label={PERSUADABILITY_LABELS[k]} />
              ))}
            {groupBy === 'household' && <LegendChip color={MIXED_HOUSEHOLD_COLOR} label="Mixed household" />}
          </div>
          {groupBy === 'household' && (
            <p className="text-xs text-neutral-400">
              One pin per physical address — the number shown is how many registered voters live there.
            </p>
          )}
        </div>
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
      {drawMode === 'territory' && (
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

      {drawMode === 'ask' && (
        <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-end gap-3">
            <p className="flex-1 text-xs text-neutral-600">
              Click the map to outline any shape ({draftRing.length} so far — need at least 3) — nothing
              is saved, this is just for one question about what's really inside it.
            </p>
            <Button size="sm" onClick={getAreaBriefing} disabled={draftRing.length < 3 || areaAi.isPending}>
              {areaAi.isPending ? '…' : 'Get area briefing'}
            </Button>
          </div>
          {areaAi.isError && <p className="text-sm text-red-600">{(areaAi.error as Error).message}</p>}
          {areaVoterCount === 0 && (
            <p className="text-xs text-neutral-500">No mapped voters fall inside that shape.</p>
          )}
          {areaBriefing && (
            <div className="space-y-1.5 rounded bg-white p-3 text-xs text-neutral-700">
              <p className="font-medium text-neutral-900">{areaBriefing.headline}</p>
              {areaBriefing.focus_areas.map((f, i) => (
                <div key={i}>
                  <p className="font-semibold text-neutral-800">{f.area}</p>
                  <p className="text-neutral-600">{f.why}</p>
                  <p className="text-sky-700">→ {f.action}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lastAssignment && <p className="text-sm text-emerald-600">{lastAssignment}</p>}
      {canManage.data && <div id="tool-geocode_coach"><GeocodeAdvanced projectId={project.id} orgId={project.org_id} voters={voters ?? []} canUseAi={Boolean(canUseAi.data)} /></div>}
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

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs ${
        active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
