import { describe, expect, it } from 'vitest';
import { buildGuideContext, buildNavIndex, emptyQuerySections, pushRecent, resolveGuideIds, resolveIds, searchNav, suggestForQuestion, togglePin } from './navMath';
const tools = [
    { id: 'smart_segments', label: 'Smart Segments', description: 'Describe a voter universe, get a walk list.', category: 'turf' },
    { id: 'donor_insights', label: 'Donor Insights', description: 'Connector scoring and at-risk donors.', category: 'fundraising' },
    { id: 'not_a_real_tool', label: 'Ghost', description: 'x', category: 'turf' }
];
describe('buildNavIndex', () => {
    it('includes only tabs and actions the viewer can reach', () => {
        const idx = buildNavIndex({ available: { fundraising: false }, tools: [] });
        const ids = idx.map((e) => e.id);
        expect(ids).toContain('tab_turf');
        expect(ids).toContain('act_invite');
        expect(ids).not.toContain('tab_fundraising');
        expect(ids).not.toContain('act_donation');
        expect(ids).not.toContain('tab_governing');
    });
    it('drops tools whose hosting tab is hidden and tools with no location', () => {
        const idx = buildNavIndex({ available: { fundraising: false, ai: true }, tools });
        const ids = idx.map((e) => e.id);
        expect(ids).toContain('tool_smart_segments');
        expect(ids).not.toContain('tool_donor_insights');
        expect(ids).not.toContain('tool_not_a_real_tool');
    });
});
describe('searchNav', () => {
    const idx = buildNavIndex({ available: { fundraising: true, ai: true }, tools });
    it('ranks a label prefix first', () => {
        expect(searchNav(idx, 'import')[0].id).toBe('act_import');
    });
    it('requires every word to match somewhere', () => {
        expect(searchNav(idx, 'donor zebra')).toEqual([]);
        expect(searchNav(idx, 'walk list').map((e) => e.id)).toContain('tool_smart_segments');
    });
    it('empty query lists tabs and actions, not every tool', () => {
        expect(searchNav(idx, '').every((e) => e.type !== 'tool')).toBe(true);
    });
});
describe('Ask Lynx helpers', () => {
    const idx = buildNavIndex({ available: { fundraising: true, ai: true }, tools });
    it('suggests destinations for a natural question', () => {
        expect(suggestForQuestion(idx, 'How do I make a walk list?').map((e) => e.id)).toContain('tool_smart_segments');
        expect(suggestForQuestion(idx, 'how do I')).toEqual([]);
    });
    it('sends the model only this viewer\'s destinations', () => {
        const ctx = JSON.parse(buildGuideContext(idx, ' invite people '));
        expect(ctx.question).toBe('invite people');
        expect(ctx.destinations.map((d) => d.id)).toEqual(idx.map((e) => e.id));
    });
    it('never resolves an id the model invented', () => {
        const r = resolveGuideIds(idx, ['act_import', 'tool_launch_missiles', 'act_import']);
        expect(r.map((e) => e.id)).toEqual(['act_import']);
    });
});
describe('pinned & recent', () => {
    const idx = buildNavIndex({ available: { fundraising: true, ai: true }, tools });
    it('toggles pins and keeps recents unique, newest first, capped', () => {
        expect(togglePin(['a'], 'b')).toEqual(['a', 'b']);
        expect(togglePin(['a', 'b'], 'a')).toEqual(['b']);
        let r = [];
        for (const id of ['a', 'b', 'c', 'a', 'd', 'e', 'f'])
            r = pushRecent(r, id);
        expect(r).toEqual(['f', 'e', 'd', 'a', 'c']);
    });
    it('drops ids that no longer resolve', () => {
        expect(resolveIds(idx, ['act_import', 'tool_gone']).map((e) => e.id)).toEqual(['act_import']);
    });
    it('shows pinned, then recent without duplicates, then defaults', () => {
        const s = emptyQuerySections(idx, ['tool_smart_segments'], ['act_import', 'tool_smart_segments'], 5);
        expect(s.map((x) => x.label)).toEqual(['Pinned', 'Recent', 'Go to']);
        expect(s[0].entries.map((e) => e.id)).toEqual(['tool_smart_segments']);
        expect(s[1].entries.map((e) => e.id)).toEqual(['act_import']);
        expect(s.flatMap((x) => x.entries)).toHaveLength(5);
    });
    it('omits empty sections', () => {
        expect(emptyQuerySections(idx, [], []).map((x) => x.label)).toEqual(['Go to']);
    });
});
