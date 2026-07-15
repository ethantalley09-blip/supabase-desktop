import { HeartHandshake, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOrgMembersForBridge } from '@/features/fundraising/useFundraisingAi';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { useMutation } from '@tanstack/react-query';

type VolunteerPipelinePack = { message: string; suggested_next_step: string };

function useVolunteerPipeline() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; volunteerName: string; situation: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'volunteer_pipeline',
        context: JSON.stringify({ volunteer_name: input.volunteerName, situation: input.situation })
      });
      const parsed = extractJson<VolunteerPipelinePack>(result.text);
      if (!parsed) throw new Error('Could not parse the volunteer message');
      return parsed;
    }
  });
}

// Volunteer Recruitment & Retention: donors get churn_prediction and a win-back
// sequence, volunteers get nothing today. Same idea, different roster —
// staff describe a real lapse or a real moment of readiness, the AI drafts
// the re-engagement or promotion ask. No shift-tracking table exists yet, so
// this is honestly input-driven (like emergency_ask) rather than pretending
// to compute an engagement score from data the app doesn't have.
export function VolunteerPipeline({ orgId, projectId }: { orgId: string; projectId: string }) {
  const { data: members } = useOrgMembersForBridge(orgId);
  const draft = useVolunteerPipeline();
  const [volunteerId, setVolunteerId] = useState('');
  const [situation, setSituation] = useState('');
  const [copied, setCopied] = useState(false);

  const volunteerName = members?.find((m) => m.profile_id === volunteerId)?.full_name ?? '';

  const run = () => {
    if (!volunteerName || situation.trim().length < 10) return;
    draft.mutate({ orgId, projectId, volunteerName, situation: situation.trim() });
  };

  const copy = async () => {
    if (!draft.data) return;
    await navigator.clipboard.writeText(draft.data.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <HeartHandshake className="h-4 w-4 text-rose-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Volunteer Pipeline</h3>
      </div>
      <p className="text-xs text-neutral-500">
        A lapsed volunteer, or one ready for more? Describe the real situation and get a warm
        re-engagement or promotion message — never a guilt trip.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={volunteerId}
          onChange={(e) => setVolunteerId(e.target.value)}
        >
          <option value="">Select team member…</option>
          {members?.map((m) => (
            <option key={m.profile_id} value={m.profile_id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <input
          className="h-9 min-w-64 flex-1 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="e.g. Did 6 shifts in March, hasn't signed up since — no explanation"
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
        />
        <Button size="sm" onClick={run} disabled={draft.isPending || !volunteerName || situation.trim().length < 10}>
          <Sparkles className="h-4 w-4" />
          {draft.isPending ? 'Drafting…' : 'Draft message'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {draft.data && (
        <div className="space-y-1.5 rounded-md border border-rose-100 bg-rose-50 p-3 text-sm text-neutral-800">
          <p className="whitespace-pre-wrap">{draft.data.message}</p>
          <p className="text-xs font-medium text-rose-700">Next step: {draft.data.suggested_next_step}</p>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? 'Copied!' : 'Copy message'}
          </Button>
        </div>
      )}
    </div>
  );
}
