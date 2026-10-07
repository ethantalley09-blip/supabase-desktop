// Pure logic for the Bundler Network Detector: real donors sharing the same
// real employer (donors.employer, already-captured data no other purpose
// reads) who have ALL actually given form an informal bundler network worth
// formally cultivating — asking the highest real giver in the cluster to
// personally host or solicit their coworkers, rather than treating each
// donor as an isolated transaction the way a pure payment processor does.
// Only ever surfaces a cluster once at least two distinct real donors at
// the same employer have both actually given — a shared employer with no
// real gifts yet isn't a network. No Supabase import (pattern: doorstep.ts)
// — see bundlerNetwork.test.ts.
// A single real giver at an employer is just a donor, not a "network" —
// this needs at least one real coworker who has also given.
const MIN_CLUSTER_DONORS = 2;
export function findBundlerClusters(donors, donations) {
    const totalsByDonor = new Map();
    for (const d of donations) {
        totalsByDonor.set(d.donor_id, (totalsByDonor.get(d.donor_id) ?? 0) + d.amount_cents);
    }
    const byEmployer = new Map();
    for (const donor of donors) {
        const employer = donor.employer?.trim();
        if (!employer)
            continue;
        const key = employer.toLowerCase();
        const entry = byEmployer.get(key) ?? { display: employer, donors: [] };
        entry.donors.push(donor);
        byEmployer.set(key, entry);
    }
    const clusters = [];
    for (const { display, donors: employerDonors } of byEmployer.values()) {
        const giving = employerDonors
            .map((donor) => ({ donor, cents: totalsByDonor.get(donor.id) ?? 0 }))
            .filter((g) => g.cents > 0);
        if (giving.length < MIN_CLUSTER_DONORS)
            continue;
        const totalCents = giving.reduce((sum, g) => sum + g.cents, 0);
        const anchor = giving.reduce((top, g) => (g.cents > top.cents ? g : top), giving[0]);
        clusters.push({
            employer: display,
            donorCount: giving.length,
            totalCents,
            anchorDonorId: anchor.donor.id,
            anchorDonorName: anchor.donor.full_name,
            anchorDonorCents: anchor.cents
        });
    }
    return clusters.sort((a, b) => b.totalCents - a.totalCents);
}
