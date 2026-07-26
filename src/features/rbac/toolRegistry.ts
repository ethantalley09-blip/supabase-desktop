// Declares every AI tool in the app and which permissions unlock it, so each
// role sees a curated toolset instead of one blanket ai.use gate showing
// everything to everyone. Pure and framework-free (no Supabase import) so
// it's unit-testable in isolation — pattern matches turf/route.ts.
//
// To add a tool: add one entry here with its required permission keys, then
// use `isToolVisible` (or `filterTools`) wherever it renders. `ai.use` is
// implied by every tool and omitted from each entry's list for brevity —
// callers must still confirm the ai_module ENTITLEMENT separately (RLS is
// still the real enforcement layer; this only controls what's presented).
import type { PermissionKey } from './roleTemplates';

export type ToolCategory = 'general' | 'turf' | 'comms' | 'fundraising' | 'compete';

export type ToolDefinition = {
  id: string;
  label: string;
  description: string;
  category: ToolCategory;
  // Permissions beyond ai.use required to see this tool. Empty = ai.use alone
  // is enough (e.g. general-purpose utilities available to any AI user).
  requires: PermissionKey[];
};

export const TOOL_REGISTRY: ToolDefinition[] = [
  // AI Center — general
  { id: 'ask_data', label: 'Ask your data', description: 'Plain-English Q&A over voter and fundraising totals.', category: 'general', requires: [] },
  { id: 'campaign_coach', label: 'Campaign Coach', description: 'Your top 3 priorities right now.', category: 'general', requires: [] },
  { id: 'message_studio', label: 'Message Studio', description: 'Draft broadcasts, scripts, and personal texts.', category: 'comms', requires: [] },
  { id: 'content_pack', label: 'Content Pack', description: 'One brief -> email/text/script/social set.', category: 'comms', requires: ['comms.manage'] },

  // Turf
  { id: 'turf_briefing', label: 'Turf Briefing', description: 'Live shift heatmap, party map, and a real-time pre-shift AI briefing.', category: 'turf', requires: ['turf.view'] },
  { id: 'doorstep_donations', label: 'Doorstep Donations', description: 'Warm doors + 20-second ask + canvasser leaderboard.', category: 'turf', requires: ['turf.view'] },
  { id: 'smart_segments', label: 'Smart Segments', description: 'Describe a voter universe, get a walk list.', category: 'turf', requires: ['turf.view'] },
  { id: 'field_coach', label: 'Field Coach', description: 'Turf-specific prioritized next actions.', category: 'turf', requires: ['turf.view'] },
  { id: 'note_digest', label: 'Note Digest', description: 'Summarizes canvass notes into themes.', category: 'turf', requires: ['turf.view'] },
  { id: 'import_mapping', label: 'Import Mapping', description: 'AI column-mapping for messy voter files.', category: 'turf', requires: ['turf.manage'] },
  { id: 'geocode_coach', label: 'AI Geocode Coach', description: 'Turns mapping health into a prioritized recovery plan.', category: 'turf', requires: ['turf.manage'] },
  { id: 'volunteer_pipeline', label: 'Volunteer Pipeline', description: 'Re-engagement or promotion messages for real volunteer situations.', category: 'turf', requires: ['turf.view'] },
  { id: 'gotv_sprint_plan', label: 'GOTV Countdown Planner', description: 'Day-by-day turnout plan from real ballot-chase status.', category: 'turf', requires: ['turf.view'] },

  // Comms
  { id: 'broadcast_draft', label: 'Draft Broadcast', description: 'AI-drafted team broadcasts and replies.', category: 'comms', requires: ['comms.broadcast'] },
  { id: 'outreach_booster', label: 'Outreach Booster', description: 'Saved-contact texts for supporters.', category: 'comms', requires: ['comms.view'] },
  { id: 'send_time_insight', label: 'Send-Time Insight', description: 'Best time to reach supporters, from real gift timestamps.', category: 'comms', requires: ['comms.view'] },
  { id: 'email_campaign', label: 'Email Campaign Studio', description: '3 A/B subject lines + preview text + body.', category: 'comms', requires: ['comms.manage'] },
  { id: 'press_release', label: 'Press Release Generator', description: 'AP-style release from facts you provide.', category: 'comms', requires: ['comms.manage'] },
  { id: 'media_pitch', label: 'Media Pitch Builder', description: 'Personalized pitch to a named reporter.', category: 'comms', requires: ['comms.manage'] },
  { id: 'direct_mail', label: 'Direct Mail Designer', description: 'Postcard-sized headline + body + CTA.', category: 'comms', requires: ['comms.manage'] },
  { id: 'phone_script', label: 'Phone / Text Script Builder', description: 'Phone bank and P2P texting scripts.', category: 'comms', requires: ['comms.manage'] },
  { id: 'endorsement_ask', label: 'Endorsement Outreach Builder', description: 'Personalized endorsement request to a named organization or leader.', category: 'comms', requires: ['comms.manage'] },

  // Fundraising AI suite
  { id: 'donor_insights', label: 'Donor Insights', description: 'Connector scoring and at-risk donors.', category: 'fundraising', requires: ['fundraising.view'] },
  { id: 'ask_optimizer', label: 'Ask Optimizer', description: 'Predicts the optimal ask per donor.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'major_donor_ladder', label: 'Major Donor Ladder', description: 'Flags donors ready for a major-gift ask.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'momentum_detector', label: 'Momentum Detector', description: 'Real-time donation-spike response.', category: 'fundraising', requires: ['fundraising.view'] },
  { id: 'payment_recovery', label: 'Payment Recovery', description: 'Recovers failed recurring charges.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'volunteer_donor_bridge', label: 'Volunteer-to-Donor Bridge', description: 'Asks non-donor volunteers to also give.', category: 'fundraising', requires: ['fundraising.manage', 'turf.view'] },
  { id: 'recurring_upgrade', label: 'Recurring Upgrade', description: 'Anniversary asks to raise monthly gifts.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'sprint_planner', label: 'FEC Sprint Planner', description: 'Day-by-day plan to hit a filing deadline.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'retention_sequence', label: 'Retention Sequence', description: 'Post-donation thank-you/impact/second-ask.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'fatigue_guard', label: 'Fatigue Guard', description: 'Checks send frequency before the next blast.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'copy_variation_tester', label: 'Copy Variation Tester', description: 'FEC-compliant A/B message variants.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'donor_message_studio', label: 'Donor Message Studio', description: 'Thank-you notes and donation asks.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'ltv_forecast', label: 'LTV Forecast', description: 'Predicts a donor\'s long-term value tier.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'donor_dedup', label: 'Donor Identity Resolution', description: 'Suggests cross-source donor merges.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'refund_watchdog', label: 'Refund Watchdog', description: 'Chargeback/refund-rate early warning.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'funding_runway', label: 'Funding Runway', description: 'Predicts cash shortfalls weeks ahead, with closing strategies.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'network_multiplier', label: 'Network Multiplier', description: 'Donor-voice asks to forward to their own people.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'reactivation_center', label: 'Reactivation Center', description: 'Rhythm-based lapse detection + 3-angle win-backs.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'issue_response', label: 'Issue Response Engine', description: 'News event -> instant multi-channel response pack.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'emergency_ask', label: 'Emergency Ask Generator', description: 'Real gap + real deadline -> same-day email/SMS/call-script pack.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'bundler_network', label: 'Bundler Network Detector', description: 'Surfaces real coworker donor networks worth formally cultivating.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'event_planner', label: 'High-Dollar Event Planner', description: 'Real, ranked invite list and honest dollar range for a fundraising event.', category: 'fundraising', requires: ['fundraising.manage'] },
  { id: 'contribution_limit_guardian', label: 'Contribution Limit Guardian', description: 'Flags real donors/employer clusters nearing a configured contribution limit.', category: 'fundraising', requires: ['fundraising.view'] },

  // Compete (opposition research on the staff-logged PUBLIC record only)
  { id: 'filing_gap', label: 'Filing Gap', description: 'Your real total vs. their public filing number.', category: 'compete', requires: ['compete.view'] },
  { id: 'rapid_rebuttal', label: 'Rapid Rebuttal', description: 'Their claim -> statement + social + door script.', category: 'compete', requires: ['compete.view'] },
  { id: 'contrast_builder', label: 'Contrast Builder', description: 'Their logged position vs. ours, issues only.', category: 'compete', requires: ['compete.view'] },
  { id: 'opponent_digest', label: 'Message Radar', description: 'Their themes, message drift, and avoided issues.', category: 'compete', requires: ['compete.view'] },
  { id: 'debate_prep', label: 'Debate Prep', description: '5 likely attacks with honest responses + pivots.', category: 'compete', requires: ['compete.view'] },
  { id: 'red_team', label: 'Red Team', description: 'Attack your own record before the opponent does.', category: 'compete', requires: ['compete.view'] },
  { id: 'mistake_response', label: 'Mistake Response', description: 'Honest accountability statement for a real candidate mistake.', category: 'compete', requires: ['compete.view'] },
  { id: 'interview_prep', label: 'Interview Prep', description: 'Prep for a friendly local interview, not a debate.', category: 'compete', requires: ['compete.view'] }
];

// Where each tool's working UI lives: which project tab hosts it and the
// DOM anchor (`tool-<id>` wrapper) to scroll to. Pure data — the dashboard
// uses it to make every card a working deep link.
export type ToolLocation = { tab: 'ai' | 'turf' | 'comms' | 'fundraising' | 'compete'; anchor: string };

export const TOOL_LOCATIONS: Record<string, ToolLocation> = Object.fromEntries(
  TOOL_REGISTRY.map((t) => {
    // A handful of tools render on the AI Center or Turf page even though
    // their registry category says otherwise (they're general-purpose or
    // reused elsewhere) — list those exceptions explicitly. Everything else
    // defaults to its own category, which is also a valid tab name
    // ('turf'/'comms'/'fundraising'/'compete' match 1:1) — so a newly added
    // comms/fundraising/compete tool routes correctly with zero extra wiring.
    const tab: ToolLocation['tab'] =
      ['ask_data', 'campaign_coach', 'message_studio', 'content_pack', 'smart_segments'].includes(t.id)
        ? 'ai'
        : ['field_coach', 'note_digest', 'import_mapping', 'doorstep_donations', 'geocode_coach'].includes(t.id)
          ? 'turf'
          : (t.category as ToolLocation['tab']);
    return [t.id, { tab, anchor: `tool-${t.id}` }];
  })
) as Record<string, ToolLocation>;

// The customized filter: given a flat permission map (as returned by the
// get_my_permissions RPC) and whether the org has ai_module, returns exactly
// the tools this role should see. Pure — no network, fully unit-testable.
export function filterTools(
  permissions: Partial<Record<PermissionKey, boolean>>,
  hasAiModule: boolean
): ToolDefinition[] {
  if (!hasAiModule || !permissions['ai.use']) return [];
  return TOOL_REGISTRY.filter((tool) => tool.requires.every((key) => permissions[key]));
}

export function isToolVisible(
  toolId: string,
  permissions: Partial<Record<PermissionKey, boolean>>,
  hasAiModule: boolean
): boolean {
  return filterTools(permissions, hasAiModule).some((t) => t.id === toolId);
}

export function toolsByCategory(tools: ToolDefinition[]): Record<ToolCategory, ToolDefinition[]> {
  const grouped: Record<ToolCategory, ToolDefinition[]> = { general: [], turf: [], comms: [], fundraising: [], compete: [] };
  for (const tool of tools) grouped[tool.category].push(tool);
  return grouped;
}

// A user's saved dashboard layout: explicit card order + hidden tool ids.
// Presentation only — never widens what filterTools() allowed.
export type DashboardLayout = { order?: string[]; hidden?: string[] };

// Apply a personal layout to the role's allowed tools: hidden ones move to
// `hiddenTools`, the rest sort by the saved order; tools the user has never
// arranged (e.g. newly shipped ones) append at the end in registry order so
// new features are discoverable, not invisible.
export function arrangeTools(
  tools: ToolDefinition[],
  layout: DashboardLayout | null | undefined
): { visible: ToolDefinition[]; hiddenTools: ToolDefinition[] } {
  const hidden = new Set(layout?.hidden ?? []);
  const order = layout?.order ?? [];
  const rank = new Map(order.map((id, i) => [id, i]));
  const visible = tools
    .filter((t) => !hidden.has(t.id))
    .sort((a, b) => (rank.get(a.id) ?? order.length + tools.indexOf(a)) - (rank.get(b.id) ?? order.length + tools.indexOf(b)));
  return { visible, hiddenTools: tools.filter((t) => hidden.has(t.id)) };
}

// Move `dragId` so it lands where `targetId` currently sits (dragging down
// passes the target, dragging up displaces it — standard list-reorder feel).
// Returns the new full order (all visible ids, explicit) ready to persist.
export function reorderTools(visibleIds: string[], dragId: string, targetId: string): string[] {
  const from = visibleIds.indexOf(dragId);
  const to = visibleIds.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return visibleIds;
  const next = [...visibleIds];
  next.splice(from, 1);
  next.splice(to, 0, dragId);
  return next;
}
