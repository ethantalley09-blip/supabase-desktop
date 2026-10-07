// Search & Jump index + ranking. Pure (no Supabase), shared by the Ctrl+K
// palette and Ask Lynx's no-AI fallback, so both always agree on where
// things live.
import { TOOL_LOCATIONS } from '@/features/rbac/toolRegistry';
// Every tab, keyed the same as ProjectDetailsPage's Tabs values. `show` is
// the key into the `available` flags ProjectDetailsPage computes; tabs with
// no `show` are always present.
export const TAB_DESTINATIONS = [
    { tab: 'overview', label: 'Overview', hint: 'Home: today, tasks, checklist, key numbers' },
    { tab: 'governing', label: 'Office', hint: 'Constituent cases (Governing mode)', show: 'governing' },
    { tab: 'tasks', label: 'Tasks', hint: 'Team to-dos and assignments' },
    { tab: 'fundraising', label: 'Fundraising', hint: 'Donations, donors, fundraising tools', show: 'fundraising' },
    { tab: 'comms', label: 'Comms', hint: 'Broadcasts, email, press, social' },
    { tab: 'compliance', label: 'Compliance', hint: 'Contribution limits and filings', show: 'compliance' },
    { tab: 'turf', label: 'Turf Map', hint: 'Voters, map, territories, walk lists' },
    { tab: 'compete', label: 'Compete', hint: 'Opposition research', show: 'compete' },
    { tab: 'ai', label: 'AI Center', hint: 'Ask your data, coach, message studio', show: 'ai' },
    { tab: 'integrations', label: 'Integrations', hint: 'Connect outside tools', show: 'integrations' },
    { tab: 'team', label: 'Team', hint: 'Members, roles, invites' }
];
// Plain actions people look for by verb ("import", "invite", "record") that
// aren't AI tools and so aren't in TOOL_REGISTRY.
export const ACTION_DESTINATIONS = [
    { id: 'act_import', label: 'Import voters', keywords: 'upload voter file csv excel spreadsheet list', tab: 'turf', anchor: 'tool-import_mapping' },
    { id: 'act_territory', label: 'Draw a territory', keywords: 'turf cut map area walk list', tab: 'turf' },
    { id: 'act_chase', label: 'Ballot chase / log a door knock', keywords: 'canvass door knock contact status visit', tab: 'turf' },
    { id: 'act_invite', label: 'Invite a teammate', keywords: 'add member volunteer staff email role', tab: 'team', anchor: 'invite-email' },
    { id: 'act_donation', label: 'Record a donation', keywords: 'gift money contribution check cash', tab: 'fundraising', show: 'fundraising' },
    { id: 'act_case', label: 'Log a constituent contact', keywords: 'case casework constituent request complaint', tab: 'governing', show: 'governing' },
    { id: 'act_task', label: 'Add a task', keywords: 'todo to-do assign reminder', tab: 'tasks' },
    { id: 'act_broadcast', label: 'Send a team broadcast', keywords: 'message announce team update', tab: 'comms' }
];
// Builds the searchable list for one viewer: only tabs and actions they can
// actually reach, plus the AI tools filterTools() already allowed.
export function buildNavIndex({ available, tools }) {
    const ok = (show) => !show || Boolean(available?.[show]);
    const entries = [];
    for (const t of TAB_DESTINATIONS) {
        if (ok(t.show))
            entries.push({ id: `tab_${t.tab}`, type: 'tab', label: t.label, detail: t.hint, keywords: t.hint, target: { tab: t.tab } });
    }
    for (const a of ACTION_DESTINATIONS) {
        if (ok(a.show))
            entries.push({ id: a.id, type: 'action', label: a.label, detail: TAB_DESTINATIONS.find((t) => t.tab === a.tab)?.label, keywords: a.keywords, target: { tab: a.tab, anchor: a.anchor } });
    }
    for (const tool of tools ?? []) {
        const loc = TOOL_LOCATIONS[tool.id];
        if (!loc)
            continue;
        const tabDef = TAB_DESTINATIONS.find((t) => t.tab === loc.tab);
        // A tool whose hosting tab this viewer can't open is a dead link.
        if (tabDef && !ok(tabDef.show))
            continue;
        entries.push({ id: `tool_${tool.id}`, type: 'tool', toolId: tool.id, label: tool.label, detail: tool.description, keywords: tool.category, target: loc });
    }
    return entries;
}
const TYPE_BONUS = { action: 3, tab: 2, tool: 0 };
// Simple, predictable ranking: every query word must appear somewhere;
// matches at the start of the label beat word-starts beat anywhere-matches.
// Predictable beats clever for a navigation box.
export function searchNav(index, query, limit = 8) {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return index.filter((e) => e.type !== 'tool').slice(0, limit);
    const scored = [];
    for (const e of index) {
        const label = e.label.toLowerCase();
        const hay = `${label} ${(e.detail ?? '').toLowerCase()} ${(e.keywords ?? '').toLowerCase()}`;
        let score = 0;
        let all = true;
        for (const w of words) {
            if (label.startsWith(w))
                score += 10;
            else if (label.split(/[\s/-]+/).some((part) => part.startsWith(w)))
                score += 6;
            else if (label.includes(w))
                score += 4;
            else if (hay.includes(w))
                score += 1;
            else {
                all = false;
                break;
            }
        }
        if (all)
            scored.push({ e, score: score + TYPE_BONUS[e.type] });
    }
    return scored
        .sort((a, b) => b.score - a.score || a.e.label.localeCompare(b.e.label))
        .slice(0, limit)
        .map((s) => s.e);
}
// Looser match for Ask Lynx's no-AI fallback: a question like "how do I
// make a walk list" won't have EVERY word in an entry, so rank by how many
// meaningful words hit instead of requiring all of them.
const QUESTION_STOPWORDS = new Set(['how', 'do', 'i', 'a', 'an', 'the', 'to', 'can', 'my', 'what', 'where', 'is', 'make', 'get', 'find', 'for', 'of', 'on', 'in', 'and', 'with', 'should', 'me', 'we', 'our', 'it', 'this']);
export function suggestForQuestion(index, question, limit = 4) {
    const words = String(question ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !QUESTION_STOPWORDS.has(w));
    if (words.length === 0)
        return [];
    return index
        .map((e) => {
        const hay = `${e.label} ${e.detail ?? ''} ${e.keywords ?? ''}`.toLowerCase();
        const hits = words.filter((w) => hay.includes(w)).length;
        const labelHits = words.filter((w) => e.label.toLowerCase().includes(w)).length;
        return { e, score: hits + labelHits * 2 + (hits ? TYPE_BONUS[e.type] * 0.1 : 0) };
    })
        .filter((s) => s.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.e);
}
// What Ask Lynx sends the model: the viewer's own reachable destinations
// only, so it can never recommend a tool this person can't open.
export function buildGuideContext(index, question) {
    return JSON.stringify({
        question: String(question ?? '').trim(),
        destinations: index.map((e) => ({ id: e.id, type: e.type, label: e.label, where: e.detail ?? null }))
    });
}
// Drops any id the model returned that isn't a real destination for this
// viewer -- the model must never be able to invent a button.
export function resolveGuideIds(index, ids) {
    const byId = new Map(index.map((e) => [e.id, e]));
    return [...new Set(ids ?? [])].map((id) => byId.get(id)).filter(Boolean).slice(0, 4);
}
// ---------------------------------------------------------------------------
// Pinned & recent
// ---------------------------------------------------------------------------
// Pins persist per user per org (in dashboard_layouts.layout.pinned, so they
// follow you between the desktop app and the web build); recents are a
// per-device convenience. Both store nav-index ids and both silently drop
// ids that no longer resolve (a tool the role lost, a module turned off).
export function togglePin(pinned, id) {
    const list = pinned ?? [];
    return list.includes(id) ? list.filter((p) => p !== id) : [...list, id];
}
export const MAX_RECENTS = 5;
export function pushRecent(recents, id) {
    return [id, ...(recents ?? []).filter((r) => r !== id)].slice(0, MAX_RECENTS);
}
export function resolveIds(index, ids) {
    const byId = new Map(index.map((e) => [e.id, e]));
    return (ids ?? []).map((id) => byId.get(id)).filter(Boolean);
}
// What the palette shows before you type: pinned first, then recent (minus
// anything already pinned), then the default tabs/actions to fill the list.
export function emptyQuerySections(index, pinned, recents, limit = 8) {
    const pins = resolveIds(index, pinned);
    const pinIds = new Set(pins.map((e) => e.id));
    const recent = resolveIds(index, recents).filter((e) => !pinIds.has(e.id));
    const shown = new Set([...pinIds, ...recent.map((e) => e.id)]);
    const rest = searchNav(index, '', limit + shown.size).filter((e) => !shown.has(e.id)).slice(0, Math.max(0, limit - shown.size));
    return [
        { label: 'Pinned', entries: pins },
        { label: 'Recent', entries: recent },
        { label: 'Go to', entries: rest }
    ].filter((s) => s.entries.length > 0);
}
