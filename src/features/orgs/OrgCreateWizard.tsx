import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ORG_TYPES } from '@/features/rbac/roleTemplates';
import { useAuth } from '@/providers/AuthProvider';
import { US_STATES } from './usStates';
import { useCreateOrganization } from './useOrganizations';

const orgSchema = z.object({
  name: z.string().min(2, 'Organization name is required'),
  org_type: z.enum(['campaign_committee', 'pac', 'party_committee', 'nonprofit'], {
    message: 'Select an organization type'
  }),
  state_of_registration: z.string().optional(),
  ein: z.string().optional(),
  fec_committee_id: z.string().optional(),
  billing_contact_name: z.string().optional(),
  billing_contact_email: z.string().email('Enter a valid email').optional().or(z.literal(''))
});

type OrgFormValues = z.infer<typeof orgSchema>;

export function OrgCreateWizard({ onCreated }: { onCreated?: () => void }) {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const createOrg = useCreateOrganization();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting }
  } = useForm<OrgFormValues>({ resolver: zodResolver(orgSchema) });

  const onSubmit = async (values: OrgFormValues) => {
    if (!user) return;
    await createOrg.mutateAsync({
      ...values,
      billing_contact_email: values.billing_contact_email || undefined,
      created_by: user.id
    });
    setSubmitted(true);
    onCreated?.();
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Organization submitted</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Your organization has been created and is pending activation. Creating an organization
          requires a paid plan — a SuperAdmin will review and activate it. You'll be able to create
          projects and invite your team once it's active.
        </p>
      </div>
    );
  }

  return (
    <form
      className="mx-auto max-w-lg space-y-5 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Create an organization</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Your account is free. Organizations are the paid tenant that owns your projects, team, and
          feature add-ons.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Organization name</Label>
        <Input id="name" {...register('name')} />
        {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Organization type</Label>
        <Controller
          name="org_type"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {ORG_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.org_type && <p className="text-xs text-red-600">{errors.org_type.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>State of registration</Label>
          <Controller
            name="state_of_registration"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
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
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ein">EIN</Label>
          <Input id="ein" placeholder="Optional" {...register('ein')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fec_committee_id">FEC Committee ID</Label>
        <Input id="fec_committee_id" placeholder="Optional" {...register('fec_committee_id')} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="billing_contact_name">Billing contact name</Label>
          <Input id="billing_contact_name" placeholder="Optional" {...register('billing_contact_name')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing_contact_email">Billing contact email</Label>
          <Input id="billing_contact_email" placeholder="Optional" {...register('billing_contact_email')} />
          {errors.billing_contact_email && (
            <p className="text-xs text-red-600">{errors.billing_contact_email.message}</p>
          )}
        </div>
      </div>

      {createOrg.isError && (
        <p className="text-sm text-red-600">{(createOrg.error as Error).message}</p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        Submit organization
      </Button>
    </form>
  );
}
