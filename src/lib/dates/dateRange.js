import { endOfQuarter, startOfMonth, startOfQuarter, subDays, subMonths } from 'date-fns';
// Shared presets for chart filtering and compliance reporting periods.
// FEC-style windows (quarterly filing periods) live alongside plain
// "last N days" presets so fundraising charts and future compliance
// reports use the same vocabulary.
export const DATE_RANGE_PRESETS = [
    { id: 'all', label: 'All time' },
    { id: 'last30', label: 'Last 30 days' },
    { id: 'last90', label: 'Last 90 days' },
    { id: 'this_month', label: 'This month' },
    { id: 'this_quarter', label: 'This quarter (FEC Q)' },
    { id: 'last_quarter', label: 'Last quarter (FEC Q)' }
];
export function resolvePreset(id, now = new Date()) {
    switch (id) {
        case 'all':
            return { from: null, to: null };
        case 'last30':
            return { from: subDays(now, 30), to: null };
        case 'last90':
            return { from: subDays(now, 90), to: null };
        case 'this_month':
            return { from: startOfMonth(now), to: null };
        case 'this_quarter':
            return { from: startOfQuarter(now), to: null };
        case 'last_quarter': {
            const lastQ = subMonths(startOfQuarter(now), 3);
            return { from: startOfQuarter(lastQ), to: endOfQuarter(lastQ) };
        }
    }
}
export function inRange(date, range) {
    if (range.from && date < range.from)
        return false;
    if (range.to && date > range.to)
        return false;
    return true;
}
