// Type declaration for the untyped button.jsx.
//
// The app is plain JS by owner decision, so this component carries no types of
// its own and TypeScript infers a bare `RefAttributes<any>` — which has no
// `children`, so every <Button>label</Button> in a .tsx file fails to compile.
//
// This is a declaration file rather than a conversion of button.jsx on purpose:
// it gives the new .tsx surface real prop checking without touching the
// JavaScript component or pulling the shared UI kit into TypeScript.
import type { ButtonHTMLAttributes, ForwardRefExoticComponent, RefAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'outline' | 'ghost' | 'destructive';
    size?: 'default' | 'sm' | 'lg';
    /** Renders the child element instead of a <button> (Radix Slot). */
    asChild?: boolean;
}

export declare const Button: ForwardRefExoticComponent<
    ButtonProps & RefAttributes<HTMLButtonElement>
>;
