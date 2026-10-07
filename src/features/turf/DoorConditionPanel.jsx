import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { HOT_TAGS, MORE_TAGS, TAG_CLASS, TAG_LABELS, inheritedStreetTags, inheritedTagsForAddress } from './doorAttributes';
// Door-condition capture for one door (migration 0039).
//
// The governing constraint is tap fatigue: a canvasser logs 60-120 doors a
// shift, one-handed, often in the sun. Every extra tap costs shift time and,
// worse, drives selective abandonment — people stop tagging the marginal doors
// first, which biases the whole dataset toward extremes. So:
//
//  - the median door costs ZERO taps: known conditions arrive pre-selected
//    from the household/street rollup and are re-confirmed just by saving,
//  - only three chips are always visible (the ones you can't predict from the
//    neighbours); the four place chips sit behind a disclosure,
//  - one write per commit, not one per chip — otherwise every toggle would
//    add a canvass_visits row and quietly corrupt Best Time to Knock.
const CHIP_TONE = {
    legal: 'border-red-300 bg-red-50 text-red-800',
    safety: 'border-amber-300 bg-amber-50 text-amber-900',
    hazard: 'border-orange-300 bg-orange-50 text-orange-900',
    access: 'border-sky-300 bg-sky-50 text-sky-900',
    facility: 'border-violet-300 bg-violet-50 text-violet-900'
};
export function DoorConditionPanel({ voter, profile, allScored = [], onCommit, isPending }) {
    const inherited = useMemo(() => {
        const fromDoor = inheritedTagsForAddress(profile);
        // Street inheritance covers block-scoped tags only — an HOA genuinely
        // covers a subdivision, a gate never covers the neighbour's house.
        const fromStreet = inheritedStreetTags(allScored, profile?.streetKey ?? null);
        return [...new Set([...fromDoor, ...fromStreet])];
    }, [profile, allScored]);
    const [selected, setSelected] = useState(() => new Set(inherited));
    const [expanded, setExpanded] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    // What this panel last committed, if anything. Without it the baseline
    // would snap back to `inherited` after a save — and a tag with a single
    // observer is only ADVISORY, so it doesn't come back as inherited at all.
    // The panel would then still read as unsaved and the Log button would stay
    // live, inviting a second write and a duplicate visit row.
    const [committed, setCommitted] = useState(null);
    const baseline = committed ?? inherited;
    const toggle = (tag) => {
        setSavedAt(null);
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(tag))
                next.delete(tag);
            else
                next.add(tag);
            return next;
        });
    };
    const observed = [...selected];
    // Deselecting a pre-filled tag is much stronger evidence than never
    // selecting it, so it is recorded explicitly rather than inferred.
    const contradicted = baseline.filter((t) => !selected.has(t));
    const dirty = contradicted.length > 0 || observed.some((t) => !baseline.includes(t));
    const commit = () => {
        onCommit({ observed, contradicted });
        setCommitted(observed);
        setSavedAt(Date.now());
    };
    const visibleMore = expanded ? MORE_TAGS : MORE_TAGS.filter((t) => selected.has(t));
    return (<div className="min-w-[15rem] space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {HOT_TAGS.map((tag) => (<Chip key={tag} tag={tag} selected={selected.has(tag)} inherited={baseline.includes(tag)} onToggle={toggle}/>))}
        {visibleMore.map((tag) => (<Chip key={tag} tag={tag} selected={selected.has(tag)} inherited={baseline.includes(tag)} onToggle={toggle}/>))}
        <button type="button" onClick={() => setExpanded((e) => !e)} className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50">
          {expanded ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>}
          {expanded ? 'Less' : 'More'}
        </button>
      </div>

      {selected.has('no_trespassing') && (<p className="text-xs text-red-700">
          This door will be removed from all walk lists.
        </p>)}
      {selected.has('hostile') && !baseline.includes('hostile') && (<p className="text-xs text-amber-700">
          Optional: add what happened in the notes — it makes the report count for more.
        </p>)}

      {dirty && (<Button size="sm" variant="outline" onClick={commit} disabled={isPending}>
          {isPending ? 'Saving…' : 'Log conditions'}
        </Button>)}
      {savedAt && !dirty && (<span className="text-xs text-emerald-600">
          Saved for {voter.full_name || 'this door'}
        </span>)}
      {!dirty && !savedAt && baseline.length > 0 && (<p className="text-xs text-neutral-400">
          Known from this building or street — saving the row re-confirms it.
        </p>)}
    </div>);
}
function Chip({ tag, selected, inherited, onToggle }) {
    const tone = CHIP_TONE[TAG_CLASS[tag]];
    const base = 'inline-flex min-h-[1.75rem] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition';
    return (<button type="button" role="switch" aria-checked={selected} aria-label={inherited ? `${TAG_LABELS[tag]}, known from this building` : TAG_LABELS[tag]} onClick={() => onToggle(tag)} className={selected
            ? `${base} ${tone} ${inherited ? 'opacity-70' : ''}`
            : `${base} border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300`}>
      {TAG_LABELS[tag]}
      {selected && inherited && <span className="text-[0.65rem] font-normal opacity-70">· known</span>}
    </button>);
}
