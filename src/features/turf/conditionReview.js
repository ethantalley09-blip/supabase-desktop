// Governance math for Door Intelligence: the four sections of the Condition
// Review Queue. No Supabase import — see conditionReview.test.ts.
//
// This ships in v1 rather than a later "governance phase" on purpose. An audit
// added after the data exists is an audit of a problem you already have, and
// every control here is cheap now and expensive to retrofit.
import { CLASS_HALF_LIFE_DAYS, TIER_THRESHOLDS, tierAtLeast } from './doorAttributes';

const DAY_MS = 86_400_000;

/** Tags a later visit contradicted, waiting on a human. */
export function findDisputed(scored) {
    return scored
        .filter((s) => s.attribute.status === 'disputed')
        .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Hard-tier tags about to fall below actionable. Prompts a confirmation walk
 * rather than letting a real exclusion lapse silently.
 *
 * Legal-class tags never decay, so they never appear here — a posted notice
 * doesn't expire, it gets retracted by a human.
 */
export function findExpiringTags(scored, opts = {}) {
    const withinDays = opts.withinDays ?? 30;
    const results = [];
    for (const s of scored) {
        const halfLife = CLASS_HALF_LIFE_DAYS[s.class];
        if (halfLife === null || halfLife === undefined)
            continue;
        if (!tierAtLeast(s.tier, 'actionable'))
            continue;
        if (s.confidence <= 0)
            continue;
        // Days until decay alone drops this below the actionable threshold,
        // holding the evidence constant.
        const undecayed = s.confidence / Math.pow(0.5, s.daysSinceConfirmed / halfLife);
        if (undecayed <= TIER_THRESHOLDS.actionable)
            continue;
        const totalLife = halfLife * Math.log2(undecayed / TIER_THRESHOLDS.actionable);
        const daysRemaining = totalLife - s.daysSinceConfirmed;
        if (daysRemaining <= withinDays)
            results.push({ scored: s, daysRemaining: Math.max(0, Math.round(daysRemaining)) });
    }
    return results.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Canvassers whose safety/hazard tagging rate runs far above the team's.
 *
 * Deliberately framed as a conversation prompt, never a performance metric —
 * same rule as canvasserFatigue.ts. Over-tagging is usually a nervous new
 * volunteer who needs a ride-along, not a bad actor, and presenting it as a
 * score invites exactly the wrong response.
 */
export function findReporterOutliers(visits, opts = {}) {
    const minVisits = opts.minVisits ?? 20;
    const multiple = opts.multiple ?? 3;
    const byCanvasser = new Map();
    let teamFlagged = 0;
    let teamVisits = 0;

    for (const v of visits) {
        const id = v.canvasser_id;
        if (!id)
            continue;
        const row = byCanvasser.get(id) ?? { canvasserId: id, name: v.canvasser_name ?? 'Canvasser', visits: 0, flagged: 0 };
        row.visits += 1;
        const flagged = (v.observed_attributes ?? []).some((t) => t === 'hostile' || t === 'dogs');
        if (flagged)
            row.flagged += 1;
        byCanvasser.set(id, row);
        teamVisits += 1;
        if (flagged)
            teamFlagged += 1;
    }

    if (teamVisits === 0)
        return { teamRate: 0, outliers: [] };
    const teamRate = teamFlagged / teamVisits;
    if (teamRate === 0)
        return { teamRate: 0, outliers: [] };

    const outliers = [...byCanvasser.values()]
        .filter((r) => r.visits >= minVisits && r.flagged / r.visits >= teamRate * multiple)
        .map((r) => ({
            canvasserId: r.canvasserId,
            name: r.name,
            visits: r.visits,
            flagged: r.flagged,
            rate: round3(r.flagged / r.visits),
            timesTeamRate: round1(r.flagged / r.visits / teamRate)
        }))
        .sort((a, b) => b.timesTeamRate - a.timesTeamRate);

    return { teamRate: round3(teamRate), outliers };
}

/**
 * Safety-tag rate by the language spoken at the doors carrying it, against the
 * project baseline. It accuses nobody; it makes visible a pattern that is
 * otherwise invisible, which is the only way anyone finds out that a safety
 * signal has drifted into a proxy for something else.
 *
 * Requires a real sample per group (default 30 doors) before reporting a
 * ratio — with a handful of doors any group can look like an outlier.
 */
export function computeEquityAudit({ profiles, voters, languageOf, minGroupDoors = 30, flagRatio = 2 }) {
    const safetyAddresses = new Set();
    for (const profile of profiles) {
        if (profile.attributes.some((a) => a.class === 'safety' && tierAtLeast(a.tier, 'advisory')))
            safetyAddresses.add(profile.addressKey);
    }

    const groups = new Map();
    let totalDoors = 0;
    let totalFlagged = 0;

    for (const voter of voters) {
        const addr = voter.address_line?.trim();
        if (!addr)
            continue;
        const key = normalizeForAudit(addr);
        const language = languageOf(voter) ?? 'unknown';
        const row = groups.get(language) ?? { language, doors: 0, flagged: 0 };
        row.doors += 1;
        totalDoors += 1;
        if (safetyAddresses.has(key)) {
            row.flagged += 1;
            totalFlagged += 1;
        }
        groups.set(language, row);
    }

    if (totalDoors === 0)
        return { baselineRate: 0, groups: [], flagged: [], hasEnoughData: false };
    const baselineRate = totalFlagged / totalDoors;

    const rows = [...groups.values()]
        .map((g) => ({
            language: g.language,
            doors: g.doors,
            flagged: g.flagged,
            rate: round3(g.doors > 0 ? g.flagged / g.doors : 0),
            ratio: baselineRate > 0 && g.doors > 0 ? round1(g.flagged / g.doors / baselineRate) : null,
            hasEnoughData: g.doors >= minGroupDoors
        }))
        .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));

    return {
        baselineRate: round3(baselineRate),
        groups: rows,
        flagged: rows.filter((r) => r.hasEnoughData && r.ratio !== null && r.ratio >= flagRatio),
        hasEnoughData: rows.some((r) => r.hasEnoughData)
    };
}

// Local copy of households.ts normalizeAddress semantics. Kept inline rather
// than imported so this module stays readable on its own; the two are asserted
// equivalent in conditionReview.test.ts.
function normalizeForAudit(address) {
    return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

const round1 = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;
