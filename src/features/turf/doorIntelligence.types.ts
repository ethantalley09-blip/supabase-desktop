// Shared types for the Door Intelligence TypeScript surface (migration 0039).
//
// These describe the same shapes the untyped JS modules already produce, and
// the same shapes python_svc/ returns over the wire. They exist so the new
// .tsx components have real type safety without retyping the whole app —
// see tsconfig.json for why that scope is deliberate.

export type DoorTag =
    | 'no_trespassing'
    | 'hostile'
    | 'dogs'
    | 'gated_home'
    | 'hoa_community'
    | 'apartment'
    | 'senior_center';

/** Class drives decay, evidence threshold, routing authority, and AI exposure. */
export type AttrClass = 'legal' | 'safety' | 'hazard' | 'access' | 'facility';

export type Tier = 'none' | 'advisory' | 'actionable' | 'hard';

export type AttrStatus = 'active' | 'disputed' | 'retracted' | 'staff_confirmed';

export type AttrSource = 'canvasser' | 'staff' | 'import' | 'backfill';

/** A door_attributes row exactly as Supabase returns it. */
export interface DoorAttributeRow {
    id: string;
    project_id: string;
    address_key: string;
    street_key: string | null;
    lat: number | null;
    lng: number | null;
    tag: DoorTag;
    class: AttrClass;
    first_observed_at: string;
    last_confirmed_at: string;
    observer_ids: string[];
    observation_count: number;
    noted_observation_count: number;
    contradiction_count: number;
    source: AttrSource;
    status: AttrStatus;
    status_changed_by: string | null;
    status_changed_at: string | null;
    status_reason: string | null;
}

/** A canvass_visits row as useCanvassVisits maps it. */
export interface VisitRow {
    id: string;
    voter_id: string;
    occurred_at: string;
    outcome: 'contacted' | 'no_answer' | 'dead_door';
    persuadability_bucket: 'base_support' | 'persuadable' | 'opposed' | 'unknown';
    notes_snapshot: string | null;
    observed_attributes: DoorTag[];
    contradicted_attributes?: DoorTag[];
    canvasser_id: string | null;
    canvasser_name: string | null;
    voter_name: string | null;
}

export interface VoterRow {
    id: string;
    full_name: string | null;
    address_line: string | null;
    canvass_notes: string | null;
    contact_status: string;
    ballot_status: string;
    lat: number | null;
    lng: number | null;
}

export interface ScoredAttribute {
    attribute: DoorAttributeRow;
    class: AttrClass;
    confidence: number;
    tier: Tier;
    daysSinceConfirmed: number;
    reasons: string[];
}

export interface DoorProfile {
    addressKey: string;
    streetKey: string | null;
    lat: number | null;
    lng: number | null;
    attributes: ScoredAttribute[];
    hardExclusion: ScoredAttribute | null;
}

export interface WalkListScore {
    doorCount: number;
    safety: number;
    /** null when the project has no real pace history to anchor against. */
    access: number | null;
    density: number | null;
    composite: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'REVIEW';
    hazardDensity: number;
    frictionMinutes: number;
    doorsPerKm: number | null;
    reasons: string[];
}

export interface StreetRisk {
    streetKey: string;
    doorCount: number;
    taggedDoors: number;
    hazardDensity: number;
    accessFriction: number;
    frictionMinutes: number;
    safetyDoors: number;
    safetyObserverCount: number;
    /** True when the k-anonymity floor withheld this street's safety signal. */
    safetySuppressed: boolean;
    dominantConstraint: DoorTag | null;
    reasons: string[];
}

/** One entry in a door's evidence trail. */
export interface TimelineEntry {
    visitId: string;
    occurredAt: string;
    canvasserName: string;
    observed: DoorTag[];
    contradicted: DoorTag[];
    outcome: VisitRow['outcome'];
    /** Tags known at the door before this visit that this visit did not re-observe. */
    silentOn: DoorTag[];
}

/** A door-condition write waiting to reach the server. */
export interface QueuedCapture {
    /** Client-generated so a replay after a partial failure is idempotent. */
    id: string;
    voterId: string;
    projectId: string;
    observedAttributes: DoorTag[];
    contradictedAttributes: DoorTag[];
    queuedAt: string;
    attempts: number;
}

export interface BackfillHit {
    voterId: string;
    addressKey: string;
    streetKey: string | null;
    tag: DoorTag;
    matchedPhrase: string;
    excerpt: string;
}

export interface BackfillPlan {
    dryRun: true;
    notesScanned: number;
    wouldCreate: number;
    skippedBecauseRealObservationExists: number;
    byTag: Partial<Record<DoorTag, number>>;
    hits: BackfillHit[];
    caveat: string;
}
