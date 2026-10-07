// Notification bell helpers. Pure.
export function unreadCount(notifications) {
    return (notifications ?? []).filter((n) => !n.read_at).length;
}
// Badge text: exact up to 9, then "9+" so the badge never grows wider.
export function badgeText(count) {
    if (!count)
        return null;
    return count > 9 ? '9+' : String(count);
}
export function relativeTime(iso, now = new Date()) {
    const s = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
    if (s < 60)
        return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7)
        return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
}
// Where clicking a notification takes you. Same project: switch tab in
// place. Another project: route there (the tab opens on Overview, and the
// notification's own tab is named in the title anyway).
export function notificationDestination(n, currentProjectId) {
    if (n.project_id && n.project_id !== currentProjectId)
        return { kind: 'route', path: `/projects/${n.project_id}` };
    if (n.link_tab)
        return { kind: 'tab', target: { tab: n.link_tab, anchor: n.link_anchor ?? undefined } };
    return { kind: 'none' };
}
