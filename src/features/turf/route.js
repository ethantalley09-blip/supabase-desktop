// Voter files vary in header casing/naming; pull city and ward from the source
// jsonb by matching common header spellings case-insensitively. This mirrors
// how geocode.ts reads the City column. Exported so turfBriefing.ts can apply
// the same lookup to a Party column without duplicating the matching logic.
export function pickField(data, candidates) {
    if (!data)
        return null;
    const wanted = new Set(candidates.map((c) => c.toLowerCase()));
    for (const [key, value] of Object.entries(data)) {
        if (!wanted.has(key.trim().toLowerCase()))
            continue;
        if (value === undefined || value === null)
            continue;
        const text = String(value).trim();
        if (text !== '')
            return text;
    }
    return null;
}
export function voterCity(v) {
    return pickField(v.data, ['city', 'city name', 'city_name']);
}
export function voterWard(v) {
    return pickField(v.data, ['ward', 'precinct', 'ward/precinct', 'ward_precinct']);
}
// Target languages the translator offers (US-electorate common set). Defined
// here (pure) so both the TranslateBar UI and dominant-language detection share
// one canonical list.
export const TRANSLATION_LANGUAGES = [
    'Spanish',
    'Chinese (Simplified)',
    'Vietnamese',
    'Tagalog',
    'Korean',
    'Arabic',
    'French',
    'Portuguese',
    'Haitian Creole'
];
// Map the many ways a voter file writes a language (codes, native names) onto a
// canonical TRANSLATION_LANGUAGES label. English and anything unrecognized map
// to null (nothing to translate into).
const LANGUAGE_ALIASES = {
    es: 'Spanish', spanish: 'Spanish', 'español': 'Spanish', espanol: 'Spanish', spa: 'Spanish',
    zh: 'Chinese (Simplified)', chinese: 'Chinese (Simplified)', mandarin: 'Chinese (Simplified)', cmn: 'Chinese (Simplified)',
    vi: 'Vietnamese', vietnamese: 'Vietnamese',
    tl: 'Tagalog', tagalog: 'Tagalog', filipino: 'Tagalog', fil: 'Tagalog',
    ko: 'Korean', korean: 'Korean',
    ar: 'Arabic', arabic: 'Arabic',
    fr: 'French', french: 'French',
    pt: 'Portuguese', portuguese: 'Portuguese',
    ht: 'Haitian Creole', 'haitian creole': 'Haitian Creole', creole: 'Haitian Creole', haitian: 'Haitian Creole'
};
function normalizeLanguage(raw) {
    return LANGUAGE_ALIASES[raw.trim().toLowerCase()] ?? null;
}
export function voterLanguage(v) {
    return pickField(v.data, ['language', 'preferred language', 'preferred_language', 'preferredlanguage', 'lang']);
}
// The most common non-English language among these voters, as a canonical
// translation label — used to default the translator to the electorate's
// dominant language. Returns null when no recognized non-English language is
// present.
export function dominantVoterLanguage(voters) {
    const counts = new Map();
    for (const v of voters) {
        const raw = voterLanguage(v);
        if (!raw)
            continue;
        const norm = normalizeLanguage(raw);
        if (!norm)
            continue;
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
    }
    let best = null;
    let bestN = 0;
    for (const [lang, n] of counts) {
        if (n > bestN) {
            bestN = n;
            best = lang;
        }
    }
    return best;
}
// Great-circle distance in meters between two [lng, lat] points. Inlined
// (rather than @turf/distance) because the optimizer calls it in tight O(n^2)
// loops and the per-call overhead matters.
function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
function pathMeters(order, coords) {
    let total = 0;
    for (let i = 1; i < order.length; i++) {
        total += haversineMeters(coords[order[i - 1]], coords[order[i]]);
    }
    return total;
}
// 2-opt refinement of an OPEN path (canvassers don't return to the start).
// Repeatedly reverses a segment when doing so shortens the total walk, which
// removes the self-crossings that show up as real-world backtracking.
function twoOpt(order, coords) {
    const d = (a, b) => haversineMeters(coords[a], coords[b]);
    const route = order.slice();
    let improved = true;
    while (improved) {
        improved = false;
        for (let i = 1; i < route.length - 1; i++) {
            for (let k = i + 1; k < route.length; k++) {
                const a = route[i - 1];
                const b = route[i];
                const c = route[k];
                const next = k + 1 < route.length ? route[k + 1] : -1;
                let delta = d(a, c) - d(a, b);
                if (next !== -1)
                    delta += d(b, next) - d(c, next);
                if (delta < -1e-6) {
                    let lo = i;
                    let hi = k;
                    while (lo < hi) {
                        const t = route[lo];
                        route[lo] = route[hi];
                        route[hi] = t;
                        lo++;
                        hi--;
                    }
                    improved = true;
                }
            }
        }
    }
    return route;
}
// Order a territory's doors into an efficient walking sequence: nearest-
// neighbor builds an initial tour, then 2-opt removes crossings. 2-opt is
// O(n^2) per pass, so it's capped by size to stay responsive in the browser;
// larger sets keep the nearest-neighbor order.
export function optimizeWalkOrder(voters) {
    const pts = voters.filter((v) => v.lat !== null && v.lng !== null);
    const coords = pts.map((v) => [v.lng, v.lat]);
    const n = pts.length;
    if (n <= 2)
        return { ordered: pts, meters: pathMeters([...pts.keys()], coords) };
    // Start from the westernmost door — a stable, intuitive starting corner.
    const startIdx = coords.reduce((min, c, i) => (c[0] < coords[min][0] ? i : min), 0);
    const visited = new Array(n).fill(false);
    const order = [startIdx];
    visited[startIdx] = true;
    while (order.length < n) {
        const last = order[order.length - 1];
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < n; j++) {
            if (visited[j])
                continue;
            const dist = haversineMeters(coords[last], coords[j]);
            if (dist < bestD) {
                bestD = dist;
                best = j;
            }
        }
        order.push(best);
        visited[best] = true;
    }
    const refined = n <= 400 ? twoOpt(order, coords) : order;
    return { ordered: refined.map((i) => pts[i]), meters: pathMeters(refined, coords) };
}
// Split a set of doors into k balanced, geographically-contiguous walk lists,
// each internally optimized. This is the "cut a big turf into N equal shifts"
// job field organizers do by hand for hours: geographic k-means keeps each
// list compact (contiguous), then a capacity cap of ceil(n/k) evens out the
// counts so no volunteer gets a monster list. Deterministic (seeded by a
// west-to-east sweep) so the same turf always splits the same way.
export function splitIntoWalkLists(voters, k) {
    const pts = voters.filter((v) => v.lat !== null && v.lng !== null);
    const n = pts.length;
    if (n === 0)
        return [];
    if (k <= 1 || n <= 1)
        return [optimizeWalkOrder(pts)];
    if (n <= k)
        return pts.map((p) => optimizeWalkOrder([p]));
    const coords = pts.map((v) => [v.lng, v.lat]);
    // Deterministic seeding: sweep west-to-east and pick k evenly spaced doors.
    const sweep = [...coords.keys()].sort((a, b) => coords[a][0] - coords[b][0] || coords[a][1] - coords[b][1]);
    const centroids = [];
    for (let i = 0; i < k; i++) {
        const idx = sweep[Math.floor(((i + 0.5) * n) / k)];
        centroids.push([coords[idx][0], coords[idx][1]]);
    }
    // Lloyd's algorithm: assign to nearest centroid, recompute, repeat.
    const assign = new Array(n).fill(0);
    for (let iter = 0; iter < 12; iter++) {
        let changed = false;
        for (let i = 0; i < n; i++) {
            let best = 0;
            let bestD = Infinity;
            for (let c = 0; c < k; c++) {
                const d = haversineMeters(coords[i], centroids[c]);
                if (d < bestD) {
                    bestD = d;
                    best = c;
                }
            }
            if (assign[i] !== best) {
                assign[i] = best;
                changed = true;
            }
        }
        const sums = Array.from({ length: k }, () => [0, 0, 0]);
        for (let i = 0; i < n; i++) {
            sums[assign[i]][0] += coords[i][0];
            sums[assign[i]][1] += coords[i][1];
            sums[assign[i]][2] += 1;
        }
        for (let c = 0; c < k; c++) {
            if (sums[c][2] > 0) {
                centroids[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
            }
        }
        if (!changed)
            break;
    }
    // Capacity-balance: closest-to-centroid doors keep their seat; overflow
    // spills to the nearest cluster that still has room.
    const cap = Math.ceil(n / k);
    const clusters = Array.from({ length: k }, () => []);
    const byFit = [...Array(n).keys()].sort((a, b) => haversineMeters(coords[a], centroids[assign[a]]) -
        haversineMeters(coords[b], centroids[assign[b]]));
    for (const i of byFit) {
        let c = assign[i];
        if (clusters[c].length >= cap) {
            let best = -1;
            let bestD = Infinity;
            for (let cc = 0; cc < k; cc++) {
                if (clusters[cc].length >= cap)
                    continue;
                const d = haversineMeters(coords[i], centroids[cc]);
                if (d < bestD) {
                    bestD = d;
                    best = cc;
                }
            }
            if (best !== -1)
                c = best;
        }
        clusters[c].push(i);
    }
    return clusters.filter((c) => c.length > 0).map((c) => optimizeWalkOrder(c.map((i) => pts[i])));
}
const CONTACT_VALUES = new Set(['active', 'moved', 'bad_address', 'deceased', 'do_not_contact']);
const BALLOT_VALUES = new Set(['none', 'requested', 'returned']);
export function applySegment(voters, filter) {
    const eq = (a, b) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
    return voters.filter((v) => {
        if (filter.contact_status && CONTACT_VALUES.has(filter.contact_status) && v.contact_status !== filter.contact_status)
            return false;
        if (filter.ballot_status && BALLOT_VALUES.has(filter.ballot_status) && v.ballot_status !== filter.ballot_status)
            return false;
        if (filter.city && !eq(voterCity(v), filter.city))
            return false;
        if (filter.ward && !eq(voterWard(v), filter.ward))
            return false;
        if (filter.language) {
            const lang = voterLanguage(v);
            if (!lang || !lang.toLowerCase().includes(filter.language.trim().toLowerCase()))
                return false;
        }
        if (typeof filter.mapped === 'boolean' && (v.lat !== null && v.lng !== null) !== filter.mapped)
            return false;
        if (typeof filter.hasNotes === 'boolean' && Boolean(v.canvass_notes?.trim()) !== filter.hasNotes)
            return false;
        if (typeof filter.assignedToTerritory === 'boolean' && Boolean(v.territory_id) !== filter.assignedToTerritory)
            return false;
        return true;
    });
}
// Compact aggregate of a project's turf/GOTV state. This is the ONLY thing the
// "Ask your voters" and "Field Coach" AI features send to the model — never raw
// voter rows — so no personal data leaves the app and the prompt stays small.
// Pure and unit-tested; the model answers strictly from these numbers.
export function buildTurfSnapshot(voters, territories) {
    const contactStatus = {
        active: 0,
        moved: 0,
        bad_address: 0,
        deceased: 0,
        do_not_contact: 0
    };
    let mapped = 0;
    let geocodableBacklog = 0;
    let requested = 0;
    let returned = 0;
    let votersAssignedToTerritory = 0;
    let notesLogged = 0;
    const cityCounts = new Map();
    const wards = new Set();
    const languageCounts = new Map();
    for (const v of voters) {
        contactStatus[v.contact_status] += 1;
        if (v.lat !== null && v.lng !== null)
            mapped += 1;
        else if (v.address_line)
            geocodableBacklog += 1;
        if (v.ballot_status === 'requested')
            requested += 1;
        else if (v.ballot_status === 'returned')
            returned += 1;
        if (v.territory_id)
            votersAssignedToTerritory += 1;
        if (v.canvass_notes?.trim())
            notesLogged += 1;
        const city = voterCity(v);
        if (city)
            cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
        const ward = voterWard(v);
        if (ward)
            wards.add(ward);
        const language = voterLanguage(v);
        if (language)
            languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
    }
    const universe = requested + returned;
    const topN = (counts) => [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topCities = topN(cityCounts).map(([city, count]) => ({ city, count }));
    const topLanguages = topN(languageCounts).map(([language, count]) => ({ language, count }));
    return {
        totalVoters: voters.length,
        mapped,
        unmapped: voters.length - mapped,
        geocodableBacklog,
        contactStatus,
        ballots: {
            requested,
            returned,
            outstanding: requested,
            returnRatePct: universe > 0 ? Math.round((returned / universe) * 100) : 0
        },
        territories: {
            total: territories.length,
            unassigned: territories.filter((t) => !t.assigned_to).length
        },
        votersAssignedToTerritory,
        distinctCities: cityCounts.size,
        distinctWards: wards.size,
        topCities,
        topLanguages,
        notesLogged
    };
}
