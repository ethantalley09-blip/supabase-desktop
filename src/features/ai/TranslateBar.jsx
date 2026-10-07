import { Languages } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TRANSLATION_LANGUAGES } from '@/features/turf/useTurf';
import { useAiAssist } from '@/lib/ai/useAiAssist';
// One-click translation of an already-generated message. Dropped in under any
// AI message output so campaigns can reach voters in-language — a gap
// incumbents are dinged for. Faithful translation only; the system prompt
// forbids adding or dropping claims. `defaultLanguage` (when the electorate's
// dominant language is known) pre-selects the dropdown.
export function TranslateBar({ orgId, projectId, text, defaultLanguage }) {
    const translate = useAiAssist();
    const initial = defaultLanguage && TRANSLATION_LANGUAGES.includes(defaultLanguage)
        ? defaultLanguage
        : TRANSLATION_LANGUAGES[0];
    const [language, setLanguage] = useState(initial);
    const run = () => translate.mutate({ orgId, projectId, purpose: 'translate', instructions: text, language });
    return (<div className="space-y-2">
      <div className="flex items-center gap-2">
        <Languages className="h-4 w-4 text-neutral-500"/>
        <select className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {TRANSLATION_LANGUAGES.map((l) => (<option key={l} value={l}>
              {l}
            </option>))}
        </select>
        <Button variant="outline" size="sm" onClick={run} disabled={translate.isPending || !text.trim()}>
          {translate.isPending ? 'Translating…' : 'Translate'}
        </Button>
      </div>
      {translate.isError && <p className="text-sm text-red-600">{translate.error.message}</p>}
      {translate.data && (<div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
          {translate.data.text}
        </div>)}
    </div>);
}
