import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/features/auth/useProfile';
import { OrgCreateWizard } from '@/features/orgs/OrgCreateWizard';
import { PendingInvites } from '@/features/orgs/PendingInvites';
import { OrgDashboard, ProjectAttentionRollup } from '@/features/dashboard/widgets';
import { useMyOrganizations } from '@/features/orgs/useOrganizations';
import { ProjectCreateForm } from '@/features/projects/ProjectCreateForm';
import { useOrgProjects } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { useAuth } from '@/providers/AuthProvider';
export function HomePage() {
    const { user, signOut } = useAuth();
    const { data: profile } = useProfile();
    const { data: organizations, isLoading, isError, refetch } = useMyOrganizations();
    return (<div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <span className="text-sm font-semibold text-neutral-900">Lynx</span>
        <div className="flex items-center gap-3">
          {profile?.is_super_admin && (<Link to="/admin" className="text-sm text-neutral-600 underline-offset-2 hover:underline">
              SuperAdmin
            </Link>)}
          <span className="text-sm text-neutral-500">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <PendingInvites />

        {isLoading && <p className="text-center text-sm text-neutral-500">Loading…</p>}

        {isError && (<div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-700">Couldn't load your organizations.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>)}

        {!isLoading && !isError && organizations?.length === 0 && <OrgCreateWizard />}

        {!isLoading && !isError && organizations && organizations.length > 0 && (<div className="space-y-4">
            {organizations.map((org) => (<div key={org.id} className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-neutral-900">{org.name}</h3>
                  <span className={org.status === 'active'
                    ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                    : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'}>
                    {org.status === 'active' ? 'Active' : 'Pending activation'}
                  </span>
                </div>
                {org.status !== 'active' && (<p className="mt-2 text-sm text-neutral-500">
                    Awaiting SuperAdmin approval. Projects and team invites unlock once this
                    organization is activated.
                  </p>)}
                {org.status === 'active' && (<>
                    <OrgDashboard orgId={org.id}/>
                    <ProjectAttentionRollup orgId={org.id}/>
                    <OrgProjects org={org}/>
                  </>)}
              </div>))}
          </div>)}
      </main>
    </div>);
}
function OrgProjects({ org }) {
    const { data: projects, isLoading } = useOrgProjects(org.id);
    const canManageProjects = useHasPermission(org.id, 'projects.manage');
    const [creating, setCreating] = useState(false);
    return (<div className="mt-4 space-y-3">
      {isLoading && <p className="text-sm text-neutral-400">Loading projects…</p>}

      {projects && projects.length > 0 && (<ul className="divide-y divide-neutral-100 rounded-md border border-neutral-100">
          {projects.map((p) => (<li key={p.id}>
              <Link to={`/projects/${p.id}`} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50">
                <span className="font-medium text-neutral-800">{p.name}</span>
                <span className="text-xs text-neutral-400">{p.state ?? ''}</span>
              </Link>
            </li>))}
        </ul>)}

      {projects && projects.length === 0 && !creating && (<p className="text-sm text-neutral-400">No projects yet.</p>)}

      {creating ? (<ProjectCreateForm orgId={org.id} onDone={() => setCreating(false)}/>) : (canManageProjects.data && (<Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            New project
          </Button>))}
    </div>);
}
