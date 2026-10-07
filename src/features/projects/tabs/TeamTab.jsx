import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrgRoles } from '@/features/comms/useComms';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { useCreateHotelBooking, useCreateShift, useHotelBookings, useShifts, useUpdateShiftStatus } from '@/features/staffing/useStaffing';
import { supabase } from '@/lib/supabase/client';
export function TeamTab({ orgId, projectId }) {
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
            if (error)
                throw error;
            return data;
        }
    });
    if (isLoading)
        return <p className="text-sm text-neutral-500">Loading team…</p>;
    return (<div className="space-y-4">
      {canManage.data && (<div className="flex justify-end">
          <Button size="sm" onClick={() => setInviting(!inviting)}>
            {inviting ? 'Close' : 'Add member'}
          </Button>
        </div>)}

      {inviting && <InviteForm orgId={orgId} onDone={() => setInviting(false)}/>}

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
            {members?.map((m) => (<tr key={m.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-900">
                  {m.profiles?.full_name || m.profiles?.email || '—'}
                </td>
                <td className="px-4 py-2 text-neutral-500">{m.roles?.name ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={m.status === 'active'
                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'}>
                    {m.status === 'active' ? 'Active' : 'Invited'}
                  </span>
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>

      <StaffingSection orgId={orgId} projectId={projectId}/>
      <LogisticsSection orgId={orgId} projectId={projectId}/>
    </div>);
}
// Staffing (question-bank §9): who's scheduled, working, off, or pending a
// swap decision. hr.view/hr.manage have existed since 0003_roles.sql
// (already granted to a seeded HR role template) but had no feature behind
// them until migration 0033_staffing_logistics.sql.
function StaffingSection({ orgId, projectId }) {
    const canView = useHasPermission(orgId, 'hr.view');
    const canManage = useHasPermission(orgId, 'hr.manage');
    const { data: shifts } = useShifts(projectId);
    const { data: members } = useQuery({
        queryKey: ['org-members-simple', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('org_memberships')
                .select('profile_id, profiles(full_name, email)')
                .eq('org_id', orgId)
                .eq('status', 'active');
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(canView.data)
    });
    const createShift = useCreateShift();
    const updateStatus = useUpdateShiftStatus();
    const [profileId, setProfileId] = useState('');
    const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [teamName, setTeamName] = useState('');
    if (!canView.data)
        return null;
    return (<div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">Staffing</h3>
      {canManage.data && (<div className="flex flex-wrap items-end gap-2">
          <select className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Who…</option>
            {members?.map((m) => (<option key={m.profile_id} value={m.profile_id}>
                {m.profiles?.full_name || m.profiles?.email}
              </option>))}
          </select>
          <input type="date" className="h-9 rounded-md border border-neutral-300 px-2 text-sm" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)}/>
          <Input placeholder="Team (optional)" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="h-9 w-32"/>
          <Button size="sm" disabled={!profileId || !shiftDate || createShift.isPending} onClick={() => createShift.mutate({ projectId, profileId, shiftDate, teamName }, { onSuccess: () => setTeamName('') })}>
            {createShift.isPending ? 'Adding…' : 'Add shift'}
          </Button>
        </div>)}
      <div className="overflow-hidden rounded-md border border-neutral-100">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-1.5">Person</th>
              <th className="px-3 py-1.5">Date</th>
              <th className="px-3 py-1.5">Team</th>
              <th className="px-3 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {shifts?.slice(0, 20).map((s) => (<tr key={s.id} className="border-t border-neutral-100">
                <td className="px-3 py-1.5 text-neutral-900">{s.profiles?.full_name || s.profiles?.email || '—'}</td>
                <td className="px-3 py-1.5 text-neutral-500">{s.shift_date}</td>
                <td className="px-3 py-1.5 text-neutral-500">{s.team_name ?? '—'}</td>
                <td className="px-3 py-1.5">
                  {canManage.data ? (<select className="h-7 rounded border border-neutral-300 bg-white px-1 text-xs" value={s.status} onChange={(e) => updateStatus.mutate({ shiftId: s.id, projectId, status: e.target.value })}>
                      <option value="scheduled">Scheduled</option>
                      <option value="worked">Worked</option>
                      <option value="off">Off</option>
                      <option value="pending_swap">Pending swap</option>
                    </select>) : (<span className="text-xs text-neutral-500">{s.status}</span>)}
                </td>
              </tr>))}
            {(!shifts || shifts.length === 0) && (<tr>
                <td colSpan={4} className="px-3 py-3 text-center text-xs text-neutral-400">
                  No shifts logged yet.
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>);
}
// Logistics (question-bank §11): which hotel each team is using, dates,
// rooms, and a real (staff-entered-rate) projected cost — reuses hr.view/
// hr.manage rather than a new permission key, same domain as Staffing.
function LogisticsSection({ orgId, projectId }) {
    const canView = useHasPermission(orgId, 'hr.view');
    const canManage = useHasPermission(orgId, 'hr.manage');
    const { data: bookings } = useHotelBookings(projectId);
    const createBooking = useCreateHotelBooking();
    const [hotelName, setHotelName] = useState('');
    const [teamName, setTeamName] = useState('');
    const [checkIn, setCheckIn] = useState('');
    const [checkOut, setCheckOut] = useState('');
    const [roomCount, setRoomCount] = useState(1);
    const [nightlyRate, setNightlyRate] = useState(0);
    if (!canView.data)
        return null;
    const submit = () => {
        if (!hotelName.trim() || !checkIn || !checkOut)
            return;
        createBooking.mutate({ projectId, hotelName, teamName, checkIn, checkOut, roomCount, nightlyRateCents: Math.round(nightlyRate * 100) }, {
            onSuccess: () => {
                setHotelName('');
                setTeamName('');
                setCheckIn('');
                setCheckOut('');
                setRoomCount(1);
                setNightlyRate(0);
            }
        });
    };
    return (<div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">Logistics</h3>
      {canManage.data && (<div className="flex flex-wrap items-end gap-2">
          <Input placeholder="Hotel name" value={hotelName} onChange={(e) => setHotelName(e.target.value)} className="h-9 w-36"/>
          <Input placeholder="Team (optional)" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="h-9 w-28"/>
          <input type="date" className="h-9 rounded-md border border-neutral-300 px-2 text-sm" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}/>
          <input type="date" className="h-9 rounded-md border border-neutral-300 px-2 text-sm" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}/>
          <input type="number" min="1" className="h-9 w-16 rounded-md border border-neutral-300 px-2 text-sm" value={roomCount} onChange={(e) => setRoomCount(Number(e.target.value) || 1)}/>
          <input type="number" min="0" step="0.01" placeholder="Rate/night" className="h-9 w-24 rounded-md border border-neutral-300 px-2 text-sm" value={nightlyRate} onChange={(e) => setNightlyRate(Number(e.target.value) || 0)}/>
          <Button size="sm" disabled={createBooking.isPending} onClick={submit}>
            {createBooking.isPending ? 'Adding…' : 'Add booking'}
          </Button>
        </div>)}
      <ul className="space-y-1 text-sm">
        {bookings?.map((b) => (<li key={b.id} className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-1.5 text-neutral-700">
            {b.hotel_name}
            {b.team_name ? ` (${b.team_name})` : ''} — {b.check_in} to {b.check_out}, {b.room_count} room
            {b.room_count === 1 ? '' : 's'} @ ${(b.nightly_rate_cents / 100).toFixed(2)}/night
          </li>))}
        {(!bookings || bookings.length === 0) && <li className="text-xs text-neutral-400">No hotel bookings recorded yet.</li>}
      </ul>
    </div>);
}
function InviteForm({ orgId, onDone }) {
    const queryClient = useQueryClient();
    const { data: roles } = useOrgRoles(orgId);
    const [email, setEmail] = useState('');
    const [roleId, setRoleId] = useState('');
    const [notice, setNotice] = useState(null);
    const invite = useMutation({
        mutationFn: async () => {
            setNotice(null);
            // Invitees must already have a (free) account -- accounts are free by
            // design, so "ask them to sign up first" is the whole onboarding cost.
            const { data: found, error: lookupError } = await supabase.rpc('lookup_profile_for_invite', {
                p_org_id: orgId,
                p_email: email.trim()
            });
            if (lookupError)
                throw lookupError;
            if (!found || found.length === 0) {
                throw new Error('No account with that email. Ask them to create a free Lynx account first, then invite them.');
            }
            const { error } = await supabase.from('org_memberships').insert({
                org_id: orgId,
                profile_id: found[0].id,
                role_id: roleId,
                status: 'invited'
            });
            if (error) {
                throw new Error(error.code === '23505' ? 'That person is already a member or has a pending invite.' : error.message);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['org-members-full', orgId] });
            setNotice(`Invite sent to ${email.trim()}.`);
            setEmail('');
        }
    });
    return (<div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email (must have a Lynx account)</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}/>
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <select className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Select a role…</option>
            {roles?.map((r) => (<option key={r.id} value={r.id}>
                {r.name}
              </option>))}
          </select>
        </div>
      </div>
      {invite.isError && <p className="text-sm text-red-600">{invite.error.message}</p>}
      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => invite.mutate()} disabled={invite.isPending || !email.includes('@') || !roleId}>
          Send invite
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>);
}
