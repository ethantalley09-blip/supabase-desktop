import { describe, expect, it } from 'vitest';
import { computeEquityAudit, findDisputed, findExpiringTags, findReporterOutliers } from './conditionReview';
import { normalizeAddress } from './households';

const scored = ({ tag = 'hostile', cls = 'safety', tier = 'actionable', confidence = 0.57, days = 0, status = 'active' } = {}) => ({
    attribute: { tag, address_key: '1 oak st', street_key: 'oak st', status, observer_ids: ['a', 'b'] },
    class: cls,
    tier,
    confidence,
    daysSinceConfirmed: days,
    reasons: []
});

describe('findDisputed', () => {
    it('surfaces only tags a later visit actually contradicted', () => {
        const all = [
            scored({ status: 'disputed', confidence: 0.4 }),
            scored({ status: 'disputed', confidence: 0.6 }),
            scored({ status: 'active' })
        ];
        const disputed = findDisputed(all);
        expect(disputed).toHaveLength(2);
        expect(disputed[0].confidence).toBe(0.6); // strongest first
    });
});

describe('findExpiringTags', () => {
    it('flags an actionable tag whose decay is about to drop it below the threshold', () => {
        // safety half-life is 180d. Undecayed 0.5714 needs ~10.6 half-lives...
        // in practice: pick a confidence just above actionable and an age that
        // puts the crossing inside the window.
        const nearlyStale = scored({ confidence: 0.56, days: 170 });
        const [expiring] = findExpiringTags([nearlyStale], { withinDays: 60 });
        expect(expiring).toBeDefined();
        expect(expiring.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(expiring.daysRemaining).toBeLessThanOrEqual(60);
    });

    it('never lists a legal-class tag — a posted notice does not expire', () => {
        const posted = scored({ tag: 'no_trespassing', cls: 'legal', tier: 'hard', confidence: 0.4, days: 900 });
        expect(findExpiringTags([posted], { withinDays: 365 })).toHaveLength(0);
    });

    it('ignores tags that are already below actionable', () => {
        expect(findExpiringTags([scored({ tier: 'advisory', confidence: 0.35 })])).toHaveLength(0);
    });

    it('ignores a tag whose evidence keeps it above the threshold for a long time', () => {
        const strong = scored({ confidence: 0.95, days: 1 });
        expect(findExpiringTags([strong], { withinDays: 30 })).toHaveLength(0);
    });
});

describe('findReporterOutliers', () => {
    const visit = (canvasserId, tags = []) => ({
        canvasser_id: canvasserId,
        canvasser_name: canvasserId,
        observed_attributes: tags
    });

    it('flags a canvasser tagging hazards far above the team rate', () => {
        const visits = [
            // Team: 4 flagged across 100 visits from three steady canvassers.
            ...Array.from({ length: 40 }, (_, i) => visit('steady-1', i < 2 ? ['dogs'] : [])),
            ...Array.from({ length: 40 }, (_, i) => visit('steady-2', i < 2 ? ['dogs'] : [])),
            // Outlier: 12 of 25.
            ...Array.from({ length: 25 }, (_, i) => visit('outlier', i < 12 ? ['hostile'] : []))
        ];
        const { outliers, teamRate } = findReporterOutliers(visits);
        expect(teamRate).toBeCloseTo(0.152, 2);
        expect(outliers).toHaveLength(1);
        expect(outliers[0].name).toBe('outlier');
        expect(outliers[0].flagged).toBe(12);
    });

    it('will not flag anyone below the minimum visit count — one rough afternoon is not a pattern', () => {
        const visits = [
            ...Array.from({ length: 60 }, (_, i) => visit('steady', i < 1 ? ['dogs'] : [])),
            ...Array.from({ length: 5 }, () => visit('newbie', ['hostile']))
        ];
        expect(findReporterOutliers(visits).outliers).toHaveLength(0);
    });

    it('reports nothing when nobody has tagged anything', () => {
        const visits = Array.from({ length: 50 }, () => visit('steady'));
        expect(findReporterOutliers(visits)).toEqual({ teamRate: 0, outliers: [] });
    });
});

describe('computeEquityAudit', () => {
    const profile = (addressKey, hasSafety) => ({
        addressKey,
        streetKey: 'oak st',
        attributes: hasSafety ? [scored({ tier: 'advisory', confidence: 0.4 })] : [],
        hardExclusion: null
    });

    const buildVoters = (language, count, flaggedCount, prefix) => Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${i}`,
        address_line: `${i + 1} ${prefix} St`,
        language,
        _flagged: i < flaggedCount
    }));

    it('reports a group whose safety-tag rate runs at multiples of the baseline', () => {
        const spanish = buildVoters('spanish', 40, 12, 'Sp');
        const english = buildVoters('english', 60, 3, 'En');
        const voters = [...spanish, ...english];
        const profiles = voters
            .filter((v) => v._flagged)
            .map((v) => profile(normalizeAddress(v.address_line), true));

        const audit = computeEquityAudit({ profiles, voters, languageOf: (v) => v.language });
        expect(audit.baselineRate).toBeCloseTo(0.15, 2);
        const sp = audit.groups.find((g) => g.language === 'spanish');
        expect(sp.rate).toBeCloseTo(0.3, 2);
        expect(sp.ratio).toBe(2);
        expect(audit.flagged.map((g) => g.language)).toEqual(['spanish']);
    });

    it('withholds a ratio for a group too small to mean anything', () => {
        const voters = [...buildVoters('hmong', 5, 5, 'Hm'), ...buildVoters('english', 60, 3, 'En')];
        const profiles = voters.filter((v) => v._flagged).map((v) => profile(normalizeAddress(v.address_line), true));
        const audit = computeEquityAudit({ profiles, voters, languageOf: (v) => v.language });
        const hmong = audit.groups.find((g) => g.language === 'hmong');
        expect(hmong.hasEnoughData).toBe(false);
        expect(audit.flagged).toHaveLength(0);
    });

    it('is quiet when nothing has been tagged at all', () => {
        const voters = buildVoters('english', 60, 0, 'En');
        const audit = computeEquityAudit({ profiles: [], voters, languageOf: (v) => v.language });
        expect(audit.baselineRate).toBe(0);
        expect(audit.flagged).toHaveLength(0);
    });

    it('keys doors the same way households.ts does', () => {
        const voters = [{ id: 'v1', address_line: ' 12  Oak St ', language: 'english' }];
        const profiles = [profile(normalizeAddress(' 12  Oak St '), true)];
        const audit = computeEquityAudit({ profiles, voters, languageOf: (v) => v.language, minGroupDoors: 1 });
        expect(audit.groups[0].flagged).toBe(1);
    });
});
