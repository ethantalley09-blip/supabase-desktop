// Integration seam for social platforms. Each platform (X, Facebook,
// Instagram, ...) gets an adapter implementing this interface; the scheduler
// UI and social_posts table are platform-agnostic. Until real API
// integrations are prioritized, the manual adapter treats posting as
// something a human did outside the app and records metrics by hand.
export type SocialPlatformAdapter = {
  platform: string;
  label: string;
  // Publish or schedule a post; returns the platform's post identifier.
  publish?: (content: string, scheduledFor?: Date) => Promise<string>;
  // Pull impression/engagement metrics for a published post.
  fetchMetrics?: (platformPostId: string) => Promise<{ impressions: number; engagement: number }>;
};

export const SOCIAL_PLATFORMS: SocialPlatformAdapter[] = [
  { platform: 'x', label: 'X (Twitter)' },
  { platform: 'facebook', label: 'Facebook' },
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'other', label: 'Other' }
];
