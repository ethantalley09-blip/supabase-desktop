import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

type Member = {
  id: string;
  status: string;
  profiles: { email: string; full_name: string | null } | null;
  roles: { name: string } | null;
};

export function TeamTab({ orgId }: { orgId: string }) {
  const { data: members, isLoading } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_memberships')
        .select('id, status, profiles(email, full_name), roles(name)')
        .eq('org_id', orgId)
        .eq('status', 'active');
      if (error) throw error;
      return data as unknown as Member[];
    }
  });

  if (isLoading) return <p className="text-sm text-neutral-500">Loading team…</p>;

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2">Member</th>
            <th className="px-4 py-2">Role</th>
          </tr>
        </thead>
        <tbody>
          {members?.map((m) => (
            <tr key={m.id} className="border-t border-neutral-100">
              <td className="px-4 py-2 text-neutral-900">
                {m.profiles?.full_name || m.profiles?.email || '—'}
              </td>
              <td className="px-4 py-2 text-neutral-500">{m.roles?.name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
