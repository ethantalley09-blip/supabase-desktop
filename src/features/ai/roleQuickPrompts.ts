// Curated quick-question chips shown above the free-text Ask box —
// approximates the advisor spec's "role-specific quick questions" (§24)
// using the permission-derived tool categories AiCenterTab already computes
// via useAvailableTools, since no hook currently exposes the caller's
// literal role name (Owner/Manager/Canvasser/etc.) to this component. A
// canvasser with only turf.view sees turf-flavored prompts; someone with
// fundraising.manage also sees fundraising ones — same self-filtering
// principle as the rest of the AI tool registry. Pure and testable.
import type { ToolCategory } from '@/features/rbac/toolRegistry';

const GENERAL_PROMPTS = ['How is this project doing overall?', 'What needs my attention right now?'];

const CATEGORY_PROMPTS: Partial<Record<ToolCategory, string[]>> = {
  turf: [
    'Which territory is hardest to work right now?',
    'What time of day gets the best contact rate?',
    'Who is our top canvasser right now?'
  ],
  fundraising: [
    'Are we raising more or less than last week?',
    'What is our average donation?',
    'How many donations came directly from a doorstep ask?'
  ],
  comms: ['How is our social media performing?'],
  compete: []
};

export function quickPromptsForCategories(categories: Iterable<ToolCategory>): string[] {
  const prompts = [...GENERAL_PROMPTS];
  const seen = new Set(prompts);
  for (const category of categories) {
    for (const prompt of CATEGORY_PROMPTS[category] ?? []) {
      if (!seen.has(prompt)) {
        prompts.push(prompt);
        seen.add(prompt);
      }
    }
  }
  return prompts;
}
