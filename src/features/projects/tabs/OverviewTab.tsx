import { format } from 'date-fns';
import type { Project } from '../useProjects';

export function OverviewTab({ project }: { project: Project }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-400">Name</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{project.name}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-400">State</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{project.state ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-400">Status</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{project.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-400">Created</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">
            {format(new Date(project.created_at), 'PPP')}
          </dd>
        </div>
      </dl>
    </div>
  );
}
