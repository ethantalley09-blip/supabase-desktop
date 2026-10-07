import { describe, expect, it } from 'vitest';
import { resolveTabGuide, TAB_GUIDES } from './guideMath';
import { buildNavIndex, TAB_DESTINATIONS } from './navMath';
import { badgeText, notificationDestination, relativeTime, unreadCount } from './notifyMath';
describe('tab guides', () => {
    it('has a guide for every tab in the app', () => {
        for (const t of TAB_DESTINATIONS)
            expect(TAB_GUIDES[t.tab], `missing guide for ${t.tab}`).toBeDefined();
    });
    it('every guide action is a real nav id', () => {
        const full = buildNavIndex({ available: { fundraising: true, governing: true, ai: true, compete: true, compliance: true, integrations: true }, tools: [
                { id: 'ask_data', label: 'Ask', description: '', category: 'general' },
                { id: 'campaign_coach', label: 'Coach', description: '', category: 'general' },
                { id: 'message_studio', label: 'Studio', description: '', category: 'comms' }
            ] });
        const ids = new Set(full.map((e) => e.id));
        for (const [tab, g] of Object.entries(TAB_GUIDES))
            for (const a of g.actions)
                expect(ids.has(a), `${tab}: ${a}`).toBe(true);
    });
    it('drops actions this viewer cannot open', () => {
        const idx = buildNavIndex({ available: { fundraising: false }, tools: [] });
        expect(resolveTabGuide('fundraising', idx).actions).toEqual([]);
        expect(resolveTabGuide('turf', idx).actions.map((a) => a.id)).toEqual(['act_import', 'act_territory', 'act_chase']);
    });
    it('drops an action that points at the current tab', () => {
        const idx = buildNavIndex({ available: {}, tools: [] });
        expect(resolveTabGuide('overview', idx).actions.map((a) => a.id)).toEqual(['act_task', 'tab_tasks']);
        expect(resolveTabGuide('nope', idx)).toBeNull();
    });
});
describe('notifications', () => {
    const NOW = new Date('2026-10-05T12:00:00Z');
    it('counts unread and caps the badge', () => {
        expect(unreadCount([{ read_at: null }, { read_at: 'x' }, {}])).toBe(2);
        expect(badgeText(0)).toBeNull();
        expect(badgeText(4)).toBe('4');
        expect(badgeText(12)).toBe('9+');
    });
    it('formats relative time', () => {
        expect(relativeTime('2026-10-05T11:59:30Z', NOW)).toBe('just now');
        expect(relativeTime('2026-10-05T11:15:00Z', NOW)).toBe('45m ago');
        expect(relativeTime('2026-10-05T06:00:00Z', NOW)).toBe('6h ago');
        expect(relativeTime('2026-10-02T12:00:00Z', NOW)).toBe('3d ago');
    });
    it('routes to another project, or switches tab in this one', () => {
        expect(notificationDestination({ project_id: 'p2', link_tab: 'tasks' }, 'p1')).toEqual({ kind: 'route', path: '/projects/p2' });
        expect(notificationDestination({ project_id: 'p1', link_tab: 'tasks', link_anchor: null }, 'p1')).toEqual({ kind: 'tab', target: { tab: 'tasks', anchor: undefined } });
        expect(notificationDestination({ project_id: 'p1' }, 'p1')).toEqual({ kind: 'none' });
    });
});
