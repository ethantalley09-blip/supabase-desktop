import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { area, booleanPointInPolygon, convex, featureCollection, point, polygon } from '@turf/turf';
import { supabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/types';
import { useAuth } from '@/providers/AuthProvider';

export type Territory = {
  id: string;
  project_id: string;
  name: string;
  assigned_to: string | null;
  geometry: GeoJSON.Polygon;
  area_sq_meters: number | null;
  profiles: { email: string; full_name: string | null } | null;
};

export type ContactStatus = 'active' | 'moved' | 'bad_address' | 'deceased' | 'do_not_contact';
export type BallotStatus = 'none' | 'requested' | 'returned';

// Statuses that mean "don't send a canvasser here" — excluded from routes and
// walk lists so volunteers never knock dead doors.
export const KNOCKABLE_STATUS: ContactStatus = 'active';
export function isKnockable(v: VoterRecord): boolean {
  return v.contact_status === KNOCKABLE_STATUS;
}

export type VoterRecord = {
  id: string;
  project_id: string;
  data: Record<string, unknown>;
  full_name: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  territory_id: string | null;
  contact_status: ContactStatus;
  ballot_status: BallotStatus;
  ballot_updated_at: string | null;
  canvass_notes: string | null;
};

// City/ward extraction and walk-order optimization live in ./route (no
// Supabase dependency, so they stay unit-testable); re-exported here so the
// turf feature has a single import surface.
export {
  applySegment,
  buildTurfSnapshot,
  dominantVoterLanguage,
  optimizeWalkOrder,
  splitIntoWalkLists,
  TRANSLATION_LANGUAGES,
  voterCity,
  voterLanguage,
  voterWard,
  type SegmentFilter,
  type TurfSnapshot,
  type WalkRoute
} from './route';

export function useTerritories(projectId: string | undefined) {
  return useQuery({
    queryKey: ['territories', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('territories')
        .select('*, profiles!territories_assigned_to_fkey(email, full_name)')
        .eq('project_id', projectId!)
        .order('created_at');
      if (error) throw error;
      return data as unknown as Territory[];
    },
    enabled: Boolean(projectId)
  });
}

export function useVoterRecords(projectId: string | undefined) {
  return useQuery({
    queryKey: ['voter-records', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voter_records')
        .select(
          'id, project_id, data, full_name, address_line, lat, lng, territory_id, contact_status, ballot_status, ballot_updated_at, canvass_notes'
        )
        .eq('project_id', projectId!)
        .limit(5000);
      if (error) throw error;
      return data as VoterRecord[];
    },
    enabled: Boolean(projectId)
  });
}

export function useCreateTerritory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      name: string;
      // Ring of [lng, lat] positions, not yet closed.
      ring: [number, number][];
      voters: VoterRecord[];
    }) => {
      const closedRing = [...input.ring, input.ring[0]];
      const geom = polygon([closedRing]);

      const { data: territory, error } = await supabase
        .from('territories')
        .insert({
          project_id: input.projectId,
          name: input.name,
          geometry: geom.geometry as unknown as Json,
          area_sq_meters: Math.round(area(geom)),
          created_by: user!.id
        })
        .select()
        .single();
      if (error) throw error;

      // Assign every mapped voter that falls inside the new polygon.
      const insideIds = input.voters
        .filter((v) => v.lat !== null && v.lng !== null)
        .filter((v) => booleanPointInPolygon(point([v.lng!, v.lat!]), geom))
        .map((v) => v.id);

      if (insideIds.length > 0) {
        const { error: assignError } = await supabase
          .from('voter_records')
          .update({ territory_id: territory.id })
          .in('id', insideIds);
        if (assignError) throw assignError;
      }

      return { territory, assignedCount: insideIds.length };
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['territories', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
    }
  });
}

// Build a polygon that encloses a set of points. A convex hull is the natural
// walk-list boundary; fall back to a small padded box when there are too few
// (or collinear) points for a hull to exist.
function hullPolygon(coords: [number, number][]) {
  const hull = convex(featureCollection(coords.map((c) => point(c))));
  if (hull) return hull;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const pad = 0.0015; // ~150m, so single/paired points still form a visible cell
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  return polygon([
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat]
    ]
  ]);
}

// Turn a city/ward selection into a canvassable territory: enclose its mapped
// voters in a hull and assign them directly by id (we already know the set, so
// no point-in-polygon pass is needed). By default the walk list is
// authoritative and reassigns voters already in another territory; pass
// skipAssigned to leave those in their current territory instead.
export function useCreateTerritoryFromVoters() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      name: string;
      voters: VoterRecord[];
      skipAssigned?: boolean;
    }) => {
      // Exclude un-geocoded doors and non-knockable ones (moved/bad address/
      // deceased/do-not-contact) so walk lists never send canvassers to dead
      // doors.
      const mappable = input.voters.filter((v) => v.lat !== null && v.lng !== null && isKnockable(v));
      if (mappable.length === 0) {
        throw new Error('No knockable, mapped voters in this selection — geocode or check statuses.');
      }
      const targets = input.skipAssigned ? mappable.filter((v) => !v.territory_id) : mappable;
      if (targets.length === 0) {
        throw new Error('Every mapped voter in this selection is already in a territory.');
      }
      const geom = hullPolygon(targets.map((v) => [v.lng!, v.lat!]));

      const { data: territory, error } = await supabase
        .from('territories')
        .insert({
          project_id: input.projectId,
          name: input.name,
          geometry: geom.geometry as unknown as Json,
          area_sq_meters: Math.round(area(geom)),
          created_by: user!.id
        })
        .select()
        .single();
      if (error) throw error;

      const ids = targets.map((v) => v.id);
      const { error: assignError } = await supabase
        .from('voter_records')
        .update({ territory_id: territory.id })
        .in('id', ids);
      if (assignError) throw assignError;

      return { territory, assignedCount: ids.length, skippedCount: mappable.length - targets.length };
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['territories', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
    }
  });
}

export function useAssignTerritory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { territoryId: string; projectId: string; profileId: string | null }) => {
      const { error } = await supabase
        .from('territories')
        .update({ assigned_to: input.profileId })
        .eq('id', input.territoryId);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['territories', vars.projectId] });
    }
  });
}

// Update a voter's contact and/or ballot status. Enforced by the turf.manage
// UPDATE policy on voter_records (RLS is the enforcement layer). Stamps
// ballot_updated_at whenever the ballot status moves so the chase board can
// show recency.
export function useUpdateVoterStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      voterId: string;
      projectId: string;
      contact_status?: ContactStatus;
      ballot_status?: BallotStatus;
    }) => {
      const patch: {
        contact_status?: ContactStatus;
        ballot_status?: BallotStatus;
        ballot_updated_at?: string;
      } = {};
      if (input.contact_status) patch.contact_status = input.contact_status;
      if (input.ballot_status) {
        patch.ballot_status = input.ballot_status;
        patch.ballot_updated_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('voter_records')
        .update(patch)
        .eq('id', input.voterId);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
    }
  });
}

// Save a canvasser's free-text note from a door contact. Debounced by the
// caller (BallotChase saves on blur, not on every keystroke) since this hits
// the network on every call.
export function useUpdateVoterNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { voterId: string; projectId: string; notes: string }) => {
      const { error } = await supabase
        .from('voter_records')
        .update({ canvass_notes: input.notes || null })
        .eq('id', input.voterId);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
    }
  });
}
