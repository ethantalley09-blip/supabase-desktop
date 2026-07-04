import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import { SOCIAL_PLATFORMS } from './socialAdapters';

type SocialPost = {
  id: string;
  platform: string;
  content: string;
  scheduled_for: string | null;
  status: string;
  impressions: number | null;
  engagement_count: number | null;
};

export function SocialSchedulerPanel({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = useHasPermission(project.org_id, 'comms.manage');
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState('x');
  const [content, setContent] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');

  const { data: posts } = useQuery({
    queryKey: ['social-posts', project.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('social_posts')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SocialPost[];
    }
  });

  const createPost = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('social_posts').insert({
        project_id: project.id,
        platform,
        content: content.trim(),
        scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        status: scheduledFor ? 'scheduled' : 'draft',
        created_by: user!.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-posts', project.id] });
      setShowForm(false);
      setContent('');
      setScheduledFor('');
    }
  });

  const recordMetrics = useMutation({
    mutationFn: async (input: { id: string; impressions: number; engagement: number }) => {
      const { error } = await supabase
        .from('social_posts')
        .update({
          impressions: input.impressions,
          engagement_count: input.engagement,
          status: 'posted'
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social-posts', project.id] })
  });

  const chartData = (posts ?? [])
    .filter((p) => p.impressions !== null)
    .map((p) => ({
      label: `${SOCIAL_PLATFORMS.find((s) => s.platform === p.platform)?.label ?? p.platform} · ${p.content.slice(0, 16)}…`,
      impressions: p.impressions ?? 0,
      engagement: p.engagement_count ?? 0
    }));

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Social media — paid tier</h3>
          <p className="text-xs text-neutral-400">
            Post scheduling and impression tracking. Platform APIs connect via adapters; metrics are
            recorded manually until then.
          </p>
        </div>
        {canManage.data && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Close' : 'New post'}
          </Button>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 rounded-md border border-neutral-100 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <select
                className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p.platform} value={p.platform}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_for">Schedule for</Label>
              <Input
                id="scheduled_for"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-content">Content</Label>
            <textarea
              id="post-content"
              rows={2}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {createPost.isError && (
            <p className="text-sm text-red-600">{(createPost.error as Error).message}</p>
          )}
          <Button size="sm" onClick={() => createPost.mutate()} disabled={createPost.isPending || content.trim().length === 0}>
            Save post
          </Button>
        </div>
      )}

      {chartData.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Impressions</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="impressions" fill="#171717" radius={[3, 3, 0, 0]} />
              <Bar dataKey="engagement" fill="#a3a3a3" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <ul className="space-y-2">
        {posts?.map((p) => (
          <SocialPostRow
            key={p.id}
            post={p}
            canManage={Boolean(canManage.data)}
            onRecordMetrics={(impressions, engagement) =>
              recordMetrics.mutate({ id: p.id, impressions, engagement })
            }
          />
        ))}
        {posts?.length === 0 && <li className="text-sm text-neutral-400">No posts yet.</li>}
      </ul>
    </div>
  );
}

function SocialPostRow({
  post,
  canManage,
  onRecordMetrics
}: {
  post: SocialPost;
  canManage: boolean;
  onRecordMetrics: (impressions: number, engagement: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [impressions, setImpressions] = useState(String(post.impressions ?? ''));
  const [engagement, setEngagement] = useState(String(post.engagement_count ?? ''));
  const platformLabel = SOCIAL_PLATFORMS.find((s) => s.platform === post.platform)?.label ?? post.platform;

  return (
    <li className="rounded-md border border-neutral-100 p-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium text-neutral-800">
          {platformLabel}
          <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
            {post.status}
          </span>
        </p>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          {post.scheduled_for && <span>{format(new Date(post.scheduled_for), 'PPp')}</span>}
          {post.impressions !== null && <span>{post.impressions} impressions</span>}
          {canManage && (
            <button className="underline-offset-2 hover:underline" onClick={() => setEditing(!editing)}>
              {editing ? 'cancel' : 'record metrics'}
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-neutral-600">{post.content}</p>
      {editing && (
        <div className="mt-2 flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Impressions</Label>
            <Input className="h-8 w-28" type="number" value={impressions} onChange={(e) => setImpressions(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Engagement</Label>
            <Input className="h-8 w-28" type="number" value={engagement} onChange={(e) => setEngagement(e.target.value)} />
          </div>
          <Button
            size="sm"
            onClick={() => {
              onRecordMetrics(Number(impressions) || 0, Number(engagement) || 0);
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      )}
    </li>
  );
}
