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

export type ToolCategory = 'general' | 'turf' | 'comms' | 'fundraising';

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
  { id: 'smart_segments', label: 'Smart Segments', description: 'Describe a voter universe, get a walk list.', category: 'turf', requires: ['turf.view'] },
  { id: 'field_coach', label: 'Field Coach', description: 'Turf-specific prioritized next actions.', category: 'turf', requires: ['turf.view'] },
  { id: 'note_digest', label: 'Note Digest', description: 'Summarizes canvass notes into themes.', category: 'turf', requires: ['turf.view'] },
  { id: 'import_mapping', label: 'Import Mapping', description: 'AI column-mapping for messy voter files.', category: 'turf', requires: ['turf.manage'] },

  // Comms
  { id: 'broadcast_draft', label: 'Draft Broadcast', description: 'AI-drafted team broadcasts and replies.', category: 'comms', requires: ['comms.broadcast'] },
  { id: 'outreach_booster', label: 'Outreach Booster', description: 'Saved-contact texts for supporters.', category: 'comms', requires: ['comms.view'] },

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
  { id: 'refund_watchdog', label: 'Refund Watchdog', description: 'Chargeback/refund-rate early warning.', category: 'fundraising', requires: ['fundraising.manage'] }
];

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
  const grouped: Record<ToolCategory, ToolDefinition[]> = { general: [], turf: [], comms: [], fundraising: [] };
  for (const tool of tools) grouped[tool.category].push(tool);
  return grouped;
}
