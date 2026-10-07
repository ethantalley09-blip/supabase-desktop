import { describe, expect, it } from 'vitest';
import { answerAvgDoorsPerCanvasserToday, answerBestContactRateTerritory, answerBestDayOfWeek, answerBestPerformingPost, answerBestTimeToKnock, answerSkipADayImpact, answerCanvasserMomentum, answerCanvasserWellbeing, answerCoachingPairs, answerCurrentDoorScript, answerCurrentSurveyQuestions, answerDonorConcentration, answerDonorGrowthVsAverageGift, answerDonorRepeatShare, answerDoorsKnockedToday, answerDoorstepAttribution, answerFundraisingPace, answerHardestTerritory, answerLodgingCost, answerNextTerritoryToCanvass, answerPaymentMethodBreakdown, answerPersuasionDrift, answerPostingFrequency, answerRevisitCandidates, answerSocialPerformance, answerTeamContactRate, answerTerritorySupportBreakdown, answerTodaysContactRate, answerTodaysStaffing, answerTodayVsBaseline, answerTopCanvasser, answerTopCanvasserThisWeek, answerTopFundraiser, answerUnattemptedDoors, answerWalkbookSizeOutliers, answerWeekendVsWeekday, answerWeeklySocialReach, answerWorstContactRateTerritory, computeAverageDailyDoors, computeCanvasserMomentum, computeDoorstepAttribution, computeFundraisingPace, computeSocialPerformance, computeTeamContactRates, describeContactRateDropAlert, describeDataFreshnessAlert, describeFundraisingMomentumAlert, rankTerritoriesByContactRate, scenarioAddWorkers, scenarioAdjustPace } from './advisorInsights';
describe('answerTopCanvasser', () => {
    const visits = [
        { canvasser_id: 'a', canvasser_name: 'Ana', outcome: 'contacted' },
        { canvasser_id: 'a', canvasser_name: 'Ana', outcome: 'contacted' },
        { canvasser_id: 'a', canvasser_name: 'Ana', outcome: 'no_answer' },
        { canvasser_id: 'b', canvasser_name: 'Ben', outcome: 'no_answer' },
        { canvasser_id: 'b', canvasser_name: 'Ben', outcome: 'no_answer' },
        { canvasser_id: 'b', canvasser_name: 'Ben', outcome: 'no_answer' }
    ];
    it('names the real top canvasser by contacts', () => {
        const result = answerTopCanvasser(visits);
        expect(result.answer).toBe('Ana, with 2 real contacts from 3 attempts.');
    });
    it('is honest when nobody has enough logged visits yet', () => {
        const result = answerTopCanvasser([{ canvasser_id: 'a', canvasser_name: 'Ana', outcome: 'contacted' }]);
        expect(result.answer).toContain('Not enough logged visits');
    });
});
const now = new Date('2026-01-15T18:00:00Z'); // Thursday
const daysAgoIso = (n, hour = 12) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};
describe('answerDoorsKnockedToday / answerTodaysContactRate / answerAvgDoorsPerCanvasserToday', () => {
    it('are honest when nothing has been knocked today', () => {
        expect(answerDoorsKnockedToday([], now).answer).toBe('No doors knocked yet today.');
        expect(answerTodaysContactRate([], now).answer).toBe('No doors knocked yet today.');
        expect(answerAvgDoorsPerCanvasserToday([], now).answer).toBe('No doors knocked yet today.');
    });
    it('count only real visits from today, ignoring other days', () => {
        const visits = [
            { occurred_at: daysAgoIso(0), outcome: 'contacted', canvasser_id: 'a' },
            { occurred_at: daysAgoIso(0), outcome: 'no_answer', canvasser_id: 'b' },
            { occurred_at: daysAgoIso(1), outcome: 'contacted', canvasser_id: 'a' }
        ];
        expect(answerDoorsKnockedToday(visits, now).answer).toBe('2 doors knocked today.');
        expect(answerTodaysContactRate(visits, now).answer).toBe('50% contact rate today.');
        expect(answerAvgDoorsPerCanvasserToday(visits, now).answer).toBe('1 doors per canvasser today.');
    });
});
describe('answerTopCanvasserThisWeek', () => {
    it('only counts real visits from the trailing 7 days', () => {
        const visits = [
            { canvasser_id: 'a', canvasser_name: 'Ana', outcome: 'contacted', occurred_at: daysAgoIso(2) },
            { canvasser_id: 'a', canvasser_name: 'Ana', outcome: 'contacted', occurred_at: daysAgoIso(2) },
            { canvasser_id: 'a', canvasser_name: 'Ana', outcome: 'no_answer', occurred_at: daysAgoIso(2) },
            { canvasser_id: 'b', canvasser_name: 'Ben', outcome: 'contacted', occurred_at: daysAgoIso(10) },
            { canvasser_id: 'b', canvasser_name: 'Ben', outcome: 'contacted', occurred_at: daysAgoIso(10) },
            { canvasser_id: 'b', canvasser_name: 'Ben', outcome: 'contacted', occurred_at: daysAgoIso(10) }
        ];
        const result = answerTopCanvasserThisWeek(visits, now);
        expect(result.answer).toContain('Ana');
    });
    it('is honest when nobody has enough visits this week', () => {
        expect(answerTopCanvasserThisWeek([], now).answer).toContain('Not enough logged visits');
    });
});
describe('computeCanvasserMomentum / answerCanvasserMomentum', () => {
    it('detects a real improving trend within the week', () => {
        const early = Array.from({ length: 5 }, (_, i) => ({
            canvasser_id: 'a',
            canvasser_name: 'Ana',
            outcome: 'no_answer',
            occurred_at: daysAgoIso(6, 8 + i)
        }));
        const later = Array.from({ length: 5 }, (_, i) => ({
            canvasser_id: 'a',
            canvasser_name: 'Ana',
            outcome: 'contacted',
            occurred_at: daysAgoIso(1, 8 + i)
        }));
        const result = computeCanvasserMomentum([...early, ...later], now);
        expect(result[0].canvasserId).toBe('a');
        expect(result[0].changePct).toBeGreaterThan(0);
        expect(answerCanvasserMomentum([...early, ...later], now).answer).toContain('Ana improving most');
    });
    it('is honest with too little data to compare', () => {
        expect(answerCanvasserMomentum([], now).answer).toContain('Not enough logged visits');
    });
});
describe('computeTeamContactRates / answerTeamContactRate', () => {
    const shifts = [
        { profile_id: 'a', shift_date: '2026-01-15', team_name: 'North' },
        { profile_id: 'b', shift_date: '2026-01-15', team_name: 'South' }
    ];
    it('attributes real visits to a team only when the canvasser+date matches a team-tagged shift', () => {
        const visits = [
            { canvasser_id: 'a', occurred_at: '2026-01-15T10:00:00Z', outcome: 'contacted' },
            { canvasser_id: 'a', occurred_at: '2026-01-15T10:30:00Z', outcome: 'no_answer' },
            { canvasser_id: 'b', occurred_at: '2026-01-15T10:00:00Z', outcome: 'contacted' },
            { canvasser_id: 'c', occurred_at: '2026-01-15T10:00:00Z', outcome: 'contacted' } // no shift -> unattributed
        ];
        const teams = computeTeamContactRates(visits, shifts);
        expect(teams.find((t) => t.team === 'North')?.attempts).toBe(2);
        expect(teams.find((t) => t.team === 'South')?.contactRatePct).toBe(100);
        expect(answerTeamContactRate(visits, shifts).answer).toContain('South');
    });
    it('is honest when no visit matches a team-tagged shift', () => {
        expect(answerTeamContactRate([], []).answer).toContain('No team-tagged shifts');
    });
});
describe('computeDayOfWeekPerformance / answerBestDayOfWeek / answerWeekendVsWeekday', () => {
    it('is honest with too few logged visits', () => {
        expect(answerBestDayOfWeek([]).answer).toContain('Not enough logged visits');
        expect(answerWeekendVsWeekday([]).answer).toContain('Not enough logged visits');
    });
    it('compares real weekend vs weekday contact rates', () => {
        const weekend = Array.from({ length: 6 }, (_, i) => ({
            occurred_at: `2026-01-1${i % 2 === 0 ? 7 : 8}T10:00:00Z`, // Jan 17/18 2026 = Sat/Sun
            outcome: 'contacted'
        }));
        const weekday = Array.from({ length: 6 }, () => ({ occurred_at: '2026-01-15T10:00:00Z', outcome: 'no_answer' }));
        const result = answerWeekendVsWeekday([...weekend, ...weekday]);
        expect(result.answer).toBe('Weekends: 100% contact rate. Weekdays: 0% contact rate.');
    });
});
describe('answerCoachingPairs', () => {
    it('pairs the strongest canvasser with the one who has the most room to grow', () => {
        const visits = [
            ...Array.from({ length: 4 }, () => ({ canvasser_id: 'a', canvasser_name: 'Ana', outcome: 'contacted' })),
            ...Array.from({ length: 4 }, () => ({ canvasser_id: 'b', canvasser_name: 'Ben', outcome: 'no_answer' }))
        ];
        const result = answerCoachingPairs(visits);
        expect(result.answer).toContain('Ana');
        expect(result.answer).toContain('Ben');
    });
    it('is honest when there are not enough canvassers to pair', () => {
        expect(answerCoachingPairs([]).answer).toContain('Not enough canvassers');
    });
});
describe('answerTodayVsBaseline', () => {
    it('is honest with no baseline data', () => {
        expect(answerTodayVsBaseline([], now).answer).toBe('Not enough data yet to compare today against a baseline.');
    });
    it('reports a real above-baseline day', () => {
        const today = Array.from({ length: 20 }, (_, i) => ({ occurred_at: daysAgoIso(0, 8 + (i % 10)), canvasser_id: `c${i % 4}` }));
        const priorWeek = Array.from({ length: 14 }, (_, i) => ({ occurred_at: daysAgoIso(1 + (i % 6), 9), canvasser_id: `c${i % 2}` }));
        const result = answerTodayVsBaseline([...today, ...priorWeek], now);
        expect(result.answer).toContain('well above');
    });
});
describe('answerHardestTerritory / rankTerritoriesByContactRate', () => {
    const voters = [
        { id: 'v1', territory_id: 't1' },
        { id: 'v2', territory_id: 't1' },
        { id: 'v3', territory_id: 't1' },
        { id: 'v4', territory_id: 't2' },
        { id: 'v5', territory_id: 't2' },
        { id: 'v6', territory_id: 't2' }
    ];
    const territories = [
        { id: 't1', name: 'North' },
        { id: 't2', name: 'South' }
    ];
    const visits = [
        { voter_id: 'v1', outcome: 'dead_door', persuadability_bucket: 'opposed' },
        { voter_id: 'v2', outcome: 'dead_door', persuadability_bucket: 'opposed' },
        { voter_id: 'v3', outcome: 'contacted', persuadability_bucket: 'opposed' },
        { voter_id: 'v4', outcome: 'contacted', persuadability_bucket: 'base_support' },
        { voter_id: 'v5', outcome: 'contacted', persuadability_bucket: 'base_support' },
        { voter_id: 'v6', outcome: 'contacted', persuadability_bucket: 'base_support' }
    ];
    it('names the real hardest territory by opposition + dead-door rate', () => {
        const result = answerHardestTerritory(voters, visits, territories);
        expect(result.answer).toContain('North');
    });
    it('is honest when no territory has enough logged visits', () => {
        const result = answerHardestTerritory(voters.slice(0, 1), [visits[0]], territories);
        expect(result.answer).toContain('Not enough logged visits');
    });
    it('ranks best and worst territory by contact rate', () => {
        const ranked = [
            { territoryId: 't1', name: 'North', attempts: 3, contactRatePct: 33, oppositionPct: 67, deadDoorPct: 67, remainingDoors: 0 },
            { territoryId: 't2', name: 'South', attempts: 3, contactRatePct: 100, oppositionPct: 0, deadDoorPct: 0, remainingDoors: 0 }
        ];
        const { best, worst } = rankTerritoriesByContactRate(ranked);
        expect(best?.name).toBe('South');
        expect(worst?.name).toBe('North');
    });
    it('returns nulls when there is nothing to rank', () => {
        expect(rankTerritoriesByContactRate([])).toEqual({ best: null, worst: null });
    });
});
describe('answerBestContactRateTerritory / answerWorstContactRateTerritory', () => {
    const voters = [
        { id: 'v1', territory_id: 't1' },
        { id: 'v2', territory_id: 't1' },
        { id: 'v3', territory_id: 't1' },
        { id: 'v4', territory_id: 't2' },
        { id: 'v5', territory_id: 't2' },
        { id: 'v6', territory_id: 't2' }
    ];
    const territories = [
        { id: 't1', name: 'North' },
        { id: 't2', name: 'South' }
    ];
    const visits = [
        { voter_id: 'v1', outcome: 'no_answer', persuadability_bucket: 'unknown' },
        { voter_id: 'v2', outcome: 'no_answer', persuadability_bucket: 'unknown' },
        { voter_id: 'v3', outcome: 'contacted', persuadability_bucket: 'opposed' },
        { voter_id: 'v4', outcome: 'contacted', persuadability_bucket: 'base_support' },
        { voter_id: 'v5', outcome: 'contacted', persuadability_bucket: 'base_support' },
        { voter_id: 'v6', outcome: 'contacted', persuadability_bucket: 'base_support' }
    ];
    it('names the real best and worst turf by contact rate', () => {
        expect(answerBestContactRateTerritory(voters, visits, territories).answer).toContain('South');
        expect(answerWorstContactRateTerritory(voters, visits, territories).answer).toContain('North');
    });
    it('is honest when no territory has enough logged visits', () => {
        expect(answerBestContactRateTerritory([], [], []).answer).toContain('Not enough logged visits');
        expect(answerWorstContactRateTerritory([], [], []).answer).toContain('Not enough logged visits');
    });
});
describe('answerNextTerritoryToCanvass', () => {
    it('is honest when no territory has remaining doors', () => {
        expect(answerNextTerritoryToCanvass([], []).answer).toBe('No territory has remaining doors to work right now.');
    });
    it('picks the real territory with the most remaining doors, even with zero visits logged', () => {
        const voters = [
            { id: 'v1', territory_id: 't1', contact_status: 'active', lat: 1, lng: 1, last_contacted_at: null },
            { id: 'v2', territory_id: 't1', contact_status: 'active', lat: 1, lng: 1, last_contacted_at: null },
            { id: 'v3', territory_id: 't2', contact_status: 'active', lat: 1, lng: 1, last_contacted_at: null }
        ];
        const territories = [{ id: 't1', name: 'North' }, { id: 't2', name: 'South' }];
        const result = answerNextTerritoryToCanvass(voters, territories);
        expect(result.answer).toContain('North');
        expect(result.answer).toContain('2 doors');
    });
});
describe('computeTerritorySupportBreakdown / answerTerritorySupportBreakdown', () => {
    const voters = [
        { id: 'v1', territory_id: 't1' },
        { id: 'v2', territory_id: 't2' }
    ];
    const territories = [{ id: 't1', name: 'North' }, { id: 't2', name: 'South' }];
    it('is honest with no logged visits', () => {
        expect(answerTerritorySupportBreakdown([], [], []).answer).toContain('Not enough logged visits');
    });
    it('names the real turf with the most supporters and the most persuadable voters', () => {
        const visits = [
            { voter_id: 'v1', outcome: 'contacted', persuadability_bucket: 'base_support' },
            { voter_id: 'v2', outcome: 'contacted', persuadability_bucket: 'persuadable' }
        ];
        const result = answerTerritorySupportBreakdown(voters, visits, territories);
        expect(result.answer).toContain('North has the most real supporters');
        expect(result.answer).toContain('South has the most undecided/persuadable');
    });
});
describe('computeWalkbookSizes / answerWalkbookSizeOutliers', () => {
    it('is honest with fewer than two sized territories', () => {
        expect(answerWalkbookSizeOutliers([], []).answer).toContain('Not enough territories');
    });
    it('flags a real oversized walkbook relative to the average', () => {
        const territories = [
            { id: 't1', name: 'Big' },
            { id: 't2', name: 'Normal A' },
            { id: 't3', name: 'Normal B' }
        ];
        const voters = [
            ...Array.from({ length: 30 }, (_, i) => ({ id: `big${i}`, territory_id: 't1' })),
            ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, territory_id: 't2' })),
            ...Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, territory_id: 't3' }))
        ];
        const result = answerWalkbookSizeOutliers(voters, territories);
        expect(result.answer).toContain('Big');
        expect(result.answer).toContain('oversized');
    });
});
describe('answerUnattemptedDoors', () => {
    it('is honest with no mapped active voters', () => {
        expect(answerUnattemptedDoors([], []).answer).toBe('No mapped, active voters in this project yet.');
    });
    it('counts real active mapped voters with zero logged visits', () => {
        const voters = [
            { id: 'v1', contact_status: 'active', lat: 1, lng: 1 },
            { id: 'v2', contact_status: 'active', lat: 1, lng: 1 },
            { id: 'v3', contact_status: 'moved', lat: 1, lng: 1 }
        ];
        const result = answerUnattemptedDoors(voters, [{ voter_id: 'v1' }]);
        expect(result.answer).toBe('1 door (50%) have never been attempted.');
    });
});
describe('answerRevisitCandidates', () => {
    it('is honest with no repeated no-answer attempts', () => {
        expect(answerRevisitCandidates([], []).answer).toContain('No doors with repeated no-answer attempts');
    });
    it('flags a real door with repeated no-answer attempts', () => {
        const voters = [{ id: 'v1', full_name: 'Jamie' }];
        const visits = [
            { voter_id: 'v1', occurred_at: '2026-01-01T10:00:00Z', outcome: 'no_answer' },
            { voter_id: 'v1', occurred_at: '2026-01-03T10:00:00Z', outcome: 'no_answer' }
        ];
        const result = answerRevisitCandidates(voters, visits);
        expect(result.answer).toContain('Jamie');
        expect(result.answer).toContain('2 attempts');
    });
});
describe('answerBestTimeToKnock', () => {
    it('reports the real best hour and contact rate', () => {
        const visits = [
            { occurred_at: '2026-01-01T18:00:00Z', outcome: 'contacted' },
            { occurred_at: '2026-01-01T18:05:00Z', outcome: 'contacted' },
            { occurred_at: '2026-01-01T18:10:00Z', outcome: 'no_answer' },
            { occurred_at: '2026-01-01T10:00:00Z', outcome: 'no_answer' },
            { occurred_at: '2026-01-01T10:05:00Z', outcome: 'no_answer' }
        ];
        const result = answerBestTimeToKnock(visits);
        expect(result.answer).toContain('67% contact rate');
    });
    it('is honest with too small a sample', () => {
        const result = answerBestTimeToKnock([{ occurred_at: '2026-01-01T18:00:00Z', outcome: 'contacted' }]);
        expect(result.answer).toContain('Not enough logged visits');
    });
});
describe('answerPersuasionDrift', () => {
    it('is honest when nothing has shifted', () => {
        const result = answerPersuasionDrift([]);
        expect(result.answer).toBe('No detected shifts between visits yet.');
    });
    it('reports a real warmed-up shift between two visits', () => {
        const visits = [
            { voter_id: 'v1', voter_name: 'Jamie', occurred_at: '2026-01-01T10:00:00Z', persuadability_bucket: 'opposed' },
            { voter_id: 'v1', voter_name: 'Jamie', occurred_at: '2026-01-05T10:00:00Z', persuadability_bucket: 'base_support' }
        ];
        const result = answerPersuasionDrift(visits);
        expect(result.answer).toContain('Jamie warmed up');
        expect(result.evidence).toEqual(['1 warmed up', '0 cooled off']);
    });
});
describe('answerCanvasserWellbeing', () => {
    const now = new Date('2026-01-15T18:00:00Z');
    const today = (h, m = 0) => new Date(Date.UTC(2026, 0, 15, h, m)).toISOString();
    it('is honest when nobody shows a fatigue or silence signal', () => {
        const result = answerCanvasserWellbeing([], now);
        expect(result.answer).toBe('No fatigue or check-in signals right now.');
    });
    it('flags a real gone-quiet canvasser', () => {
        const visits = [
            { canvasser_id: 'a', canvasser_name: 'Sam', occurred_at: today(9), outcome: 'contacted' },
            { canvasser_id: 'a', canvasser_name: 'Sam', occurred_at: today(9, 15), outcome: 'contacted' }
        ];
        const result = answerCanvasserWellbeing(visits, now);
        expect(result.answer).toContain('gone quiet');
        expect(result.evidence[0]).toContain('Sam');
    });
});
describe('answerTodaysStaffing', () => {
    it('is honest when nothing is scheduled', () => {
        expect(answerTodaysStaffing([], '2026-01-15').answer).toBe('No shifts logged for today yet.');
    });
    it('reports the real headcount and team breakdown for today', () => {
        const shifts = [
            { profile_id: 'a', profile_name: 'Ana', shift_date: '2026-01-15', status: 'scheduled', team_name: 'North' },
            { profile_id: 'b', profile_name: 'Ben', shift_date: '2026-01-15', status: 'worked', team_name: 'South' },
            { profile_id: 'c', profile_name: 'Cam', shift_date: '2026-01-14', status: 'scheduled', team_name: 'North' }
        ];
        const result = answerTodaysStaffing(shifts, '2026-01-15');
        expect(result.answer).toContain('2 on shift today');
        expect(result.answer).toContain('North, South');
    });
});
describe('answerLodgingCost', () => {
    it('is honest with no bookings recorded', () => {
        expect(answerLodgingCost([]).answer).toBe('No hotel bookings recorded yet.');
    });
    it('reports the real projected total from staff-entered rates', () => {
        const result = answerLodgingCost([
            { hotel_name: 'Hampton Inn', team_name: 'North', check_in: '2026-01-10', check_out: '2026-01-12', room_count: 2, nightly_rate_cents: 10000 }
        ]);
        expect(result.answer).toBe('$400 projected across 2 rooms.');
        expect(result.evidence[0]).toContain('Hampton Inn');
    });
});
describe('answerCurrentDoorScript', () => {
    it('is honest when no script has been entered', () => {
        expect(answerCurrentDoorScript([]).answer).toBe('No door script has been entered yet.');
    });
    it('reports the real current active script', () => {
        const result = answerCurrentDoorScript([{ kind: 'door_script', content: 'Hi, I\'m with the campaign...', sortOrder: 0, active: true }]);
        expect(result.answer).toBe("Hi, I'm with the campaign...");
    });
});
describe('answerCurrentSurveyQuestions', () => {
    it('is honest when no questions have been entered', () => {
        expect(answerCurrentSurveyQuestions([]).answer).toBe('No survey questions have been entered yet.');
    });
    it('lists the real active questions in order', () => {
        const entries = [
            { kind: 'survey_question', content: 'Are you registered?', sortOrder: 0, active: true },
            { kind: 'survey_question', content: 'Who will you support?', sortOrder: 1, active: true }
        ];
        const result = answerCurrentSurveyQuestions(entries);
        expect(result.answer).toBe('2 questions: Are you registered? / Who will you support?');
    });
});
describe('describeDataFreshnessAlert', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    it('stays silent with no visits at all', () => {
        expect(describeDataFreshnessAlert([], now)).toBeNull();
    });
    it('stays silent when the most recent visit is recent', () => {
        expect(describeDataFreshnessAlert([{ occurred_at: '2026-01-15T00:00:00Z' }], now)).toBeNull();
    });
    it('flags stale data when the most recent visit is over 48 hours old', () => {
        const result = describeDataFreshnessAlert([{ occurred_at: '2026-01-10T12:00:00Z' }], now);
        expect(result).toContain('No canvass visits logged in the last 5 days');
    });
});
const donation = (over = {}) => ({
    id: 'd1',
    project_id: 'p1',
    donor_id: 'donor1',
    amount_cents: 5000,
    donated_at: new Date().toISOString(),
    payment_method: null,
    voter_id: null,
    ...over
});
describe('computeFundraisingPace / answerFundraisingPace', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();
    it('sums real donations into the correct 7-day windows', () => {
        const donations = [
            donation({ amount_cents: 1000, donated_at: daysAgo(1) }),
            donation({ amount_cents: 2000, donated_at: daysAgo(3) }),
            donation({ amount_cents: 500, donated_at: daysAgo(10) })
        ];
        const pace = computeFundraisingPace(donations, now);
        expect(pace.last7DaysCents).toBe(3000);
        expect(pace.prior7DaysCents).toBe(500);
        expect(pace.trend).toBe('up');
    });
    it('reports flat when the swing is under the 10% threshold', () => {
        const donations = [donation({ amount_cents: 1000, donated_at: daysAgo(1) }), donation({ amount_cents: 1000, donated_at: daysAgo(10) })];
        expect(computeFundraisingPace(donations, now).trend).toBe('flat');
    });
    it('is honest with zero donations', () => {
        const result = answerFundraisingPace([], now);
        expect(result.answer).toBe('No donations recorded yet.');
    });
    it('describes the real total and trend direction', () => {
        const donations = [donation({ amount_cents: 10_000, donated_at: daysAgo(1) })];
        const result = answerFundraisingPace(donations, now);
        expect(result.answer).toContain('$100 in the last 7 days');
        expect(result.answer).toContain('up');
    });
});
describe('answerTopFundraiser', () => {
    it('is honest when no donation has a recorder attached', () => {
        expect(answerTopFundraiser([donation()]).answer).toBe('No donations have a staff member recorded against them yet.');
    });
    it('names the real top staff member by dollars recorded', () => {
        const donations = [
            donation({ amount_cents: 5000, recorder: { full_name: 'Ana', email: 'ana@x.com' } }),
            donation({ amount_cents: 5000, recorder: { full_name: 'Ana', email: 'ana@x.com' } }),
            donation({ amount_cents: 3000, recorder: { full_name: 'Ben', email: 'ben@x.com' } })
        ];
        const result = answerTopFundraiser(donations);
        expect(result.answer).toBe('Ana, with $100 recorded across 2 donations.');
    });
});
describe('answerPaymentMethodBreakdown', () => {
    it('is honest with no donations', () => {
        expect(answerPaymentMethodBreakdown([]).answer).toBe('No donations recorded yet.');
    });
    it('names the real top-earning payment method', () => {
        const donations = [
            donation({ amount_cents: 5000, payment_method: 'card' }),
            donation({ amount_cents: 1000, payment_method: 'check' })
        ];
        expect(answerPaymentMethodBreakdown(donations).answer).toBe('card, with $50 raised.');
    });
    it('groups missing payment methods honestly instead of dropping them', () => {
        const result = answerPaymentMethodBreakdown([donation({ amount_cents: 1000, payment_method: null })]);
        expect(result.answer).toBe('Not specified, with $10 raised.');
    });
});
describe('answerDonorGrowthVsAverageGift', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();
    it('is honest without two full weeks of data', () => {
        expect(answerDonorGrowthVsAverageGift([], now).answer).toContain('Not enough donations');
    });
    it('reports real donor-count and average-gift trends', () => {
        const donations = [
            donation({ donor_id: 'a', amount_cents: 1000, donated_at: daysAgo(1) }),
            donation({ donor_id: 'b', amount_cents: 1000, donated_at: daysAgo(2) }),
            donation({ donor_id: 'c', amount_cents: 5000, donated_at: daysAgo(10) })
        ];
        const result = answerDonorGrowthVsAverageGift(donations, now);
        expect(result.answer).toContain('Donor count is up (1 → 2)');
    });
});
describe('answerDonorConcentration', () => {
    it('is honest with no donations', () => {
        expect(answerDonorConcentration([]).answer).toBe('No donations recorded yet.');
    });
    it('flags a real heavy concentration among top donors', () => {
        const donations = Array.from({ length: 10 }, (_, i) => donation({ donor_id: `d${i}`, amount_cents: i === 0 ? 100_000 : 100 }));
        const result = answerDonorConcentration(donations);
        expect(result.answer).toContain('99%');
        expect(result.evidence[0]).toContain('meaningful concentration');
    });
});
describe('answerDonorRepeatShare', () => {
    it('is honest with no donations', () => {
        expect(answerDonorRepeatShare([]).answer).toBe('No donations recorded yet.');
    });
    it('splits real revenue between repeat and first-time donors', () => {
        const donations = [
            donation({ donor_id: 'a', amount_cents: 1000 }),
            donation({ donor_id: 'a', amount_cents: 1000 }),
            donation({ donor_id: 'b', amount_cents: 1000 })
        ];
        const result = answerDonorRepeatShare(donations);
        expect(result.answer).toContain('67% of revenue comes from donors who have given more than once');
    });
});
describe('describeFundraisingMomentumAlert', () => {
    it('stays silent on a normal swing', () => {
        expect(describeFundraisingMomentumAlert({ last7DaysCents: 1100, prior7DaysCents: 1000, dailyAverageCents: 157, trend: 'flat', trendPct: 10 })).toBeNull();
    });
    it('flags a genuinely large upward swing', () => {
        const result = describeFundraisingMomentumAlert({ last7DaysCents: 2000, prior7DaysCents: 1000, dailyAverageCents: 286, trend: 'up', trendPct: 100 });
        expect(result).toContain('up 100%');
    });
    it('flags a genuinely large downward swing', () => {
        const result = describeFundraisingMomentumAlert({ last7DaysCents: 500, prior7DaysCents: 1000, dailyAverageCents: 71, trend: 'down', trendPct: -50 });
        expect(result).toContain('down 50%');
    });
    it('stays silent with no prior-week baseline', () => {
        expect(describeFundraisingMomentumAlert({ last7DaysCents: 500, prior7DaysCents: 0, dailyAverageCents: 71, trend: 'up', trendPct: null })).toBeNull();
    });
});
describe('computeSocialPerformance / answerSocialPerformance', () => {
    const posts = [
        { platform: 'x', content: 'First post', status: 'posted', impressions: 1000, engagement_count: 50, created_at: '2026-01-01' },
        { platform: 'facebook', content: 'Second post', status: 'posted', impressions: 2000, engagement_count: 100, created_at: '2026-01-02' },
        { platform: 'x', content: 'Draft post', status: 'draft', impressions: null, engagement_count: null, created_at: '2026-01-03' }
    ];
    it('only counts posted content, ignoring drafts', () => {
        const stats = computeSocialPerformance(posts);
        expect(stats.postedCount).toBe(2);
        expect(stats.totalImpressions).toBe(3000);
        expect(stats.totalEngagement).toBe(150);
        expect(stats.topPlatform).toEqual({ platform: 'facebook', impressions: 2000 });
    });
    it('is honest when nothing has been posted yet', () => {
        const result = answerSocialPerformance([]);
        expect(result.answer).toContain('No posted social content');
    });
    it('reports the real totals and top platform', () => {
        const result = answerSocialPerformance(posts);
        expect(result.answer).toContain('3,000 total impressions');
        expect(result.evidence[0]).toContain('facebook');
    });
});
describe('answerWeeklySocialReach', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    it('is honest with no posted content this week', () => {
        expect(answerWeeklySocialReach([], now).answer).toBe('No posted content with recorded metrics this week.');
    });
    it('sums real impressions from posts within the last 7 days only', () => {
        const posts = [
            { platform: 'x', content: 'A', status: 'posted', impressions: 1000, engagement_count: 10, created_at: '2026-01-14T00:00:00Z' },
            { platform: 'x', content: 'B', status: 'posted', impressions: 5000, engagement_count: 10, created_at: '2025-12-01T00:00:00Z' }
        ];
        expect(answerWeeklySocialReach(posts, now).answer).toBe('1,000 impressions across 1 post this week.');
    });
});
describe('answerBestPerformingPost', () => {
    it('is honest with no posts meeting the minimum impression floor', () => {
        expect(answerBestPerformingPost([]).answer).toContain('No posted content with enough recorded impressions');
    });
    it('picks the real highest engagement-rate post above the sample floor', () => {
        const posts = [
            { platform: 'x', content: 'Low rate but high volume', status: 'posted', impressions: 10_000, engagement_count: 100, created_at: '2026-01-01' },
            { platform: 'facebook', content: 'High rate', status: 'posted', impressions: 100, engagement_count: 50, created_at: '2026-01-02' }
        ];
        const result = answerBestPerformingPost(posts);
        expect(result.answer).toContain('facebook');
        expect(result.answer).toContain('50% engagement rate');
    });
});
describe('answerPostingFrequency', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    it('is honest with nothing posted in the last 4 weeks', () => {
        expect(answerPostingFrequency([], now).answer).toContain('No posted content in the last 4 weeks');
    });
    it('reports a real posts-per-week average without asserting a target', () => {
        const posts = Array.from({ length: 8 }, (_, i) => ({
            platform: 'x',
            content: `Post ${i}`,
            status: 'posted',
            impressions: 100,
            engagement_count: 5,
            created_at: new Date(now.getTime() - i * 3 * 86_400_000).toISOString()
        }));
        const result = answerPostingFrequency(posts, now);
        expect(result.answer).toContain('2 posts/week');
        expect(result.answer).toContain("doesn't set a target pace");
    });
});
describe('computeDoorstepAttribution / answerDoorstepAttribution', () => {
    it('splits real donations by whether they were linked to a door', () => {
        const donations = [
            donation({ amount_cents: 1000, voter_id: 'v1' }),
            donation({ amount_cents: 2000, voter_id: null }),
            donation({ amount_cents: 3000, voter_id: 'v2' })
        ];
        const stats = computeDoorstepAttribution(donations);
        expect(stats.doorstepCount).toBe(2);
        expect(stats.otherCount).toBe(1);
        expect(stats.doorstepTotalCents).toBe(4000);
        expect(stats.pctOfDonationsFromDoorstep).toBe(67);
    });
    it('is honest with zero donations', () => {
        expect(answerDoorstepAttribution([]).answer).toBe('No donations recorded yet.');
    });
});
describe('scenarioAdjustPace', () => {
    it('projects a faster finish from a positive pace change', () => {
        const result = scenarioAdjustPace(100, 1000, 25);
        expect(result.dailyRateAfter).toBe(125);
        expect(result.daysToTarget).toBe(8);
    });
    it('reports zero days when the target is already met', () => {
        expect(scenarioAdjustPace(100, 0, 25).daysToTarget).toBe(0);
    });
    it('reports null days when the adjusted pace hits zero', () => {
        expect(scenarioAdjustPace(10, 1000, -100).daysToTarget).toBeNull();
    });
});
describe('scenarioAddWorkers', () => {
    it('projects the combined daily rate from added workers', () => {
        const result = scenarioAddWorkers(100, 20, 3, 1000);
        expect(result.dailyRateAfter).toBe(160);
        expect(result.daysToTarget).toBe(7);
    });
    it('never lets the rate go negative when removing workers', () => {
        const result = scenarioAddWorkers(10, 20, -5, 1000);
        expect(result.dailyRateAfter).toBe(0);
        expect(result.daysToTarget).toBeNull();
    });
});
describe('computeAverageDailyDoors / answerSkipADayImpact', () => {
    const now = new Date('2026-01-15T18:00:00Z');
    const daysAgo = (n) => new Date(now.getTime() - n * 86_400_000).toISOString();
    it('is honest with no recent visits', () => {
        expect(answerSkipADayImpact([], now).answer).toContain('Not enough recent visits');
    });
    it('averages real visits over the trailing window', () => {
        // daysAgo(0..6) are all within "now - 7 days" (inclusive), giving exactly 7 visits over 7 days.
        const visits = Array.from({ length: 7 }, (_, i) => ({ occurred_at: daysAgo(i) }));
        expect(computeAverageDailyDoors(visits, now)).toBeCloseTo(1, 5);
        expect(answerSkipADayImpact(visits, now).answer).toContain('1 fewer doors');
    });
});
describe('describeContactRateDropAlert', () => {
    const now = new Date('2026-01-15T18:00:00Z');
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    // Exactly 7 entries at offsets 1-7 days back, all within the "prior week"
    // window the function actually uses (today - 7d <= t < today).
    const priorWeekAt = (contactedCount) => Array.from({ length: 7 }, (_, i) => ({
        occurred_at: new Date(todayStart.getTime() - (i + 1) * 86_400_000).toISOString(),
        outcome: i < contactedCount ? 'contacted' : 'no_answer'
    }));
    it('stays silent with too few visits today', () => {
        expect(describeContactRateDropAlert([], now)).toBeNull();
    });
    it('stays silent on a normal contact rate', () => {
        const today = Array.from({ length: 10 }, (_, i) => ({
            occurred_at: new Date(todayStart.getTime() + i * 60_000).toISOString(),
            outcome: i < 3 ? 'contacted' : 'no_answer' // 30% today
        }));
        // 3 of 7 contacted -> ~43% prior week; a ~13pt drop is under the 15pt floor.
        expect(describeContactRateDropAlert([...today, ...priorWeekAt(3)], now)).toBeNull();
    });
    it('flags a genuine contact-rate drop vs. the trailing week', () => {
        const today = Array.from({ length: 10 }, (_, i) => ({
            occurred_at: new Date(todayStart.getTime() + i * 60_000).toISOString(),
            outcome: 'no_answer' // 0% today
        }));
        // 4 of 7 contacted -> ~57% prior week; a ~57pt drop clears the floor easily.
        const result = describeContactRateDropAlert([...today, ...priorWeekAt(4)], now);
        expect(result).toContain('below');
        expect(result).toContain('0%)');
    });
});
