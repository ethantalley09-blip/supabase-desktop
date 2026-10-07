import { Inbox, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CASE_CATEGORIES, CASE_PRIORITIES, CASE_SOURCES } from './governingMath';
import { useCreateCase } from './useGoverning';
const EMPTY = { constituentName: '', contactEmail: '', contactPhone: '', category: 'casework', source: 'email', subject: '', details: '', priority: 'normal', dueOn: '' };
const selectClass = 'h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm';
// Log a constituent contact as a case. Everything typed here is personal
// and stays in-app: the AI reply drafter only ever sees the first name and
// what the constituent wrote (buildReplyContext).
export function CaseIntake({ orgId, projectId }) {
    const create = useCreateCase();
    const [form, setForm] = useState(EMPTY);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const ready = form.constituentName.trim() && form.subject.trim() && form.details.trim();
    const submit = () => {
        if (!ready)
            return;
        create.mutate({ orgId, projectId, ...form }, { onSuccess: () => setForm(EMPTY) });
    };
    return (<div className="space-y-3 rounded-lg border border-emerald-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-emerald-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Log a constituent contact</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Someone called, emailed, or stopped by the office. Log it here so it gets a response and
        nothing falls through the cracks.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Constituent name" value={form.constituentName} onChange={set('constituentName')}/>
        <Input type="email" placeholder="Email (optional)" value={form.contactEmail} onChange={set('contactEmail')}/>
        <Input placeholder="Phone (optional)" value={form.contactPhone} onChange={set('contactPhone')}/>
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Category" className={selectClass} value={form.category} onChange={set('category')}>
          {CASE_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
        </select>
        <select aria-label="Source" className={selectClass} value={form.source} onChange={set('source')}>
          {CASE_SOURCES.map((s) => (<option key={s.value} value={s.value}>via {s.label}</option>))}
        </select>
        <select aria-label="Priority" className={selectClass} value={form.priority} onChange={set('priority')}>
          {CASE_PRIORITIES.map((p) => (<option key={p} value={p}>{p} priority</option>))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Respond by
          <Input type="date" className="w-40" value={form.dueOn} onChange={set('dueOn')}/>
        </label>
      </div>
      <Input placeholder="Subject (e.g. Pothole on Elm St, VA benefits delay)" value={form.subject} onChange={set('subject')}/>
      <textarea rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="What did they ask for or say? Use their words where you can." value={form.details} onChange={set('details')}/>
      <Button size="sm" onClick={submit} disabled={create.isPending || !ready}>
        <Plus className="h-4 w-4"/>
        {create.isPending ? 'Saving…' : 'Open case'}
      </Button>
      {create.isError && <p className="text-sm text-red-600">{create.error.message}</p>}
    </div>);
}
