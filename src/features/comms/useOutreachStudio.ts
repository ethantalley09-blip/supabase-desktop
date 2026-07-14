import { useMutation } from '@tanstack/react-query';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';

// Outreach & Marketing suite (Comms tab, paid tier): email, press, media
// pitches, direct mail, phone/text scripts. All drafting-only — nothing is
// persisted, matching the emergency_ask pattern — the campaign sends through
// its own channels immediately.

export type EmailCampaignPack = { subject_a: string; subject_b: string; subject_c: string; preview_text: string; body: string };

export function useEmailCampaign() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; goal: string; audience: string; brief: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'email_campaign',
        context: JSON.stringify({ goal: input.goal, audience: input.audience, brief: input.brief })
      });
      const parsed = extractJson<EmailCampaignPack>(result.text);
      if (!parsed) throw new Error('Could not parse email campaign');
      return parsed;
    }
  });
}

export type PressReleasePack = { headline: string; dateline: string; body: string; boilerplate: string; media_contact_line: string };

export function usePressRelease() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: {
      orgId: string;
      projectId: string;
      announcement: string;
      quote: string;
      location: string;
      contact: string;
    }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'press_release',
        context: JSON.stringify({
          announcement: input.announcement,
          quote: input.quote || undefined,
          location: input.location || undefined,
          media_contact: input.contact || undefined
        })
      });
      const parsed = extractJson<PressReleasePack>(result.text);
      if (!parsed) throw new Error('Could not parse press release');
      return parsed;
    }
  });
}

export type MediaPitchPack = { subject: string; body: string };

export function useMediaPitch() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: {
      orgId: string;
      projectId: string;
      reporterName: string;
      outlet: string;
      beat: string;
      angle: string;
    }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'media_pitch',
        context: JSON.stringify({
          reporter_name: input.reporterName,
          outlet: input.outlet,
          beat: input.beat,
          story_angle: input.angle
        })
      });
      const parsed = extractJson<MediaPitchPack>(result.text);
      if (!parsed) throw new Error('Could not parse media pitch');
      return parsed;
    }
  });
}

export type DirectMailPack = { headline: string; body: string; cta: string };

export function useDirectMail() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; brief: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'direct_mail',
        context: JSON.stringify({ brief: input.brief })
      });
      const parsed = extractJson<DirectMailPack>(result.text);
      if (!parsed) throw new Error('Could not parse direct mail copy');
      return parsed;
    }
  });
}

export type PhoneScriptPack = { greeting: string; message: string; ask: string; if_voicemail: string };

export function usePhoneScript() {
  const ai = useAiAssist();
  return useMutation({
    mutationFn: async (input: { orgId: string; projectId: string; callType: string; ask: string }) => {
      const result = await ai.mutateAsync({
        orgId: input.orgId,
        projectId: input.projectId,
        purpose: 'phone_script',
        context: JSON.stringify({ call_type: input.callType, ask: input.ask })
      });
      const parsed = extractJson<PhoneScriptPack>(result.text);
      if (!parsed) throw new Error('Could not parse phone script');
      return parsed;
    }
  });
}
