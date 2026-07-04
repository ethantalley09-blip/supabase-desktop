import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { area, booleanPointInPolygon, point, polygon } from '@turf/turf';
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

export type VoterRecord = {
  id: string;
  project_id: string;
  data: Record<string, unknown>;
  full_name: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  territory_id: string | null;
};

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
        .select('id, project_id, data, full_name, address_line, lat, lng, territory_id')
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
