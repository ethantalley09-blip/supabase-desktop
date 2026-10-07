import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
export const Label = forwardRef(({ className, ...props }, ref) => (<LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none', className)} {...props}/>));
Label.displayName = 'Label';
