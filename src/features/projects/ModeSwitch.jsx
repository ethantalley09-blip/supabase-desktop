import { Landmark, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetProjectMode } from '@/features/governing/useGoverning';
// Campaign <-> Governing switch in the project header. Same project, same
// data, either direction -- that continuity is what keeps a winning campaign
// on Lynx through the whole term instead of churning on election day.
export function ModeSwitch({ project, canManage }) {
    const setMode = useSetProjectMode();
    const [open, setOpen] = useState(false);
    const [officeTitle, setOfficeTitle] = useState(project.office_title ?? '');
    const [termEndsOn, setTermEndsOn] = useState(project.term_ends_on ?? '');
    const governing = project.mode === 'governing';
    if (!canManage) {
        return governing ? (<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Governing</span>) : null;
    }
    if (governing) {
        return (<Button size="sm" variant="outline" disabled={setMode.isPending} onClick={() => setMode.mutate({ projectId: project.id, mode: 'campaign' })} title="Back to campaigning for re-election. Office cases stay saved.">
        <Megaphone className="h-3.5 w-3.5"/>
        {setMode.isPending ? 'Switching…' : 'Start re-election campaign'}
      </Button>);
    }
    return (<div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
        <Landmark className="h-3.5 w-3.5"/>
        We won — switch to Governing
      </Button>
      {open && (<div className="absolute right-0 z-20 mt-2 w-80 space-y-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg">
          <p className="text-sm font-semibold text-neutral-900">Switch to Governing mode</p>
          <p className="text-xs text-neutral-500">
            Adds an Office tab for constituent casework. Nothing is deleted: voters, notes, donors,
            and turf all stay for the re-election.
          </p>
          <Input placeholder="Office (e.g. City Council, District 4)" value={officeTitle} onChange={(e) => setOfficeTitle(e.target.value)}/>
          <label className="block text-xs text-neutral-500">
            Term ends
            <Input type="date" value={termEndsOn} onChange={(e) => setTermEndsOn(e.target.value)}/>
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={setMode.isPending} onClick={() => setMode.mutate({ projectId: project.id, mode: 'governing', officeTitle, termEndsOn }, { onSuccess: () => setOpen(false) })}>
              {setMode.isPending ? 'Switching…' : 'Switch'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {setMode.isError && <p className="text-xs text-red-600">{setMode.error.message}</p>}
        </div>)}
    </div>);
}
