import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/shared/ui/patient/primitives/button-variants';
import { cn } from '@/lib/utils';

export type GuestPlaceholderProps = {
  title: string;
  description: ReactNode;
  actionLabel: ReactNode;
  actionHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  illustration?: ReactNode;
};

/**
 * Заглушка для гостя или пользователя без привязки телефона (EXEC I.10).
 * Тёплый информационный блок + основное и опциональное действие.
 */
export function GuestPlaceholder({
  title,
  description,
  actionLabel,
  actionHref,
  secondaryLabel,
  secondaryHref,
  illustration,
}: GuestPlaceholderProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 patient-text-primary dark:border-amber-900/40 dark:bg-amber-950/25">
        {illustration ? <div className="mb-3">{illustration}</div> : null}
        <h2 className="patient-type-section-title">{title}</h2>
        <p className="mt-2 patient-type-secondary">{description}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link
          href={actionHref}
          className={cn(
            buttonVariants({ size: 'default' }),
            'inline-flex w-full justify-center sm:w-auto',
          )}
        >
          {actionLabel}
        </Link>
        {secondaryLabel && secondaryHref ? (
          <Link
            href={secondaryHref}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'default' }),
              'inline-flex w-full justify-center sm:w-auto',
            )}
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
