import { describe, expect, it } from 'vitest';
import { arrangeTools, filterTools, isToolVisible, reorderTools, TOOL_LOCATIONS, TOOL_REGISTRY, toolsByCategory } from './toolRegistry';
describe('TOOL_LOCATIONS', () => {
    it('every registered tool has a deep-link location with a tool- anchor', () => {
        for (const tool of TOOL_REGISTRY) {
            const loc = TOOL_LOCATIONS[tool.id];
            expect(loc, `missing location for ${tool.id}`).toBeDefined();
            expect(loc.anchor).toBe(`tool-${tool.id}`);
            expect(['ai', 'turf', 'comms', 'fundraising', 'compete', 'integrations']).toContain(loc.tab);
        }
    });
});
describe('filterTools', () => {
    it('returns nothing without ai_module, even with every permission', () => {
        const allPerms = Object.fromEntries(TOOL_REGISTRY.flatMap((t) => t.requires).map((k) => [k, true]));
        expect(filterTools({ 'ai.use': true, ...allPerms }, false)).toEqual([]);
    });
    it('returns nothing without ai.use, even with ai_module active', () => {
        expect(filterTools({ 'fundraising.manage': true }, true)).toEqual([]);
    });
    it('a Canvasser (ai.use + turf.view only) sees turf tools but no fundraising tools', () => {
        const tools = filterTools({ 'ai.use': true, 'turf.view': true }, true);
        const ids = tools.map((t) => t.id);
        expect(ids).toContain('smart_segments');
        expect(ids).toContain('field_coach');
        expect(ids).not.toContain('ask_optimizer');
        expect(ids).not.toContain('donor_message_studio');
    });
    it('a Fundraiser (ai.use + fundraising.manage, no turf) sees the fundraising suite but not turf-only tools', () => {
        const tools = filterTools({ 'ai.use': true, 'fundraising.manage': true, 'fundraising.view': true }, true);
        const ids = tools.map((t) => t.id);
        expect(ids).toContain('ask_optimizer');
        expect(ids).toContain('donor_message_studio');
        expect(ids).not.toContain('smart_segments');
        // volunteer_donor_bridge is cross-domain -- needs turf.view too, which this role lacks.
        expect(ids).not.toContain('volunteer_donor_bridge');
    });
    it('cross-domain tools require every listed permission (AND, not OR)', () => {
        expect(isToolVisible('volunteer_donor_bridge', { 'ai.use': true, 'fundraising.manage': true }, true)).toBe(false);
        expect(isToolVisible('volunteer_donor_bridge', { 'ai.use': true, 'turf.view': true }, true)).toBe(false);
        expect(isToolVisible('volunteer_donor_bridge', { 'ai.use': true, 'fundraising.manage': true, 'turf.view': true }, true)).toBe(true);
    });
    it('an Owner with every permission sees the full registry', () => {
        const allPerms = Object.fromEntries(TOOL_REGISTRY.flatMap((t) => t.requires).map((k) => [k, true]));
        const tools = filterTools({ 'ai.use': true, ...allPerms }, true);
        expect(tools.length).toBe(TOOL_REGISTRY.length);
    });
});
describe('toolsByCategory', () => {
    it('groups tools under their declared category', () => {
        const grouped = toolsByCategory(TOOL_REGISTRY);
        expect(grouped.fundraising.every((t) => t.category === 'fundraising')).toBe(true);
        expect(grouped.turf.length).toBeGreaterThan(0);
    });
});
describe('arrangeTools', () => {
    const three = TOOL_REGISTRY.slice(0, 3); // [ask_data, campaign_coach, message_studio]
    it('no layout = registry order, nothing hidden', () => {
        const { visible, hiddenTools } = arrangeTools(three, null);
        expect(visible.map((t) => t.id)).toEqual(three.map((t) => t.id));
        expect(hiddenTools).toEqual([]);
    });
    it('applies saved order and hides hidden tools', () => {
        const { visible, hiddenTools } = arrangeTools(three, {
            order: [three[2].id, three[0].id],
            hidden: [three[1].id]
        });
        expect(visible.map((t) => t.id)).toEqual([three[2].id, three[0].id]);
        expect(hiddenTools.map((t) => t.id)).toEqual([three[1].id]);
    });
    it('tools missing from a stale saved order append at the end (new features stay discoverable)', () => {
        const { visible } = arrangeTools(three, { order: [three[1].id] });
        expect(visible[0].id).toBe(three[1].id);
        expect(visible.map((t) => t.id)).toContain(three[0].id);
        expect(visible.map((t) => t.id)).toContain(three[2].id);
    });
    it('a hidden id the role no longer has access to is simply ignored', () => {
        const { visible } = arrangeTools(three, { hidden: ['not_a_real_tool'] });
        expect(visible.length).toBe(3);
    });
});
describe('reorderTools', () => {
    it('moves the dragged id to the target position', () => {
        expect(reorderTools(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
        expect(reorderTools(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    });
    it('is a no-op for self-drops or unknown ids', () => {
        expect(reorderTools(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
        expect(reorderTools(['a', 'b'], 'zz', 'a')).toEqual(['a', 'b']);
    });
});
