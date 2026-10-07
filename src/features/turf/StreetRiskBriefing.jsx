import { AlertTriangle, DoorClosed, KeyRound, Route, ShieldAlert, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { buildVoterAddressIndex, rollUpAddress, scoreAllAttributes, TAG_LABELS } from './doorAttributes';
import { streetName } from './neighborhoodProof';
import { optimizeWalkOrder } from './route';
import { buildConditionSnapshot, countDoorsByStreet, findSafetyAdvisories, rollUpStreet } from './streetRisk';
import { useCanvassVisits } from './useTurf';
import { useDoorAttributes } from './useDoorAttributes';
import { applyHardExclusions } from './walkListFilter';
import { computeProjectPaceStats, estimateCompletion, formatDuration } from './walkListEta';
import { projectMedianDensity, scoreWalkList } from './walkListScore';
// Street Risk & Access — the manager-facing half of Door Intelligence. Every
// number on this page is computed by the pure modules (doorAttributes.ts,
// streetRisk.ts, walkList*.ts); the AI only ever narrates numbers that already
// exist, and only ever receives the aggregate snapshot streetRisk.ts builds.
//
// `voters` arrives already filtered by the page's city/ward picker, exactly
// like every other Turf Briefing section, so the filter reaches here too.
export function StreetRiskBriefing({ orgId, projectId, voters, canUseAi }) {
    const briefingAi = useAiAssist();
    const accessAi = useAiAssist();
    const safetyAi = useAiAssist();
    const { data: attributes } = useDoorAttributes(projectId);
    const { data: visits } = useCanvassVisits(projectId);
    const [briefing, setBriefing] = useState(null);
    const [accessPlan, setAccessPlan] = useState(null);
    const [accessFor, setAccessFor] = useState(null);
    const [advisory, setAdvisory] = useState(null);
    const [advisoryFor, setAdvisoryFor] = useState(null);

    const model = useMemo(() => {
        const scored = scoreAllAttributes({
            attributes: attributes ?? [],
            visits: visits ?? [],
            voters
        });
        const profilesByAddress = rollUpAddress(scored);
        const profiles = [...profilesByAddress.values()];
        const streets = rollUpStreet(profiles, countDoorsByStreet(voters, streetName));
        const { included, excluded } = applyHardExclusions(voters, profilesByAddress);
        const walk = optimizeWalkOrder(included);
        const addressOf = buildVoterAddressIndex(voters);
        const paceStats = computeProjectPaceStats(visits ?? [], addressOf, profilesByAddress);
        const doors = included.map((v) => ({ addressKey: addressOf.get(v.id) ?? null }));
        return {
            scored,
            profilesByAddress,
            profiles,
            streets,
            included,
            excluded,
            walk,
            paceStats,
            score: scoreWalkList({
                doors: included,
                profilesByAddress,
                pathMeters: walk.meters,
                projectMedianMinutes: paceStats.overall.median,
                projectMedianDensity: projectMedianDensity([walk])
            }),
            eta: estimateCompletion({ doors, profilesByAddress, pathMeters: walk.meters, paceStats })
        };
    }, [attributes, visits, voters]);

    const advisories = useMemo(() => findSafetyAdvisories(model.streets), [model.streets]);
    const taggedDoors = model.profiles.length;

    // The one place a door-condition payload is built for the model. The
    // k-anonymity floor and the no-PII rule live inside buildConditionSnapshot,
    // so there is deliberately no other way to assemble one.
    const runBriefing = () => {
        setBriefing(null);
        briefingAi.mutate({
            orgId,
            projectId,
            purpose: 'door_condition_briefing',
            context: JSON.stringify(buildConditionSnapshot({
                streets: model.streets,
                profiles: model.profiles,
                doorCount: voters.length,
                paceStats: model.paceStats
            }))
        }, { onSuccess: (r) => setBriefing(extractJson(r.text)) });
    };

    const runAccessPlan = (street) => {
        setAccessFor(street.streetKey);
        setAccessPlan(null);
        accessAi.mutate({
            orgId,
            projectId,
            purpose: 'access_constraint_plan',
            context: JSON.stringify({
                constraintType: street.dominantConstraint,
                street: street.streetKey,
                doorsBehindConstraint: street.doorCount,
                accessFriction: street.accessFriction
            })
        }, { onSuccess: (r) => setAccessPlan(extractJson(r.text)) });
    };

    const runAdvisory = (item) => {
        setAdvisoryFor(item.street);
        setAdvisory(null);
        safetyAi.mutate({
            orgId,
            projectId,
            purpose: 'safety_cluster_advisory',
            context: JSON.stringify(item)
        }, { onSuccess: (r) => setAdvisory(extractJson(r.text)) });
    };

    if (!attributes)
        return null;

    return (<div className="space-y-3" id="tool-door-intelligence">
      <div className="flex items-center gap-2">
        <DoorClosed className="h-4 w-4 text-sky-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Street risk &amp; access</h3>
        <span className="text-xs text-neutral-400">
          From {taggedDoors} door{taggedDoors === 1 ? '' : 's'} your canvassers have tagged
        </span>
      </div>

      {taggedDoors === 0 ? (<p className="rounded-lg border border-dashed border-neutral-200 bg-white p-4 text-sm text-neutral-500">
          No door conditions logged yet. Canvassers add them from the Ballot chase table — gates,
          buildings, dogs, and anything that made a door hard or unsafe to reach. This section fills
          in as they do.
        </p>) : (<>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Doors tagged" value={taggedDoors} sub={`of ${voters.length} in view`}/>
            <Stat label="Excluded from routes" value={model.excluded.length} sub="posted or confirmed unsafe" tone={model.excluded.length > 0 ? 'red' : 'neutral'}/>
            <Stat label="Walk-list grade" value={model.score.grade} sub={`safety ${model.score.safety} · access ${model.score.access ?? '—'} · density ${model.score.density ?? '—'}`} tone={model.score.grade === 'REVIEW' ? 'red' : 'emerald'}/>
            <Stat label="Estimated time" value={formatDuration(model.eta.totalMinutes)} sub={model.eta.totalMinutes === null ? 'needs more logged visits' : `${model.included.length} doors, ${(model.walk.meters / 1000).toFixed(1)} km`}/>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-neutral-500"/>
              <h4 className="text-sm font-semibold text-neutral-900">Why this route scores what it does</h4>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-neutral-600">
              {model.score.reasons.map((r) => <li key={r}>• {r}</li>)}
            </ul>
            {model.excluded.length > 0 && (<details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-neutral-500">
                  {model.excluded.length} door{model.excluded.length === 1 ? '' : 's'} removed from this walk list
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-neutral-600">
                  {model.excluded.slice(0, 20).map((e) => (<li key={e.voter.id}>
                      <span className="font-medium">{e.voter.address_line || e.voter.full_name}</span> — {e.reason}
                    </li>))}
                </ul>
              </details>)}
          </div>

          {model.streets.length > 0 && (<div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2">Street</th>
                    <th className="px-4 py-2">Doors</th>
                    <th className="px-4 py-2">Main constraint</th>
                    <th className="px-4 py-2">Added time</th>
                    <th className="px-4 py-2"/>
                  </tr>
                </thead>
                <tbody>
                  {model.streets.slice(0, 8).map((s) => (<tr key={s.streetKey} className="border-t border-neutral-100">
                      <td className="px-4 py-2 capitalize">{s.streetKey}</td>
                      <td className="px-4 py-2 tabular-nums">{s.doorCount}</td>
                      <td className="px-4 py-2">
                        {s.dominantConstraint ? TAG_LABELS[s.dominantConstraint] : <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{s.frictionMinutes > 0 ? `~${Math.round(s.frictionMinutes)} min` : '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {canUseAi && s.dominantConstraint && (<Button size="sm" variant="outline" onClick={() => runAccessPlan(s)} disabled={accessAi.isPending}>
                            <KeyRound className="mr-1 h-3 w-3"/>
                            {accessAi.isPending && accessFor === s.streetKey ? 'Planning…' : 'Access plan'}
                          </Button>)}
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>)}

          {accessPlan && (<div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm">
              <p className="font-semibold capitalize text-sky-900">Access plan — {accessFor}</p>
              <p className="text-sky-900">{accessPlan.approach}</p>
              <ol className="ml-4 list-decimal space-y-1 text-sky-900">
                {(accessPlan.steps ?? []).map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <p className="rounded-md bg-white p-2 text-neutral-800"><span className="font-medium">Say: </span>{accessPlan.ask_script}</p>
              <p className="text-sky-900"><span className="font-medium">If refused: </span>{accessPlan.if_refused}</p>
              <p className="text-xs text-sky-700">{accessPlan.expected_yield}</p>
            </div>)}
          {accessAi.isError && <p className="text-sm text-red-600">{accessAi.error.message}</p>}

          {advisories.length > 0 && (<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-700"/>
                <h4 className="text-sm font-semibold text-amber-900">Safety check</h4>
              </div>
              {advisories.map((a) => (<div key={a.street} className="flex items-center justify-between gap-3 text-sm text-amber-900">
                  <span className="capitalize">
                    {a.street} — {a.safetyDoors} of {a.totalDoors} doors, reported by {a.distinctReporters} canvassers
                  </span>
                  {canUseAi && (<Button size="sm" variant="outline" onClick={() => runAdvisory(a)} disabled={safetyAi.isPending}>
                      {safetyAi.isPending && advisoryFor === a.street ? 'Writing…' : 'Advisory'}
                    </Button>)}
                </div>))}
              <p className="text-xs text-amber-700">
                These are your own volunteers' impressions of brief interactions, not verified facts
                about the people who live there.
              </p>
            </div>)}

          {advisory && (<div className="space-y-2 rounded-lg border border-amber-300 bg-white p-4 text-sm">
              <p className="font-semibold capitalize text-neutral-900">Advisory — {advisoryFor}</p>
              <p className="text-neutral-800">{advisory.summary}</p>
              <ul className="ml-4 list-disc space-y-1 text-neutral-800">
                {(advisory.precautions ?? []).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <p className="text-neutral-800"><span className="font-medium">Check it: </span>{advisory.verification_step}</p>
              <p className="text-xs text-neutral-500">{advisory.tone_check}</p>
            </div>)}
          {safetyAi.isError && <p className="text-sm text-red-600">{safetyAi.error.message}</p>}

          {canUseAi && (<div className="space-y-2 rounded-lg border border-violet-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-600"/>
                  <h4 className="text-sm font-semibold text-neutral-900">Access &amp; safety briefing</h4>
                </div>
                <Button size="sm" onClick={runBriefing} disabled={briefingAi.isPending}>
                  {briefingAi.isPending ? 'Briefing…' : 'Brief me'}
                </Button>
              </div>
              <p className="text-xs text-neutral-500">
                Street-level only — no names, addresses, or notes leave the app.
              </p>
              {briefingAi.isError && <p className="text-sm text-red-600">{briefingAi.error.message}</p>}
              {briefing && (<div className="space-y-2 text-sm">
                  <p className="font-medium text-neutral-900">{briefing.headline}</p>
                  {(briefing.street_notes ?? []).map((n, i) => (<div key={i} className="rounded-md border border-neutral-200 bg-neutral-50 p-2">
                      <p className="font-medium capitalize text-neutral-900">{n.street}</p>
                      <p className="text-neutral-600">{n.condition}</p>
                      <p className="text-neutral-800">→ {n.instruction}</p>
                    </div>))}
                  <p className="flex items-start gap-1.5 text-neutral-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"/>
                    {briefing.pairing_advice}
                  </p>
                  <p className="text-xs text-neutral-500">{briefing.time_impact}</p>
                </div>)}
            </div>)}
        </>)}
    </div>);
}
function Stat({ label, value, sub, tone = 'neutral' }) {
    const toneClass = {
        neutral: 'border-neutral-200 bg-white text-neutral-900',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        red: 'border-red-200 bg-red-50 text-red-900'
    }[tone];
    return (<div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs opacity-70">{sub}</p>}
    </div>);
}
