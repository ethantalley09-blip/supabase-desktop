import { ArrowRight, HelpCircle, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { resolveGuideIds, suggestForQuestion } from './navMath';
import { useAskLynx } from './useWorkspace';
const STARTERS = [
    'How do I import my voter list?',
    'How do I make a walk list?',
    'What should I work on today?',
    'How do I invite volunteers?'
];
// Ask Lynx: plain-English help in a side panel. With the AI module it
// answers and offers buttons to the right places; without it, it still
// suggests matching destinations from the same index Search & Jump uses, so
// the panel is never a dead end.
export function AskLynx({ open, onClose, orgId, projectId, index, aiEnabled, onGo }) {
    const ask = useAskLynx();
    const [question, setQuestion] = useState('');
    const [asked, setAsked] = useState('');
    if (!open)
        return null;
    const submit = (q) => {
        const text = (q ?? question).trim();
        if (!text)
            return;
        setAsked(text);
        setQuestion('');
        if (aiEnabled)
            ask.mutate({ orgId, projectId, index, question: text });
    };
    const aiLinks = ask.data ? resolveGuideIds(index, ask.data.destination_ids) : [];
    const fallback = asked && (!aiEnabled || ask.isError) ? suggestForQuestion(index, asked) : [];
    const links = aiEnabled && !ask.isError ? aiLinks : fallback;
    const go = (target) => {
        onClose();
        onGo(target);
    };
    return (<div className="fixed inset-0 z-40 flex justify-end bg-black/20" onMouseDown={onClose}>
      <aside role="dialog" aria-label="Ask Lynx" className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-indigo-600"/>
            <p className="text-sm font-semibold text-neutral-900">Ask Lynx</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-neutral-400 hover:text-neutral-700"/>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {!asked && (<>
              <p className="text-sm text-neutral-600">
                Ask how to do anything in Lynx, in your own words. I'll explain and take you there.
              </p>
              <div className="space-y-1.5">
                {STARTERS.map((s) => (<button key={s} type="button" onClick={() => submit(s)} className="block w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50">
                    {s}
                  </button>))}
              </div>
            </>)}

          {asked && (<div className="ml-auto max-w-[85%] rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">{asked}</div>)}

          {ask.isPending && <p className="text-sm text-neutral-400">Thinking…</p>}

          {aiEnabled && ask.data && !ask.isPending && (<div className="space-y-2 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-800">
              <p>{ask.data.answer}</p>
              {ask.data.steps?.length > 0 && (<ol className="list-decimal space-y-0.5 pl-5 text-neutral-700">
                  {ask.data.steps.map((s) => (<li key={s}>{s}</li>))}
                </ol>)}
            </div>)}

          {asked && !ask.isPending && (!aiEnabled || ask.isError) && (<p className="text-sm text-neutral-600">
              {ask.isError ? "I couldn't get an AI answer just now, but these look like the right places:" : 'These look like the right places:'}
              {links.length === 0 && ' nothing matched. Try different words, or press Ctrl/⌘ K to search.'}
            </p>)}

          {!ask.isPending && links.length > 0 && (<div className="space-y-1.5">
              {links.map((l) => (<button key={l.id} type="button" onClick={() => go(l.target)} className="flex w-full items-center justify-between gap-2 rounded-md border border-indigo-200 bg-white px-3 py-2 text-left text-sm hover:bg-indigo-50">
                  <span>
                    <span className="block font-medium text-neutral-900">{l.label}</span>
                    {l.detail && <span className="block text-xs text-neutral-400">{l.detail}</span>}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-indigo-500"/>
                </button>))}
            </div>)}
        </div>

        <form className="flex gap-2 border-t border-neutral-100 p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How do I…" className="h-9 flex-1 rounded-md border border-neutral-300 px-3 text-sm outline-none focus:ring-1 focus:ring-neutral-900" aria-label="Your question"/>
          <Button type="submit" size="sm" disabled={!question.trim() || ask.isPending} aria-label="Ask">
            <Send className="h-4 w-4"/>
          </Button>
        </form>
      </aside>
    </div>);
}
