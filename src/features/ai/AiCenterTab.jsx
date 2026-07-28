import { Compass, MessageSquare, Search, Sparkles, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buildFundraisingSnapshot, COMPLIANCE_THRESHOLD_CENTS, useDonationTotal, useDonations } from '@/features/fundraising/useFundraising';
import { buildTurfSnapshot, dominantVoterLanguage, useCanvassVisits, useSurveyResponses, useTerritories, useVoterRecords } from '@/features/turf/useTurf';
import { computeGeocodeHealth } from '@/features/turf/geocodeHealth';
import { useAvailableTools } from '@/features/rbac/useAvailableTools';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { AiDashboard } from './AiDashboard';
import { buildCannedAnswers } from './cannedAnswers';
import { assessConfidence, buildFollowUpInstructions, buildScopeLine, FOLLOW_UP_PROMPTS } from './conversationContext';
import { useAdvisorSocialPosts } from './advisorData';
import { answerAnswerChoiceSkew, answerAvgDoorsPerCanvasserToday, answerBestContactRateTerritory, answerBestDayOfWeek, answerBestPerformingPost, answerBestTimeToKnock, answerSkipADayImpact, answerCanvasserMomentum, answerCanvasserWellbeing, answerCoachingPairs, answerCurrentDoorScript, answerCurrentSurveyQuestions, answerDonorConcentration, answerDonorGrowthVsAverageGift, answerDonorRepeatShare, answerDoorsKnockedToday, answerDoorstepAttribution, answerFundraisingPace, answerHardestTerritory, answerLodgingCost, answerNextTerritoryToCanvass, answerPaymentMethodBreakdown, answerPersuasionDrift, answerPostingFrequency, answerRevisitCandidates, answerSocialPerformance, answerSurveyAbandonment, answerSurveyCompletion, answerTeamContactRate, answerTerritorySupportBreakdown, answerTodaysContactRate, answerTodaysStaffing, answerTodayVsBaseline, answerTopCanvasser, answerTopCanvasserThisWeek, answerTopFundraiser, answerUnattemptedDoors, answerWalkbookSizeOutliers, answerWeekendVsWeekday, answerWeeklySocialReach, answerWorstContactRateTerritory, computeAverageDailyDoors, computeFundraisingPace, describeContactRateDropAlert, describeDataFreshnessAlert, describeFundraisingMomentumAlert, scenarioAdjustPace } from './advisorInsights';
import { quickPromptsForCategories } from './roleQuickPrompts';
import { useHotelBookings, useShifts } from '@/features/staffing/useStaffing';
import { useCampaignScripts, useCreateScript } from '@/features/scripts/useScripts';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { CampaignCommandCenter } from './CampaignCommandCenter';
import { ContentPack } from './ContentPack';
import { RefineBar } from './RefineBar';
import { SmartSegments } from './SmartSegments';
import { TranslateBar } from './TranslateBar';
const STUDIO_KINDS = [
    { value: 'broadcast', label: 'Team broadcast' },
    { value: 'canvassing_script', label: 'Canvassing script' },
    { value: 'relational_text', label: 'Personal text' }
];
const TONES = ['Warm', 'Urgent', 'Casual', 'Formal'];
// The AI Center — one hub for the campaign's own-data AI tools. Everything here
// runs on first-party data (this project's voters, territories, and donations),
// summarized into an aggregate snapshot; no raw rows leave the app. Rendered
// only when the org has the ai_module entitlement AND the viewer has ai.use
// (gated in ProjectDetailsPage).
export function AiCenterTab({ project, onOpenTool }) {
    const { tools } = useAvailableTools(project.org_id);
    const has = (id) => tools.some((t) => t.id === id);
    const { data: voters } = useVoterRecords(project.id);
    const { data: territories } = useTerritories(project.id);
    const fundraisingEnt = useEntitlement(project.org_id, 'fundraising_module', project.id);
    const { data: donations } = useDonations(project.id);
    const { data: donationTotal } = useDonationTotal(project.id);
    const { data: canvassVisits } = useCanvassVisits(project.id);
    const { data: socialPosts } = useAdvisorSocialPosts(project.id);
    const { data: shifts } = useShifts(project.id);
    const { data: hotelBookings } = useHotelBookings(project.id);
    const { data: campaignScripts } = useCampaignScripts(project.id);
    const { data: surveyResponses } = useSurveyResponses(project.id);
    const canManageScripts = useHasPermission(project.org_id, 'turf.manage');
    const ask = useAiAssist();
    const coach = useAiAssist();
    const studio = useAiAssist();
    const [question, setQuestion] = useState('');
    const [thread, setThread] = useState([]);
    const [studioKind, setStudioKind] = useState('broadcast');
    const [studioTone, setStudioTone] = useState(TONES[0]);
    const [studioBrief, setStudioBrief] = useState('');
    const [studioText, setStudioText] = useState(''); // current draft (refinable)
    const [copied, setCopied] = useState(false);
    const [scenarioGoalDollars, setScenarioGoalDollars] = useState(500);
    const [scenarioPaceChangePct, setScenarioPaceChangePct] = useState(10);
    // Combined project snapshot: turf always, fundraising only when the project
    // has that paid module (otherwise the donations query is RLS-empty anyway).
    // Kept as real objects (not just the stringified form) so the fixed
    // question bank below can query them directly instead of asking the AI.
    const turfSnapshot = useMemo(() => buildTurfSnapshot(voters ?? [], territories ?? []), [voters, territories]);
    const fundraisingSnapshot = useMemo(() => fundraisingEnt.data
        ? buildFundraisingSnapshot(donations ?? [], donationTotal ?? 0, COMPLIANCE_THRESHOLD_CENTS)
        : undefined, [donations, donationTotal, fundraisingEnt.data]);
    const snapshot = useMemo(() => JSON.stringify({ turf: turfSnapshot, fundraising: fundraisingSnapshot }), [turfSnapshot, fundraisingSnapshot]);
    // The fixed question bank, translated into real data queries over the
    // snapshots above — each renders instantly with real project-specific
    // evidence instead of waiting on an AI call. Free-text questions (the
    // Input below) still go through the `data_qa` AI purpose unchanged.
    const cannedAnswers = useMemo(() => buildCannedAnswers({
        turf: turfSnapshot,
        fundraising: fundraisingSnapshot,
        geocode: computeGeocodeHealth(voters ?? [])
    }), [turfSnapshot, fundraisingSnapshot, voters]);
    // Default the translator to the electorate's dominant non-English language,
    // detected from the imported voter file.
    const dominantLanguage = useMemo(() => dominantVoterLanguage(voters ?? []), [voters]);
    // Honest, non-AI reads on what backs an answer right now — computed once
    // per snapshot change, shown once above the conversation rather than
    // repeated on every turn.
    const scopeLine = useMemo(() => buildScopeLine(turfSnapshot, fundraisingSnapshot), [turfSnapshot, fundraisingSnapshot]);
    const confidence = useMemo(() => assessConfidence(turfSnapshot), [turfSnapshot]);
    // Role-tailored quick-question chips (approximates "role-specific quick
    // questions" from the advisor spec) — driven by which tool categories this
    // viewer's permissions actually unlock, since no hook exposes their literal
    // role name here.
    const quickPrompts = useMemo(() => quickPromptsForCategories(tools.map((t) => t.category)), [tools]);
    // Advisor Insights: canvassing performance + turf rankings, reusing the
    // same pure math Turf Briefing already computes from the real visit log —
    // just reformatted as advisor Q&A.
    const advisorCanvassing = useMemo(() => {
        const visits = canvassVisits ?? [];
        const shiftRows = (shifts ?? []).map((s) => ({ profile_id: s.profile_id, shift_date: s.shift_date, team_name: s.team_name }));
        return [
            answerDoorsKnockedToday(visits),
            answerTodaysContactRate(visits),
            answerAvgDoorsPerCanvasserToday(visits),
            answerTopCanvasser(visits),
            answerTopCanvasserThisWeek(visits),
            answerCanvasserMomentum(visits),
            answerTeamContactRate(visits, shiftRows),
            answerBestTimeToKnock(visits),
            answerBestDayOfWeek(visits),
            answerWeekendVsWeekday(visits),
            answerHardestTerritory(voters ?? [], visits, territories ?? []),
            answerPersuasionDrift(visits),
            answerCanvasserWellbeing(visits),
            answerCoachingPairs(visits),
            answerTodayVsBaseline(visits),
            answerSkipADayImpact(visits)
        ];
    }, [canvassVisits, voters, territories, shifts]);
    // Turf/geography (§7) — a separate group from canvassing performance,
    // matching the source doc's own section split.
    const advisorTurf = useMemo(() => {
        const visits = canvassVisits ?? [];
        const votersList = voters ?? [];
        const territoriesList = territories ?? [];
        return [
            answerBestContactRateTerritory(votersList, visits, territoriesList),
            answerWorstContactRateTerritory(votersList, visits, territoriesList),
            answerNextTerritoryToCanvass(votersList, territoriesList),
            answerTerritorySupportBreakdown(votersList, visits, territoriesList),
            answerWalkbookSizeOutliers(votersList, territoriesList),
            answerUnattemptedDoors(votersList, visits),
            answerRevisitCandidates(votersList, visits)
        ];
    }, [canvassVisits, voters, territories]);
    const advisorSocial = useMemo(() => [
        answerSocialPerformance(socialPosts ?? []),
        answerWeeklySocialReach(socialPosts ?? []),
        answerBestPerformingPost(socialPosts ?? []),
        answerPostingFrequency(socialPosts ?? [])
    ], [socialPosts]);
    const dataFreshnessAlert = useMemo(() => describeDataFreshnessAlert(canvassVisits ?? []), [canvassVisits]);
    const contactRateDropAlert = useMemo(() => describeContactRateDropAlert(canvassVisits ?? []), [canvassVisits]);
    // Fundraising pace/forecast + doorstep attribution — gated the same way as
    // every other fundraising-dependent answer (undefined module -> RLS-empty
    // donations anyway, but the explicit check keeps the message accurate).
    const fundraisingPace = useMemo(() => computeFundraisingPace(donations ?? []), [donations]);
    const momentumAlert = useMemo(() => describeFundraisingMomentumAlert(fundraisingPace), [fundraisingPace]);
    const advisorFundraising = useMemo(() => fundraisingEnt.data
        ? [
            answerFundraisingPace(donations ?? []),
            answerDoorstepAttribution(donations ?? []),
            answerTopFundraiser(donations ?? []),
            answerPaymentMethodBreakdown(donations ?? []),
            answerDonorGrowthVsAverageGift(donations ?? []),
            answerDonorConcentration(donations ?? []),
            answerDonorRepeatShare(donations ?? [])
        ]
        : [], [fundraisingEnt.data, donations]);
    // Staffing (§9) + Logistics (§11) — migration 0033_staffing_logistics.sql.
    // RLS already degrades gracefully for a viewer without hr.view (shifts:
    // their own rows only; hotel_bookings: empty), so no extra gating needed
    // here beyond what the query itself returns.
    const todayDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const advisorStaffing = useMemo(() => {
        const shiftRows = (shifts ?? []).map((s) => ({
            profile_id: s.profile_id,
            profile_name: s.profiles?.full_name || s.profiles?.email || null,
            shift_date: s.shift_date,
            status: s.status,
            team_name: s.team_name
        }));
        return [answerTodaysStaffing(shiftRows, todayDate), answerLodgingCost(hotelBookings ?? [])];
    }, [shifts, hotelBookings, todayDate]);
    // Survey/script (§8, items 1-2) — migration 0034_campaign_scripts.sql.
    const scriptEntries = useMemo(() => (campaignScripts ?? []).map((s) => ({ id: s.id, kind: s.kind, content: s.content, sortOrder: s.sort_order, active: s.active, choices: s.choices })), [campaignScripts]);
    // Survey/script §8 [Derived]-tier remainder — completion rate, abandonment,
    // answer-choice skew — migration 0035_survey_responses.sql.
    const activeSurveyQuestions = useMemo(() => scriptEntries.filter((s) => s.kind === 'survey_question' && s.active), [scriptEntries]);
    const advisorScripts = useMemo(() => [
        answerCurrentDoorScript(scriptEntries),
        answerCurrentSurveyQuestions(scriptEntries),
        answerSurveyCompletion(canvassVisits ?? [], surveyResponses ?? [], activeSurveyQuestions),
        answerSurveyAbandonment(canvassVisits ?? [], surveyResponses ?? [], activeSurveyQuestions),
        answerAnswerChoiceSkew(surveyResponses ?? [], activeSurveyQuestions)
    ], [scriptEntries, activeSurveyQuestions, canvassVisits, surveyResponses]);
    const createScript = useCreateScript();
    const [newDoorScript, setNewDoorScript] = useState('');
    const [newSurveyQuestion, setNewSurveyQuestion] = useState('');
    // Optional comma-separated choices — a structured (multiple-choice)
    // question, needed for answer-choice skew; left blank, the question
    // stays open-ended text (surveyAnalytics.js honestly excludes those from
    // skew rather than inventing buckets for free text).
    const [newSurveyChoices, setNewSurveyChoices] = useState('');
    // "What if our pace changes X%?" scenario simulator (§20 of the advisor
    // spec) — pure math over the real current daily rate, no AI call.
    const scenario = useMemo(() => scenarioAdjustPace(fundraisingPace.dailyAverageCents, Math.max(0, scenarioGoalDollars * 100 - (donationTotal ?? 0)), scenarioPaceChangePct), [fundraisingPace, scenarioGoalDollars, scenarioPaceChangePct, donationTotal]);
    // Canvassing-pace analog of the simulator above — same math, a real doors/
    // day rate instead of dollars/day. "Doors remaining" is a plain number the
    // user types in (no persisted door goal exists in this app, same
    // limitation as the fundraising simulator's goal-$ input).
    const [scenarioDoorsRemaining, setScenarioDoorsRemaining] = useState(500);
    const [scenarioDoorsPaceChangePct, setScenarioDoorsPaceChangePct] = useState(10);
    const avgDailyDoors = useMemo(() => computeAverageDailyDoors(canvassVisits ?? []), [canvassVisits]);
    const doorsScenario = useMemo(() => scenarioAdjustPace(avgDailyDoors, scenarioDoorsRemaining, scenarioDoorsPaceChangePct), [avgDailyDoors, scenarioDoorsRemaining, scenarioDoorsPaceChangePct]);
    // The free-text advisor is a real conversation, not single-shot Q&A: each
    // new question is stitched with the last couple of turns (buildFollowUpInstructions)
    // so "Why does that matter?" resolves against what was just said, and every
    // answer lands in `thread` instead of overwriting the last one.
    const runAsk = (q) => {
        const text = q.trim();
        if (!text)
            return;
        setQuestion('');
        const instructions = buildFollowUpInstructions(text, thread);
        ask.mutate({ orgId: project.org_id, projectId: project.id, purpose: 'data_qa', instructions, context: snapshot }, {
            onSuccess: (data) => setThread((t) => [...t, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, question: text, answer: data.text }])
        });
    };
    const runStudio = () => studio.mutate({
        orgId: project.org_id,
        projectId: project.id,
        purpose: studioKind,
        tone: studioTone,
        instructions: studioBrief.trim() || 'A brief, on-message update.'
    }, { onSuccess: (data) => setStudioText(data.text) });
    const copyStudio = async () => {
        if (!studioText)
            return;
        await navigator.clipboard.writeText(studioText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (<div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-violet-600"/>
        <h2 className="text-base font-semibold text-neutral-900">AI Center</h2>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
          Premium
        </span>
      </div>
      <p className="text-sm text-neutral-500">
        Your campaign's AI toolkit, all in one place. Everything here works off this project's own
        data — nothing is shared outside your organization.
      </p>

      {/* Per-role dashboard: category tabs + drag-and-drop arrangement */}
      <AiDashboard orgId={project.org_id} onOpenTool={onOpenTool}/>

      <CampaignCommandCenter voters={voters ?? []} territories={territories ?? []} donations={donations ?? []} totalCents={donationTotal ?? 0}/>

      {/* Ask your data */}
      {has('ask_data') && (<div id="tool-ask_data">
      <Card icon={<Search className="h-4 w-4 text-violet-600"/>} title="Ask your data">
        <p className="text-xs text-neutral-500">
          Ask anything about your voters and fundraising in plain English — no filters to build. Ask a follow-up
          any time — it remembers what you just asked.
        </p>
        <p className="text-xs text-neutral-400">
          {scopeLine} Data confidence:{' '}
          <span className={confidence.level === 'high'
                ? 'font-medium text-emerald-600'
                : confidence.level === 'moderate'
                    ? 'font-medium text-amber-600'
                    : 'font-medium text-red-600'}>
            {confidence.level}
          </span>{' '}
          ({confidence.reason}).
        </p>
        {quickPrompts.length > 0 && (<div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt) => (<button key={prompt} type="button" onClick={() => runAsk(prompt)} disabled={ask.isPending} className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">
                {prompt}
              </button>))}
          </div>)}
        <div className="flex gap-2">
          <Input placeholder="e.g. How many voters in Ward 3 haven't been contacted?" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runAsk(question)}/>
          <Button size="sm" onClick={() => runAsk(question)} disabled={ask.isPending || !question.trim()}>
            {ask.isPending ? 'Asking…' : 'Ask'}
          </Button>
        </div>
        {ask.isError && <p className="text-sm text-red-600">{ask.error.message}</p>}

        {thread.length > 0 && (<div className="space-y-3">
            {thread.map((turn) => (<div key={turn.id} className="space-y-1.5">
                <p className="text-xs font-medium text-neutral-500">You asked: {turn.question}</p>
                <Answer>{turn.answer}</Answer>
                <div className="flex flex-wrap gap-1.5">
                  {FOLLOW_UP_PROMPTS.map((prompt) => (<button key={prompt} type="button" onClick={() => runAsk(prompt)} disabled={ask.isPending} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                      {prompt}
                    </button>))}
                </div>
              </div>))}
            <button type="button" onClick={() => setThread([])} className="text-xs text-neutral-400 hover:underline">
              Start a new conversation
            </button>
          </div>)}

        <div className="space-y-2 border-t border-neutral-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quick answers</p>
          {cannedAnswers.map((a) => (<div key={a.id} className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
              <p className="text-xs font-medium text-neutral-900">{a.question}</p>
              <p className="text-xs text-neutral-700">{a.answer}</p>
              {a.evidence.length > 0 && (<p className="text-xs text-neutral-400">{a.evidence.join(' · ')}</p>)}
              <button type="button" onClick={() => runAsk(a.question)} disabled={ask.isPending} className="mt-1 text-xs text-violet-600 hover:underline disabled:opacity-50">
                Ask AI to elaborate →
              </button>
            </div>))}
        </div>
      </Card>
      </div>)}

      {/* Advisor Insights — real canvassing performance, turf rankings,
            fundraising pace, and social reach, plus a pace "what if" simulator.
            Reuses the same pure math Turf Briefing already computes from the
            real visit log; nothing here is a new data source. */}
      {has('advisor_insights') && (<div id="tool-advisor_insights">
      <Card icon={<TrendingUp className="h-4 w-4 text-violet-600"/>} title="Advisor Insights">
        <p className="text-xs text-neutral-500">
          Deeper answers from real logged data — canvassing performance, territory rankings, fundraising
          pace, and social reach — plus a "what if our pace changes" simulator.
        </p>
        {momentumAlert && (<p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{momentumAlert}</p>)}
        {dataFreshnessAlert && (<p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{dataFreshnessAlert}</p>)}
        {contactRateDropAlert && (<p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{contactRateDropAlert}</p>)}
        <div className="space-y-2">
          {[...advisorCanvassing, ...advisorTurf, ...advisorSocial, ...advisorFundraising, ...advisorStaffing, ...advisorScripts].map((a) => (<div key={a.id} className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
              <p className="text-xs font-medium text-neutral-900">{a.question}</p>
              <p className="text-xs text-neutral-700">{a.answer}</p>
              {a.evidence.length > 0 && <p className="text-xs text-neutral-400">{a.evidence.join(' · ')}</p>}
            </div>))}
        </div>
        {fundraisingEnt.data && (<div className="space-y-2 border-t border-neutral-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Fundraising pace simulator
            </p>
            <p className="text-xs text-neutral-500">
              Currently raising about ${(fundraisingPace.dailyAverageCents / 100).toLocaleString()}/day. See what a
              faster or slower pace would mean for a goal.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-neutral-500">
                Goal ($)
                <input type="number" min="0" value={scenarioGoalDollars} onChange={(e) => setScenarioGoalDollars(Number(e.target.value) || 0)} className="mt-1 h-9 w-28 rounded-md border border-neutral-300 px-2 text-sm text-neutral-900"/>
              </label>
              <label className="text-xs text-neutral-500">
                Pace change (%)
                <input type="number" value={scenarioPaceChangePct} onChange={(e) => setScenarioPaceChangePct(Number(e.target.value) || 0)} className="mt-1 h-9 w-24 rounded-md border border-neutral-300 px-2 text-sm text-neutral-900"/>
              </label>
            </div>
            <p className="text-xs text-neutral-700">
              At {scenarioPaceChangePct > 0 ? '+' : ''}
              {scenarioPaceChangePct}% pace, that's about ${(scenario.dailyRateAfter / 100).toLocaleString()}/day —{' '}
              {scenario.daysToTarget === null
                    ? "you'd never reach that goal at that pace"
                    : scenario.daysToTarget === 0
                        ? "you're already there"
                        : `about ${scenario.daysToTarget} day${scenario.daysToTarget === 1 ? '' : 's'} to reach it`}
              .
            </p>
          </div>)}
        <div className="space-y-2 border-t border-neutral-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Canvassing pace simulator</p>
          <p className="text-xs text-neutral-500">
            Currently averaging about {Math.round(avgDailyDoors)} doors/day. See what a faster or slower pace would
            mean for a remaining-doors target.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-neutral-500">
              Doors remaining
              <input type="number" min="0" value={scenarioDoorsRemaining} onChange={(e) => setScenarioDoorsRemaining(Number(e.target.value) || 0)} className="mt-1 h-9 w-28 rounded-md border border-neutral-300 px-2 text-sm text-neutral-900"/>
            </label>
            <label className="text-xs text-neutral-500">
              Pace change (%)
              <input type="number" value={scenarioDoorsPaceChangePct} onChange={(e) => setScenarioDoorsPaceChangePct(Number(e.target.value) || 0)} className="mt-1 h-9 w-24 rounded-md border border-neutral-300 px-2 text-sm text-neutral-900"/>
            </label>
          </div>
          <p className="text-xs text-neutral-700">
            At {scenarioDoorsPaceChangePct > 0 ? '+' : ''}
            {scenarioDoorsPaceChangePct}% pace, that's about {doorsScenario.dailyRateAfter} doors/day —{' '}
            {doorsScenario.daysToTarget === null
                ? "you'd never clear that many doors at that pace"
                : doorsScenario.daysToTarget === 0
                    ? "you're already there"
                    : `about ${doorsScenario.daysToTarget} day${doorsScenario.daysToTarget === 1 ? '' : 's'} to clear them`}
            .
          </p>
        </div>
        {canManageScripts.data && (<div className="space-y-2 border-t border-neutral-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Set the current door script / survey
            </p>
            <div className="flex gap-2">
              <textarea rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="Paste the current door-knock opening script…" value={newDoorScript} onChange={(e) => setNewDoorScript(e.target.value)}/>
              <Button size="sm" disabled={!newDoorScript.trim() || createScript.isPending} onClick={() => createScript.mutate({ projectId: project.id, kind: 'door_script', content: newDoorScript }, { onSuccess: () => setNewDoorScript('') })}>
                Save
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Add a survey question…" value={newSurveyQuestion} onChange={(e) => setNewSurveyQuestion(e.target.value)}/>
              <Input placeholder="Choices, comma-separated (optional — blank = open text)" value={newSurveyChoices} onChange={(e) => setNewSurveyChoices(e.target.value)} className="w-64"/>
              <Button size="sm" variant="outline" disabled={!newSurveyQuestion.trim() || createScript.isPending} onClick={() => createScript.mutate({
                projectId: project.id,
                kind: 'survey_question',
                content: newSurveyQuestion,
                sortOrder: scriptEntries.length,
                choices: newSurveyChoices.split(',').map((c) => c.trim()).filter(Boolean)
            }, { onSuccess: () => { setNewSurveyQuestion(''); setNewSurveyChoices(''); } })}>
                Add question
              </Button>
            </div>
          </div>)}
      </Card>
      </div>)}

      {/* Smart Segments — describe a universe, get an actionable walk list */}
      {has('smart_segments') && (<div id="tool-smart_segments">
          <SmartSegments project={project}/>
        </div>)}

      {/* Field Coach */}
      {has('campaign_coach') && (<div id="tool-campaign_coach">
      <Card icon={<Compass className="h-4 w-4 text-violet-600"/>} title="Campaign Coach">
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">Not sure what to do next? Get your top 3 priorities right now.</p>
          <Button variant="outline" size="sm" onClick={() => coach.mutate({ orgId: project.org_id, projectId: project.id, purpose: 'field_coach', context: snapshot })} disabled={coach.isPending}>
            {coach.isPending ? 'Thinking…' : 'Plan my day'}
          </Button>
        </div>
        {coach.isError && <p className="text-sm text-red-600">{coach.error.message}</p>}
        {coach.data && <Answer tone="violet">{coach.data.text}</Answer>}
      </Card>
      </div>)}

      {/* Message Studio */}
      {has('message_studio') && (<div id="tool-message_studio">
      <Card icon={<MessageSquare className="h-4 w-4 text-violet-600"/>} title="Message Studio">
        <p className="text-xs text-neutral-500">Draft on-message copy for any channel in seconds.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select className="flex h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm" value={studioKind} onChange={(e) => setStudioKind(e.target.value)}>
              {STUDIO_KINDS.map((k) => (<option key={k.value} value={k.value}>
                  {k.label}
                </option>))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Tone</Label>
            <select className="flex h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm" value={studioTone} onChange={(e) => setStudioTone(e.target.value)}>
              {TONES.map((t) => (<option key={t} value={t}>
                  {t}
                </option>))}
            </select>
          </div>
        </div>
        <textarea rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="What should it say? e.g. Remind volunteers about Saturday's canvass launch at 9am." value={studioBrief} onChange={(e) => setStudioBrief(e.target.value)}/>
        <Button size="sm" onClick={runStudio} disabled={studio.isPending}>
          <Sparkles className="h-4 w-4"/>
          {studio.isPending ? 'Writing…' : 'Generate'}
        </Button>
        {studio.isError && <p className="text-sm text-red-600">{studio.error.message}</p>}
        {studioText && (<div className="space-y-2">
            <Answer>{studioText}</Answer>
            <Button variant="outline" size="sm" onClick={copyStudio}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <RefineBar orgId={project.org_id} projectId={project.id} text={studioText} onResult={setStudioText}/>
            <TranslateBar orgId={project.org_id} projectId={project.id} text={studioText} defaultLanguage={dominantLanguage}/>
          </div>)}
      </Card>
      </div>)}

      {/* Content Pack — one brief, every channel */}
      {has('content_pack') && (<div id="tool-content_pack">
          <ContentPack project={project} defaultLanguage={dominantLanguage}/>
        </div>)}
    </div>);
}
function Card({ icon, title, children }) {
    return (<div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      </div>
      {children}
    </div>);
}
function Answer({ children, tone = 'neutral' }) {
    const cls = tone === 'violet' ? 'border-violet-200 bg-violet-50' : 'border-neutral-200 bg-neutral-50';
    return (<div className={`whitespace-pre-wrap rounded-md border p-3 text-sm text-neutral-800 ${cls}`}>
      {children}
    </div>);
}
