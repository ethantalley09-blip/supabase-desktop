// "Start here" guides: one short strip per tab saying what it's for and the
// two or three things people come to it to do. Pure config + resolution.
// Action ids are nav-index ids (navMath.js), so a guide can only ever offer
// a button this viewer can actually open -- anything unresolvable is dropped.
export const TAB_GUIDES = {
    overview: {
        title: 'Your home base',
        body: 'Today shows what needs doing, My tasks shows what\'s yours, and the numbers below show how the campaign is going.',
        actions: ['act_task', 'tab_tasks']
    },
    tasks: {
        title: 'Your team\'s to-do list',
        body: 'Add a task in one line, assign it to anyone on the team, and give it a date. Overdue tasks turn red, and whoever you assign gets a notification.',
        actions: []
    },
    governing: {
        title: 'Constituent services',
        body: 'Log every call, email, and walk-in as a case so nothing falls through the cracks. Work the queue top-down: overdue first, then urgent.',
        actions: ['act_case']
    },
    turf: {
        title: 'Your voters, on a map',
        body: 'Import a voter list, cut it into territories, and turn those into walk lists. Every door your team knocks is logged here.',
        actions: ['act_import', 'act_territory', 'act_chase']
    },
    fundraising: {
        title: 'Money in',
        body: 'Record every gift (online, check, or cash at the door). The more you log, the sharper the donor tools below get.',
        actions: ['act_donation']
    },
    comms: {
        title: 'Talk to your team and supporters',
        body: 'Send team broadcasts for free; email, press, and social tools live here too.',
        actions: ['act_broadcast']
    },
    compete: {
        title: 'Opposition research, done right',
        body: 'Log what the opponent said or did publicly, with a source. Every tool here works only from what you log.',
        actions: []
    },
    ai: {
        title: 'AI tools in one place',
        body: 'Ask questions about your data, get a coach\'s top priorities, or draft messages. Pin your favourites in Search (Ctrl/⌘ K).',
        actions: ['tool_ask_data', 'tool_campaign_coach', 'tool_message_studio']
    },
    integrations: {
        title: 'Connect your other tools',
        body: 'Bring in texting/email results, event sign-ups, and petition signatures from the services you already use.',
        actions: []
    },
    team: {
        title: 'Who\'s on the campaign',
        body: 'Invite people by email and pick their role. The role decides what each person can see.',
        actions: ['act_invite']
    },
    compliance: {
        title: 'Contribution tracking',
        body: 'Placeholder rules to help you keep an eye on limits. This is not legal advice; check with counsel.',
        actions: []
    }
};
export function resolveTabGuide(tab, index) {
    const guide = TAB_GUIDES[tab];
    if (!guide)
        return null;
    const byId = new Map((index ?? []).map((e) => [e.id, e]));
    return {
        ...guide,
        // An action that just points at the tab you're already on is noise.
        actions: guide.actions.map((id) => byId.get(id)).filter((e) => e && !(e.type === 'tab' && e.target.tab === tab))
    };
}
