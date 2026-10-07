import { useMutation } from '@tanstack/react-query';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
export function useEmailCampaign() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'email_campaign',
                context: JSON.stringify({ goal: input.goal, audience: input.audience, brief: input.brief })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse email campaign');
            return parsed;
        }
    });
}
export function usePressRelease() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
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
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse press release');
            return parsed;
        }
    });
}
export function useMediaPitch() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
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
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse media pitch');
            return parsed;
        }
    });
}
export function useDirectMail() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'direct_mail',
                context: JSON.stringify({ brief: input.brief })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse direct mail copy');
            return parsed;
        }
    });
}
export function usePhoneScript() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'phone_script',
                context: JSON.stringify({ call_type: input.callType, ask: input.ask })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse phone script');
            return parsed;
        }
    });
}
// Endorsement Outreach Builder: donor asks and media pitches exist, asking
// an organization or community leader for their endorsement is a distinct
// ask with its own stakes and structure -- had no tool until now.
export function useEndorsementAsk() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'endorsement_ask',
                context: JSON.stringify({ organization_or_leader: input.who, why_they_fit: input.whyFit })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse the endorsement request');
            return parsed;
        }
    });
}
