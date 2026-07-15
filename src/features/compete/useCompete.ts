import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { buildCompeteSnapshot } from './competeMath';

// Compete tab hooks. Data layer: opponent_records — public-record items staff
// typed in by hand (migration 0027; RLS on compete.view/manage). The five AI
// tools are drafting/analysis-only, so nothing they output is persisted.

export type OpponentRecord = {
  id: string;
  record_type: 'statement' | 'vote' | 'ad' | 'endorsement' | 'filing' | 'news';
  occurred_on: string;
  source: string | null;
  content: string;
  status: string;
  created_at: string;
};

export function useOpponentRecords(projectId: string | undefined) {
  return useQuery({
    queryKey: ['opponent-records', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opponent_records')
        .select('*')
        .eq('project_id', projectId!)
        .eq('status', 'active')
        .order('occurred_on', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as OpponentRecord[];
    },
    enabled: Boolean(projectId)
  });
}

export function useAddOpponentRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orgId: string;
      projectId: string;
      recordType: OpponentRecord['record_type'];
      occurredOn: string;
      source: string;
      content: string;
    }) => {
      const { error } = await supabase.from('opponent_records').insert({
        org_id: input.orgId,
        project_id: input.projectId,
        record_type: input.recordType,
        occurred_on: input.occurredOn,
        source: input.source.trim() || null,
        content: input.content.trim()
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['opponent-records', vars.projectId] })
  });
}

// Archive, never delete (invariant #2).
export function useArchiveOpponentRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; projectId: string }) => {
      const { error } = await supabase.from('opponent_records').update({ status: 'archived' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['opponent-records', vars.projectId] })
  });
}

export type ContrastPack = {
  email: { subject: string; body: string };
  social: string;
  talking_points: string[];
};

export function useContrast() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; record: OpponentRecord; ourPosition: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'contrast_message',
        context: JSON.stringify({
          opponent_statement: input.record.content,
          said_on: input.record.occurred_on,
          source: input.record.source,
          our_position: input.ourPosition
        })
      });
      const parsed = extractJson<ContrastPack>(result.text);
      if (!parsed) throw new Error('Could not parse contrast pack');
      return parsed;
    }
  });
}

export type RebuttalPack = { statement: string; social: string; door_response: string };

export function useRebuttal() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; record: OpponentRecord; correctingFacts: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'rebuttal',
        context: JSON.stringify({
          opponent_claim: input.record.content,
          said_on: input.record.occurred_on,
          source: input.record.source,
          our_correcting_facts: input.correctingFacts
        })
      });
      const parsed = extractJson<RebuttalPack>(result.text);
      if (!parsed) throw new Error('Could not parse rebuttal pack');
      return parsed;
    }
  });
}

export type DebatePrepSheet = { attacks: { attack: string; response: string; pivot: string }[] };

export function useDebatePrep() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; records: OpponentRecord[]; ourPositions: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'debate_prep',
        context: JSON.stringify({
          opponent_record: JSON.parse(buildCompeteSnapshot(input.records)),
          our_positions: input.ourPositions
        })
      });
      const parsed = extractJson<DebatePrepSheet>(result.text);
      if (!parsed) throw new Error('Could not parse debate prep sheet');
      return parsed;
    }
  });
}

export type RedTeamReport = {
  vulnerabilities: { attack_angle: string; likelihood: string; prep_response: string }[];
};

export function useRedTeam() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; ownRecord: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'self_opposition',
        context: JSON.stringify({ our_candidate_record: input.ownRecord })
      });
      const parsed = extractJson<RedTeamReport>(result.text);
      if (!parsed) throw new Error('Could not parse red-team report');
      return parsed;
    }
  });
}

export type OpponentDigestReport = {
  themes: { theme: string; evidence_count: number; summary: string }[];
  shift: string;
  gaps: string;
};

export function useOpponentDigest() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; records: OpponentRecord[] }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'opponent_digest',
        context: buildCompeteSnapshot(input.records)
      });
      const parsed = extractJson<OpponentDigestReport>(result.text);
      if (!parsed) throw new Error('Could not parse opponent digest');
      return parsed;
    }
  });
}

export type MistakeResponsePack = { statement: string; social_post: string; canvasser_talking_point: string };

// Accountability, not spin, for a REAL error the campaign's own candidate
// made -- distinct from Red Team (anticipates attacks before they land) and
// Issue Response Engine (reacts to external news events). Nothing typed here
// is persisted, same sensitivity as Red Team.
export function useMistakeResponse() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; whatHappened: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'mistake_response',
        context: JSON.stringify({ what_happened: input.whatHappened })
      });
      const parsed = extractJson<MistakeResponsePack>(result.text);
      if (!parsed) throw new Error('Could not parse the accountability response');
      return parsed;
    }
  });
}

export type InterviewPrepSheet = {
  bridge_phrases: string[];
  likely_questions: { question: string; suggested_answer: string }[];
  one_thing_to_land: string;
};

// Friendly/routine press prep (local news, podcast) -- distinct from Debate
// Prep's adversarial exchange.
export function useInterviewPrep() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; format: string; topics: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'interview_prep',
        context: JSON.stringify({ format: input.format, likely_topics: input.topics })
      });
      const parsed = extractJson<InterviewPrepSheet>(result.text);
      if (!parsed) throw new Error('Could not parse the interview prep sheet');
      return parsed;
    }
  });
}
