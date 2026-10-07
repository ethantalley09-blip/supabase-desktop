import { AlertCircle, Check, History, MinusCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
// Named conditionTimelineMath, not conditionTimeline: this dev box's
// filesystem is case-insensitive, so a pure-math module cannot share a name
// with its component differing only in case — the bundler resolves the import
// to whichever it finds first. Same reason turfBriefingMath.js and
// bundlerNetworkMath.js carry the suffix (see CLAUDE.md).
import { buildConditionTimeline, hasDisagreement, tagsInTimeline } from './conditionTimelineMath';
import { TAG_LABELS } from './doorAttributes';
import type { DoorTag, VisitRow, VoterRow } from './doorIntelligence.types';
import { normalizeAddress } from './households';

// Per-door evidence trail.
//
// door_attributes gives routing what it needs — one row per address+tag with
// counters — but that is useless for REVIEW. A manager looking at a disputed
// tag needs to see who observed what, when, and what contradicted it. The
// evidence was already in canvass_visits (append-only since 0030, carrying
// per-visit conditions since 0039); it was just never surfaced.
interface Props {
    visits: VisitRow[];
    voters: VoterRow[];
    /** Pre-select a door; otherwise the reader picks one. */
    addressKey?: string | null;
}

export function ConditionTimeline({ visits, voters, addressKey = null }: Props) {
    // Only doors that actually have condition evidence are worth offering.
    const doorsWithEvidence = useMemo(() => {
        const keys = new Map<string, string>();
        const voterAddress = new Map<string, string>();
        for (const voter of voters) {
            if (voter.address_line) voterAddress.set(voter.id, voter.address_line.trim());
        }
        for (const visit of visits) {
            const hasEvidence =
                (visit.observed_attributes?.length ?? 0) > 0 ||
                (visit.contradicted_attributes?.length ?? 0) > 0;
            if (!hasEvidence) continue;
            const address = voterAddress.get(visit.voter_id);
            if (!address) continue;
            keys.set(normalizeAddress(address), address);
        }
        return [...keys.entries()]
            .map(([key, label]) => ({ key, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [visits, voters]);

    const [selected, setSelected] = useState<string | null>(addressKey);
    const active = selected ?? addressKey ?? doorsWithEvidence[0]?.key ?? null;

    const timeline = useMemo(
        () => (active ? buildConditionTimeline(visits, voters, active) : []),
        [visits, voters, active]
    );
    const disagreements = useMemo(
        () => tagsInTimeline(timeline).filter((tag) => hasDisagreement(timeline, tag)),
        [timeline]
    );

    if (doorsWithEvidence.length === 0) return null;

    return (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4" id="tool-condition_timeline">
            <div className="flex flex-wrap items-center gap-2">
                <History className="h-4 w-4 text-neutral-600" />
                <h3 className="text-sm font-semibold text-neutral-900">Door history</h3>
                <select
                    className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
                    value={active ?? ''}
                    onChange={(e) => setSelected(e.target.value)}
                >
                    {doorsWithEvidence.map((door) => (
                        <option key={door.key} value={door.key}>
                            {door.label}
                        </option>
                    ))}
                </select>
                <span className="text-xs text-neutral-400">
                    {timeline.length} logged visit{timeline.length === 1 ? '' : 's'}
                </span>
            </div>

            {disagreements.length > 0 && (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Canvassers disagree about {disagreements.map((t) => TAG_LABELS[t]).join(', ')} at this
                        door. The trail below shows who saw what — worth a confirming visit before acting on it.
                    </span>
                </p>
            )}

            <ol className="space-y-2">
                {timeline.map((entry) => (
                    <li key={entry.visitId} className="border-l-2 border-neutral-200 pl-3">
                        <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-medium text-neutral-900">
                                {new Date(entry.occurredAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                })}
                            </span>
                            <span className="text-xs text-neutral-500">{entry.canvasserName}</span>
                            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-neutral-600">
                                {entry.outcome.replace(/_/g, ' ')}
                            </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {entry.observed.map((tag) => (
                                <TagPill key={`o-${tag}`} tag={tag} kind="observed" />
                            ))}
                            {entry.contradicted.map((tag) => (
                                <TagPill key={`c-${tag}`} tag={tag} kind="contradicted" />
                            ))}
                            {entry.silentOn.map((tag) => (
                                <TagPill key={`s-${tag}`} tag={tag} kind="silent" />
                            ))}
                            {entry.observed.length === 0 &&
                                entry.contradicted.length === 0 &&
                                entry.silentOn.length === 0 && (
                                    <span className="text-xs text-neutral-400">No conditions logged</span>
                                )}
                        </div>
                    </li>
                ))}
            </ol>

            <p className="text-xs text-neutral-400">
                &ldquo;Not seen&rdquo; only counts as evidence against conditions that are impossible to miss —
                a gate or a building. A dog can be indoors, so its absence on one visit means nothing.
            </p>
        </div>
    );
}

function TagPill({ tag, kind }: { tag: DoorTag; kind: 'observed' | 'contradicted' | 'silent' }) {
    const config = {
        observed: {
            className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
            icon: <Check className="h-3 w-3" />,
            suffix: ''
        },
        contradicted: {
            className: 'border-red-200 bg-red-50 text-red-800',
            icon: <MinusCircle className="h-3 w-3" />,
            suffix: ' · not there'
        },
        silent: {
            className: 'border-neutral-200 bg-neutral-50 text-neutral-500',
            icon: null,
            suffix: ' · not seen'
        }
    }[kind];

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${config.className}`}
        >
            {config.icon}
            {TAG_LABELS[tag]}
            {config.suffix}
        </span>
    );
}
