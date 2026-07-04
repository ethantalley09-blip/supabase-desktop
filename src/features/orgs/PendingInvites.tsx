import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';

type Invite = { membership_id: string; org_name: string; role_name: string };

// Shown on the home page for any signed-in user with status='invited'
// memberships. Accept flips the row to active (RLS lets invitees resolve
// only their own invite); decline marks it removed.
export function PendingInvites() {
  const queryClient = useQueryClient();

  const { data: invites } = useQuery({
    queryKey: ['my-pending-invites'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_pending_invites');
      if (error) throw error;
      return (data ?? []) as Invite[];
    }
  });

  const resolve = useMutation({
    mutationFn: async (input: { membershipId: string; accept: boolean }) => {
      const { error } = await supabase
        .from('org_memberships')
        .update({ status: input.accept ? 'active' : 'removed' })
        .eq('id', input.membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Accepting an invite changes what the user can see everywhere
      // (projects, dashboards, team lists) -- refetch it all.
      queryClient.invalidateQueries();
    }
  });

  if (!invites || invites.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {invites.map((inv) => (
        <div
          key={inv.membership_id}
          className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-4"
        >
          <p className="text-sm text-neutral-800">
            You've been invited to <span className="font-medium">{inv.org_name}</span> as{' '}
            <span className="font-medium">{inv.role_name}</span>.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ membershipId: inv.membership_id, accept: true })}
            >
              Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ membershipId: inv.membership_id, accept: false })}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
