import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/providers/AuthProvider';
const authSchema = z.object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters')
});
export function AuthPage() {
    const { user, signInWithPassword, signUpWithPassword } = useAuth();
    const [mode, setMode] = useState('sign-in');
    const [formError, setFormError] = useState(null);
    const [confirmationSent, setConfirmationSent] = useState(false);
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(authSchema) });
    if (user) {
        return <Navigate to="/" replace/>;
    }
    const onSubmit = async (values) => {
        setFormError(null);
        setConfirmationSent(false);
        const { error } = mode === 'sign-in'
            ? await signInWithPassword(values.email, values.password)
            : await signUpWithPassword(values.email, values.password);
        if (error) {
            setFormError(error);
            return;
        }
        if (mode === 'sign-up') {
            setConfirmationSent(true);
        }
    };
    return (<div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-neutral-900">
          {mode === 'sign-in' ? 'Sign in to Lynx' : 'Create your free account'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {mode === 'sign-in'
            ? 'Access your organizations and projects.'
            : 'Account creation is free. Creating an organization requires a plan.'}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')}/>
            {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} {...register('password')}/>
            {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {confirmationSent && (<p className="text-sm text-emerald-600">Check your email to confirm your account.</p>)}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <button type="button" className="mt-4 text-sm text-neutral-500 underline-offset-2 hover:underline" onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setFormError(null);
            setConfirmationSent(false);
        }}>
          {mode === 'sign-in' ? "Don't have an account? Sign up free" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>);
}
