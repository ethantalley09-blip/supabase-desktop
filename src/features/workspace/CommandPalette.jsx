import { CornerDownLeft, LayoutGrid, Search, Sparkles, Star, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { emptyQuerySections, searchNav } from './navMath';
const TYPE_ICON = { tab: LayoutGrid, action: Zap, tool: Sparkles };
const TYPE_LABEL = { tab: 'Tab', action: 'Action', tool: 'AI tool' };
// Search & Jump (Ctrl/Cmd+K): type a few letters of anything (a tab, an
// action like "import", any AI tool) and press Enter to go there. Before you
// type, it shows your pinned places, then recent ones. The star on each row
// pins/unpins. The keyboard shortcut is registered in ProjectDetailsPage so
// it works from every tab.
export function CommandPalette({ open, onClose, index, onGo, pinned, recents, onTogglePin, onChosen }) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const sections = useMemo(() => (query.trim()
        ? [{ label: null, entries: searchNav(index, query, 8) }]
        : emptyQuerySections(index, pinned, recents, 8)), [index, query, pinned, recents]);
    const flat = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
    const pinnedSet = useMemo(() => new Set(pinned ?? []), [pinned]);
    // The input mounts fresh each time the palette opens (closed renders
    // null), so autoFocus focuses it synchronously -- a deferred focus()
    // loses keystrokes typed right after Ctrl+K. Reset on CLOSE, not open:
    // an on-open reset runs after mount and wipes anything typed instantly.
    useEffect(() => {
        if (!open) {
            setQuery('');
            setActive(0);
        }
    }, [open]);
    useEffect(() => setActive(0), [query]);
    if (!open)
        return null;
    const go = (entry) => {
        if (!entry)
            return;
        onChosen?.(entry.id);
        onClose();
        onGo(entry.target);
    };
    const onKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, flat.length - 1));
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
        }
        else if (e.key === 'Enter') {
            e.preventDefault();
            go(flat[active]);
        }
        else if (e.key === 'Escape') {
            onClose();
        }
    };
    let i = -1;
    return (<div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div role="dialog" aria-label="Search and jump" className="w-full max-w-lg overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-neutral-100 px-4">
          <Search className="h-4 w-4 text-neutral-400"/>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder="Where do you want to go? Try “import”, “walk list”, “donor”…" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-neutral-400" aria-label="Search"/>
          <kbd className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-400">Esc</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto py-1" role="listbox">
          {flat.length === 0 && (<p className="px-4 py-6 text-center text-sm text-neutral-400">
              No match. Try a simpler word, or ask Lynx in plain English.
            </p>)}
          {sections.map((section) => (<div key={section.label ?? 'results'}>
              {section.label && (<p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{section.label}</p>)}
              {section.entries.map((r) => {
                i += 1;
                const idx = i;
                const Icon = TYPE_ICON[r.type];
                const isPinned = pinnedSet.has(r.id);
                return (<div key={r.id} role="option" aria-selected={idx === active} onMouseEnter={() => setActive(idx)} className={`flex items-center gap-3 px-4 py-2 ${idx === active ? 'bg-neutral-100' : ''}`}>
                    <button type="button" onClick={() => go(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Icon className="h-4 w-4 shrink-0 text-neutral-400"/>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-neutral-900">{r.label}</span>
                        {r.detail && <span className="block truncate text-xs text-neutral-400">{r.detail}</span>}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-300">{TYPE_LABEL[r.type]}</span>
                    </button>
                    {onTogglePin && (<button type="button" onClick={() => onTogglePin(r.id)} title={isPinned ? 'Unpin' : 'Pin to the top of Search'} aria-label={isPinned ? `Unpin ${r.label}` : `Pin ${r.label}`} className="shrink-0">
                        <Star className={`h-3.5 w-3.5 ${isPinned ? 'fill-amber-400 text-amber-400' : idx === active ? 'text-neutral-300 hover:text-amber-400' : 'text-transparent'}`}/>
                      </button>)}
                    <CornerDownLeft className={`h-3.5 w-3.5 shrink-0 ${idx === active ? 'text-neutral-400' : 'text-transparent'}`}/>
                  </div>);
            })}
            </div>))}
        </div>
        <div className="flex gap-3 border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-400">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>☆ to pin</span>
          <span>Ctrl/⌘ K anytime</span>
        </div>
      </div>
    </div>);
}
