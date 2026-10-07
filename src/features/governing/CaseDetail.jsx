import { Copy, MessageSquarePlus, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TranslateBar } from '@/features/ai/TranslateBar';
import { CASE_PRIORITIES, CASE_STATUSES } from './governingMath';
import { useAddCaseUpdate, useCaseUpdates, useConstituentReply, useUpdateCase } from './useGoverning';
const selectClass = 'h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs';
const KIND_LABEL = { note: 'Note', status_change: 'Status', reply_sent: 'Reply sent' };
// One case opened up: status controls, the append-only timeline, an internal
// note box, and (with the AI module) a drafted reply staff edit and send
// from their own email -- Lynx never sends constituent mail itself.
export function CaseDetail({ orgId, projectId, caseRow, members, canManage, aiEnabled }) {
    const update = useUpdateCase();
    const addUpdate = useAddCaseUpdate();
    const { data: updates } = useCaseUpdates(caseRow.id);
    const reply = useConstituentReply();
    const [note, setNote] = useState('');
    const [facts, setFacts] = useState('');
    const [draft, setDraft] = useState(null);
    const patch = (p) => update.mutate({ id: caseRow.id, projectId, patch: p });
    const latestNote = [...(updates ?? [])].reverse().find((u) => u.kind === 'note')?.body;
    const runReply = () => reply.mutate({ orgId, projectId, caseRow, staffFacts: facts, latestNote }, { onSuccess: (d) => setDraft(d) });
    const markSent = () => addUpdate.mutate({ caseId: caseRow.id, kind: 'reply_sent', body: draft?.subject ? `Replied: ${draft.subject}` : 'Reply sent' });
    return (<div className="space-y-3 border-t border-neutral-100 bg-neutral-50 p-4">
      <div className="text-xs text-neutral-600">
        <p className="whitespace-pre-wrap">{caseRow.details}</p>
        <p className="mt-1 text-neutral-400">
          {[caseRow.contact_email, caseRow.contact_phone].filter(Boolean).join(' · ') || 'No contact details logged'}
        </p>
      </div>

      {canManage && (<div className="flex flex-wrap items-center gap-2">
          <select aria-label="Status" className={selectClass} value={caseRow.status} onChange={(e) => patch({ status: e.target.value })}>
            {CASE_STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
          <select aria-label="Priority" className={selectClass} value={caseRow.priority} onChange={(e) => patch({ priority: e.target.value })}>
            {CASE_PRIORITIES.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
          <select aria-label="Assigned to" className={selectClass} value={caseRow.assigned_to ?? ''} onChange={(e) => patch({ assigned_to: e.target.value || null })}>
            <option value="">Unassigned</option>
            {members?.map((m) => (<option key={m.profile_id} value={m.profile_id}>{m.full_name}</option>))}
          </select>
          <Input type="date" aria-label="Respond by" className="h-8 w-36 text-xs" value={caseRow.due_on ?? ''} onChange={(e) => patch({ due_on: e.target.value || null })}/>
          {update.isError && <span className="text-xs text-red-600">{update.error.message}</span>}
        </div>)}

      <div className="space-y-1">
        <p className="text-xs font-semibold text-neutral-700">Timeline</p>
        {(updates ?? []).length === 0 && <p className="text-xs text-neutral-400">Nothing logged yet.</p>}
        {(updates ?? []).map((u) => (<div key={u.id} className="text-xs text-neutral-600">
            <span className="font-medium text-neutral-800">{KIND_LABEL[u.kind]}</span>
            {' · '}
            {new Date(u.created_at).toLocaleString()}
            {u.author ? ` · ${u.author.full_name || u.author.email}` : ''}
            <span className="block whitespace-pre-wrap pl-2 text-neutral-600">{u.body}</span>
          </div>))}
      </div>

      {canManage && (<div className="flex gap-2">
          <Input className="h-8 text-xs" placeholder="Internal note (e.g. Called the county, ticket #4471)" value={note} onChange={(e) => setNote(e.target.value)}/>
          <Button size="sm" variant="outline" disabled={!note.trim() || addUpdate.isPending} onClick={() => addUpdate.mutate({ caseId: caseRow.id, body: note }, { onSuccess: () => setNote('') })}>
            <MessageSquarePlus className="h-3.5 w-3.5"/>
            Add note
          </Button>
        </div>)}

      {canManage && aiEnabled && (<div className="space-y-2 rounded-md border border-emerald-200 bg-white p-3">
          <p className="text-xs font-semibold text-neutral-800">Draft a reply</p>
          <textarea rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-xs" placeholder="Facts to include, in your words (e.g. Public Works scheduled the repair for Oct 9). Leave blank for an acknowledgment." value={facts} onChange={(e) => setFacts(e.target.value)}/>
          <Button size="sm" onClick={runReply} disabled={reply.isPending}>
            <Sparkles className="h-3.5 w-3.5"/>
            {reply.isPending ? 'Drafting…' : 'Draft reply'}
          </Button>
          {reply.isError && <p className="text-xs text-red-600">{reply.error.message}</p>}
          {draft && (<div className="space-y-2">
              <p className="text-xs font-medium text-neutral-800">Subject: {draft.subject}</p>
              <textarea rows={8} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-xs" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}/>
              {draft.promises_to_avoid?.length > 0 && (<ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">
                  {draft.promises_to_avoid.map((p) => (<li key={p}>{p}</li>))}
                </ul>)}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(`${draft.subject}\n\n${draft.body}`)}>
                  <Copy className="h-3.5 w-3.5"/>
                  Copy
                </Button>
                <Button size="sm" variant="outline" onClick={markSent} disabled={addUpdate.isPending}>
                  <Send className="h-3.5 w-3.5"/>
                  I sent it — log to timeline
                </Button>
              </div>
              <TranslateBar orgId={orgId} projectId={projectId} text={draft.body}/>
            </div>)}
        </div>)}
    </div>);
}
