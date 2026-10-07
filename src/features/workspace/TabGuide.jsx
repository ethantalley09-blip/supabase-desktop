import { ArrowRight, Info, X } from 'lucide-react';
import { useState } from 'react';
import { resolveTabGuide } from './guideMath';
// Per-viewer, per-tab "I've read it". Guarded: private windows can throw.
function readHidden() {
    try {
        return JSON.parse(window.localStorage.getItem('lynx.tabGuides.hidden') ?? '[]');
    }
    catch {
        return [];
    }
}
function writeHidden(list) {
    try {
        window.localStorage.setItem('lynx.tabGuides.hidden', JSON.stringify(list));
    }
    catch {
        // ignore: the guide just reappears next visit
    }
}
// "Start here" strip at the top of each tab. Hiding it collapses it to a
// one-line "About this tab" link rather than removing it, so the help is
// never more than one click away.
export function TabGuide({ tab, index, onGo }) {
    const [hidden, setHidden] = useState(readHidden);
    const guide = resolveTabGuide(tab, index);
    if (!guide)
        return null;
    const isHidden = hidden.includes(tab);
    const set = (next) => {
        setHidden(next);
        writeHidden(next);
    };
    if (isHidden) {
        return (<button type="button" onClick={() => set(hidden.filter((t) => t !== tab))} className="mb-3 flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700">
        <Info className="h-3.5 w-3.5"/> About this tab
      </button>);
    }
    return (<div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600"/>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900">{guide.title}</p>
        <p className="text-xs text-neutral-600">{guide.body}</p>
        {guide.actions.length > 0 && (<div className="mt-2 flex flex-wrap gap-1.5">
            {guide.actions.map((a) => (<button key={a.id} type="button" onClick={() => onGo(a.target)} className="flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs text-sky-800 hover:bg-sky-100">
                {a.label} <ArrowRight className="h-3 w-3"/>
              </button>))}
          </div>)}
      </div>
      <button type="button" onClick={() => set([...hidden, tab])} aria-label="Hide this guide" title="Hide (you can reopen it)">
        <X className="h-4 w-4 text-neutral-400 hover:text-neutral-700"/>
      </button>
    </div>);
}
