import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrgRoles } from '@/features/comms/useComms';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { supabase } from '@/lib/supabase/client';

type Member = {
  id: string;
  status: string;
  profiles: { email: string; full_name: string | null } | null;
  roles: { name: string } | null;
};

export function TeamTab({ orgId }: { orgId: string }) {
  const canManage = useHasPermission(orgId, 'team.manage');
  const [inviting, setInviting] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ['org-members-full', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_memberships')
        .select('id, status, profiles(email, full_name), roles(name)')
        .eq('org_id', orgId)
        .in('status', ['active', 'invited']);
      if (error) throw error;
      return data as unknown as Member[];
    }
  });

  if (isLoading) return <p className="text-sm text-neutral-500">Loading team…</p>;

  return (
    <div className="space-y-4">
      {canManage.data && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setInviting(!inviting)}>
            {inviting ? 'Close' : 'Add member'}
          </Button>
        </div>
      )}

      {inviting && <InviteForm orgId={orgId} onDone={() => setInviting(false)} />}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {members?.map((m) => (
              <tr key={m.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-900">
                  {m.profiles?.full_name || m.profiles?.email || '—'}
                </td>
                <td className="px-4 py-2 text-neutral-500">{m.roles?.name ?? '—'}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      m.status === 'active'
                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                        : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'
                    }
                  >
                    {m.status === 'active' ? 'Active' : 'Invited'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InviteForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: roles } = useOrgRoles(orgId);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      setNotice(null);
      // Invitees must already have a (free) account -- accounts are free by
      // design, so "ask them to sign up first" is the whole onboarding cost.
      const { data: found, error: lookupError } = await supabase.rpc('lookup_profile_for_invite', {
        p_org_id: orgId,
        p_email: email.trim()
      });
      if (lookupError) throw lookupError;
      if (!found || found.length === 0) {
        throw new Error(
          'No account with that email. Ask them to create a free Lynx account first, then invite them.'
        );
      }

      const { error } = await supabase.from('org_memberships').insert({
        org_id: orgId,
        profile_id: found[0].id,
        role_id: roleId,
        status: 'invited'
      });
      if (error) {
        throw new Error(
          error.code === '23505' ? 'That person is already a member or has a pending invite.' : error.message
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members-full', orgId] });
      setNotice(`Invite sent to ${email.trim()}.`);
      setEmail('');
    }
  });

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email (must have a Lynx account)</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <select
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="">Select a role…</option>
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {invite.isError && <p className="text-sm text-red-600">{(invite.error as Error).message}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => invite.mutate()}
          disabled={invite.isPending || !email.includes('@') || !roleId}
        >
          Send invite
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
