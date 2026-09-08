'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';

import { buttonVariants, type ButtonVariants } from './button-variants';

type ButtonProps = Omit<ButtonPrimitive.Props, 'size'> & ButtonVariants;

/**
 * Patient UI boundary for buttons. Shared variants retain their global behavior; patient
 * action variants apply the semantic patientVisual action classes without duplicate chrome.
 */
function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={
        typeof className === 'function'
          ? (state) => buttonVariants({ variant, size, className: className(state) })
          : buttonVariants({ variant, size, className })
      }
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonVariants };
