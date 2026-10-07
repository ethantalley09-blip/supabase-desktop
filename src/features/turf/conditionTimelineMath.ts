// Per-door evidence trail. Pure — no Supabase import (pattern: route.ts,
// doorAttributes.js) — see conditionTimeline.test.ts.
//
// door_attributes stores current STATE (one row per address+tag, with counters).
// That is what routing needs, but it is useless for review: a manager looking
// at a disputed tag needs to see who observed what, when, and what contradicted
// it. The evidence is already there — canvass_visits is append-only and carries
// observed_attributes/contradicted_attributes per visit — it was just never
// surfaced. This assembles it.
import type { DoorTag, TimelineEntry, VisitRow, VoterRow } from './doorIntelligence.types';
import { normalizeAddress } from './households';

/**
 * Every real visit to one physical door, newest first, with the conditions
 * observed and contradicted at each.
 *
 * `silentOn` is the interesting column: tags that were already known at this
 * door before the visit, which the visit did not re-observe. For an unmissable
 * tag that is genuine evidence against it (see UNMISSABLE_TAGS in
 * doorAttributes.js); for a dog it means nothing. The timeline shows it either
 * way and lets the reader judge, rather than silently applying the asymmetry
 * the scorer applies.
 */
export function buildConditionTimeline(
    visits: VisitRow[],
    voters: VoterRow[],
    addressKey: string
): TimelineEntry[] {
    const voterIdsAtAddress = new Set(
        voters
            .filter((v) => v.address_line && normalizeAddress(v.address_line) === addressKey)
            .map((v) => v.id)
    );
    if (voterIdsAtAddress.size === 0) return [];

    const relevant = visits
        .filter((v) => voterIdsAtAddress.has(v.voter_id))
        .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

    // Walk forward accumulating what was known, so each entry can report what
    // it failed to re-observe; reverse at the end for newest-first display.
    const known = new Set<DoorTag>();
    const entries: TimelineEntry[] = [];

    for (const visit of relevant) {
        const observed = visit.observed_attributes ?? [];
        const contradicted = visit.contradicted_attributes ?? [];
        const silentOn = [...known].filter(
            (tag) => !observed.includes(tag) && !contradicted.includes(tag)
        );

        entries.push({
            visitId: visit.id,
            occurredAt: visit.occurred_at,
            canvasserName: visit.canvasser_name ?? 'Unknown canvasser',
            observed: [...observed],
            contradicted: [...contradicted],
            outcome: visit.outcome,
            silentOn
        });

        for (const tag of observed) known.add(tag);
        for (const tag of contradicted) known.delete(tag);
    }

    return entries.reverse();
}

/** Distinct people who have ever reported a given tag at this door. */
export function observersForTag(entries: TimelineEntry[], tag: DoorTag): string[] {
    const names = new Set<string>();
    for (const entry of entries) {
        if (entry.observed.includes(tag)) names.add(entry.canvasserName);
    }
    return [...names];
}

/**
 * Whether the trail shows genuine disagreement about a tag — at least one
 * observation AND at least one contradiction. Distinct from the scorer's
 * `disputed` status, which is set by the contradiction cascade; this is the
 * human-readable "two people saw this differently".
 */
export function hasDisagreement(entries: TimelineEntry[], tag: DoorTag): boolean {
    const observed = entries.some((e) => e.observed.includes(tag));
    const contradicted = entries.some((e) => e.contradicted.includes(tag));
    return observed && contradicted;
}

/** Every tag that appears anywhere in the trail, for rendering a filter. */
export function tagsInTimeline(entries: TimelineEntry[]): DoorTag[] {
    const tags = new Set<DoorTag>();
    for (const entry of entries) {
        for (const tag of entry.observed) tags.add(tag);
        for (const tag of entry.contradicted) tags.add(tag);
    }
    return [...tags];
}
