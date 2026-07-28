import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { area, booleanPointInPolygon, convex, featureCollection, point, polygon } from '@turf/turf';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { classifyPersuadability } from './turfBriefingMath';
import { mergePreferences } from './turfPreferences';
// Statuses that mean "don't send a canvasser here" — excluded from routes and
// walk lists so volunteers never knock dead doors.
export const KNOCKABLE_STATUS = 'active';
export function isKnockable(v) {
    return v.contact_status === KNOCKABLE_STATUS;
}
const DEAD_CONTACT_STATUSES = ['moved', 'bad_address', 'deceased', 'do_not_contact'];
// Derives a canvass_visits.outcome from real, already-captured fields —
// never a separately user-chosen value (migration 0030's comment explains
// why: it keeps the Best Time to Knock insight honest about what it's
// actually measuring).
function deriveOutcome(contactStatus, notes) {
    if (DEAD_CONTACT_STATUSES.includes(contactStatus))
        return 'dead_door';
    if (notes?.trim())
        return 'contacted';
    return 'no_answer';
}
// Records one immutable row in canvass_visits (migration 0030) for a real
// door contact — never for a ballot-only update, which can come from
// non-door sources. Best-effort: a visit-log failure shouldn't block the
// status/notes update that already succeeded, so errors are swallowed here
// (the write to voter_records itself, which IS the source of truth for
// current state, already threw on failure before this runs). Returns the new
// row's id (or null on failure) so a caller can attach survey_responses to
// this specific visit (migration 0035) — optional, ignored by every caller
// that doesn't need it.
async function logVisit(input) {
    const { bucket } = classifyPersuadability({
        contact_status: input.contactStatus,
        ballot_status: input.ballotStatus,
        canvass_notes: input.notes
    });
    try {
        const { data, error } = await supabase.from('canvass_visits').insert({
            voter_id: input.voterId,
            project_id: input.projectId,
            contact_status: input.contactStatus,
            ballot_status: input.ballotStatus,
            notes_snapshot: input.notes,
            persuadability_bucket: bucket,
            outcome: deriveOutcome(input.contactStatus, input.notes)
        }).select('id').single();
        if (error)
            throw error;
        return data.id;
    }
    catch {
        // Decoration on top of the real update — never surfaced to the user.
        return null;
    }
}
// City/ward extraction and walk-order optimization live in ./route (no
// Supabase dependency, so they stay unit-testable); re-exported here so the
// turf feature has a single import surface.
export { applySegment, buildTurfSnapshot, dominantVoterLanguage, optimizeWalkOrder, splitIntoWalkLists, TRANSLATION_LANGUAGES, voterCity, voterLanguage, voterWard } from './route';
export function useTerritories(projectId) {
    return useQuery({
        queryKey: ['territories', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('territories')
                .select('*, profiles!territories_assigned_to_fkey(email, full_name)')
                .eq('project_id', projectId)
                .order('created_at');
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useVoterRecords(projectId) {
    return useQuery({
        queryKey: ['voter-records', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('voter_records')
                .select('id, project_id, data, full_name, address_line, lat, lng, territory_id, contact_status, ballot_status, ballot_updated_at, canvass_notes, geocode_status, geocode_checked_at, last_contacted_at')
                .eq('project_id', projectId)
                .limit(5000);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useCreateTerritory() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: async (input) => {
            const closedRing = [...input.ring, input.ring[0]];
            const geom = polygon([closedRing]);
            const { data: territory, error } = await supabase
                .from('territories')
                .insert({
                project_id: input.projectId,
                name: input.name,
                geometry: geom.geometry,
                area_sq_meters: Math.round(area(geom)),
                created_by: user.id
            })
                .select()
                .single();
            if (error)
                throw error;
            // Assign every mapped voter that falls inside the new polygon.
            const insideIds = input.voters
                .filter((v) => v.lat !== null && v.lng !== null)
                .filter((v) => booleanPointInPolygon(point([v.lng, v.lat]), geom))
                .map((v) => v.id);
            if (insideIds.length > 0) {
                const { error: assignError } = await supabase
                    .from('voter_records')
                    .update({ territory_id: territory.id })
                    .in('id', insideIds);
                if (assignError)
                    throw assignError;
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
function hullPolygon(coords) {
    const hull = convex(featureCollection(coords.map((c) => point(c))));
    if (hull)
        return hull;
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
        mutationFn: async (input) => {
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
            const geom = hullPolygon(targets.map((v) => [v.lng, v.lat]));
            const { data: territory, error } = await supabase
                .from('territories')
                .insert({
                project_id: input.projectId,
                name: input.name,
                geometry: geom.geometry,
                area_sq_meters: Math.round(area(geom)),
                created_by: user.id
            })
                .select()
                .single();
            if (error)
                throw error;
            const ids = targets.map((v) => v.id);
            const { error: assignError } = await supabase
                .from('voter_records')
                .update({ territory_id: territory.id })
                .in('id', ids);
            if (assignError)
                throw assignError;
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
        mutationFn: async (input) => {
            const { error } = await supabase
                .from('territories')
                .update({ assigned_to: input.profileId })
                .eq('id', input.territoryId);
            if (error)
                throw error;
        },
        onSuccess: (_r, vars) => {
            queryClient.invalidateQueries({ queryKey: ['territories', vars.projectId] });
        }
    });
}
// Update a voter's contact and/or ballot status. Enforced by the turf.manage
// UPDATE policy on voter_records (RLS is the enforcement layer). Stamps
// ballot_updated_at whenever the ballot status moves so the chase board can
// show recency, and last_contacted_at whenever contact_status changes — a
// real door touch, not just a ballot-status change — so Turf Briefing's
// staleness heatmap and shift stats reflect actual field activity.
export function useUpdateVoterStatus() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const patch = {};
            if (input.contact_status) {
                patch.contact_status = input.contact_status;
                patch.last_contacted_at = new Date().toISOString();
            }
            if (input.ballot_status) {
                patch.ballot_status = input.ballot_status;
                patch.ballot_updated_at = new Date().toISOString();
            }
            const { error } = await supabase
                .from('voter_records')
                .update(patch)
                .eq('id', input.voterId);
            if (error)
                throw error;
            // A visit is only logged for a real door-contact signal
            // (contact_status changing) — a ballot-only update can come from
            // non-door sources like phone-bank ballot tracking.
            if (input.contact_status) {
                await logVisit({
                    voterId: input.voterId,
                    projectId: input.projectId,
                    contactStatus: input.contact_status,
                    ballotStatus: input.ballot_status ?? input.current.ballot_status,
                    notes: input.current.canvass_notes
                });
            }
        },
        onSuccess: (_r, vars) => {
            queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
            queryClient.invalidateQueries({ queryKey: ['canvass-visits', vars.projectId] });
        }
    });
}
// Save a canvasser's free-text note from a door contact. Debounced by the
// caller (BallotChase saves on blur, not on every keystroke) since this hits
// the network on every call. A saved note means a real door contact just
// happened, so this stamps last_contacted_at too, and always logs a visit
// (unlike a status-only update, a note is unambiguously a real conversation).
export function useUpdateVoterNotes() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const notes = input.notes || null;
            const { error } = await supabase
                .from('voter_records')
                .update({ canvass_notes: notes, last_contacted_at: new Date().toISOString() })
                .eq('id', input.voterId);
            if (error)
                throw error;
            await logVisit({
                voterId: input.voterId,
                projectId: input.projectId,
                contactStatus: input.current.contact_status,
                ballotStatus: input.current.ballot_status,
                notes
            });
        },
        onSuccess: (_r, vars) => {
            queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
            queryClient.invalidateQueries({ queryKey: ['canvass-visits', vars.projectId] });
        }
    });
}
// Records one real survey attempt at the door: logs a visit (same as any
// other door contact — a survey conversation IS a real door contact) then
// attaches the answers actually given to that specific visit (migration
// 0035_survey_responses.sql). Kept separate from useUpdateVoterNotes rather
// than folded into it — a canvasser may run the survey without necessarily
// also leaving a free-text note, or vice versa.
export function useLogSurveyResponses() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const answered = input.answers.filter((a) => a.answer.trim());
            if (answered.length === 0)
                return;
            const visitId = await logVisit({
                voterId: input.voterId,
                projectId: input.projectId,
                contactStatus: input.current.contact_status,
                ballotStatus: input.current.ballot_status,
                notes: input.current.canvass_notes
            });
            // logVisit already swallows its own errors (best-effort log); if it
            // couldn't create a visit row, there's nothing to attach answers to.
            if (!visitId)
                return;
            const { error } = await supabase.from('survey_responses').insert(answered.map((a) => ({
                visit_id: visitId,
                script_id: a.scriptId,
                project_id: input.projectId,
                answer: a.answer.trim()
            })));
            if (error)
                throw error;
        },
        onSuccess: (_r, vars) => {
            queryClient.invalidateQueries({ queryKey: ['canvass-visits', vars.projectId] });
            queryClient.invalidateQueries({ queryKey: ['survey-responses', vars.projectId] });
        }
    });
}
export function useSurveyResponses(projectId) {
    return useQuery({
        queryKey: ['survey-responses', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('survey_responses')
                .select('visit_id, script_id, answer')
                .eq('project_id', projectId)
                .limit(20000);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useCanvassVisits(projectId) {
    return useQuery({
        queryKey: ['canvass-visits', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('canvass_visits')
                .select('id, voter_id, occurred_at, outcome, persuadability_bucket, notes_snapshot, canvasser_id, voter:voter_id(full_name), canvasser:canvasser_id(full_name)')
                .eq('project_id', projectId)
                .order('occurred_at', { ascending: false })
                .limit(5000);
            if (error)
                throw error;
            const rows = data;
            return rows.map((r) => ({
                id: r.id,
                voter_id: r.voter_id,
                occurred_at: r.occurred_at,
                outcome: r.outcome,
                persuadability_bucket: r.persuadability_bucket,
                notes_snapshot: r.notes_snapshot,
                voter_name: r.voter?.full_name ?? null,
                canvasser_id: r.canvasser_id,
                canvasser_name: r.canvasser?.full_name ?? null
            }));
        },
        enabled: Boolean(projectId)
    });
}
// Loads the caller's personal Turf Briefing customization (filter/threshold
// settings) for a project. One row per (user, project); RLS restricts to
// own rows (migration 0031), same shape as useDashboardLayout.ts. Always
// resolves to a complete TurfPreferences — mergePreferences fills in
// anything missing (including "nothing saved yet") with the defaults.
export function useTurfPreferences(projectId) {
    return useQuery({
        queryKey: ['turf-preferences', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('turf_briefing_preferences')
                .select('settings')
                .eq('project_id', projectId)
                .maybeSingle();
            if (error)
                throw error;
            return mergePreferences(data?.settings);
        },
        enabled: Boolean(projectId)
    });
}
export function useSaveTurfPreferences() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ projectId, settings }) => {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user)
                throw new Error('Not signed in');
            const { error } = await supabase
                .from('turf_briefing_preferences')
                .upsert({ profile_id: auth.user.id, project_id: projectId, settings, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,project_id' });
            if (error)
                throw error;
            return settings;
        },
        // Optimistic: write the new settings into the cache immediately so the
        // Customize panel doesn't visually snap back while the save is in flight.
        onMutate: async ({ projectId, settings }) => {
            queryClient.setQueryData(['turf-preferences', projectId], settings);
        },
        onError: (_e, vars) => queryClient.invalidateQueries({ queryKey: ['turf-preferences', vars.projectId] })
    });
}
