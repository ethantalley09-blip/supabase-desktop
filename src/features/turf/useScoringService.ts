// Client for the Python scoring service (python_svc/).
//
// The service is STATELESS and holds no database credentials: we send it rows
// this caller already fetched under their own RLS session, and it sends back
// derived numbers. That is what keeps invariant #1 intact — a service with its
// own service-role key would sit outside RLS and become a way to read rows the
// caller could not.
//
// Availability is treated as optional throughout. The same maths exists in
// doorAttributes.js / walkListScore.js and every in-app surface already uses
// it, so the service being down degrades a diagnostic panel rather than
// breaking canvassing. `useServiceHealth` exists to say so plainly in the UI
// instead of showing a spinner forever.
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
    BackfillPlan,
    DoorAttributeRow,
    StreetRisk,
    VisitRow,
    VoterRow,
    WalkListScore
} from './doorIntelligence.types';

// Dev goes through the Vite proxy (same-origin, no CORS preflight); a packaged
// build can point at a deployed service via VITE_DOOR_INTEL_URL.
const BASE = (import.meta.env.VITE_DOOR_INTEL_URL as string | undefined) ?? '/door-intel';

const TIMEOUT_MS = 8000;

async function post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(`${BASE}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`Scoring service returned ${response.status}`);
        }
        return (await response.json()) as T;
    } finally {
        clearTimeout(timer);
    }
}

export interface ServiceHealth {
    status: string;
    service: string;
}

export function useServiceHealth() {
    return useQuery<ServiceHealth>({
        queryKey: ['door-intel-health'],
        queryFn: async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3000);
            try {
                const response = await fetch(`${BASE}/health`, { signal: controller.signal });
                if (!response.ok) throw new Error(`health ${response.status}`);
                return (await response.json()) as ServiceHealth;
            } finally {
                clearTimeout(timer);
            }
        },
        // The service is optional — don't retry-storm when it simply isn't
        // running, and don't refetch on every window focus.
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 60_000
    });
}

export interface ScoringInput {
    attributes: DoorAttributeRow[];
    visits: VisitRow[];
    voters: VoterRow[];
}

export interface StreetRiskResponse {
    streets: StreetRisk[];
    snapshot: Record<string, unknown>;
    advisories: Array<{
        street: string;
        safetyDoors: number;
        distinctReporters: number;
        totalDoors: number;
        hazardDensity: number;
    }>;
}

export function useStreetRiskService() {
    return useMutation<StreetRiskResponse, Error, ScoringInput>({
        mutationFn: (input) => post<StreetRiskResponse>('/street-risk', input)
    });
}

export interface WalkListResponse {
    included: string[];
    excluded: Array<{ voterId: string; tag: string; reason: string }>;
    specialized: Array<{ key: string; tag: string; capability: string; doors: number }>;
    assignments: Array<{ listId: string; assignedTo: string | null; flags: string[] }>;
    paceStats: { overall: { median: number | null; n: number } };
    eta: {
        totalMinutes: number | null;
        doorMinutes: number | null;
        travelMinutes: number | null;
        basis: string;
        doorsBeyondDaylight: number | null;
    };
    score: WalkListScore;
}

export function useWalkListService() {
    return useMutation<
        WalkListResponse,
        Error,
        ScoringInput & {
            path_meters?: number;
            project_median_density?: number | null;
            remaining_daylight_minutes?: number | null;
            canvassers?: Array<{ profile_id: string; capabilities: string[] }>;
        }
    >({
        mutationFn: (input) => post<WalkListResponse>('/walk-list', input)
    });
}

/** Dry run only. The write path is a separate, explicit user action. */
export function useBackfillPlan() {
    return useMutation<
        BackfillPlan & { rows?: unknown[] },
        Error,
        { voters: VoterRow[]; existing_attributes: DoorAttributeRow[]; emit_rows?: boolean; project_id?: string; canvasser_id?: string }
    >({
        mutationFn: (input) => post<BackfillPlan & { rows?: unknown[] }>('/backfill/plan', input)
    });
}

export interface FirewallCheck {
    totalConditions: number;
    visibleToRouting: number;
    safetyConditionsWithheld: number;
    routingContainsSafety: boolean;
}

/**
 * Diagnostic: asks the service to prove the class firewall is actually
 * stripping safety data from what routing sees. Exposed in the UI rather than
 * left to tests so the property can be checked against real project data.
 */
export function useFirewallCheck() {
    return useMutation<FirewallCheck, Error, ScoringInput>({
        mutationFn: (input) => post<FirewallCheck>('/firewall-check', input)
    });
}
