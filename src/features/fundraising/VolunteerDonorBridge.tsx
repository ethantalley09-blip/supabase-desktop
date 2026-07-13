import { HandHeart, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDraftVolunteerAsk, useOrgMembersForBridge, useVolunteerDonorAsks } from './useFundraisingAi';

// Cross-domain feature: bridges Turf (canvassers/volunteers) and Fundraising
// (donors) — a match no single-purpose donation platform (ActBlue, WinRed,
// Anedot) can make, because they don't have the field-organizing data at all.
// Turns your most engaged non-donors into a warm, high-conversion ask list.
export function VolunteerDonorBridge({ orgId, projectId }: { orgId: string; projectId: string }) {
  const { data: members } = useOrgMembersForBridge(orgId);
  const { data: recentAsks } = useVolunteerDonorAsks(orgId);
  const draft = useDraftVolunteerAsk();
  const [profileId, setProfileId] = useState('');
  const [contribution, setContribution] = useState('');

  const run = async () => {
    if (!profileId || !contribution.trim()) return;
    await draft.mutateAsync({ orgId, projectId, profileId, contributionSummary: contribution.trim() });
    setContribution('');
  };

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <HandHeart className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Volunteer-to-Donor Bridge</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Your active volunteers are your warmest, highest-conversion non-donors. Cites their real
        field contribution — no guilt, just an invitation to also join financially.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
        >
          <option value="">Select volunteer…</option>
          {members?.map((m) => (
            <option key={m.profile_id} value={m.profile_id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <Input
          className="flex-1"
          placeholder="Their contribution, e.g. knocked 120 doors across 3 shifts"
          value={contribution}
          onChange={(e) => setContribution(e.target.value)}
        />
        <Button size="sm" onClick={run} disabled={draft.isPending || !profileId || !contribution.trim()}>
          <Sparkles className="h-4 w-4" />
          {draft.isPending ? 'Drafting…' : 'Draft Ask'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {recentAsks && recentAsks.length > 0 && (
        <div className="space-y-2">
          {recentAsks.slice(0, 3).map((a) => (
            <div key={a.id} className="rounded-md border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{a.contribution_summary}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{a.ask_message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
