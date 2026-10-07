import { describe, expect, it } from 'vitest';
import { answerAverageDonation, answerBallotsOutstanding, answerComplianceProgress, answerContactsLogged, answerFundraisingTotal, answerGeocodingBacklog, answerTopCity, answerUnassignedTerritories, answerVoterUniverse, buildCannedAnswers } from './cannedAnswers';
const turf = (over = {}) => ({
    totalVoters: 100,
    mapped: 80,
    unmapped: 20,
    geocodableBacklog: 10,
    contactStatus: { active: 100, moved: 0, bad_address: 0, deceased: 0, do_not_contact: 0 },
    ballots: { requested: 40, returned: 30, outstanding: 10, returnRatePct: 75 },
    territories: { total: 2, unassigned: 0 },
    votersAssignedToTerritory: 100,
    distinctCities: 2,
    distinctWards: 3,
    topCities: [
        { city: 'Columbus', count: 60 },
        { city: 'Dublin', count: 40 }
    ],
    topLanguages: [],
    notesLogged: 5,
    ...over
});
const fundraising = (over = {}) => ({
    totalRaisedUsd: 500,
    donationCount: 10,
    uniqueDonors: 8,
    averageDonationUsd: 50,
    largestDonationUsd: 200,
    complianceThresholdUsd: 1000,
    progressToCompliancePct: 50,
    complianceUnlocked: false,
    ...over
});
const geocode = (over = {}) => ({
    total: 100,
    mapped: 80,
    noAddress: 2,
    unattempted: 10,
    ambiguous: 3,
    noMatch: 4,
    error: 1,
    pctMapped: 80,
    ...over
});
describe('answerBallotsOutstanding', () => {
    it('states the real outstanding count with request/return evidence', () => {
        const result = answerBallotsOutstanding(turf());
        expect(result.answer).toBe('10 ballots still outstanding.');
        expect(result.evidence).toEqual(['40 requested', '30 returned', '75% return rate']);
    });
    it('says none outstanding when every requested ballot returned', () => {
        const result = answerBallotsOutstanding(turf({ ballots: { requested: 20, returned: 20, outstanding: 0, returnRatePct: 100 } }));
        expect(result.answer).toBe('None — every requested ballot has been returned.');
    });
    it('says no ballots requested when the universe is empty', () => {
        const result = answerBallotsOutstanding(turf({ ballots: { requested: 0, returned: 0, outstanding: 0, returnRatePct: 0 } }));
        expect(result.answer).toBe('No ballots requested yet.');
    });
});
describe('answerComplianceProgress', () => {
    it('honestly reports no fundraising module rather than fabricating a number', () => {
        const result = answerComplianceProgress(undefined);
        expect(result.answer).toContain("isn't enabled");
        expect(result.evidence).toEqual([]);
    });
    it('reports real progress toward the threshold', () => {
        const result = answerComplianceProgress(fundraising());
        expect(result.answer).toBe('50% of the way to the compliance threshold.');
        expect(result.evidence).toEqual(['$500 raised', '$1,000 threshold', '50% to go']);
    });
    it('reports when compliance is already unlocked', () => {
        const result = answerComplianceProgress(fundraising({ complianceUnlocked: true, progressToCompliancePct: 100 }));
        expect(result.answer).toBe('Already past the compliance threshold.');
    });
});
describe('answerTopCity', () => {
    it('names the real top city with its share of the total', () => {
        const result = answerTopCity(turf());
        expect(result.answer).toBe('Columbus, with 60 voters.');
        expect(result.evidence[0]).toBe('60% of all 100 voters');
    });
    it('is honest when there is no city data at all', () => {
        const result = answerTopCity(turf({ topCities: [] }));
        expect(result.answer).toContain('No city data');
    });
});
describe('answerGeocodingBacklog', () => {
    it('sums every non-mapped status into the real backlog count', () => {
        const result = answerGeocodingBacklog(geocode());
        // unattempted(10) + ambiguous(3) + noMatch(4) + error(1) = 18
        expect(result.answer).toBe('18 voters still need geocoding.');
        expect(result.evidence).toContain('10 not tried yet');
    });
    it('says none needed when everything is resolved', () => {
        const result = answerGeocodingBacklog(geocode({ unattempted: 0, ambiguous: 0, noMatch: 0, error: 0, pctMapped: 100 }));
        expect(result.answer).toContain('None');
    });
});
describe('answerVoterUniverse', () => {
    it('states the real voter count and mapped share', () => {
        const result = answerVoterUniverse(turf());
        expect(result.answer).toBe('100 voters in the file, 80% mapped.');
        expect(result.evidence).toEqual(['80 mapped', '20 unmapped', '2 cities, 3 wards']);
    });
    it('is honest when no voter file has been imported', () => {
        const result = answerVoterUniverse(turf({ totalVoters: 0, mapped: 0, unmapped: 0 }));
        expect(result.answer).toContain('No voter file imported');
    });
});
describe('answerContactsLogged', () => {
    it('reports the real note-logged count with its share of the universe', () => {
        const result = answerContactsLogged(turf());
        expect(result.answer).toBe('5 voters have a canvass note logged.');
        expect(result.evidence).toEqual(['5% of 100 total voters']);
    });
    it('says none logged when the universe has no notes', () => {
        const result = answerContactsLogged(turf({ notesLogged: 0 }));
        expect(result.answer).toContain('No canvass notes logged yet');
    });
});
describe('answerUnassignedTerritories', () => {
    it('flags real unassigned territories', () => {
        const result = answerUnassignedTerritories(turf({ territories: { total: 3, unassigned: 1 } }));
        expect(result.answer).toBe('Yes — 1 of 3 territories is unassigned.');
    });
    it('confirms full assignment when none are unassigned', () => {
        const result = answerUnassignedTerritories(turf({ territories: { total: 2, unassigned: 0 } }));
        expect(result.answer).toBe('No — all 2 territories are assigned.');
    });
    it('is honest when no territories exist yet', () => {
        const result = answerUnassignedTerritories(turf({ territories: { total: 0, unassigned: 0 } }));
        expect(result.answer).toBe('No territories drawn yet.');
    });
});
describe('answerFundraisingTotal', () => {
    it('honestly reports no fundraising module rather than fabricating a number', () => {
        const result = answerFundraisingTotal(undefined);
        expect(result.answer).toContain("isn't enabled");
    });
    it('reports the real total and donor count', () => {
        const result = answerFundraisingTotal(fundraising());
        expect(result.answer).toBe('$500 raised from 8 donors.');
        expect(result.evidence).toEqual(['10 donations', '8 unique donors']);
    });
    it('says none recorded when donationCount is zero', () => {
        const result = answerFundraisingTotal(fundraising({ donationCount: 0, totalRaisedUsd: 0, uniqueDonors: 0 }));
        expect(result.answer).toContain('No donations recorded yet');
    });
});
describe('answerAverageDonation', () => {
    it('reports the real average and largest gift', () => {
        const result = answerAverageDonation(fundraising());
        expect(result.answer).toBe('$50 average.');
        expect(result.evidence).toEqual(['$200 largest single gift', '10 donations counted']);
    });
    it('honestly reports no fundraising module rather than fabricating a number', () => {
        const result = answerAverageDonation(undefined);
        expect(result.answer).toContain("isn't enabled");
    });
});
describe('buildCannedAnswers', () => {
    it('returns the full bank in a fixed order', () => {
        const result = buildCannedAnswers({ turf: turf(), fundraising: fundraising(), geocode: geocode() });
        expect(result.map((a) => a.id)).toEqual([
            'voter_universe',
            'contacts_logged',
            'ballots_outstanding',
            'unassigned_territories',
            'top_city',
            'geocoding_backlog',
            'fundraising_total',
            'average_donation',
            'compliance_progress'
        ]);
    });
});
