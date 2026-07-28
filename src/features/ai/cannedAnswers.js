export function answerBallotsOutstanding(turf) {
    const { requested, returned, outstanding, returnRatePct } = turf.ballots;
    return {
        id: 'ballots_outstanding',
        question: 'How many ballots are still outstanding?',
        answer: outstanding > 0
            ? `${outstanding} ballot${outstanding === 1 ? '' : 's'} still outstanding.`
            : requested > 0
                ? 'None — every requested ballot has been returned.'
                : 'No ballots requested yet.',
        evidence: [`${requested} requested`, `${returned} returned`, `${returnRatePct}% return rate`]
    };
}
export function answerComplianceProgress(fundraising) {
    const question = 'How close are we to the compliance threshold?';
    if (!fundraising) {
        return {
            id: 'compliance_progress',
            question,
            answer: "Fundraising isn't enabled for this project, so there's no compliance threshold to track.",
            evidence: []
        };
    }
    const { totalRaisedUsd, complianceThresholdUsd, progressToCompliancePct, complianceUnlocked } = fundraising;
    return {
        id: 'compliance_progress',
        question,
        answer: complianceUnlocked
            ? 'Already past the compliance threshold.'
            : `${progressToCompliancePct}% of the way to the compliance threshold.`,
        evidence: [
            `$${totalRaisedUsd.toLocaleString()} raised`,
            `$${complianceThresholdUsd.toLocaleString()} threshold`,
            complianceUnlocked ? 'compliance module unlocked' : `${100 - progressToCompliancePct}% to go`
        ]
    };
}
export function answerTopCity(turf) {
    const question = 'Which city has the most voters?';
    const top = turf.topCities[0];
    if (!top) {
        return { id: 'top_city', question, answer: 'No city data found in the imported voter file.', evidence: [] };
    }
    const pct = turf.totalVoters > 0 ? Math.round((top.count / turf.totalVoters) * 100) : 0;
    return {
        id: 'top_city',
        question,
        answer: `${top.city}, with ${top.count} voter${top.count === 1 ? '' : 's'}.`,
        evidence: [`${pct}% of all ${turf.totalVoters} voters`, ...turf.topCities.slice(1, 3).map((c) => `${c.city}: ${c.count}`)]
    };
}
export function answerGeocodingBacklog(geocode) {
    const question = 'How many voters still need geocoding?';
    const stillNeeded = geocode.unattempted + geocode.ambiguous + geocode.noMatch + geocode.error;
    return {
        id: 'geocoding_backlog',
        question,
        answer: stillNeeded > 0
            ? `${stillNeeded} voter${stillNeeded === 1 ? '' : 's'} still need geocoding.`
            : 'None — every voter with an address has been geocoded.',
        evidence: [
            `${geocode.unattempted} not tried yet`,
            `${geocode.ambiguous} ambiguous matches`,
            `${geocode.noMatch + geocode.error} failed lookups`,
            `${geocode.pctMapped}% mapped overall`
        ]
    };
}
// Executive/health question ("How is this project doing overall?" family) —
// the plain voter-universe headline, size + mapped share.
export function answerVoterUniverse(turf) {
    const question = 'How many voters are in this project?';
    const pctMapped = turf.totalVoters > 0 ? Math.round((turf.mapped / turf.totalVoters) * 100) : 0;
    return {
        id: 'voter_universe',
        question,
        answer: turf.totalVoters > 0
            ? `${turf.totalVoters.toLocaleString()} voter${turf.totalVoters === 1 ? '' : 's'} in the file, ${pctMapped}% mapped.`
            : 'No voter file imported yet.',
        evidence: [`${turf.mapped} mapped`, `${turf.unmapped} unmapped`, `${turf.distinctCities} cities, ${turf.distinctWards} wards`]
    };
}
// Canvassing-performance proxy: how many voters have a logged canvass note,
// the closest thing this snapshot has to "meaningful contacts made" without
// a dedicated contact-attempt table.
export function answerContactsLogged(turf) {
    const question = 'How many voters have we logged contact notes for?';
    const pct = turf.totalVoters > 0 ? Math.round((turf.notesLogged / turf.totalVoters) * 100) : 0;
    return {
        id: 'contacts_logged',
        question,
        answer: turf.notesLogged > 0
            ? `${turf.notesLogged.toLocaleString()} voter${turf.notesLogged === 1 ? '' : 's'} have a canvass note logged.`
            : 'No canvass notes logged yet.',
        evidence: turf.totalVoters > 0 ? [`${pct}% of ${turf.totalVoters} total voters`] : []
    };
}
// Turf/targeting question: are any territories sitting unassigned right now.
export function answerUnassignedTerritories(turf) {
    const question = 'Are any territories unassigned?';
    const { total, unassigned } = turf.territories;
    return {
        id: 'unassigned_territories',
        question,
        answer: total === 0
            ? 'No territories drawn yet.'
            : unassigned > 0
                ? `Yes — ${unassigned} of ${total} territor${total === 1 ? 'y' : 'ies'} ${unassigned === 1 ? 'is' : 'are'} unassigned.`
                : `No — all ${total} territor${total === 1 ? 'y' : 'ies'} ${total === 1 ? 'is' : 'are'} assigned.`,
        evidence: total > 0 ? [`${turf.votersAssignedToTerritory} of ${turf.totalVoters} voters in an assigned territory`] : []
    };
}
// Fundraising headline ("How much have we raised?" family).
export function answerFundraisingTotal(fundraising) {
    const question = 'How much have we raised?';
    if (!fundraising) {
        return {
            id: 'fundraising_total',
            question,
            answer: "Fundraising isn't enabled for this project.",
            evidence: []
        };
    }
    const { totalRaisedUsd, donationCount, uniqueDonors } = fundraising;
    return {
        id: 'fundraising_total',
        question,
        answer: donationCount > 0
            ? `$${totalRaisedUsd.toLocaleString()} raised from ${uniqueDonors} donor${uniqueDonors === 1 ? '' : 's'}.`
            : 'No donations recorded yet.',
        evidence: donationCount > 0 ? [`${donationCount} donation${donationCount === 1 ? '' : 's'}`, `${uniqueDonors} unique donors`] : []
    };
}
// Fundraising average/size question.
export function answerAverageDonation(fundraising) {
    const question = 'What is our average donation?';
    if (!fundraising) {
        return {
            id: 'average_donation',
            question,
            answer: "Fundraising isn't enabled for this project.",
            evidence: []
        };
    }
    const { donationCount, averageDonationUsd, largestDonationUsd } = fundraising;
    return {
        id: 'average_donation',
        question,
        answer: donationCount > 0 ? `$${averageDonationUsd.toLocaleString()} average.` : 'No donations recorded yet.',
        evidence: donationCount > 0 ? [`$${largestDonationUsd.toLocaleString()} largest single gift`, `${donationCount} donations counted`] : []
    };
}
// The full bank, in display order — AiCenterTab.tsx renders this list
// directly instead of firing an AI call per question.
export function buildCannedAnswers(input) {
    return [
        answerVoterUniverse(input.turf),
        answerContactsLogged(input.turf),
        answerBallotsOutstanding(input.turf),
        answerUnassignedTerritories(input.turf),
        answerTopCity(input.turf),
        answerGeocodingBacklog(input.geocode),
        answerFundraisingTotal(input.fundraising),
        answerAverageDonation(input.fundraising),
        answerComplianceProgress(input.fundraising)
    ];
}
