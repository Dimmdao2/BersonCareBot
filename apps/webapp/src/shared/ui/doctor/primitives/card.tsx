import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import {
  Card as BaseCard,
  CardAction as BaseCardAction,
  CardContent as BaseCardContent,
  CardDescription as BaseCardDescription,
  CardFooter as BaseCardFooter,
  CardHeader as BaseCardHeader,
  CardTitle as BaseCardTitle,
} from '@/shared/ui/primitives/card';

export function Card({ className, size = 'default', ...props }: ComponentProps<typeof BaseCard>) {
  return (
    <BaseCard
      size={size}
      className={cn(
        size === 'default' &&
          'gap-3 rounded-[var(--doctor-page-block-radius,12px)] border border-[var(--doctor-block-border)] py-[var(--doctor-block-padding,18px)] ring-0',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<typeof BaseCardHeader>) {
  return (
    <BaseCardHeader
      className={cn(
        'gap-0.5 px-[var(--doctor-block-padding,18px)] group-data-[size=sm]/card:px-3',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<typeof BaseCardTitle>) {
  return (
    <BaseCardTitle
      className={cn(className, 'font-sans text-sm font-semibold leading-normal')}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<typeof BaseCardContent>) {
  return (
    <BaseCardContent
      className={cn(
        'px-[var(--doctor-block-padding,18px)] group-data-[size=sm]/card:px-3',
        className,
      )}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<typeof BaseCardFooter>) {
  return (
    <BaseCardFooter
      className={cn(
        'p-[var(--doctor-block-padding,18px)] group-data-[size=sm]/card:p-3',
        className,
      )}
      {...props}
    />
  );
}

export const CardAction = BaseCardAction;
export const CardDescription = BaseCardDescription;
