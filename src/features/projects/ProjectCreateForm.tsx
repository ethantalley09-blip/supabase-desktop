import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { US_STATES } from '@/features/orgs/usStates';
import { useCreateProject } from './useProjects';

const projectSchema = z.object({
  name: z.string().min(2, 'Project name is required'),
  state: z.string().optional()
});

type ProjectFormValues = z.infer<typeof projectSchema>;

export function ProjectCreateForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const createProject = useCreateProject();
  const [fundraisingAddon, setFundraisingAddon] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting }
  } = useForm<ProjectFormValues>({ resolver: zodResolver(projectSchema) });

  const onSubmit = async (values: ProjectFormValues) => {
    await createProject.mutateAsync({
      org_id: orgId,
      name: values.name,
      state: values.state,
      addons: fundraisingAddon ? ['fundraising_module'] : []
    });
    onDone();
  };

  return (
    <form
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
      onSubmit={handleSubmit(onSubmit)}
    >
      <h3 className="font-medium text-neutral-900">New project</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="project-name">Name</Label>
          <Input id="project-name" {...register('name')} />
          {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>State</Label>
          <Controller
            name="state"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Where this project operates" />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-neutral-400">Determines state-level compliance rules.</p>
        </div>
      </div>

      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Paid add-ons</p>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={fundraisingAddon}
            onChange={(e) => setFundraisingAddon(e.target.checked)}
          />
          <span>
            <span className="font-medium text-neutral-800">Fundraising module</span>
            <span className="block text-xs text-neutral-500">
              Donation and donor tracking for this project. Unlocks compliance tools at $1,000 raised.
            </span>
          </span>
        </label>
      </div>

      {createProject.isError && (
        <p className="text-sm text-red-600">{(createProject.error as Error).message}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          Create project
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
