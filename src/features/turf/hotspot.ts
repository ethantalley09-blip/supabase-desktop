// Pure logic for the Live Hotspot Caller: turns the existing heatmap
// (turfBriefingMath.ts's heatmapWeight — density/persuadability/fundraising/
// staleness) from just a color overlay into words, by grid-binning real
// mapped voters and naming the real streets in the single densest bin for
// whichever mode is currently active. Reuses heatmapWeight directly rather
// than reimplementing any weighting logic, so the words always agree with
// what's actually drawn on the map. No Supabase import (pattern:
// turfBriefingMath.ts) — see hotspot.test.ts.
import { heatmapWeight, type HeatmapMode } from './turfBriefingMath';
import type { VoterRecord } from './useTurf';

export type Hotspot = {
  cellLat: number;
  cellLng: number;
  totalWeight: number;
  voterCount: number;
  // A few real, deduped addresses inside the hottest cell — grounds the AI
  // commentary in real streets instead of a bare coordinate.
  sampleAddresses: string[];
};

// ~300m per cell at mid-latitudes — small enough to read as a real pocket
// of a neighborhood, not an entire territory.
const CELL_SIZE_DEG = 0.003;

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_SIZE_DEG)}:${Math.floor(lng / CELL_SIZE_DEG)}`;
}

export function findHotspot(voters: VoterRecord[], mode: HeatmapMode, nowMs: number = Date.now()): Hotspot | null {
  const mapped = voters.filter((v) => v.lat !== null && v.lng !== null);
  if (mapped.length === 0) return null;

  const cells = new Map<string, { totalWeight: number; lats: number[]; lngs: number[]; addresses: string[] }>();
  for (const v of mapped) {
    const weight = heatmapWeight(v, mode, nowMs);
    if (weight <= 0) continue;
    const key = cellKey(v.lat!, v.lng!);
    const cell = cells.get(key) ?? { totalWeight: 0, lats: [], lngs: [], addresses: [] };
    cell.totalWeight += weight;
    cell.lats.push(v.lat!);
    cell.lngs.push(v.lng!);
    if (v.address_line && !cell.addresses.includes(v.address_line)) cell.addresses.push(v.address_line);
    cells.set(key, cell);
  }

  let best: { totalWeight: number; lats: number[]; lngs: number[]; addresses: string[] } | null = null;
  for (const cell of cells.values()) {
    if (!best || cell.totalWeight > best.totalWeight) best = cell;
  }
  if (!best || best.totalWeight <= 0) return null;

  return {
    cellLat: best.lats.reduce((sum, x) => sum + x, 0) / best.lats.length,
    cellLng: best.lngs.reduce((sum, x) => sum + x, 0) / best.lngs.length,
    totalWeight: Math.round(best.totalWeight * 10) / 10,
    voterCount: best.lats.length,
    sampleAddresses: best.addresses.slice(0, 3)
  };
}
