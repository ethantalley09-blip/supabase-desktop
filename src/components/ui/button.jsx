import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50', {
    variants: {
        variant: {
            default: 'bg-neutral-900 text-neutral-50 hover:bg-neutral-800',
            outline: 'border border-neutral-300 bg-white hover:bg-neutral-100',
            ghost: 'hover:bg-neutral-100',
            destructive: 'bg-red-600 text-white hover:bg-red-500'
        },
        size: {
            default: 'h-9 px-4 py-2',
            sm: 'h-8 px-3 text-xs',
            lg: 'h-10 px-6'
        }
    },
    defaultVariants: {
        variant: 'default',
        size: 'default'
    }
});
export const Button = forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}/>;
});
Button.displayName = 'Button';
