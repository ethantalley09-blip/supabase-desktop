import { describe, expect, it } from 'vitest';
import { quickPromptsForCategories } from './roleQuickPrompts';

describe('quickPromptsForCategories', () => {
  it('always includes the general prompts', () => {
    const prompts = quickPromptsForCategories([]);
    expect(prompts).toContain('How is this project doing overall?');
  });

  it('adds turf-flavored prompts for a canvasser (turf.view only)', () => {
    const prompts = quickPromptsForCategories(['turf']);
    expect(prompts).toContain('Who is our top canvasser right now?');
    expect(prompts).not.toContain('What is our average donation?');
  });

  it('adds fundraising-flavored prompts for a fundraiser', () => {
    const prompts = quickPromptsForCategories(['fundraising']);
    expect(prompts).toContain('What is our average donation?');
    expect(prompts).not.toContain('Who is our top canvasser right now?');
  });

  it('combines categories without duplicating the general prompts', () => {
    const prompts = quickPromptsForCategories(['turf', 'fundraising', 'comms']);
    expect(prompts.filter((p) => p === 'How is this project doing overall?')).toHaveLength(1);
    expect(prompts).toContain('How is our social media performing?');
  });
});
