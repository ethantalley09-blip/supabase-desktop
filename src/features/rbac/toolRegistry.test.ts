import { describe, expect, it } from 'vitest';
import { filterTools, isToolVisible, TOOL_REGISTRY, toolsByCategory } from './toolRegistry';

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
    expect(
      isToolVisible('volunteer_donor_bridge', { 'ai.use': true, 'fundraising.manage': true, 'turf.view': true }, true)
    ).toBe(true);
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
