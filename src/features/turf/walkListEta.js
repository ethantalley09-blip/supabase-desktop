// Real completion-time estimation for a walk list. No Supabase import — see
// walkListEta.test.ts.
//
// Every minute figure here comes from the project's OWN canvass_visits
// timestamps. There are no industry benchmarks and no default pace constant:
// when there isn't enough real data the estimator returns null and the UI says
// "not enough data yet". A fabricated ETA that a captain staffs a shift
// against is worse than no ETA — same rule as visitHistory.ts's minimum
// sample for Best Time to Knock.
import { tierAtLeast } from './doorAttributes';

// A gap longer than this is a break, a drive to new turf, or the end of a
// shift — not the time one door took.
const MAX_DOOR_GAP_MINUTES = 45;
// Per condition signature. Below this we fall back to the project median.
const MIN_SIGNATURE_SAMPLE = 8;
// The project-wide median needs a much larger sample before it can stand in
// for a specific signature.
const MIN_PROJECT_SAMPLE = MIN_SIGNATURE_SAMPLE * 4;
// Average walking pace, metres/second. The one physical constant in here.
const WALK_SPEED_MS = 1.25;

/**
 * The condition signature of a door: its actionable routing tags, sorted, so
 * "gated + dogs" and "dogs + gated" are the same bucket. Safety tags never
 * appear — this feeds routing and timing, which read conditions only through
 * the class firewall (getRoutingAttributes).
 */
export function doorSignature(profile) {
    if (!profile)
        return 'plain';
    const tags = profile.attributes
        .filter((a) => a.class !== 'safety' && tierAtLeast(a.tier, 'actionable'))
        .map((a) => a.attribute.tag)
        .sort();
    return tags.length > 0 ? tags.join('|') : 'plain';
}

export function median(values) {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Median minutes per door, overall and per condition signature, measured from
 * the gap between consecutive visits by the SAME canvasser on the SAME day.
 * A gap is attributed to the later door — that's the time it took to reach
 * and work it.
 */
export function computeProjectPaceStats(visits, addressOf = new Map(), profilesByAddress = new Map()) {
    const byCanvasserDay = new Map();
    for (const v of visits) {
        const d = new Date(v.occurred_at);
        if (Number.isNaN(d.getTime()))
            continue;
        const key = `${v.canvasser_id ?? 'unknown'}:${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const list = byCanvasserDay.get(key) ?? [];
        list.push(v);
        byCanvasserDay.set(key, list);
    }

    const overall = [];
    const bySignatureValues = new Map();

    for (const list of byCanvasserDay.values()) {
        const sorted = [...list].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
        for (let i = 1; i < sorted.length; i++) {
            const minutes = (new Date(sorted[i].occurred_at).getTime() - new Date(sorted[i - 1].occurred_at).getTime()) / 60_000;
            if (minutes <= 0 || minutes > MAX_DOOR_GAP_MINUTES)
                continue;
            overall.push(minutes);
            const addressKey = addressOf.get(sorted[i].voter_id);
            const signature = doorSignature(addressKey ? profilesByAddress.get(addressKey) : null);
            const bucket = bySignatureValues.get(signature) ?? [];
            bucket.push(minutes);
            bySignatureValues.set(signature, bucket);
        }
    }

    const bySignature = {};
    for (const [signature, values] of bySignatureValues)
        bySignature[signature] = { median: round1(median(values)), n: values.length };

    return {
        overall: { median: overall.length > 0 ? round1(median(overall)) : null, n: overall.length },
        bySignature
    };
}

/**
 * Minutes for one door. Falls back signature -> project -> nothing, and says
 * which basis it used so the UI can be honest about it.
 */
export function estimateDoorMinutes(signature, paceStats) {
    const sig = paceStats?.bySignature?.[signature];
    if (sig && sig.n >= MIN_SIGNATURE_SAMPLE && sig.median !== null)
        return { minutes: sig.median, basis: 'signature', n: sig.n };
    const overall = paceStats?.overall;
    if (overall && overall.n >= MIN_PROJECT_SAMPLE && overall.median !== null)
        return { minutes: overall.median, basis: 'project', n: overall.n };
    return { minutes: null, basis: 'insufficient_data', n: overall?.n ?? 0 };
}

/**
 * Whole-list ETA: real per-door time plus real walking time along the already-
 * optimized path. Returns totalMinutes null (never a guess) when the project
 * hasn't logged enough visits yet.
 */
export function estimateCompletion({ doors, profilesByAddress = new Map(), pathMeters = 0, paceStats = null, remainingDaylightMinutes = null }) {
    let doorMinutes = 0;
    let estimatedDoors = 0;
    const basisCounts = { signature: 0, project: 0, insufficient_data: 0 };

    for (const door of doors) {
        const profile = door.addressKey ? profilesByAddress.get(door.addressKey) : null;
        const { minutes, basis } = estimateDoorMinutes(doorSignature(profile), paceStats);
        basisCounts[basis] += 1;
        if (minutes !== null) {
            doorMinutes += minutes;
            estimatedDoors += 1;
        }
    }

    if (estimatedDoors === 0) {
        return {
            totalMinutes: null,
            doorMinutes: null,
            travelMinutes: null,
            basis: 'insufficient_data',
            basisCounts,
            doorsBeyondDaylight: null
        };
    }

    // Scale to the full list when some doors had no usable estimate, rather
    // than silently under-counting them.
    const scaledDoorMinutes = (doorMinutes / estimatedDoors) * doors.length;
    const travelMinutes = pathMeters > 0 ? pathMeters / WALK_SPEED_MS / 60 : 0;
    const totalMinutes = scaledDoorMinutes + travelMinutes;

    let doorsBeyondDaylight = null;
    if (remainingDaylightMinutes !== null && totalMinutes > remainingDaylightMinutes && totalMinutes > 0) {
        const reachableFraction = remainingDaylightMinutes / totalMinutes;
        doorsBeyondDaylight = Math.max(0, doors.length - Math.floor(doors.length * reachableFraction));
    }

    return {
        totalMinutes: Math.round(totalMinutes),
        doorMinutes: Math.round(scaledDoorMinutes),
        travelMinutes: Math.round(travelMinutes),
        basis: basisCounts.signature > basisCounts.project ? 'signature' : 'project',
        basisCounts,
        doorsBeyondDaylight
    };
}

export function formatDuration(minutes) {
    if (minutes === null || minutes === undefined)
        return 'Not enough data yet';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
