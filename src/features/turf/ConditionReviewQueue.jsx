import { ClipboardCheck, Clock, Scale, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { computeEquityAudit, findDisputed, findExpiringTags, findReporterOutliers } from './conditionReview';
import { rollUpAddress, scoreAllAttributes, TAG_LABELS } from './doorAttributes';
import { voterLanguage } from './route';
import { useCanvassVisits } from './useTurf';
import { useDoorAttributes, useSetAttributeStatus } from './useDoorAttributes';
// Condition Review Queue — the governance surface for Door Intelligence
// (turf.manage only). Four sections, all pure math, no AI: this is where a
// manager checks the system's own output rather than acting on it.
export function ConditionReviewQueue({ projectId, voters }) {
    const { data: attributes } = useDoorAttributes(projectId);
    const { data: visits } = useCanvassVisits(projectId);
    const setStatus = useSetAttributeStatus();
    const [retractingId, setRetractingId] = useState(null);
    const [reason, setReason] = useState('');

    const model = useMemo(() => {
        const scored = scoreAllAttributes({ attributes: attributes ?? [], visits: visits ?? [], voters });
        const profiles = [...rollUpAddress(scored).values()];
        return {
            disputed: findDisputed(scored),
            expiring: findExpiringTags(scored),
            reporters: findReporterOutliers(visits ?? []),
            equity: computeEquityAudit({ profiles, voters, languageOf: voterLanguage })
        };
    }, [attributes, visits, voters]);

    if (!attributes)
        return null;

    const act = (attributeId, status) => setStatus.mutate({ attributeId, projectId, status, reason: status === 'retracted' ? reason : undefined }, {
        onSuccess: () => { setRetractingId(null); setReason(''); }
    });

    return (<div className="space-y-3" id="tool-condition-review">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-neutral-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Condition review</h3>
      </div>

      <Section icon={<Scale className="h-4 w-4 text-neutral-500"/>} title="Disputed" empty="Nothing disputed — no logged condition has been contradicted by a later visit." items={model.disputed}>
        {model.disputed.map((s) => (<Row key={s.attribute.id} title={`${TAG_LABELS[s.attribute.tag]} — ${s.attribute.address_key}`} sub={s.reasons.join(' · ')}>
            <Button size="sm" variant="outline" onClick={() => act(s.attribute.id, 'staff_confirmed')} disabled={setStatus.isPending}>
              Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRetractingId(s.attribute.id)} disabled={setStatus.isPending}>
              Retract
            </Button>
          </Row>))}
      </Section>

      {retractingId && (<div className="space-y-2 rounded-lg border border-neutral-300 bg-neutral-50 p-3">
          <p className="text-sm text-neutral-700">
            Retracting keeps the record and the reason — nothing is deleted.
          </p>
          <div className="flex gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this wrong? (required)"/>
            <Button size="sm" onClick={() => act(retractingId, 'retracted')} disabled={!reason.trim() || setStatus.isPending}>
              Retract
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setRetractingId(null); setReason(''); }}>
              Cancel
            </Button>
          </div>
        </div>)}
      {setStatus.isError && <p className="text-sm text-red-600">{setStatus.error.message}</p>}

      <Section icon={<Clock className="h-4 w-4 text-neutral-500"/>} title="Expiring soon" empty="No route-affecting condition is about to lapse." items={model.expiring}>
        {model.expiring.slice(0, 10).map(({ scored: s, daysRemaining }) => (<Row key={s.attribute.id} title={`${TAG_LABELS[s.attribute.tag]} — ${s.attribute.address_key}`} sub={`Drops below route-affecting in ~${daysRemaining} days unless a canvasser sees it again`}/>))}
      </Section>

      <Section icon={<UserCheck className="h-4 w-4 text-neutral-500"/>} title="Worth a conversation" empty="Everyone's tagging rate is in line with the team." items={model.reporters.outliers}>
        <p className="px-1 pb-1 text-xs text-neutral-500">
          Not a performance metric. A high rate usually means a newer volunteer who'd benefit from a
          ride-along, not a problem.
        </p>
        {model.reporters.outliers.map((o) => (<Row key={o.canvasserId} title={o.name} sub={`${o.flagged} of ${o.visits} doors tagged — ${o.timesTeamRate}x the team rate`}/>))}
      </Section>

      <Section icon={<Scale className="h-4 w-4 text-neutral-500"/>} title="Equity audit" empty={model.equity.hasEnoughData
            ? 'No language group is tagged at an unusual rate.'
            : 'Not enough doors logged yet to check this reliably.'} items={model.equity.flagged}>
        {model.equity.flagged.map((g) => (<Row key={g.language} title={`${g.language}-speaking doors`} sub={`${g.flagged} of ${g.doors} tagged (${Math.round(g.rate * 100)}%) — ${g.ratio}x the project baseline of ${Math.round(model.equity.baselineRate * 100)}%`}/>))}
        {model.equity.flagged.length > 0 && (<p className="px-1 pt-1 text-xs text-neutral-500">
            This is a pattern to look into, not a finding. Check whether these doors were walked by
            the same few people, or at unusual hours, before drawing any conclusion.
          </p>)}
      </Section>
    </div>);
}
function Section({ icon, title, empty, items, children }) {
    return (<div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold text-neutral-900">{title}</h4>
        {items.length > 0 && (<span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{items.length}</span>)}
      </div>
      {items.length === 0 ? (<p className="mt-2 text-sm text-neutral-500">{empty}</p>) : (<div className="mt-2 space-y-1.5">{children}</div>)}
    </div>);
}
function Row({ title, sub, children }) {
    return (<div className="flex items-center justify-between gap-3 rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium capitalize text-neutral-900">{title}</p>
        {sub && <p className="truncate text-xs text-neutral-500">{sub}</p>}
      </div>
      {children && <div className="flex shrink-0 gap-1.5">{children}</div>}
    </div>);
}
