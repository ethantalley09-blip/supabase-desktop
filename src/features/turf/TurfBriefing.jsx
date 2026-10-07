import { AlertTriangle, ArrowDownRight, ArrowRightLeft, ArrowUpRight, BookOpenText, CalendarClock, CheckCircle2, Clock, Coffee, DollarSign, Dumbbell, Flame, GraduationCap, Home, Languages, MapPinned, MessageCircleQuestion, MessagesSquare, PhoneOff, Radar, RotateCcw, Settings2, Shuffle, Sparkles, Sun, Target, TrendingUp, Trophy, Users, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatUsd, useDonations } from '@/features/fundraising/useFundraising';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { useQuickInsight } from '@/lib/ai/useQuickInsight';
import { findAskCoverageGaps } from './askCoverageGap';
import { buildAskRehearsalSnapshot } from './askRehearsal';
import { computeCanvasserAskCoach } from './canvasserAskCoach';
import { detectCanvasserFatigue } from './canvasserFatigue';
import { detectSilentCanvassers } from './canvasserSilence';
import { computeCanvasserLeaderboard } from './canvasserStats';
import { computeDaylight } from './daylight';
import { canvasserLeaderboard as computeDonationLeaderboard, scoreDoors } from './doorstep';
import { daysUntilElection, findCountdownAskTargets } from './electionCountdownAsk';
import { findGoldenHourTargets } from './goldenHourPush';
import { dedupeHouseholds, groupIntoHouseholds } from './households';
import { findMomentumAskTargets } from './momentumAsk';
import { optimizeMoneyRoute } from './moneyRoute';
import { findNeighborhoodProof } from './neighborhoodProof';
import { detectCrossCanvasserOverlap } from './overlapGuard';
import { computePeakAskWindow } from './peakAskWindow';
import { findPersistenceAskTargets } from './persistenceAsk';
import { findPriorityDoors } from './priorityDoor';
import { buildRevisitQueue } from './revisitQueue';
import { dominantVoterLanguage, optimizeWalkOrder } from './route';
import { computeTerritoryDifficulty } from './territoryDifficulty';
import { computeTerritoryFundraisingRoi } from './territoryFundraisingRoi';
import { computeTerritoryStaffing, suggestReallocations } from './territoryStaffing';
import { computeGoalProgress } from './teamGoalTracker';
import { DEFAULT_TURF_PREFERENCES } from './turfPreferences';
import { buildBriefingSnapshot, classifyPersuadability, PARTY_LABELS, PERSUADABILITY_LABELS, remainingDoorsToday, voterParty } from './turfBriefingMath';
import { findHotspot } from './hotspot';
import { useCanvassVisits, useSaveTurfPreferences, useTurfPreferences } from './useTurf';
import { computeBestTimeToKnock, detectPersuasionDrift } from './visitHistory';
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// Priority order for picking the single "top" remaining door to prep —
// persuadable doors are the most actionable use of a personalized opener.
const DOOR_PRIORITY = { persuadable: 0, unknown: 1, base_support: 2, opposed: 3 };
// Turf Briefing: the real-time tactical layer static walk-list exports (NGP
// VAN's model) can't offer — a static export is stale the moment the first
// door gets knocked. Everything here reads from real, already-logged field
// activity (contact_status, canvass_notes, last_contacted_at, and the
// canvass_visits history log from migration 0030); the AI only narrates or
// coaches, it never invents the underlying numbers. Every threshold below is
// customizable per user via the Customize panel (turf_briefing_preferences,
// migration 0031) — voters is already filtered by the page's city/ward
// picker (TurfTab.tsx), so that filter reaches every section here too.
export function TurfBriefing({ orgId, projectId, voters, territories, canUseAi, onRebalance, heatmapMode = 'off', mapSelectedVoterId = null, onClearMapSelection }) {
    const ai = useAiAssist();
    const objectionAi = useAiAssist();
    const scriptAi = useAiAssist();
    const explainAi = useAiAssist();
    const languageAi = useAiAssist();
    const debriefAi = useAiAssist();
    const territoryAi = useAiAssist();
    const revisitAi = useAiAssist();
    const momentumAi = useAiAssist();
    const peakAskAi = useAiAssist();
    const territoryRoiAi = useAiAssist();
    const persistenceAi = useAiAssist();
    const goldenHourAi = useAiAssist();
    const coverageGapAi = useAiAssist();
    const coachAi = useAiAssist();
    const countdownAi = useAiAssist();
    const priorityDoorAi = useAiAssist();
    const checkinAi = useAiAssist();
    const territoryStaffingAi = useAiAssist();
    const silenceAi = useAiAssist();
    const neighborProofAi = useAiAssist();
    const donationObjectionAi = useAiAssist();
    const rehearsalAi = useAiAssist();
    const { data: visits } = useCanvassVisits(projectId);
    const { data: donations } = useDonations(projectId);
    const { data: savedPreferences } = useTurfPreferences(projectId);
    const savePreferences = useSaveTurfPreferences();
    const [briefing, setBriefing] = useState(null);
    const [rebalanceNote, setRebalanceNote] = useState(null);
    const [moneyRouteNote, setMoneyRouteNote] = useState(null);
    const [goalInput, setGoalInput] = useState('');
    const [objectionText, setObjectionText] = useState('');
    const [objectionResult, setObjectionResult] = useState(null);
    const [doorScript, setDoorScript] = useState(null);
    const [doorExplain, setDoorExplain] = useState(null);
    const [languagePrep, setLanguagePrep] = useState(null);
    const [shiftDebrief, setShiftDebrief] = useState(null);
    const [territoryBriefing, setTerritoryBriefing] = useState(null);
    const [revisitStrategy, setRevisitStrategy] = useState(null);
    const [momentumFor, setMomentumFor] = useState(null);
    const [momentumScript, setMomentumScript] = useState(null);
    const [peakAskBriefing, setPeakAskBriefing] = useState(null);
    const [territoryRoiBriefing, setTerritoryRoiBriefing] = useState(null);
    const [persistenceFor, setPersistenceFor] = useState(null);
    const [persistenceScript, setPersistenceScript] = useState(null);
    const [goldenHourPlan, setGoldenHourPlan] = useState(null);
    const [coverageGapFor, setCoverageGapFor] = useState(null);
    const [coverageAlert, setCoverageAlert] = useState(null);
    const [coachFor, setCoachFor] = useState(null);
    const [coachingNote, setCoachingNote] = useState(null);
    const [electionDate, setElectionDate] = useState('');
    const [countdownFor, setCountdownFor] = useState(null);
    const [countdownScript, setCountdownScript] = useState(null);
    const [priorityDoorBriefing, setPriorityDoorBriefing] = useState(null);
    const [checkinFor, setCheckinFor] = useState(null);
    const [checkinPrompt, setCheckinPrompt] = useState(null);
    const [territoryStaffingBriefing, setTerritoryStaffingBriefing] = useState(null);
    const [silenceFor, setSilenceFor] = useState(null);
    const [silencePrompt, setSilencePrompt] = useState(null);
    const [neighborProofFor, setNeighborProofFor] = useState(null);
    const [neighborProofPitch, setNeighborProofPitch] = useState(null);
    const [donationObjectionText, setDonationObjectionText] = useState('');
    const [donationObjectionResult, setDonationObjectionResult] = useState(null);
    const [rehearsalPrep, setRehearsalPrep] = useState(null);
    const [customizeOpen, setCustomizeOpen] = useState(false);
    const [draft, setDraft] = useState(DEFAULT_TURF_PREFERENCES);
    const prefs = savedPreferences ?? DEFAULT_TURF_PREFERENCES;
    // Sync the editable draft once real saved settings load, without clobbering
    // in-progress edits on every background refetch.
    useEffect(() => {
        if (savedPreferences)
            setDraft(savedPreferences);
    }, [savedPreferences]);
    const recentWindowMs = prefs.statWindows.recentHours * HOUR_MS;
    const todayWindowMs = prefs.statWindows.todayHours * HOUR_MS;
    const snapshot = useMemo(() => buildBriefingSnapshot(voters, territories, undefined, { recentWindowMs, todayWindowMs }), [voters, territories, recentWindowMs, todayWindowMs]);
    const remainingDoors = useMemo(() => remainingDoorsToday(voters, undefined, { todayWindowMs }), [voters, todayWindowMs]);
    const physicalDoorsRemaining = useMemo(() => dedupeHouseholds(remainingDoors).length, [remainingDoors]);
    // Shared warm-door scoring (doorstep.ts) — reused by Golden Hour Push,
    // Ask Coverage Gap, and Election Countdown Ask below, same instant
    // client-side math DoorstepDonations.tsx already uses.
    const warmDoors = useMemo(() => scoreDoors(voters), [voters]);
    // Neighborhood Social Proof: real neighbor-giver counts on the same
    // street as a warm door (neighborhoodProof.ts) — honest social proof,
    // never fabricated, and only ever shown when the real count is > 0.
    const neighborProof = useMemo(() => findNeighborhoodProof(warmDoors, voters, donations ?? []), [warmDoors, voters, donations]);
    // Ask Rehearsal Prep: a confidence-building aggregate snapshot of today's
    // real warm doors (askRehearsal.ts) — distinct from Canvasser Ask Coach,
    // which coaches after the fact from real ask-rate stats.
    const askRehearsalSnapshot = useMemo(() => buildAskRehearsalSnapshot(warmDoors), [warmDoors]);
    const bestTimeVisits = useMemo(() => {
        const cutoff = Date.now() - prefs.bestTimeToKnock.lookbackDays * DAY_MS;
        return (visits ?? []).filter((v) => new Date(v.occurred_at).getTime() >= cutoff);
    }, [visits, prefs.bestTimeToKnock.lookbackDays]);
    const bestTime = useMemo(() => computeBestTimeToKnock(bestTimeVisits, {
        minSample: prefs.bestTimeToKnock.minSample,
        minHourAttempts: prefs.bestTimeToKnock.minHourAttempts
    }), [bestTimeVisits, prefs.bestTimeToKnock.minSample, prefs.bestTimeToKnock.minHourAttempts]);
    // Fundraising Intelligence: Peak Ask Window — the revenue analog of Best
    // Time to Knock, from real doorstep-linked gifts only (peakAskWindow.ts).
    const peakAskWindow = useMemo(() => computePeakAskWindow(donations ?? []), [donations]);
    const driftVisits = useMemo(() => {
        const cutoff = Date.now() - prefs.persuasionDrift.lookbackDays * DAY_MS;
        return (visits ?? []).filter((v) => new Date(v.occurred_at).getTime() >= cutoff);
    }, [visits, prefs.persuasionDrift.lookbackDays]);
    const driftAlerts = useMemo(() => detectPersuasionDrift(driftVisits)
        .filter((d) => (d.direction === 'warmed' ? prefs.persuasionDrift.showWarmed : prefs.persuasionDrift.showCooled))
        .slice(0, 5), [driftVisits, prefs.persuasionDrift.showWarmed, prefs.persuasionDrift.showCooled]);
    // Fundraising Intelligence: Momentum Ask. Uses the FULL (unfiltered by the
    // showWarmed/showCooled display preference above) drift list — a warmed
    // door is still a real ask opportunity even if this user has hidden
    // warmed alerts from their own drift feed.
    const allDriftAlerts = useMemo(() => detectPersuasionDrift(driftVisits), [driftVisits]);
    const momentumTargets = useMemo(() => findMomentumAskTargets(allDriftAlerts, donations ?? []).slice(0, 5), [allDriftAlerts, donations]);
    // A rough campaign-wide centroid of mapped doors — good enough for "how
    // much daylight is left on this shift" without needing a per-territory
    // picker. Skipped entirely (not faked) when nothing is mapped yet.
    const daylight = useMemo(() => {
        const mapped = voters.filter((v) => v.lat !== null && v.lng !== null);
        if (mapped.length === 0)
            return null;
        const lat = mapped.reduce((s, v) => s + v.lat, 0) / mapped.length;
        const lng = mapped.reduce((s, v) => s + v.lng, 0) / mapped.length;
        return computeDaylight(lat, lng);
    }, [voters]);
    const daylightUrgent = Boolean(daylight && daylight.minutesOfDaylightLeft > 0 && daylight.minutesOfDaylightLeft <= prefs.daylight.warnMinutes);
    // Live Team Fundraising Goal Tracker: real progress today's actual
    // doorstep gifts have made toward a staff-set goal, plus an honest pace-
    // based projection using real remaining daylight (teamGoalTracker.ts).
    // The goal itself is a session-local input, same lightweight pattern as
    // the Election Countdown date field below — not persisted server-side.
    const goalCents = useMemo(() => {
        const dollars = Number(goalInput);
        return dollars > 0 ? Math.round(dollars * 100) : 0;
    }, [goalInput]);
    const goalProgress = useMemo(() => computeGoalProgress(donations ?? [], goalCents, undefined, daylight?.minutesOfDaylightLeft ?? null), [donations, goalCents, daylight]);
    const goalInsight = useQuickInsight({
        orgId,
        projectId,
        framing: 'Live team fundraising goal progress for today\'s shift — motivating, team-focused tone',
        data: { raisedCentsToday: goalProgress.raisedCentsToday, goalCents, progressPct: goalProgress.progressPct },
        enabled: canUseAi && goalCents > 0 && goalProgress.giftCountToday > 0
    });
    // Fundraising Intelligence: Golden Hour Push — once daylight is genuinely
    // running low, the highest-value warm doors still reachable are worth
    // more than one extra unscored knock (goldenHourPush.ts).
    const remainingDoorIds = useMemo(() => new Set(remainingDoors.map((d) => d.id)), [remainingDoors]);
    const goldenHourTargets = useMemo(() => (daylightUrgent ? findGoldenHourTargets(warmDoors, remainingDoorIds, donations ?? []) : []), [daylightUrgent, warmDoors, remainingDoorIds, donations]);
    const territoryDifficulty = useMemo(() => computeTerritoryDifficulty(voters, visits ?? [], territories), [voters, visits, territories]);
    // Fundraising Intelligence: Territory Fundraising ROI — real $ raised per
    // door knocked, a revenue-per-effort ranking distinct from the vote-
    // contact difficulty ranking above.
    const territoryRoi = useMemo(() => computeTerritoryFundraisingRoi(voters, visits ?? [], donations ?? [], territories), [voters, visits, donations, territories]);
    // Territory Staffing Advisor: real remaining-door load per territory
    // against how many real canvassers are actually working it
    // (territoryStaffing.ts) — a cross-territory reallocation signal distinct
    // from both rankings above.
    const territoryStaffing = useMemo(() => computeTerritoryStaffing(voters, visits ?? [], territories), [voters, visits, territories]);
    const reallocations = useMemo(() => suggestReallocations(territoryStaffing), [territoryStaffing]);
    // Round 4: Canvasser Leaderboard, Cross-Canvasser Overlap Guard, Revisit
    // Queue — all read from the same canvass_visits log (now including
    // canvasser_id/name) as Best Time to Knock and Persuasion Drift above.
    const canvasserLeaderboard = useMemo(() => computeCanvasserLeaderboard(visits ?? [], { minAttempts: prefs.canvasserLeaderboard.minAttempts }), [visits, prefs.canvasserLeaderboard.minAttempts]);
    // Fundraising Intelligence: Canvasser Ask Coach — cross-references the
    // door-knocking leaderboard above with the doorstep $ leaderboard
    // (doorstep.ts) by profile id, since a canvasser and a donation recorder
    // are the same person.
    const donationLeaderboard = useMemo(() => computeDonationLeaderboard(donations ?? []), [donations]);
    const askCoachStats = useMemo(() => computeCanvasserAskCoach(canvasserLeaderboard, donationLeaderboard).slice(0, 5), [canvasserLeaderboard, donationLeaderboard]);
    const allHouseholds = useMemo(() => groupIntoHouseholds(voters), [voters]);
    const overlapAlerts = useMemo(() => detectCrossCanvasserOverlap(allHouseholds, visits ?? [], { lookbackDays: prefs.overlapGuard.lookbackDays }).slice(0, 5), [allHouseholds, visits, prefs.overlapGuard.lookbackDays]);
    // Fundraising Intelligence: Ask Coverage Gap — a warm household multiple
    // real canvassers visited, but no one has asked yet (askCoverageGap.ts).
    const askCoverageGaps = useMemo(() => findAskCoverageGaps(allHouseholds, visits ?? [], warmDoors, donations ?? [], {
        lookbackDays: prefs.overlapGuard.lookbackDays
    }).slice(0, 5), [allHouseholds, visits, warmDoors, donations, prefs.overlapGuard.lookbackDays]);
    const revisitQueue = useMemo(() => buildRevisitQueue(remainingDoors, visits ?? [], { minAttempts: prefs.revisitQueue.minAttempts }).slice(0, 5), [remainingDoors, visits, prefs.revisitQueue.minAttempts]);
    const topRevisit = revisitQueue[0] ?? null;
    // Fundraising Intelligence: Persistence Pays — a door reached only after
    // real repeated attempts (persistenceAsk.ts), cross-referenced against
    // whether it's ever been asked yet. Uses ALL logged visits, not just the
    // knockable/remaining set, since the door that just converted may no
    // longer be "remaining" at all.
    const persistenceTargets = useMemo(() => findPersistenceAskTargets(visits ?? [], donations ?? []).slice(0, 5), [visits, donations]);
    // Fundraising Intelligence: Election Countdown Ask — the fundraising
    // analog of the GOTV Countdown Planner. Only computed once staff enter a
    // real election date (electionCountdownAsk.ts), mirroring
    // GotvSprintPlan.tsx's own date-input convention.
    const countdownDays = useMemo(() => (electionDate ? daysUntilElection(electionDate) : null), [electionDate]);
    const countdownTargets = useMemo(() => (electionDate ? findCountdownAskTargets(warmDoors, donations ?? [], electionDate) : []), [electionDate, warmDoors, donations]);
    // Priority Door Briefing: the turnout-focused analog of Golden Hour Push
    // (which is fundraising-focused) — real persuadability + ballot status,
    // the revisit queue above, and the same real election countdown all feed
    // one ranked "which doors most need a turnout knock right now" list
    // (priorityDoor.ts). Deliberately excludes fundraising warmth, which
    // already has its own dedicated tool.
    const priorityDoorInputs = useMemo(() => remainingDoors.map((v) => ({
        id: v.id,
        full_name: v.full_name,
        address_line: v.address_line,
        bucket: classifyPersuadability(v).bucket,
        ballot_status: v.ballot_status
    })), [remainingDoors]);
    const priorityDoors = useMemo(() => findPriorityDoors(priorityDoorInputs, revisitQueue, countdownDays), [priorityDoorInputs, revisitQueue, countdownDays]);
    // Canvasser Pace Check-in: a real, honest split in one canvasser's own
    // contact rate across today's shift (canvasserFatigue.ts) — framed as a
    // supportive nudge, never a performance write-up.
    const fatigueAlerts = useMemo(() => detectCanvasserFatigue(visits ?? []), [visits]);
    // Silent Canvasser Alert: a real-time safety/coordination check distinct
    // from Pace Check-in above — this flags total silence after an
    // established presence today, not a declining rate while still active
    // (canvasserSilence.ts).
    const silentCanvassers = useMemo(() => detectSilentCanvassers(visits ?? []), [visits]);
    const leaderboardInsight = useQuickInsight({
        orgId,
        projectId,
        framing: 'Canvasser door-knocking leaderboard — celebratory shoutout tone',
        data: canvasserLeaderboard.slice(0, 3),
        enabled: canUseAi && canvasserLeaderboard.length > 0
    });
    // The single highest-priority remaining door — what Door Prep operates on.
    // Click-to-Ask Door Popup: a real door clicked on the map overrides the
    // algorithm's own auto-picked top-priority door for Door Prep — any real
    // voter is inspectable, not just the single highest-priority one.
    const mapSelectedDoor = useMemo(() => (mapSelectedVoterId ? voters.find((v) => v.id === mapSelectedVoterId) ?? null : null), [mapSelectedVoterId, voters]);
    const topDoor = useMemo(() => {
        if (mapSelectedDoor)
            return mapSelectedDoor;
        const sorted = [...remainingDoors].sort((a, b) => DOOR_PRIORITY[classifyPersuadability(a).bucket] - DOOR_PRIORITY[classifyPersuadability(b).bucket]);
        return sorted[0] ?? null;
    }, [mapSelectedDoor, remainingDoors]);
    const remainingLanguage = useMemo(() => dominantVoterLanguage(remainingDoors), [remainingDoors]);
    const topDoorVisits = useMemo(() => (visits ?? []).filter((v) => v.voter_id === topDoor?.id).slice(0, 5), [visits, topDoor]);
    // Passive one-sentence AI commentary layered on top of already-exact pure
    // math — never a replacement, silent on failure (useQuickInsight's own
    // contract). Wired into the four pure-math features that had no AI at all
    // before this round.
    const bestTimeInsight = useQuickInsight({
        orgId,
        projectId,
        framing: 'Best-time-to-knock insight for canvassers — practical scheduling tone',
        data: bestTime,
        enabled: canUseAi && Boolean(bestTime)
    });
    const driftInsight = useQuickInsight({
        orgId,
        projectId,
        framing: 'Persuasion drift alert list for a canvass captain — strategic, brief',
        data: driftAlerts,
        enabled: canUseAi && driftAlerts.length > 0
    });
    const householdInsight = useQuickInsight({
        orgId,
        projectId,
        framing: 'Physical doors remaining today, household-deduped — practical field-ops tone',
        data: { physicalDoorsRemaining, totalVotersRemaining: remainingDoors.length },
        enabled: canUseAi && physicalDoorsRemaining > 0
    });
    const daylightInsight = useQuickInsight({
        orgId,
        projectId,
        framing: 'Daylight remaining on a canvassing shift — practical, time-pressure-aware tone',
        data: daylight ? { minutesLeft: Math.round(daylight.minutesOfDaylightLeft), urgent: daylightUrgent } : null,
        enabled: canUseAi && Boolean(daylight)
    });
    // Live Hotspot Caller: turns the map's own heatmap from a color overlay
    // into words — the single densest real pocket for whichever mode is
    // active right now, naming real streets (hotspot.ts). Off entirely when
    // the heatmap itself is off, so it never talks about a mode nobody
    // selected.
    const hotspot = useMemo(() => (heatmapMode === 'off' ? null : findHotspot(voters, heatmapMode)), [voters, heatmapMode]);
    const hotspotInsight = useQuickInsight({
        orgId,
        projectId,
        framing: `The single densest real "${heatmapMode}" pocket on the map right now — practical, points-to-it tone`,
        data: hotspot,
        enabled: canUseAi && Boolean(hotspot)
    });
    const generateBriefing = () => {
        setBriefing(null);
        ai.mutate({
            orgId,
            projectId,
            purpose: 'turf_briefing',
            context: JSON.stringify({
                ...snapshot,
                daylightMinutesLeft: daylight ? Math.round(daylight.minutesOfDaylightLeft) : null
            })
        }, { onSuccess: (res) => setBriefing(extractJson(res.text)) });
    };
    const generateDebrief = () => {
        setShiftDebrief(null);
        debriefAi.mutate({
            orgId,
            projectId,
            purpose: 'shift_debrief',
            context: JSON.stringify({
                ...snapshot,
                bestTime: bestTime ? { bestHourLabel: bestTime.bestHourLabel, contactRatePct: bestTime.contactRatePct } : null,
                warmedCount: driftAlerts.filter((d) => d.direction === 'warmed').length,
                cooledCount: driftAlerts.filter((d) => d.direction === 'cooled').length
            })
        }, { onSuccess: (res) => setShiftDebrief(extractJson(res.text)) });
    };
    const generateTerritoryBriefing = () => {
        setTerritoryBriefing(null);
        territoryAi.mutate({ orgId, projectId, purpose: 'territory_difficulty_briefing', context: JSON.stringify(territoryDifficulty) }, { onSuccess: (res) => setTerritoryBriefing(extractJson(res.text)) });
    };
    const getDoorScript = () => {
        if (!topDoor)
            return;
        setDoorScript(null);
        scriptAi.mutate({
            orgId,
            projectId,
            purpose: 'door_script_personalize',
            context: JSON.stringify({
                party: voterParty(topDoor),
                ...classifyPersuadability(topDoor),
                notes: topDoor.canvass_notes
            })
        }, { onSuccess: (res) => setDoorScript(extractJson(res.text)) });
    };
    const getDoorExplain = () => {
        if (!topDoor)
            return;
        setDoorExplain(null);
        explainAi.mutate({
            orgId,
            projectId,
            purpose: 'door_explainer',
            context: JSON.stringify({
                name: topDoor.full_name,
                party: voterParty(topDoor),
                persuadability: classifyPersuadability(topDoor),
                visit_history: topDoorVisits.map((v) => ({ occurred_at: v.occurred_at, outcome: v.outcome, notes: v.notes_snapshot }))
            })
        }, { onSuccess: (res) => setDoorExplain(extractJson(res.text)) });
    };
    const getLanguagePrep = () => {
        if (!remainingLanguage)
            return;
        setLanguagePrep(null);
        languageAi.mutate({ orgId, projectId, purpose: 'door_language_prep', context: JSON.stringify({ language: remainingLanguage }) }, { onSuccess: (res) => setLanguagePrep(extractJson(res.text)) });
    };
    const getRevisitStrategy = () => {
        if (!topRevisit)
            return;
        setRevisitStrategy(null);
        revisitAi.mutate({
            orgId,
            projectId,
            purpose: 'revisit_strategy',
            context: JSON.stringify({ attempts: topRevisit.attempts, lastAttemptAt: topRevisit.lastAttemptAt })
        }, { onSuccess: (res) => setRevisitStrategy(extractJson(res.text)) });
    };
    const getMomentumAsk = (target) => {
        setMomentumFor(target.voterId);
        setMomentumScript(null);
        momentumAi.mutate({
            orgId,
            projectId,
            purpose: 'momentum_ask_script',
            context: JSON.stringify({ name: target.name, from: target.from, to: target.to })
        }, { onSuccess: (res) => setMomentumScript(extractJson(res.text)) });
    };
    const getPeakAskBriefing = () => {
        if (!peakAskWindow)
            return;
        setPeakAskBriefing(null);
        peakAskAi.mutate({ orgId, projectId, purpose: 'peak_ask_briefing', context: JSON.stringify(peakAskWindow) }, { onSuccess: (res) => setPeakAskBriefing(extractJson(res.text)) });
    };
    const getTerritoryRoiBriefing = () => {
        if (territoryRoi.length === 0)
            return;
        setTerritoryRoiBriefing(null);
        territoryRoiAi.mutate({ orgId, projectId, purpose: 'territory_roi_briefing', context: JSON.stringify(territoryRoi) }, { onSuccess: (res) => setTerritoryRoiBriefing(extractJson(res.text)) });
    };
    const getPersistenceAsk = (target) => {
        setPersistenceFor(target.voterId);
        setPersistenceScript(null);
        persistenceAi.mutate({
            orgId,
            projectId,
            purpose: 'persistence_ask_script',
            context: JSON.stringify({ name: target.name, priorAttempts: target.priorAttempts })
        }, { onSuccess: (res) => setPersistenceScript(extractJson(res.text)) });
    };
    const getGoldenHourPlan = () => {
        if (goldenHourTargets.length === 0 || !daylight)
            return;
        setGoldenHourPlan(null);
        goldenHourAi.mutate({
            orgId,
            projectId,
            purpose: 'golden_hour_ask_plan',
            context: JSON.stringify({
                minutesLeft: Math.round(daylight.minutesOfDaylightLeft),
                warmDoors: goldenHourTargets.map((d) => ({ name: d.name, address: d.address, reasons: d.reasons }))
            })
        }, { onSuccess: (res) => setGoldenHourPlan(extractJson(res.text)) });
    };
    const getCoverageAlert = (gap) => {
        setCoverageGapFor(gap.householdKey);
        setCoverageAlert(null);
        coverageGapAi.mutate({
            orgId,
            projectId,
            purpose: 'ask_coverage_alert',
            context: JSON.stringify({
                name: gap.warmDoor.name,
                address: gap.address,
                reasons: gap.warmDoor.reasons,
                canvassers: gap.canvassers
            })
        }, { onSuccess: (res) => setCoverageAlert(extractJson(res.text)) });
    };
    const getCoachingNote = (stat) => {
        setCoachFor(stat.canvasserId);
        setCoachingNote(null);
        coachAi.mutate({
            orgId,
            projectId,
            purpose: 'canvasser_ask_coaching',
            context: JSON.stringify({ name: stat.name, contacts: stat.contacts, giftCount: stat.giftCount, askRatePct: stat.askRatePct })
        }, { onSuccess: (res) => setCoachingNote(extractJson(res.text)) });
    };
    const getCountdownAsk = (target) => {
        setCountdownFor(target.voterId);
        setCountdownScript(null);
        countdownAi.mutate({
            orgId,
            projectId,
            purpose: 'election_countdown_ask',
            context: JSON.stringify({ name: target.name, reasons: target.reasons, daysUntilElection: target.daysUntilElection })
        }, { onSuccess: (res) => setCountdownScript(extractJson(res.text)) });
    };
    const getPriorityDoorBriefing = () => {
        if (priorityDoors.length === 0)
            return;
        setPriorityDoorBriefing(null);
        priorityDoorAi.mutate({
            orgId,
            projectId,
            purpose: 'priority_door_briefing',
            context: JSON.stringify(priorityDoors.map((d) => ({ name: d.name, address: d.address, reasons: d.reasons })))
        }, { onSuccess: (res) => setPriorityDoorBriefing(extractJson(res.text)) });
    };
    const getCheckinPrompt = (alert) => {
        setCheckinFor(alert.canvasserId);
        setCheckinPrompt(null);
        checkinAi.mutate({
            orgId,
            projectId,
            purpose: 'canvasser_checkin_prompt',
            context: JSON.stringify({
                name: alert.name,
                earlyContactRatePct: alert.earlyContactRatePct,
                laterContactRatePct: alert.laterContactRatePct,
                attemptsConsidered: alert.attemptsConsidered
            })
        }, { onSuccess: (res) => setCheckinPrompt(extractJson(res.text)) });
    };
    const getTerritoryStaffingBriefing = () => {
        if (reallocations.length === 0)
            return;
        setTerritoryStaffingBriefing(null);
        territoryStaffingAi.mutate({ orgId, projectId, purpose: 'territory_staffing_briefing', context: JSON.stringify(reallocations) }, { onSuccess: (res) => setTerritoryStaffingBriefing(extractJson(res.text)) });
    };
    const getSilenceCheckin = (alert) => {
        setSilenceFor(alert.canvasserId);
        setSilencePrompt(null);
        silenceAi.mutate({
            orgId,
            projectId,
            purpose: 'canvasser_silence_checkin',
            context: JSON.stringify({
                name: alert.name,
                minutesSinceLastVisit: alert.minutesSinceLastVisit,
                visitsToday: alert.visitsToday
            })
        }, { onSuccess: (res) => setSilencePrompt(extractJson(res.text)) });
    };
    const getNeighborProofPitch = (door) => {
        setNeighborProofFor(door.voterId);
        setNeighborProofPitch(null);
        neighborProofAi.mutate({
            orgId,
            projectId,
            purpose: 'neighborhood_proof_ask',
            context: JSON.stringify({
                name: door.name,
                address: door.address,
                reasons: door.reasons,
                streetName: door.streetName,
                neighborGiverCount: door.neighborGiverCount
            })
        }, { onSuccess: (res) => setNeighborProofPitch(extractJson(res.text)) });
    };
    const askDonationObjection = () => {
        if (!donationObjectionText.trim())
            return;
        setDonationObjectionResult(null);
        donationObjectionAi.mutate({ orgId, projectId, purpose: 'donation_objection_handler', instructions: donationObjectionText.trim() }, { onSuccess: (res) => setDonationObjectionResult(extractJson(res.text)) });
    };
    const getRehearsalPrep = () => {
        if (!askRehearsalSnapshot)
            return;
        setRehearsalPrep(null);
        rehearsalAi.mutate({ orgId, projectId, purpose: 'ask_rehearsal_prep', context: JSON.stringify(askRehearsalSnapshot) }, { onSuccess: (res) => setRehearsalPrep(extractJson(res.text)) });
    };
    const askObjection = () => {
        if (!objectionText.trim())
            return;
        setObjectionResult(null);
        objectionAi.mutate({ orgId, projectId, purpose: 'door_objection_assist', instructions: objectionText.trim() }, { onSuccess: (res) => setObjectionResult(extractJson(res.text)) });
    };
    const rebalance = () => {
        // Deduped by household first — a route should never send a canvasser to
        // the same physical door twice just because two people are registered
        // there.
        const remaining = dedupeHouseholds(remainingDoors);
        if (remaining.length === 0) {
            setRebalanceNote('No doors left to rebalance — everything knockable has been touched in the configured window.');
            return;
        }
        onRebalance(optimizeWalkOrder(remaining));
        setRebalanceNote(remaining.length === remainingDoors.length
            ? `Route rebalanced over the ${remaining.length} door${remaining.length === 1 ? '' : 's'} still remaining today.`
            : `Route rebalanced over ${remaining.length} physical door${remaining.length === 1 ? '' : 's'} (covering ${remainingDoors.length} registered voters) still remaining today.`);
    };
    const applyMoneyRoute = () => {
        const remaining = dedupeHouseholds(remainingDoors);
        if (remaining.length === 0) {
            setMoneyRouteNote('No doors left to route — everything knockable has been touched in the configured window.');
            return;
        }
        const warmVoterIds = new Set(warmDoors.map((d) => d.voterId));
        const result = optimizeMoneyRoute(remaining, warmVoterIds);
        onRebalance(result);
        setMoneyRouteNote(result.warmDoorsFirst > 0
            ? `Route reordered to hit ${result.warmDoorsFirst} real warm door${result.warmDoorsFirst === 1 ? '' : 's'} first, then the rest by walking distance.`
            : 'No real warm doors in range yet — route left in plain geographic order.');
    };
    const saveDraft = () => savePreferences.mutate({ projectId, settings: draft });
    const resetDraft = () => setDraft(DEFAULT_TURF_PREFERENCES);
    return (<div className="space-y-3 rounded-lg border border-indigo-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-indigo-600"/>
          <h3 className="text-sm font-semibold text-neutral-900">Turf Briefing</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(!customizeOpen)}>
          <Settings2 className="h-3.5 w-3.5"/>
          Customize
        </Button>
      </div>
      <p className="text-xs text-neutral-500">
        A live read on today's shift, not a static export — this rebalances as results come in, so a
        walk list never goes stale the way an exported PDF or spreadsheet does. Filtered by the
        city/ward picker above; every threshold below is yours to customize.
      </p>

      {customizeOpen && (<CustomizePanel draft={draft} setDraft={setDraft} onSave={saveDraft} onReset={resetDraft} saving={savePreferences.isPending}/>)}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`Contacted (${prefs.statWindows.recentHours}h)`} value={snapshot.contactedLast4h}/>
        <Stat label="Physical doors left" value={physicalDoorsRemaining}/>
        <Stat label="Persuadable" value={snapshot.persuadable} tone="text-amber-600"/>
        <Stat label="Base support" value={snapshot.baseSupport} tone="text-emerald-600"/>
      </div>
      <QuickInsightLine insight={householdInsight.data}/>

      {snapshot.topRemainingTerritories.length > 0 && (<p className="text-xs text-neutral-500">
          Heaviest remaining load:{' '}
          {snapshot.topRemainingTerritories.map((t) => `${t.name} (${t.remaining})`).join(' · ')}
        </p>)}

      {daylight && (<div className={`space-y-1 rounded-md border px-3 py-1.5 text-xs ${daylightUrgent ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <p className="flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 shrink-0"/>
            {daylight.minutesOfDaylightLeft > 0
                ? `~${Math.floor(daylight.minutesOfDaylightLeft / 60)}h ${Math.round(daylight.minutesOfDaylightLeft % 60)}m of daylight left today (sunset ~${daylight.sunsetUtc.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`
                : 'Sun is down for the shift area — plan porch-light-only doors.'}
          </p>
          <QuickInsightLine insight={daylightInsight.data} tone={daylightUrgent ? 'text-rose-700' : 'text-amber-700'}/>
        </div>)}

      {hotspot && (<div className="space-y-1 rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-900">
          <p className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 shrink-0"/>
            Hottest real "{heatmapMode}" pocket right now: {hotspot.voterCount} voter{hotspot.voterCount === 1 ? '' : 's'}
            {hotspot.sampleAddresses.length > 0 && ` near ${hotspot.sampleAddresses.join(', ')}`}
          </p>
          <QuickInsightLine insight={hotspotInsight.data} tone="text-orange-700"/>
        </div>)}

      <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-900">
            <Target className="h-3.5 w-3.5"/>
            Live Team Fundraising Goal
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-500">$</span>
            <Input type="number" min="1" step="1" className="h-7 w-24" placeholder="Today's goal" value={goalInput} onChange={(e) => setGoalInput(e.target.value)}/>
          </div>
        </div>
        {goalCents > 0 ? (<div className="space-y-1 text-xs text-neutral-700">
            <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, goalProgress.progressPct)}%` }}/>
            </div>
            <p>
              {formatUsd(goalProgress.raisedCentsToday)} of {formatUsd(goalCents)} ({goalProgress.progressPct}%) from{' '}
              {goalProgress.giftCountToday} real doorstep gift{goalProgress.giftCountToday === 1 ? '' : 's'} today
              {goalProgress.projectedCentsByEndOfDay !== null &&
                ` — on pace for ~${formatUsd(goalProgress.projectedCentsByEndOfDay)} by sunset`}
            </p>
            <QuickInsightLine insight={goalInsight.data} tone="text-emerald-700"/>
          </div>) : (<p className="text-xs text-neutral-500">Set a real dollar goal for today's shift to track live progress.</p>)}
      </div>

      {goldenHourTargets.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-yellow-300 bg-yellow-50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-yellow-900">
              <Zap className="h-3.5 w-3.5"/>
              Golden Hour Push
            </p>
            <Button size="sm" variant="outline" onClick={getGoldenHourPlan} disabled={goldenHourAi.isPending}>
              <Sparkles className="h-3.5 w-3.5"/>
              {goldenHourAi.isPending ? '…' : 'Get plan'}
            </Button>
          </div>
          <div className="space-y-1 text-xs text-neutral-700">
            {goldenHourTargets.map((d) => (<p key={d.voterId}>
                {d.name} · {d.address} — {d.reasons.join(' · ')}
              </p>))}
          </div>
          {goldenHourAi.isError && <p className="text-sm text-red-600">{goldenHourAi.error.message}</p>}
          {goldenHourPlan && (<div className="space-y-1 rounded bg-white p-2.5 text-neutral-700">
              <p className="font-medium text-neutral-900">{goldenHourPlan.headline}</p>
              <p className="text-yellow-800">→ {goldenHourPlan.advice}</p>
            </div>)}
        </div>)}

      {bestTime && (<div className="space-y-1 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-800">
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0"/>
            Best time to knock, from {bestTime.sampleSize} real visits: <strong>{bestTime.bestHourLabel}</strong> ({bestTime.contactRatePct}% real contact rate)
          </p>
          <QuickInsightLine insight={bestTimeInsight.data} tone="text-sky-700"/>
        </div>)}

      {peakAskWindow && (<div className="space-y-2 rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-900">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold">
              <DollarSign className="h-3.5 w-3.5 shrink-0"/>
              Peak Ask Window, from {peakAskWindow.sampleSize} real doorstep gifts:{' '}
              <strong>{peakAskWindow.bestHourLabel}</strong> ({formatUsd(peakAskWindow.totalCentsInBestHour)} ·{' '}
              {peakAskWindow.giftCountInBestHour} gift{peakAskWindow.giftCountInBestHour === 1 ? '' : 's'})
            </p>
            {canUseAi && (<Button size="sm" variant="outline" onClick={getPeakAskBriefing} disabled={peakAskAi.isPending}>
                <Sparkles className="h-3.5 w-3.5"/>
                {peakAskAi.isPending ? '…' : 'Get staffing takeaway'}
              </Button>)}
          </div>
          {peakAskAi.isError && <p className="text-sm text-red-600">{peakAskAi.error.message}</p>}
          {peakAskBriefing && (<div className="space-y-1 rounded bg-white p-2.5 text-neutral-700">
              <p className="font-medium text-neutral-900">{peakAskBriefing.headline}</p>
              <p className="text-green-700">→ {peakAskBriefing.staffing_advice}</p>
            </div>)}
        </div>)}

      {driftAlerts.length > 0 && (<div className="space-y-1 rounded-md border border-neutral-200 p-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Persuasion drift</p>
          {driftAlerts.map((d) => (<div key={`${d.voterId}-${d.occurredAt}`} className="flex items-center gap-1.5 text-xs">
              {d.direction === 'warmed' ? (<ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-emerald-600"/>) : (<ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-rose-600"/>)}
              <span className="text-neutral-700">
                {d.name} {d.direction === 'warmed' ? 'warmed up' : 'cooled off'} ({d.from.replace('_', ' ')} → {d.to.replace('_', ' ')})
              </span>
            </div>))}
          <QuickInsightLine insight={driftInsight.data}/>
        </div>)}

      {askRehearsalSnapshot && canUseAi && (<div className="space-y-2 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fuchsia-900">
              <Dumbbell className="h-3.5 w-3.5"/>
              Ask Rehearsal Prep
            </p>
            <Button size="sm" variant="outline" onClick={getRehearsalPrep} disabled={rehearsalAi.isPending}>
              <Sparkles className="h-3.5 w-3.5"/>
              {rehearsalAi.isPending ? '…' : 'Rehearse my asks'}
            </Button>
          </div>
          <p className="text-xs text-neutral-600">
            {askRehearsalSnapshot.doorCount} warm door{askRehearsalSnapshot.doorCount === 1 ? '' : 's'} today — get
            ready for the questions donors actually ask before you start knocking.
          </p>
          {rehearsalAi.isError && <p className="text-sm text-red-600">{rehearsalAi.error.message}</p>}
          {rehearsalPrep && (<div className="space-y-1.5 rounded bg-white p-2.5 text-xs text-neutral-700">
              <p className="font-medium text-fuchsia-900">{rehearsalPrep.confidence_opener}</p>
              {rehearsalPrep.anticipated_questions.map((q, i) => (<div key={i}>
                  <p className="font-semibold text-neutral-800">Q: {q.question}</p>
                  <p className="text-fuchsia-700">A: {q.answer}</p>
                </div>))}
            </div>)}
        </div>)}

      {momentumTargets.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
            <TrendingUp className="h-3.5 w-3.5"/>
            Momentum Ask — just warmed up, never asked
          </p>
          {momentumTargets.map((t) => (<div key={t.voterId} className="space-y-1 rounded bg-white p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-700">
                  {t.name} ({t.from.replace('_', ' ')} → {t.to.replace('_', ' ')})
                </span>
                <Button size="sm" variant="outline" onClick={() => getMomentumAsk(t)} disabled={momentumAi.isPending}>
                  <Sparkles className="h-3.5 w-3.5"/>
                  {momentumAi.isPending && momentumFor === t.voterId ? '…' : 'Get ask script'}
                </Button>
              </div>
              {momentumScript && momentumFor === t.voterId && (<div className="space-y-1 rounded bg-emerald-50 p-2 text-neutral-700">
                  <p>{momentumScript.opener}</p>
                  <p className="text-emerald-700">→ {momentumScript.ask}</p>
                  <p className="font-medium">Suggested ask: ${momentumScript.suggested_ask_dollars}</p>
                </div>)}
            </div>))}
          {momentumAi.isError && <p className="text-sm text-red-600">{momentumAi.error.message}</p>}
        </div>)}

      {neighborProof.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-800">
            <Home className="h-3.5 w-3.5"/>
            Neighborhood Social Proof
          </p>
          {neighborProof.map((d) => (<div key={d.voterId} className="space-y-1 rounded bg-white p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-700">
                  {d.name} · {d.address} — {d.neighborGiverCount} neighbor{d.neighborGiverCount === 1 ? '' : 's'} on{' '}
                  {d.streetName} already gave
                </span>
                <Button size="sm" variant="outline" onClick={() => getNeighborProofPitch(d)} disabled={neighborProofAi.isPending}>
                  <Sparkles className="h-3.5 w-3.5"/>
                  {neighborProofAi.isPending && neighborProofFor === d.voterId ? '…' : 'Get pitch'}
                </Button>
              </div>
              {neighborProofPitch && neighborProofFor === d.voterId && (<div className="space-y-1 rounded bg-sky-50 p-2 text-neutral-700">
                  <p>{neighborProofPitch.pitch}</p>
                  <p className="text-sky-700">If yes: {neighborProofPitch.if_yes}</p>
                  <p className="text-neutral-500">If no: {neighborProofPitch.if_no}</p>
                  <p className="font-medium">Suggested ask: ${neighborProofPitch.suggested_ask_dollars}</p>
                </div>)}
            </div>))}
          {neighborProofAi.isError && <p className="text-sm text-red-600">{neighborProofAi.error.message}</p>}
        </div>)}

      {canvasserLeaderboard.length > 0 && (<div className="space-y-1 rounded-md border border-neutral-200 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <Trophy className="h-3.5 w-3.5"/>
            Canvasser leaderboard
          </p>
          {canvasserLeaderboard.slice(0, 5).map((c, i) => (<div key={c.canvasserId} className="flex items-center justify-between text-xs text-neutral-700">
              <span>
                {i + 1}. {c.name}
              </span>
              <span className="text-neutral-500">
                {c.contacts} contacted · {c.contactRatePct}% rate ({c.attempts} attempts)
              </span>
            </div>))}
          <QuickInsightLine insight={leaderboardInsight.data}/>
        </div>)}

      {askCoachStats.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-cyan-200 bg-cyan-50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-900">
            <GraduationCap className="h-3.5 w-3.5"/>
            Canvasser Ask Coach
          </p>
          {askCoachStats.map((s) => (<div key={s.canvasserId} className="space-y-1 rounded bg-white p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-700">
                  {s.name}: {s.giftCount} gifts / {s.contacts} contacts ({s.askRatePct}% ask rate)
                </span>
                <Button size="sm" variant="outline" onClick={() => getCoachingNote(s)} disabled={coachAi.isPending}>
                  <Sparkles className="h-3.5 w-3.5"/>
                  {coachAi.isPending && coachFor === s.canvasserId ? '…' : 'Get coaching'}
                </Button>
              </div>
              {coachingNote && coachFor === s.canvasserId && (<div className="space-y-1 rounded bg-cyan-50 p-2 text-neutral-700">
                  <p>{coachingNote.observation}</p>
                  <p className="text-cyan-700">→ {coachingNote.coaching_tip}</p>
                </div>)}
            </div>))}
          {coachAi.isError && <p className="text-sm text-red-600">{coachAi.error.message}</p>}
        </div>)}

      {fatigueAlerts.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-violet-200 bg-violet-50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-900">
            <Coffee className="h-3.5 w-3.5"/>
            Canvasser Pace Check-in
          </p>
          {fatigueAlerts.map((f) => (<div key={f.canvasserId} className="space-y-1 rounded bg-white p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-700">
                  {f.name}: contact rate dropped from {f.earlyContactRatePct}% to {f.laterContactRatePct}% this shift
                </span>
                <Button size="sm" variant="outline" onClick={() => getCheckinPrompt(f)} disabled={checkinAi.isPending}>
                  <Sparkles className="h-3.5 w-3.5"/>
                  {checkinAi.isPending && checkinFor === f.canvasserId ? '…' : 'Draft check-in'}
                </Button>
              </div>
              {checkinPrompt && checkinFor === f.canvasserId && (<div className="space-y-1 rounded bg-violet-50 p-2 text-neutral-700">
                  <p>{checkinPrompt.checkin_message}</p>
                </div>)}
            </div>))}
          {checkinAi.isError && <p className="text-sm text-red-600">{checkinAi.error.message}</p>}
        </div>)}

      {silentCanvassers.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-slate-300 bg-slate-100 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
            <PhoneOff className="h-3.5 w-3.5"/>
            Silent Canvasser Alert
          </p>
          {silentCanvassers.map((s) => (<div key={s.canvasserId} className="space-y-1 rounded bg-white p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-700">
                  {s.name}: no visits logged in {Math.floor(s.minutesSinceLastVisit / 60)}h{' '}
                  {s.minutesSinceLastVisit % 60}m, after {s.visitsToday} today
                </span>
                <Button size="sm" variant="outline" onClick={() => getSilenceCheckin(s)} disabled={silenceAi.isPending}>
                  <Sparkles className="h-3.5 w-3.5"/>
                  {silenceAi.isPending && silenceFor === s.canvasserId ? '…' : 'Draft check-in'}
                </Button>
              </div>
              {silencePrompt && silenceFor === s.canvasserId && (<div className="space-y-1 rounded bg-slate-50 p-2 text-neutral-700">
                  <p>{silencePrompt.checkin_message}</p>
                </div>)}
            </div>))}
          {silenceAi.isError && <p className="text-sm text-red-600">{silenceAi.error.message}</p>}
        </div>)}

      {overlapAlerts.length > 0 && (<div className="space-y-1 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-2.5 text-xs text-fuchsia-900">
          <p className="flex items-center gap-1.5 font-semibold uppercase tracking-wide">
            <Users className="h-3.5 w-3.5"/>
            Cross-canvasser overlap
          </p>
          {overlapAlerts.map((o) => (<p key={o.householdKey}>
              {o.address}: visited by {o.canvassers.join(' and ')} ({o.visitCount} visits) — coordinate next time.
            </p>))}
        </div>)}

      {askCoverageGaps.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-900">
            <AlertTriangle className="h-3.5 w-3.5"/>
            Ask Coverage Gap
          </p>
          {askCoverageGaps.map((g) => (<div key={g.householdKey} className="space-y-1 rounded bg-white p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-700">
                  {g.address}: visited by {g.canvassers.join(' and ')} — {g.warmDoor.name} never asked
                </span>
                <Button size="sm" variant="outline" onClick={() => getCoverageAlert(g)} disabled={coverageGapAi.isPending}>
                  <Sparkles className="h-3.5 w-3.5"/>
                  {coverageGapAi.isPending && coverageGapFor === g.householdKey ? '…' : 'Get alert'}
                </Button>
              </div>
              {coverageAlert && coverageGapFor === g.householdKey && (<div className="space-y-1 rounded bg-red-50 p-2 text-neutral-700">
                  <p>{coverageAlert.alert}</p>
                  <p className="text-red-700">→ {coverageAlert.suggested_next_step}</p>
                </div>)}
            </div>))}
          {coverageGapAi.isError && <p className="text-sm text-red-600">{coverageGapAi.error.message}</p>}
        </div>)}

      {priorityDoors.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-900">
              <Target className="h-3.5 w-3.5"/>
              Priority Door Briefing
            </p>
            <Button size="sm" variant="outline" onClick={getPriorityDoorBriefing} disabled={priorityDoorAi.isPending}>
              <Sparkles className="h-3.5 w-3.5"/>
              {priorityDoorAi.isPending ? '…' : 'Get briefing'}
            </Button>
          </div>
          <div className="space-y-1 text-xs text-neutral-700">
            {priorityDoors.map((d) => (<p key={d.voterId}>
                {d.name} · {d.address} — {d.reasons.join(' · ')}
              </p>))}
          </div>
          {priorityDoorAi.isError && <p className="text-sm text-red-600">{priorityDoorAi.error.message}</p>}
          {priorityDoorBriefing && (<div className="space-y-1 rounded bg-white p-2.5 text-xs text-neutral-700">
              <p className="font-medium text-neutral-900">{priorityDoorBriefing.headline}</p>
              {priorityDoorBriefing.doors.map((d, i) => (<p key={i} className="text-indigo-700">
                  {d.name}: {d.instruction}
                </p>))}
            </div>)}
        </div>)}

      {revisitQueue.length > 0 && (<div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <RotateCcw className="h-3.5 w-3.5"/>
              Revisit queue
            </p>
            {canUseAi && (<Button size="sm" variant="outline" onClick={getRevisitStrategy} disabled={revisitAi.isPending}>
                <Sparkles className="h-3.5 w-3.5"/>
                {revisitAi.isPending ? '…' : 'Get revisit strategy'}
              </Button>)}
          </div>
          <div className="space-y-1 text-xs text-slate-700">
            {revisitQueue.map((r) => (<p key={r.voterId}>
                {r.name}: {r.attempts} no-answer attempts, last tried{' '}
                {new Date(r.lastAttemptAt).toLocaleDateString()}
              </p>))}
          </div>
          {revisitAi.isError && <p className="text-sm text-red-600">{revisitAi.error.message}</p>}
          {revisitStrategy && (<div className="space-y-1 rounded bg-white p-2.5 text-xs text-neutral-700">
              <p>{revisitStrategy.verdict}</p>
              <p className="text-slate-700">→ {revisitStrategy.suggestion}</p>
            </div>)}
        </div>)}

      {persistenceTargets.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <Flame className="h-3.5 w-3.5"/>
            Persistence Pays — just reached, never asked
          </p>
          {persistenceTargets.map((t) => (<div key={t.voterId} className="space-y-1 rounded bg-white p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-700">
                  {t.name}: reached after {t.priorAttempts} prior real no-answer attempts
                </span>
                <Button size="sm" variant="outline" onClick={() => getPersistenceAsk(t)} disabled={persistenceAi.isPending}>
                  <Sparkles className="h-3.5 w-3.5"/>
                  {persistenceAi.isPending && persistenceFor === t.voterId ? '…' : 'Get ask script'}
                </Button>
              </div>
              {persistenceScript && persistenceFor === t.voterId && (<div className="space-y-1 rounded bg-amber-50 p-2 text-neutral-700">
                  <p>{persistenceScript.opener}</p>
                  <p className="text-amber-700">→ {persistenceScript.ask}</p>
                  <p className="font-medium">Suggested ask: ${persistenceScript.suggested_ask_dollars}</p>
                </div>)}
            </div>))}
          {persistenceAi.isError && <p className="text-sm text-red-600">{persistenceAi.error.message}</p>}
        </div>)}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={rebalance}>
          <Shuffle className="h-3.5 w-3.5"/>
          Rebalance now
        </Button>
        <Button variant="outline" size="sm" onClick={applyMoneyRoute}>
          <DollarSign className="h-3.5 w-3.5"/>
          Optimize for $
        </Button>
        {canUseAi && (<Button size="sm" onClick={generateBriefing} disabled={ai.isPending}>
            <Sparkles className="h-3.5 w-3.5"/>
            {ai.isPending ? 'Reading the field…' : "Generate today's briefing"}
          </Button>)}
        {canUseAi && (<Button variant="outline" size="sm" onClick={generateDebrief} disabled={debriefAi.isPending}>
            <CheckCircle2 className="h-3.5 w-3.5"/>
            {debriefAi.isPending ? 'Wrapping up…' : 'End-of-shift debrief'}
          </Button>)}
      </div>
      {rebalanceNote && <p className="text-xs text-neutral-500">{rebalanceNote}</p>}
      {moneyRouteNote && <p className="text-xs text-neutral-500">{moneyRouteNote}</p>}
      {ai.isError && <p className="text-sm text-red-600">{ai.error.message}</p>}

      {briefing && (<div className="space-y-2 rounded-md border border-indigo-100 bg-indigo-50 p-3">
          <p className="text-sm font-medium text-indigo-900">{briefing.headline}</p>
          <div className="space-y-1.5">
            {briefing.focus_areas.map((f, i) => (<div key={i} className="rounded bg-white p-2 text-xs">
                <p className="font-semibold text-neutral-800">{f.area}</p>
                <p className="text-neutral-600">{f.why}</p>
                <p className="text-indigo-700">→ {f.action}</p>
              </div>))}
          </div>
          {briefing.watch_out && (<p className="border-t border-indigo-100 pt-2 text-xs text-amber-700">⚠ {briefing.watch_out}</p>)}
        </div>)}

      {debriefAi.isError && <p className="text-sm text-red-600">{debriefAi.error.message}</p>}
      {shiftDebrief && (<div className="space-y-2 rounded-md border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">{shiftDebrief.headline}</p>
          {shiftDebrief.wins.length > 0 && (<div className="text-xs text-emerald-800">
              <p className="font-semibold">Wins:</p>
              <ul className="ml-4 list-disc">
                {shiftDebrief.wins.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>)}
          {shiftDebrief.follow_up_tomorrow.length > 0 && (<div className="text-xs text-neutral-700">
              <p className="font-semibold">Tomorrow:</p>
              <ul className="ml-4 list-disc">
                {shiftDebrief.follow_up_tomorrow.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>)}
        </div>)}

      {topDoor && canUseAi && (<div className="space-y-2 rounded-md border border-teal-200 bg-teal-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-teal-900">
              Door Prep — {topDoor.full_name || 'next priority door'}
              {topDoor.address_line ? ` · ${topDoor.address_line}` : ''}
              {mapSelectedDoor && ' (selected on map)'}
            </p>
            {mapSelectedDoor && onClearMapSelection && (<Button size="sm" variant="outline" onClick={onClearMapSelection}>
                Clear map selection
              </Button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={getDoorScript} disabled={scriptAi.isPending}>
              <Sparkles className="h-3.5 w-3.5"/>
              {scriptAi.isPending ? '…' : 'Personalized opener'}
            </Button>
            <Button size="sm" variant="outline" onClick={getDoorExplain} disabled={explainAi.isPending}>
              <BookOpenText className="h-3.5 w-3.5"/>
              {explainAi.isPending ? '…' : 'Explain this door'}
            </Button>
            {remainingLanguage && (<Button size="sm" variant="outline" onClick={getLanguagePrep} disabled={languageAi.isPending}>
                <Languages className="h-3.5 w-3.5"/>
                {languageAi.isPending ? '…' : `${remainingLanguage} prep`}
              </Button>)}
          </div>
          {(scriptAi.isError || explainAi.isError || languageAi.isError) && (<p className="text-sm text-red-600">
              {(scriptAi.error || explainAi.error || languageAi.error).message}
            </p>)}
          {doorScript && (<div className="space-y-1 rounded bg-white p-2.5 text-xs text-neutral-700">
              <p>{doorScript.opener}</p>
              {doorScript.key_points.map((k, i) => <p key={i} className="text-teal-700">• {k}</p>)}
              <p className="italic text-neutral-500">{doorScript.sign_off}</p>
            </div>)}
          {doorExplain && (<p className="rounded bg-white p-2.5 text-xs text-neutral-700">{doorExplain.summary}</p>)}
          {languagePrep && (<div className="space-y-1 rounded bg-white p-2.5 text-xs text-neutral-700">
              <p><span className="font-semibold text-neutral-900">Greeting:</span> {languagePrep.greeting}</p>
              <p><span className="font-semibold text-neutral-900">Key phrase:</span> {languagePrep.key_phrase}</p>
              <p className="text-neutral-500">{languagePrep.respectful_note}</p>
            </div>)}
        </div>)}

      {territoryDifficulty.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-orange-200 bg-orange-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-orange-900">
              <MapPinned className="h-3.5 w-3.5"/>
              Territory Difficulty
            </p>
            <Button size="sm" variant="outline" onClick={generateTerritoryBriefing} disabled={territoryAi.isPending}>
              <Sparkles className="h-3.5 w-3.5"/>
              {territoryAi.isPending ? '…' : 'Get staffing briefing'}
            </Button>
          </div>
          <div className="space-y-1 text-xs text-neutral-700">
            {territoryDifficulty.slice(0, 5).map((t) => (<p key={t.territoryId}>
                {t.name}: {t.contactRatePct}% contact rate, {t.oppositionPct}% opposition, {t.remainingDoors} doors left
              </p>))}
          </div>
          {territoryAi.isError && <p className="text-sm text-red-600">{territoryAi.error.message}</p>}
          {territoryBriefing && (<div className="space-y-1.5">
              {territoryBriefing.ranked.map((r, i) => (<div key={i} className="rounded bg-white p-2 text-xs">
                  <p className="font-semibold text-neutral-800">{r.territory}</p>
                  <p className="text-neutral-600">{r.difficulty_note}</p>
                  <p className="text-orange-700">→ {r.staffing_advice}</p>
                </div>))}
            </div>)}
        </div>)}

      {territoryRoi.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-lime-200 bg-lime-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-lime-900">
              <TrendingUp className="h-3.5 w-3.5"/>
              Territory Fundraising ROI
            </p>
            <Button size="sm" variant="outline" onClick={getTerritoryRoiBriefing} disabled={territoryRoiAi.isPending}>
              <Sparkles className="h-3.5 w-3.5"/>
              {territoryRoiAi.isPending ? '…' : 'Get ROI briefing'}
            </Button>
          </div>
          <div className="space-y-1 text-xs text-neutral-700">
            {territoryRoi.slice(0, 5).map((t) => (<p key={t.territoryId}>
                {t.name}: {formatUsd(t.totalCents)} raised over {t.doorsKnocked} doors knocked (
                {formatUsd(t.centsPerDoorKnocked)}/door)
              </p>))}
          </div>
          {territoryRoiAi.isError && <p className="text-sm text-red-600">{territoryRoiAi.error.message}</p>}
          {territoryRoiBriefing && (<div className="space-y-1.5">
              {territoryRoiBriefing.ranked.map((r, i) => (<div key={i} className="rounded bg-white p-2 text-xs">
                  <p className="font-semibold text-neutral-800">{r.territory}</p>
                  <p className="text-neutral-600">{r.roi_note}</p>
                  <p className="text-lime-700">→ {r.staffing_advice}</p>
                </div>))}
            </div>)}
        </div>)}

      {reallocations.length > 0 && canUseAi && (<div className="space-y-2 rounded-md border border-teal-200 bg-teal-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
              <ArrowRightLeft className="h-3.5 w-3.5"/>
              Territory Staffing Advisor
            </p>
            <Button size="sm" variant="outline" onClick={getTerritoryStaffingBriefing} disabled={territoryStaffingAi.isPending}>
              <Sparkles className="h-3.5 w-3.5"/>
              {territoryStaffingAi.isPending ? '…' : 'Get staffing briefing'}
            </Button>
          </div>
          <div className="space-y-1 text-xs text-neutral-700">
            {reallocations.map((r, i) => (<p key={i}>
                Move canvassers from {r.fromTerritory} ({r.fromDoorsPerCanvasser} doors/canvasser) to {r.toTerritory} (
                {r.toDoorsPerCanvasser} doors/canvasser)
              </p>))}
          </div>
          {territoryStaffingAi.isError && (<p className="text-sm text-red-600">{territoryStaffingAi.error.message}</p>)}
          {territoryStaffingBriefing && (<div className="space-y-1.5">
              {territoryStaffingBriefing.ranked.map((r, i) => (<div key={i} className="rounded bg-white p-2 text-xs">
                  <p className="text-neutral-800">{r.suggestion}</p>
                  <p className="text-teal-700">→ {r.reason}</p>
                </div>))}
            </div>)}
        </div>)}

      {canUseAi && (<div className="space-y-2 rounded-md border border-rose-200 bg-rose-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-900">
              <CalendarClock className="h-3.5 w-3.5"/>
              Election Countdown Ask
            </p>
            <Input type="date" className="h-7 w-40 text-xs" value={electionDate} onChange={(e) => setElectionDate(e.target.value)}/>
          </div>
          <p className="text-xs text-neutral-500">
            The fundraising analog of the GOTV Countdown Planner — enter the real election date to turn warm,
            never-given doors into a time-pressured (never fabricated) closing ask.
          </p>
          {electionDate && countdownDays !== null && countdownDays >= 0 && countdownTargets.length > 0 && (<div className="space-y-2">
              <p className="text-xs font-medium text-rose-800">{countdownDays} real day{countdownDays === 1 ? '' : 's'} until election day</p>
              {countdownTargets.map((t) => (<div key={t.voterId} className="space-y-1 rounded bg-white p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-neutral-700">{t.name} · {t.address}</span>
                    <Button size="sm" variant="outline" onClick={() => getCountdownAsk(t)} disabled={countdownAi.isPending}>
                      <Sparkles className="h-3.5 w-3.5"/>
                      {countdownAi.isPending && countdownFor === t.voterId ? '…' : 'Get ask script'}
                    </Button>
                  </div>
                  {countdownScript && countdownFor === t.voterId && (<div className="space-y-1 rounded bg-rose-50 p-2 text-neutral-700">
                      <p>{countdownScript.opener}</p>
                      <p className="text-rose-700">→ {countdownScript.ask}</p>
                      <p className="font-medium">Suggested ask: ${countdownScript.suggested_ask_dollars}</p>
                    </div>)}
                </div>))}
            </div>)}
          {countdownAi.isError && <p className="text-sm text-red-600">{countdownAi.error.message}</p>}
        </div>)}

      {canUseAi && (<div className="space-y-2 rounded-md border border-violet-200 bg-violet-50 p-3">
          <div className="flex items-center gap-1.5">
            <MessageCircleQuestion className="h-3.5 w-3.5 text-violet-600"/>
            <p className="text-xs font-semibold text-violet-900">Live Objection Assistant</p>
          </div>
          <p className="text-xs text-neutral-500">
            Type what a voter just said at the door — get an instant, honest pivot to say next.
          </p>
          <div className="flex gap-2">
            <Input placeholder="e.g. &quot;I'm worried about property taxes&quot;" value={objectionText} onChange={(e) => setObjectionText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askObjection()}/>
            <Button size="sm" onClick={askObjection} disabled={objectionAi.isPending || !objectionText.trim()}>
              <Sparkles className="h-3.5 w-3.5"/>
              {objectionAi.isPending ? '…' : 'Get pivot'}
            </Button>
          </div>
          {objectionAi.isError && <p className="text-sm text-red-600">{objectionAi.error.message}</p>}
          {objectionResult && (<div className="space-y-1 rounded bg-white p-2.5 text-xs text-neutral-700">
              <p><span className="font-semibold text-neutral-900">Acknowledge:</span> {objectionResult.acknowledge}</p>
              <p><span className="font-semibold text-neutral-900">Bridge:</span> {objectionResult.bridge}</p>
              <p><span className="font-semibold text-neutral-900">Pivot:</span> {objectionResult.pivot}</p>
            </div>)}
        </div>)}

      {canUseAi && (<div className="space-y-2 rounded-md border border-pink-200 bg-pink-50 p-3">
          <div className="flex items-center gap-1.5">
            <MessagesSquare className="h-3.5 w-3.5 text-pink-600"/>
            <p className="text-xs font-semibold text-pink-900">Donation Objection Handler</p>
          </div>
          <p className="text-xs text-neutral-500">
            Type exactly what a voter said when they declined or stalled on a donation ask — get an honest
            pivot, and a same-day follow-up text if it was about cash or timing, never if it was a flat no.
          </p>
          <div className="flex gap-2">
            <Input placeholder="e.g. &quot;I don't have any cash on me right now&quot;" value={donationObjectionText} onChange={(e) => setDonationObjectionText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askDonationObjection()}/>
            <Button size="sm" onClick={askDonationObjection} disabled={donationObjectionAi.isPending || !donationObjectionText.trim()}>
              <Sparkles className="h-3.5 w-3.5"/>
              {donationObjectionAi.isPending ? '…' : 'Get response'}
            </Button>
          </div>
          {donationObjectionAi.isError && (<p className="text-sm text-red-600">{donationObjectionAi.error.message}</p>)}
          {donationObjectionResult && (<div className="space-y-1 rounded bg-white p-2.5 text-xs text-neutral-700">
              <p>
                <span className="font-semibold text-neutral-900">Acknowledge:</span>{' '}
                {donationObjectionResult.acknowledge}
              </p>
              <p>
                <span className="font-semibold text-neutral-900">Pivot:</span> {donationObjectionResult.pivot}
              </p>
              {donationObjectionResult.follow_up_text && (<p>
                  <span className="font-semibold text-neutral-900">Follow-up text:</span>{' '}
                  {donationObjectionResult.follow_up_text}
                </p>)}
            </div>)}
        </div>)}
    </div>);
}
function Stat({ label, value, tone }) {
    return (<div className="rounded-md border border-neutral-200 bg-neutral-50 p-2 text-center">
      <p className={`text-lg font-semibold ${tone ?? 'text-neutral-900'}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
    </div>);
}
// Passive AI decoration (useQuickInsight's own contract: never blocks,
// never errors visibly, renders nothing until real commentary exists).
function QuickInsightLine({ insight, tone }) {
    if (!insight)
        return null;
    return (<p className={`flex items-start gap-1.5 text-xs ${tone ?? 'text-violet-700'}`}>
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0"/>
      {insight}
    </p>);
}
function NumberField({ label, value, onChange, min = 0, step = 1 }) {
    return (<label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
      {label}
      <input type="number" min={min} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-7 w-20 rounded-md border border-neutral-300 px-2 text-right text-xs"/>
    </label>);
}
function CheckboxField({ label, checked, onChange }) {
    return (<label className="flex items-center gap-1.5 text-xs text-neutral-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}/>
      {label}
    </label>);
}
// The full customization surface for every filter/threshold in Turf
// Briefing — edits a local draft; nothing persists until Save (which
// upserts turf_briefing_preferences, migration 0031).
function CustomizePanel({ draft, setDraft, onSave, onReset, saving }) {
    return (<div className="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-neutral-700">Stat windows</legend>
          <NumberField label={'"Recent" window (hours)'} value={draft.statWindows.recentHours} onChange={(n) => setDraft((p) => ({ ...p, statWindows: { ...p.statWindows, recentHours: n } }))}/>
          <NumberField label={'"Today" window (hours)'} value={draft.statWindows.todayHours} onChange={(n) => setDraft((p) => ({ ...p, statWindows: { ...p.statWindows, todayHours: n } }))}/>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-neutral-700">Best Time to Knock</legend>
          <NumberField label="Min. total visits" value={draft.bestTimeToKnock.minSample} onChange={(n) => setDraft((p) => ({ ...p, bestTimeToKnock: { ...p.bestTimeToKnock, minSample: n } }))}/>
          <NumberField label="Min. attempts/hour" value={draft.bestTimeToKnock.minHourAttempts} onChange={(n) => setDraft((p) => ({ ...p, bestTimeToKnock: { ...p.bestTimeToKnock, minHourAttempts: n } }))}/>
          <NumberField label="Lookback (days)" value={draft.bestTimeToKnock.lookbackDays} onChange={(n) => setDraft((p) => ({ ...p, bestTimeToKnock: { ...p.bestTimeToKnock, lookbackDays: n } }))}/>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-neutral-700">Persuasion Drift</legend>
          <NumberField label="Lookback (days)" value={draft.persuasionDrift.lookbackDays} onChange={(n) => setDraft((p) => ({ ...p, persuasionDrift: { ...p.persuasionDrift, lookbackDays: n } }))}/>
          <CheckboxField label="Show warmed-up doors" checked={draft.persuasionDrift.showWarmed} onChange={(v) => setDraft((p) => ({ ...p, persuasionDrift: { ...p.persuasionDrift, showWarmed: v } }))}/>
          <CheckboxField label="Show cooled-off doors" checked={draft.persuasionDrift.showCooled} onChange={(v) => setDraft((p) => ({ ...p, persuasionDrift: { ...p.persuasionDrift, showCooled: v } }))}/>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-neutral-700">Map</legend>
          <NumberField label="Household min. size" value={draft.household.minSize} onChange={(n) => setDraft((p) => ({ ...p, household: { minSize: n } }))}/>
          <NumberField label="Heatmap noise floor" value={draft.heatmap.minWeightToShow} min={0} step={0.1} onChange={(n) => setDraft((p) => ({ ...p, heatmap: { minWeightToShow: n } }))}/>
          <NumberField label="Daylight warning (min)" value={draft.daylight.warnMinutes} onChange={(n) => setDraft((p) => ({ ...p, daylight: { warnMinutes: n } }))}/>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-neutral-700">Canvasser coordination</legend>
          <NumberField label="Leaderboard min. attempts" value={draft.canvasserLeaderboard.minAttempts} onChange={(n) => setDraft((p) => ({ ...p, canvasserLeaderboard: { minAttempts: n } }))}/>
          <NumberField label="Overlap lookback (days)" value={draft.overlapGuard.lookbackDays} onChange={(n) => setDraft((p) => ({ ...p, overlapGuard: { lookbackDays: n } }))}/>
          <NumberField label="Revisit min. attempts" value={draft.revisitQueue.minAttempts} onChange={(n) => setDraft((p) => ({ ...p, revisitQueue: { minAttempts: n } }))}/>
        </fieldset>

        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="text-xs font-semibold text-neutral-700">Pin highlight filter</legend>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-7 rounded-md border border-neutral-300 bg-white px-2 text-xs" value={draft.highlightFilter.mode} onChange={(e) => setDraft((p) => ({ ...p, highlightFilter: { mode: e.target.value, value: null } }))}>
              <option value="none">No highlight filter</option>
              <option value="party">Highlight by party</option>
              <option value="persuadability">Highlight by persuadability</option>
            </select>
            {draft.highlightFilter.mode === 'party' && (<select className="h-7 rounded-md border border-neutral-300 bg-white px-2 text-xs" value={draft.highlightFilter.value ?? ''} onChange={(e) => setDraft((p) => ({ ...p, highlightFilter: { ...p.highlightFilter, value: e.target.value } }))}>
                <option value="" disabled>Choose a party…</option>
                {Object.keys(PARTY_LABELS).map((k) => (<option key={k} value={k}>{PARTY_LABELS[k]}</option>))}
              </select>)}
            {draft.highlightFilter.mode === 'persuadability' && (<select className="h-7 rounded-md border border-neutral-300 bg-white px-2 text-xs" value={draft.highlightFilter.value ?? ''} onChange={(e) => setDraft((p) => ({ ...p, highlightFilter: { ...p.highlightFilter, value: e.target.value } }))}>
                <option value="" disabled>Choose a bucket…</option>
                {Object.keys(PERSUADABILITY_LABELS).map((k) => (<option key={k} value={k}>{PERSUADABILITY_LABELS[k]}</option>))}
              </select>)}
          </div>
        </fieldset>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="outline" onClick={onReset}>
          Reset to defaults
        </Button>
      </div>
    </div>);
}
