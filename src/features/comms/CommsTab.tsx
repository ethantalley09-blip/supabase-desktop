import { format } from 'date-fns';
import { Check, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { OutreachBooster } from '@/features/outreach/OutreachBooster';
import { TranslateBar } from '@/features/ai/TranslateBar';
import { useAuth } from '@/providers/AuthProvider';
import { SocialSchedulerPanel } from './paid/SocialSchedulerPanel';
import {
  useAcknowledge,
  useCreateBroadcast,
  useOrgRoles,
  useProjectThreads,
  useReply,
  useThreadMessages,
  type Thread
} from './useComms';

export function CommsTab({ project }: { project: Project }) {
  const canBroadcast = useHasPermission(project.org_id, 'comms.broadcast');
  const paidTier = useEntitlement(project.org_id, 'comms_paid_tier');
  const aiEnabled = useEntitlement(project.org_id, 'ai_module');
  const canUseAi = useHasPermission(project.org_id, 'ai.use');
  const showAi = Boolean(aiEnabled.data && canUseAi.data);
  const { data: threads } = useProjectThreads(project.org_id, project.id);
  const [composing, setComposing] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          Internal notifications between management and field teams. Included free for every project.
        </p>
        {canBroadcast.data && (
          <Button size="sm" onClick={() => setComposing(!composing)}>
            <Megaphone className="h-4 w-4" />
            {composing ? 'Close' : 'New broadcast'}
          </Button>
        )}
      </div>

      {/* Anchor matches TOOL_LOCATIONS so AI-dashboard cards deep-link here */}
      <div id="tool-broadcast_draft">
        {composing && <BroadcastComposer project={project} onDone={() => setComposing(false)} />}
      </div>

      <div className="space-y-3">
        {threads?.map((t) => (
          <ThreadCard key={t.id} thread={t} orgId={project.org_id} projectId={project.id} showAi={showAi} />
        ))}
        {threads?.length === 0 && (
          <p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-400">
            No broadcasts yet.
          </p>
        )}
      </div>

      <div id="tool-outreach_booster">
        <OutreachBooster project={project} />
      </div>

      {paidTier.data ? (
        <SocialSchedulerPanel project={project} />
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
          <span className="font-medium text-neutral-700">Comms paid tier</span> — social media
          scheduling and impression tracking. Contact your administrator to upgrade.
        </div>
      )}
    </div>
  );
}

function BroadcastComposer({ project, onDone }: { project: Project; onDone: () => void }) {
  const { data: roles } = useOrgRoles(project.org_id);
  const createBroadcast = useCreateBroadcast();
  const aiEnabled = useEntitlement(project.org_id, 'ai_module');
  const canUseAi = useHasPermission(project.org_id, 'ai.use');
  const assist = useAiAssist();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [targetRoleId, setTargetRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const draftWithAi = async () => {
    setError(null);
    const audience = roles?.find((r) => r.id === targetRoleId)?.name;
    const result = await assist.mutateAsync({
      orgId: project.org_id,
      projectId: project.id,
      purpose: 'broadcast',
      audience: audience ? `${audience}s` : 'the whole team',
      instructions: subject.trim() || 'A brief update for the field team.'
    });
    setBody(result.text);
  };

  const submit = async () => {
    setError(null);
    if (subject.trim().length < 2 || body.trim().length < 2) {
      setError('Subject and message are required');
      return;
    }
    await createBroadcast.mutateAsync({
      orgId: project.org_id,
      projectId: project.id,
      subject: subject.trim(),
      body: body.trim(),
      targetRoleId: targetRoleId || undefined
    });
    onDone();
  };

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-900">New broadcast</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Audience</Label>
          <select
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            value={targetRoleId}
            onChange={(e) => setTargetRoleId(e.target.value)}
          >
            <option value="">Everyone</option>
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}s
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="body">Message</Label>
          {aiEnabled.data && canUseAi.data && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={draftWithAi}
              disabled={assist.isPending}
            >
              {assist.isPending ? 'Drafting…' : 'Draft with AI'}
            </Button>
          )}
        </div>
        <textarea
          id="body"
          rows={3}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {assist.isError && <p className="text-sm text-red-600">{(assist.error as Error).message}</p>}
      {createBroadcast.isError && (
        <p className="text-sm text-red-600">{(createBroadcast.error as Error).message}</p>
      )}
      <Button size="sm" onClick={submit} disabled={createBroadcast.isPending}>
        Send broadcast
      </Button>
    </div>
  );
}

function ThreadCard({
  thread,
  orgId,
  projectId,
  showAi
}: {
  thread: Thread;
  orgId: string;
  projectId: string;
  showAi: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <p className="text-sm font-medium text-neutral-900">{thread.subject}</p>
          <p className="text-xs text-neutral-400">
            To {thread.roles ? `${thread.roles.name}s` : 'everyone'} ·{' '}
            {format(new Date(thread.created_at), 'PPp')}
          </p>
        </div>
        <span className="text-xs text-neutral-400">{open ? 'Hide' : 'Open'}</span>
      </button>
      {open && <ThreadView threadId={thread.id} orgId={orgId} projectId={projectId} showAi={showAi} />}
    </div>
  );
}

function ThreadView({
  threadId,
  orgId,
  projectId,
  showAi
}: {
  threadId: string;
  orgId: string;
  projectId: string;
  showAi: boolean;
}) {
  const { user } = useAuth();
  const { data: messages } = useThreadMessages(threadId);
  const reply = useReply();
  const acknowledge = useAcknowledge();
  const draftReply = useAiAssist();
  const [replyBody, setReplyBody] = useState('');

  const sendReply = async () => {
    if (replyBody.trim().length === 0) return;
    await reply.mutateAsync({ threadId, body: replyBody.trim() });
    setReplyBody('');
  };

  const draftWithAi = async () => {
    const result = await draftReply.mutateAsync({
      orgId,
      projectId,
      purpose: 'broadcast',
      instructions: replyBody.trim()
        ? `Polish this reply to a team broadcast: ${replyBody.trim()}`
        : 'Write a brief, friendly reply acknowledging the broadcast above.'
    });
    setReplyBody(result.text);
  };

  return (
    <div className="space-y-3 border-t border-neutral-100 px-4 py-3">
      {messages?.map((m) => {
        const acked = m.message_acknowledgements.some((a) => a.profile_id === user?.id);
        return (
          <div key={m.id} className="rounded-md bg-neutral-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-600">
                {m.profiles?.full_name || m.profiles?.email}
                <span className="ml-2 font-normal text-neutral-400">
                  {format(new Date(m.created_at), 'p')}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">
                  {m.message_acknowledgements.length} ack
                  {m.message_acknowledgements.length === 1 ? '' : 's'}
                </span>
                {m.sender_id !== user?.id && !acked && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => acknowledge.mutate({ messageId: m.id, threadId })}
                  >
                    <Check className="h-3 w-3" /> Acknowledge
                  </Button>
                )}
                {acked && <span className="text-xs text-emerald-600">Acknowledged</span>}
              </div>
            </div>
            <p className="mt-1 text-sm text-neutral-800">{m.body}</p>
            {showAi && (
              <div className="mt-2">
                <TranslateBar orgId={orgId} projectId={projectId} text={m.body} />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-2">
        <Input
          placeholder="Reply…"
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendReply()}
        />
        {showAi && (
          <Button variant="outline" size="sm" onClick={draftWithAi} disabled={draftReply.isPending}>
            {draftReply.isPending ? 'Drafting…' : 'Draft with AI'}
          </Button>
        )}
        <Button size="sm" onClick={sendReply} disabled={reply.isPending}>
          Reply
        </Button>
      </div>
      {draftReply.isError && (
        <p className="text-sm text-red-600">{(draftReply.error as Error).message}</p>
      )}
    </div>
  );
}
